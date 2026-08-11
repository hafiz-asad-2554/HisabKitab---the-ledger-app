import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import { useAppStore } from '../../store';

/**
 * Settings / More screen.
 * - App Lock toggle (biometric/PIN)
 * - Auto-Sync toggle (Google Drive)
 * - Removed: Language selector (deprecated)
 * - Removed: "This device" role selector (deprecated)
 */
export default function More() {
  const biometric = useAppStore(s => s.biometricLockEnabled);
  const setBio = useAppStore(s => s.setBiometricLock);
  const autoSync = useAppStore(s => s.autoSyncEnabled);
  const setAutoSync = useAppStore(s => s.setAutoSyncEnabled);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Settings</Text>

      {/* App Lock */}
      <View style={styles.row}>
        <View style={styles.rowTextBlock}>
          <Text style={styles.title}>App lock</Text>
          <Text style={styles.note}>Require device biometrics or PIN to access your ledger</Text>
        </View>
        <Switch value={biometric} onValueChange={setBio} trackColor={{ true: '#10B981' }} />
      </View>

      {/* Auto-Sync Toggle */}
      <View style={styles.row}>
        <View style={styles.rowTextBlock}>
          <Text style={styles.title}>Auto-sync personal ledger</Text>
          <Text style={styles.note}>
            Automatically sync ledger changes to your Google Drive when data is modified or the app goes to background
          </Text>
        </View>
        <Switch value={autoSync} onValueChange={setAutoSync} trackColor={{ true: '#10B981' }} />
      </View>

      {/* Sync Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          {autoSync ? '✅ Auto-Sync Enabled' : '⚙️ Manual Sync Mode'}
        </Text>
        <Text style={styles.infoText}>
          {autoSync
            ? 'Your ledger changes will be automatically synced to Google Drive. Smart delta updates patch the existing file — no duplicate backups are created.'
            : 'Sync will only occur when you manually trigger it from your Profile page. Toggle on to enable automatic background syncing.'}
        </Text>
      </View>

      {/* Privacy Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🔒 Privacy</Text>
        <Text style={styles.infoText}>
          All ledger data is stored locally on your device. Cloud sync uses your personal Google Drive with file-scoped access only. No data is shared with third parties.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20, paddingBottom: 40 },
  header: { color: '#F8FAFC', fontSize: 23, fontWeight: '700', marginBottom: 20 },
  row: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rowTextBlock: { flex: 1, paddingRight: 12 },
  title: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  note: { color: '#94A3B8', fontSize: 13, marginTop: 4, lineHeight: 18 },
  infoCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  infoText: { color: '#94A3B8', fontSize: 13, lineHeight: 20 },
});
