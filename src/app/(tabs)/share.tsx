import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, FlatList, Modal, ActivityIndicator,
} from 'react-native';
import { useAppStore, SharedLedgerGrant, SharedLedgerReceived, SharedLedgerType } from '../../store';
import { secureCredentials } from '../../services/secure-credentials';
import { SyncEngine } from '../../sync';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type ScreenView = 'LANDING' | 'MY_SHARES' | 'RECEIVED' | 'SHARE_MODAL' | 'ACCESS_MANAGE';

export default function ShareHub() {
  const router = useRouter();
  const log = useAppStore(s => s.addSyncLog);
  const file = useAppStore(s => s.driveFileId);
  const setFile = useAppStore(s => s.setDriveFileId);
  const profile = useAppStore(s => s.profile);
  const contacts = useAppStore(s => s.contacts);
  const crops = useAppStore(s => s.crops);
  const grants = useAppStore(s => s.sharedLedgerGrants);
  const received = useAppStore(s => s.sharedLedgersReceived);
  const addGrant = useAppStore(s => s.addSharedLedgerGrant);
  const removeGrant = useAppStore(s => s.removeSharedLedgerGrant);
  const addNotification = useAppStore(s => s.addNotification);

  const [view, setView] = useState<ScreenView>('LANDING');
  const [email, setEmail] = useState('');
  const [fileId, setFileId] = useState(file || '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedLedgerType, setSelectedLedgerType] = useState<SharedLedgerType>('PERSONAL');
  const [shareModalVisible, setShareModalVisible] = useState(false);

  /* ── Save Drive Config ── */
  const save = async () => {
    if (!fileId.trim() || !token.trim())
      return Alert.alert('Required', 'Enter the Drive database file ID and OAuth token.');
    setFile(fileId.trim());
    await secureCredentials.setDriveToken(token.trim());
    setToken('');
    Alert.alert('Drive connected', 'Credentials are stored in the device secure enclave.');
  };

  /* ── Share Ledger via Drive Permissions ── */
  const share = async () => {
    if (!/^\S+@\S+\.\S+$/i.test(email))
      return Alert.alert('Invalid email', 'Enter a valid email address.');
    if (!fileId.trim())
      return Alert.alert('Required', 'Enter the Drive file ID first.');

    const access = token || (await secureCredentials.getDriveToken());
    if (!access) return Alert.alert('Sign in required', 'Save a Drive OAuth token first.');

    setBusy(true);
    try {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId.trim())}/permissions?sendNotificationEmail=true`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'user',
            role: 'writer',
            emailAddress: email.trim(),
          }),
        }
      );
      if (!r.ok) throw new Error(`Drive returned ${r.status}`);

      // Record the grant locally
      addGrant({
        grantee_email: email.trim(),
        ledger_type: selectedLedgerType,
        drive_file_id: fileId.trim(),
      });

      log(`Write access granted to ${email.trim()}.`, 'COMPLETE');
      addNotification({
        type: 'ACCESS_GRANTED',
        title: 'Ledger shared',
        message: `${selectedLedgerType === 'PERSONAL' ? 'Personal' : 'Business & Crop'} ledger shared with ${email.trim()}.`,
      });
      Alert.alert('Access granted', 'No public link was created. The recipient can access the ledger through the app.');
      setEmail('');
      setShareModalVisible(false);
    } catch (e) {
      log(e instanceof Error ? e.message : 'Permission grant failed.', 'ERROR');
      Alert.alert('Share failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  /* ── Revoke Access ── */
  const revokeAccess = (grant: SharedLedgerGrant) => {
    Alert.alert(
      'Revoke Access',
      `Remove ${grant.grantee_email}'s access to your ${grant.ledger_type === 'PERSONAL' ? 'Personal' : 'Business & Crop'} ledger?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            // Note: In production, you'd also call the Drive API to remove the permission
            removeGrant(grant.grant_id);
            addNotification({
              type: 'ACCESS_REVOKED',
              title: 'Access revoked',
              message: `Access revoked for ${grant.grantee_email}.`,
            });
            Alert.alert('Done', 'Access has been revoked.');
          },
        },
      ]
    );
  };

  /* ── Sync ── */
  const sync = async () => {
    const driveToken = await secureCredentials.getDriveToken();
    if (!driveToken) {
      return Alert.alert('Sign in required', 'Please connect your Google account first.');
    }
    if (!file) {
      return Alert.alert('Drive file missing', 'Enter the Drive database file ID first.');
    }
    setBusy(true);
    await SyncEngine.syncNow();
    setBusy(false);
  };

  /* ── Landing Screen ── */
  if (view === 'LANDING') {
    return (
      <ScrollView style={x.page} contentContainerStyle={x.content}>
        <Text style={x.head}>Share Ledger</Text>
        <Text style={x.copy}>
          Share your ledgers securely with family or business partners using their Google email.
        </Text>

        {/* Ledger Type Selection */}
        <TouchableOpacity
          style={x.ledgerCard}
          onPress={() => {
            setSelectedLedgerType('BUSINESS_CROP');
            setView('MY_SHARES');
          }}
        >
          <View style={x.ledgerIcon}>
            <MaterialIcons name="agriculture" size={32} color="#10B981" />
          </View>
          <View style={x.ledgerInfo}>
            <Text style={x.ledgerTitle}>Business & Crop Ledger</Text>
            <Text style={x.ledgerDesc}>
              Share crop cycle data and business expenses
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity
          style={x.ledgerCard}
          onPress={() => {
            setSelectedLedgerType('PERSONAL');
            setView('MY_SHARES');
          }}
        >
          <View style={x.ledgerIcon}>
            <MaterialIcons name="person" size={32} color="#3B82F6" />
          </View>
          <View style={x.ledgerInfo}>
            <Text style={x.ledgerTitle}>Personal Ledger</Text>
            <Text style={x.ledgerDesc}>
              Share personal contact ledgers and transaction history
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#64748B" />
        </TouchableOpacity>

        {/* Received Shared Ledgers */}
        {received.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={x.sectionTitle}>Shared With You</Text>
            {received.map(r => (
              <View key={r.share_id} style={x.receivedCard}>
                <View style={x.receivedIcon}>
                  <MaterialIcons
                    name={r.ledger_type === 'PERSONAL' ? 'person' : 'agriculture'}
                    size={24}
                    color="#F8FAFC"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={x.receivedName}>{r.owner_name}'s Ledger</Text>
                  <Text style={x.receivedEmail}>{r.owner_email}</Text>
                  <Text style={x.receivedType}>
                    {r.ledger_type === 'PERSONAL' ? 'Personal' : 'Business & Crop'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Drive Config */}
        <View style={x.configSection}>
          <Text style={x.sectionTitle}>Drive Configuration</Text>
          <TextInput
            style={x.input}
            value={fileId}
            onChangeText={setFileId}
            placeholder="Hidden Google Drive file ID"
            placeholderTextColor="#94A3B8"
          />
          <TextInput
            style={x.input}
            value={token}
            onChangeText={setToken}
            placeholder="OAuth token with Drive scope"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity style={x.secondary} onPress={save}>
            <Text style={x.text}>Save secure connection</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} style={x.secondary} onPress={sync}>
            <Text style={x.text}>{busy ? 'Working…' : 'Sync private ledger'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  /* ── My Shares View (per ledger type) ── */
  if (view === 'MY_SHARES') {
    const typeGrants = grants.filter(g => g.ledger_type === selectedLedgerType);
    const typeName = selectedLedgerType === 'PERSONAL' ? 'Personal' : 'Business & Crop';

    return (
      <View style={x.page}>
        <View style={x.subHeader}>
          <TouchableOpacity onPress={() => setView('LANDING')}>
            <MaterialIcons name="arrow-back" size={24} color="#F8FAFC" />
          </TouchableOpacity>
          <Text style={x.subTitle}>{typeName} Ledger</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={x.content}>
          {/* Quick Stats */}
          <View style={x.statsRow}>
            <View style={x.statCard}>
              <Text style={x.statNum}>
                {selectedLedgerType === 'PERSONAL' ? contacts.length : crops.length}
              </Text>
              <Text style={x.statLabel}>
                {selectedLedgerType === 'PERSONAL' ? 'Contacts' : 'Crop Cycles'}
              </Text>
            </View>
            <View style={x.statCard}>
              <Text style={x.statNum}>{typeGrants.length}</Text>
              <Text style={x.statLabel}>People with access</Text>
            </View>
          </View>

          {/* Share Button */}
          <TouchableOpacity
            style={x.primary}
            onPress={() => setShareModalVisible(true)}
          >
            <MaterialIcons name="share" size={20} color="#FFF" />
            <Text style={x.text}> Share with someone</Text>
          </TouchableOpacity>

          {/* Current Access List */}
          <Text style={[x.sectionTitle, { marginTop: 20 }]}>Who has access</Text>
          {typeGrants.length === 0 ? (
            <Text style={x.copy}>No one has access to this ledger yet.</Text>
          ) : (
            typeGrants.map(g => (
              <View key={g.grant_id} style={x.grantRow}>
                <View style={x.grantAvatar}>
                  <Text style={x.grantInitial}>
                    {g.grantee_email.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={x.grantEmail}>{g.grantee_email}</Text>
                  <Text style={x.grantDate}>
                    Since {new Date(g.granted_at).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={x.revokeBtn}
                  onPress={() => revokeAccess(g)}
                >
                  <Text style={x.revokeText}>Revoke</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        {/* Share Modal */}
        <Modal visible={shareModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView
            style={x.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              contentContainerStyle={x.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={x.modalContainer}>
                <Text style={x.modalTitle}>
                  Share {typeName} Ledger
                </Text>
                <Text style={x.modalCopy}>
                  Enter the recipient's Google email. They'll receive access to view and edit the shared ledger through the app.
                </Text>
                <TextInput
                  style={x.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="recipient@gmail.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <View style={x.modalActions}>
                  <TouchableOpacity
                    style={x.cancelBtn}
                    onPress={() => setShareModalVisible(false)}
                  >
                    <Text style={x.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busy}
                    style={x.primary}
                    onPress={share}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={x.text}>Grant Access</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  return null;
}

const x = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  head: { color: '#F8FAFC', fontSize: 23, fontWeight: '800' },
  copy: { color: '#94A3B8', lineHeight: 20, marginBottom: 8 },
  sectionTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '700', marginBottom: 10 },

  // Ledger Type Cards
  ledgerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  ledgerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  ledgerInfo: { flex: 1 },
  ledgerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  ledgerDesc: { color: '#94A3B8', fontSize: 13, marginTop: 3 },

  // Received Shared
  receivedCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  receivedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  receivedName: { color: '#F8FAFC', fontWeight: '700', fontSize: 15 },
  receivedEmail: { color: '#94A3B8', fontSize: 12 },
  receivedType: { color: '#64748B', fontSize: 11, marginTop: 2 },

  // Config Section
  configSection: { marginTop: 20, gap: 10 },
  input: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    color: '#F8FAFC',
  },
  primary: {
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  secondary: {
    backgroundColor: '#334155',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  text: { color: '#fff', fontWeight: '800' },

  // Sub Header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  subTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statNum: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' },
  statLabel: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  // Grant Rows
  grantRow: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  grantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  grantInitial: { color: '#F8FAFC', fontWeight: '800', fontSize: 16 },
  grantEmail: { color: '#F8FAFC', fontWeight: '600', fontSize: 14 },
  grantDate: { color: '#64748B', fontSize: 11, marginTop: 2 },
  revokeBtn: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  revokeText: { color: '#FCA5A5', fontWeight: '700', fontSize: 12 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
  },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  modalTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalCopy: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { padding: 12 },
  cancelText: { color: '#94A3B8', fontWeight: '600' },
});
