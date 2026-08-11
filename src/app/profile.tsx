import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAppStore } from '../store';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { SyncEngine } from '../sync';
import { secureCredentials } from '../services/secure-credentials';
import { MaterialIcons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const profile = useAppStore(s => s.profile);
  const updateProfile = useAppStore(s => s.updateProfile);
  const removeProfileAvatar = useAppStore(s => s.removeProfileAvatar);
  const locked = useAppStore(s => s.biometricLockEnabled);
  const setLocked = useAppStore(s => s.setBiometricLock);
  const autoSync = useAppStore(s => s.autoSyncEnabled);
  const driveFileId = useAppStore(s => s.driveFileId);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [syncing, setSyncing] = useState(false);

  const { promptAsync, loading: googleLoading, isSignedIn, signOut, error: googleError } = useGoogleSignIn();

  /* ── Avatar Picker ── */
  const pickAvatar = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        updateProfile({ ...profile, avatarUri: result.assets[0].uri });
      }
    } catch {
      Alert.alert('Error', 'Could not pick image');
    }
  };

  const removeAvatar = () => {
    Alert.alert('Remove Photo', 'Your profile photo will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeProfileAvatar(),
      },
    ]);
  };

  /* ── Google Sign-In ── */
  const handleGoogleSignIn = async () => {
    if (promptAsync) {
      await promptAsync();
    }
  };

  /* ── Manual Sync ── */
  const handleSync = async () => {
    const token = await secureCredentials.getDriveToken();
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in with Google first to enable Drive sync.');
      return;
    }
    if (!driveFileId) {
      Alert.alert('Drive file missing', 'Please configure the Drive database file ID in the Share Ledger tab first.');
      return;
    }
    setSyncing(true);
    const success = await SyncEngine.syncNow();
    setSyncing(false);
    Alert.alert(
      success ? 'Sync Complete' : 'Sync Failed',
      success
        ? 'Your ledger has been merged and saved to Google Drive.'
        : 'Check your connection and try again. See sync logs for details.'
    );
  };

  const save = () => {
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return Alert.alert('Invalid email', 'Enter a valid email address.');
    }
    updateProfile({ ...profile, name: name.trim() || 'My HisabKitab', email: email.trim() });
    Alert.alert('Saved', 'Your profile has been updated.');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0F172A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* ── Avatar Section ── */}
        <TouchableOpacity style={styles.avatar} onPress={pickAvatar} activeOpacity={0.7}>
          {profile.avatarUri ? (
            <Image source={{ uri: profile.avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.initial}>{(name || 'M').slice(0, 1).toUpperCase()}</Text>
          )}
          <View style={styles.avatarOverlay}>
            <MaterialIcons name="camera-alt" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>

        {profile.avatarUri && (
          <TouchableOpacity style={styles.removePhotoBtn} onPress={removeAvatar}>
            <MaterialIcons name="delete-outline" size={16} color="#F87171" />
            <Text style={styles.removePhotoText}>Remove Photo</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.heading}>My Profile</Text>
        <Text style={styles.caption}>Personal account and privacy controls</Text>

        {/* ── Name ── */}
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#94A3B8"
        />

        {/* ── Email ── */}
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="name@gmail.com"
          placeholderTextColor="#94A3B8"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* ── App Lock ── */}
        <View style={styles.setting}>
          <View style={styles.settingText}>
            <Text style={styles.title}>App lock</Text>
            <Text style={styles.note}>Require device authentication on launch</Text>
          </View>
          <Switch value={locked} onValueChange={setLocked} trackColor={{ true: '#10B981' }} />
        </View>

        {/* ── Data Info ── */}
        <View style={styles.data}>
          <Text style={styles.title}>Data parameters</Text>
          <Text style={styles.note}>
            Ledger data is stored locally and included in the secure sharing workflow when enabled.
          </Text>
        </View>

        {/* ── Save Profile ── */}
        <TouchableOpacity style={styles.save} onPress={save}>
          <Text style={styles.saveText}>Save profile</Text>
        </TouchableOpacity>

        {/* ── Google Drive Sync ── */}
        <View style={styles.google}>
          <Text style={styles.title}>Google Drive Sync</Text>
          <Text style={styles.note}>
            {autoSync
              ? '🟢 Auto-sync is enabled. Changes sync automatically.'
              : '⚪ Manual sync mode. Tap below to sync now.'}
          </Text>

          {googleError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {googleError}</Text>
            </View>
          )}

          {!isSignedIn ? (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Sign in with Google</Text>
              )}
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.connectedBadge}>
                <MaterialIcons name="check-circle" size={18} color="#10B981" />
                <Text style={styles.connectedText}>Google account connected</Text>
              </View>
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Sync to Drive now</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
                <Text style={styles.signOutText}>Sign out from Google</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#0F172A', padding: 20, alignItems: 'stretch' },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#047857',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#6EE7B7',
    overflow: 'hidden',
  },
  avatarImage: { width: 86, height: 86, borderRadius: 43 },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  initial: { color: '#fff', fontSize: 36, fontWeight: '800' },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  removePhotoText: { color: '#F87171', fontSize: 13, fontWeight: '600' },
  heading: {
    color: '#F8FAFC',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
  },
  caption: { color: '#94A3B8', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  label: { color: '#CBD5E1', fontWeight: '700', marginBottom: 7, marginTop: 12 },
  input: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    color: '#F8FAFC',
    padding: 13,
  },
  setting: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  settingText: { flex: 1, paddingRight: 12 },
  data: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginTop: 12 },
  title: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  note: { color: '#94A3B8', fontSize: 13, marginTop: 5, lineHeight: 18 },
  save: {
    backgroundColor: '#10B981',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: { color: '#fff', fontWeight: '800' },
  google: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginTop: 12 },
  googleButton: {
    backgroundColor: '#4285F4',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#064E3B',
    padding: 10,
    borderRadius: 8,
  },
  connectedText: { color: '#A7F3D0', fontWeight: '600', fontSize: 13 },
  signOutBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  signOutText: { color: '#F87171', fontWeight: '600', fontSize: 13 },
  errorBox: {
    backgroundColor: '#7F1D1D',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  errorText: { color: '#FCA5A5', fontSize: 12 },
});
