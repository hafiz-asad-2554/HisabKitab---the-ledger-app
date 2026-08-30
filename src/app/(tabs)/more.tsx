import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../../store';

/**
 * More screen.
 *
 * Contains:
 * 1. Quick-access cards for the three pillar screens relocated from the
 *    bottom nav (Agriculture, Business Ledger, Capital Pools).
 * 2. App Settings: App Lock toggle, Auto-Sync toggle.
 * 3. Privacy info card.
 */
export default function More() {
  const router = useRouter();
  const biometric = useAppStore(s => s.biometricLockEnabled);
  const setBio = useAppStore(s => s.setBiometricLock);
  const autoSync = useAppStore(s => s.autoSyncEnabled);
  const setAutoSync = useAppStore(s => s.setAutoSyncEnabled);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.header}>More</Text>

      {/* ── Pillar Navigation (relocated from bottom nav) ── */}
      <Text style={styles.sectionLabel}>LEDGER PILLARS</Text>

      <TouchableOpacity
        style={styles.navCard}
        onPress={() => router.push('/(tabs)/crops' as any)}
        accessibilityLabel="Open Agriculture ledger"
        accessibilityRole="button"
      >
        <View style={[styles.navIconCircle, { backgroundColor: '#064E3B' }]}>
          <MaterialIcons name="agriculture" size={22} color="#34D399" />
        </View>
        <View style={styles.navTextBlock}>
          <Text style={styles.navTitle}>Agriculture</Text>
          <Text style={styles.navSub}>Crop & Field Analytics</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#475569" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navCard}
        onPress={() => router.push('/(tabs)/business' as any)}
        accessibilityLabel="Open Business ledger"
        accessibilityRole="button"
      >
        <View style={[styles.navIconCircle, { backgroundColor: '#1E3A5F' }]}>
          <MaterialIcons name="store" size={22} color="#60A5FA" />
        </View>
        <View style={styles.navTextBlock}>
          <Text style={styles.navTitle}>Business Ledger</Text>
          <Text style={styles.navSub}>Jama / Naam accounts</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#475569" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navCard}
        onPress={() => router.push('/(tabs)/capital' as any)}
        accessibilityLabel="Open Capital Pools"
        accessibilityRole="button"
      >
        <View style={[styles.navIconCircle, { backgroundColor: '#4C1D95' }]}>
          <MaterialIcons name="account-balance-wallet" size={22} color="#A78BFA" />
        </View>
        <View style={styles.navTextBlock}>
          <Text style={styles.navTitle}>Capital Pools</Text>
          <Text style={styles.navSub}>Project budgets & tracking</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#475569" />
      </TouchableOpacity>

      {/* ── Settings ── */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>SETTINGS</Text>

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
  header: { color: '#F8FAFC', fontSize: 23, fontWeight: '700', marginBottom: 4 },
  sectionLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  // Pillar nav cards
  navCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  navIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  navTextBlock: { flex: 1 },
  navTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  navSub: { color: '#94A3B8', fontSize: 13, marginTop: 2 },

  // Settings rows
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
