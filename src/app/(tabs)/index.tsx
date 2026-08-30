import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { Contact, useAppStore } from '../../store';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { DeviceContact, getDeviceContact, pickDeviceContact } from '../../services/device-contacts';
import { addContactsChangeListener } from 'expo-contacts/legacy';
import { ContextSwitcher } from '../../components/ContextSwitcher';

export default function KhataDirectoryScreen() {
  const router = useRouter();
  const contacts = useAppStore(state => state.contacts);
  const addContact = useAppStore(state => state.addContact);
  const profile = useAppStore(state => state.profile);
  const unreadCount = useAppStore(state => state.unreadNotificationCount);

  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [query, setQuery] = useState('');
  const [deviceContactId, setDeviceContactId] = useState<string | undefined>();
  const [deviceAvatarUri, setDeviceAvatarUri] = useState<string | undefined>();

  // Decoupled useEffect to avoid infinite loop when contacts update
  useEffect(() => {
    const refreshLinked = async () => {
      const currentContacts = useAppStore.getState().contacts;
      const updateContactFn = useAppStore.getState().updateContact;

      await Promise.all(
        currentContacts
          .filter(c => c.is_linked_to_device_contacts && c.device_contact_identifier)
          .map(async c => {
            const latest = await getDeviceContact(c.device_contact_identifier!);
            if (
              latest &&
              (latest.name !== c.display_name ||
                latest.phone !== c.phone_number ||
                latest.avatarUri !== c.person_avatar_uri)
            ) {
              updateContactFn(c.person_id, latest.name, latest.phone, c.notes, latest.avatarUri);
            }
          })
      );
    };

    // Initial sync on mount
    void refreshLinked();

    // Event listener for native device contact updates
    if (Platform.OS !== 'web' && typeof addContactsChangeListener === 'function') {
      const listener = addContactsChangeListener(() => {
        void refreshLinked();
      });
      return () => listener.remove();
    }
  }, []); // Empty dependency array prevents re-render recursion

  // Memoize global net balance calculation to prevent O(N * M) reduction on every render
  const globalBalance = useMemo(() => {
    return contacts.reduce((total, contact) => {
      const contactNet = contact.transactions.reduce(
        (acc, t) => acc + (t.given_amount - t.taken_amount),
        0
      );
      return total + contactNet;
    }, 0);
  }, [contacts]);

  const isNetPositive = globalBalance >= 0;

  // Memoize search-filtered contacts array for FlatList
  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      c =>
        c.display_name.toLowerCase().includes(q) ||
        c.phone_number.includes(q)
    );
  }, [contacts, query]);

  const handleAddContact = () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    addContact(newName.trim(), newPhone.trim(), deviceAvatarUri, deviceContactId);
    setNewName('');
    setNewPhone('');
    setDeviceContactId(undefined);
    setDeviceAvatarUri(undefined);
    setModalVisible(false);
  };

  const openDevicePicker = async () => {
    try {
      const contact = await pickDeviceContact();
      if (contact) chooseDeviceContact(contact);
    } catch (error) {
      Alert.alert(
        'Contacts unavailable',
        error instanceof Error ? error.message : 'Unable to read device contacts.'
      );
    }
  };

  const chooseDeviceContact = (contact: DeviceContact) => {
    setNewName(contact.name);
    setNewPhone(contact.phone);
    setDeviceAvatarUri(contact.avatarUri);
    setDeviceContactId(contact.id);
  };

  const renderContact = useCallback(({ item }: { item: Contact }) => {
    const contactNet = item.transactions.reduce(
      (acc, t) => acc + (t.given_amount - t.taken_amount),
      0
    );
    const isContactPositive = contactNet >= 0;

    return (
      <TouchableOpacity
        style={styles.contactCard}
        onPress={() => router.push(`/person/${item.person_id}`)}
      >
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.display_name}</Text>
          {item.phone_number ? (
            <Text style={styles.contactPhone}>{item.phone_number}</Text>
          ) : null}
        </View>
        <View style={styles.contactBalanceContainer}>
          <Text style={styles.balanceLabel}>Net Balance</Text>
          <Text
            style={[
              styles.contactBalance,
              { color: isContactPositive ? '#10B981' : '#EF4444' },
            ]}
          >
            {contactNet >= 0 ? '+' : ''}
            {Math.abs(contactNet).toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <View style={styles.container}>
      {/* ── Pinned Top Bar with Profile & Notification Bell ── */}
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <Image
            source={require('../../../assets/images/hisabkitab-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.tagline}>Your private ledger</Text>
          </View>
        </View>
        <View style={styles.topbarRight}>
          {/* Notification Bell */}
          <TouchableOpacity
            accessibilityLabel="Open notifications"
            onPress={() => router.push('/notifications')}
            style={styles.notificationBell}
          >
            <MaterialIcons name="notifications" size={26} color="#F8FAFC" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Profile Avatar */}
          <TouchableOpacity
            accessibilityLabel="Open my profile"
            onPress={() => router.push('/profile')}
            style={styles.profileAvatar}
          >
            {profile.avatarUri ? (
              <Image source={{ uri: profile.avatarUri }} style={styles.profileImage} />
            ) : (
              <Text style={styles.profileInitial}>
                {profile.name.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Pinned Financial Pillars Header ── */}
      <ContextSwitcher activePillar="home" />

      {/* ── Scrollable Content (ListHeader + Directory Items) ── */}
      <FlatList
        data={filteredContacts}
        keyExtractor={item => item.person_id}
        renderItem={renderContact}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <View>
            {/* Global Net View Card */}
            <View
              style={[
                styles.globalCard,
                { backgroundColor: isNetPositive ? '#064E3B' : '#7F1D1D' },
              ]}
            >
              <Text style={styles.globalLabel}>Global Net Balance</Text>
              <Text
                style={[
                  styles.globalAmount,
                  { color: isNetPositive ? '#34D399' : '#FCA5A5' },
                ]}
              >
                {globalBalance >= 0 ? '+' : ''}
                {Math.abs(globalBalance).toFixed(2)}
              </Text>
              <Text style={styles.globalSubtext}>
                {isNetPositive ? 'Net Receivable (Lena Hai)' : 'Net Payable (Dena Hai)'}
              </Text>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search contacts"
              placeholderTextColor="#94A3B8"
              style={styles.search}
            />
            <Text style={styles.sectionTitle}>People Directory</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No contacts found. Add one to get started.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={24} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>New Contact</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#94A3B8"
                value={newName}
                onChangeText={setNewName}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone (Optional)"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={setNewPhone}
              />
              <TouchableOpacity style={styles.linkContactBtn} onPress={openDevicePicker}>
                <MaterialIcons name="contacts" size={18} color="#A7F3D0" />
                <Text style={styles.linkContactText}>
                  {deviceContactId ? 'Device contact linked' : 'Link device contact'}
                </Text>
              </TouchableOpacity>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAddContact}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  tagline: { color: '#94A3B8', fontSize: 12 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notificationBell: { position: 'relative', padding: 4 },
  notifBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  profileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#047857',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6EE7B7',
    overflow: 'hidden',
  },
  profileImage: { width: 42, height: 42, borderRadius: 21 },
  profileInitial: { color: '#fff', fontWeight: '800', fontSize: 18 },
  globalCard: { margin: 16, padding: 24, borderRadius: 16, alignItems: 'center' },
  globalLabel: { fontSize: 16, color: '#F8FAFC', marginBottom: 8, opacity: 0.9 },
  globalAmount: { fontSize: 36, fontWeight: 'bold' },
  globalSubtext: { fontSize: 14, color: '#F8FAFC', marginTop: 8, opacity: 0.8 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  search: {
    marginHorizontal: 16,
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  listContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  contactCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 18, fontWeight: '600', color: '#F8FAFC' },
  contactPhone: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  contactBalanceContainer: { alignItems: 'flex-end' },
  balanceLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  contactBalance: { fontSize: 18, fontWeight: 'bold' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 16 },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: { padding: 12, marginRight: 8 },
  cancelBtnText: { color: '#94A3B8', fontSize: 16 },
  saveBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  linkContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#064E3B',
    borderRadius: 8,
    padding: 12,
    marginTop: 2,
  },
  linkContactText: { color: '#A7F3D0', fontWeight: '600' },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 16, textAlign: 'center' },
});
