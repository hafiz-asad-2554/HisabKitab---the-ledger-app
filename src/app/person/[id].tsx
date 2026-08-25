import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Contacts from 'expo-contacts/legacy';
import { useAppStore, Transaction } from '../../store';
import { COLORS } from '../../theme';
import { runningBalance } from '../../sync';
import { exportContactLedgerPDF } from '../../utils/exportLedger';
import { MaterialIcons } from '@expo/vector-icons';

type TxKind = 'GIVEN' | 'TAKEN';

/* ─── Avatar Picker Helper ─── */
async function pickAndSaveAvatar(
  mode: 'camera' | 'gallery',
  personId: string
): Promise<string | null> {
  if (mode === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required to take a photo.');
      return null;
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Media library access is required to choose a photo.');
      return null;
    }
  }

  const result =
    mode === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });

  if (result.canceled || !result.assets?.length) return null;

  const src = result.assets[0].uri;
  // Copy to app's document directory so it persists across cache clears
  const destDir = FileSystem.documentDirectory + 'avatars/';
  await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
  const ext = src.split('.').pop()?.toLowerCase() || 'jpg';
  const dest = destDir + `avatar_${personId}.${ext}`;
  await FileSystem.copyAsync({ from: src, to: dest });
  return dest;
}

/* ─── Sync avatar to device contact ─── */
async function syncAvatarToDeviceContact(
  deviceContactId: string,
  localAvatarUri: string | null
): Promise<void> {
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return;

    const contact = await Contacts.getContactByIdAsync(deviceContactId, [Contacts.Fields.Image]);
    if (!contact) return;

    if (localAvatarUri) {
      // Read the file as base64 for expo-contacts
      const base64 = await FileSystem.readAsStringAsync(localAvatarUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Contacts.updateContactAsync({
        ...contact,
        image: { uri: `data:image/jpeg;base64,${base64}` } as any,
      });
    }
  } catch {
    // Non-fatal — device contact update is best-effort
  }
}

export default function Ledger() {
  const { id, isShared } = useLocalSearchParams<{ id: string; isShared?: string }>();
  const isSharedLedger = isShared === 'true';
  const router = useRouter();

  const contact = useAppStore(s => s.contacts.find(c => c.person_id === id));
  const add = useAppStore(s => s.addTransaction);
  const update = useAppStore(s => s.updateTransaction);
  const remove = useAppStore(s => s.deleteTransaction);
  const updateContact = useAppStore(s => s.updateContact);
  const deleteContact = useAppStore(s => s.deleteContact);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction>();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<TxKind>('GIVEN');
  const [date, setDate] = useState(new Date());
  const [picker, setPicker] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Avatar picker action sheet state
  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);

  const ordered = useMemo(
    () =>
      contact
        ? [...contact.transactions].sort(
            (a, b) =>
              a.custom_transaction_date.localeCompare(b.custom_transaction_date) ||
              a.client_mutation_timestamp - b.client_mutation_timestamp
          )
        : [],
    [contact]
  );

  // Memoized running balance calculation to prevent recalculating 3x inline per render pass
  const currentRunningBalance = useMemo(
    () => (ordered.length > 0 ? runningBalance(ordered) : 0),
    [ordered]
  );

  if (!contact)
    return (
      <View style={styles.page}>
        <Text style={styles.empty}>Ledger not found.</Text>
      </View>
    );

  const start = (t?: Transaction) => {
    setEditing(t);
    setDescription(t?.description || '');
    const isGiven = (t?.given_amount || 0) > 0;
    setKind(isGiven ? 'GIVEN' : 'TAKEN');
    setAmount(t ? String(isGiven ? t.given_amount : t.taken_amount) : '');
    setDate(t ? new Date(t.custom_transaction_date) : new Date());
    setOpen(true);
  };

  const save = () => {
    const numeric = Number(amount);
    if (!description.trim() || !Number.isFinite(numeric) || numeric <= 0)
      return Alert.alert('Missing details', 'Enter a description and a positive amount.');
    const data = {
      description: description.trim(),
      given_amount: kind === 'GIVEN' ? numeric : 0,
      taken_amount: kind === 'TAKEN' ? numeric : 0,
      custom_transaction_date: date.toISOString(),
    };
    editing
      ? update(contact.person_id, editing.transaction_id, data)
      : add(contact.person_id, data.description, data.given_amount, data.taken_amount, data.custom_transaction_date);
    setOpen(false);
  };

  const confirmDelete = (t: Transaction) =>
    Alert.alert(
      'Delete transaction?',
      'This will remove the entry and recalculate the running balance.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove(contact.person_id, t.transaction_id) },
      ]
    );

  const handleExportPDF = () => {
    if (isSharedLedger) {
      Alert.alert('Export Restricted', 'Exporting PDF is disabled for secondary users on shared ledgers.');
      return;
    }
    void exportContactLedgerPDF(contact);
  };

  const openEditModal = () => {
    setEditName(contact.display_name);
    setEditPhone(contact.phone_number || '');
    setEditEmail(contact.email || '');
    setEditNotes(contact.notes || '');
    setEditModalVisible(true);
  };

  const handleSaveContact = () => {
    if (!editName.trim()) {
      return Alert.alert('Error', 'Name is required');
    }
    updateContact(
      contact.person_id,
      editName.trim(),
      editPhone.trim(),
      editNotes.trim() || undefined,
      contact.person_avatar_uri,
      editEmail.trim() || undefined
    );
    setEditModalVisible(false);
  };

  /* ─── Delete Entire Ledger ─── */
  const confirmDeleteLedger = () => {
    Alert.alert(
      `Delete ${contact.display_name}'s ledger?`,
      'This removes all transactions and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (contact.person_avatar_uri) {
              try {
                await FileSystem.deleteAsync(contact.person_avatar_uri, { idempotent: true });
              } catch {
                // best-effort
              }
            }
            deleteContact(contact.person_id);
            router.back();
          },
        },
      ]
    );
  };

  /* ─── ⋮ Menu ─── */
  const showMenu = () => {
    Alert.alert(
      contact.display_name,
      'Choose an action',
      [
        { text: 'Edit Details', onPress: openEditModal },
        {
          text: 'Delete Ledger',
          style: 'destructive',
          onPress: confirmDeleteLedger,
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  /* ─── Avatar Picker Actions ─── */
  const handleAvatarPress = () => {
    setAvatarMenuVisible(true);
  };

  const handleAvatarAction = async (action: 'camera' | 'gallery' | 'remove') => {
    setAvatarMenuVisible(false);
    if (action === 'remove') {
      if (contact.person_avatar_uri) {
        try {
          await FileSystem.deleteAsync(contact.person_avatar_uri, { idempotent: true });
        } catch {
          // best-effort
        }
      }
      updateContact(
        contact.person_id,
        contact.display_name,
        contact.phone_number,
        contact.notes,
        undefined,
        contact.email
      );
      return;
    }

    const newUri = await pickAndSaveAvatar(action, contact.person_id);
    if (!newUri) return;

    updateContact(
      contact.person_id,
      contact.display_name,
      contact.phone_number,
      contact.notes,
      newUri,
      contact.email
    );

    if (contact.is_linked_to_device_contacts && contact.device_contact_identifier) {
      await syncAvatarToDeviceContact(contact.device_contact_identifier, newUri);
    }
  };

  const renderTransactionItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <View style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => start(item)}>
          <Text style={styles.desc}>{item.description}</Text>
          <Text style={styles.date}>{item.custom_transaction_date.slice(0, 10)} · tap to edit</Text>
        </Pressable>
        <View>
          <Text style={[styles.value, { color: item.given_amount ? COLORS.profit : COLORS.loss }]}>
            {item.given_amount ? item.given_amount.toFixed(2) : item.taken_amount.toFixed(2)}
          </Text>
          <TouchableOpacity onPress={() => confirmDelete(item)}>
            <Text style={styles.delete}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [confirmDelete]
  );

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={handleAvatarPress} style={styles.avatarWrapper} activeOpacity={0.8}>
          {contact.person_avatar_uri ? (
            <Image source={{ uri: contact.person_avatar_uri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{contact.display_name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <MaterialIcons name="camera-alt" size={12} color="#fff" />
          </View>
        </TouchableOpacity>

        <Text style={styles.name}>{contact.display_name}</Text>
        <Text style={styles.phone}>
          {contact.phone_number || 'No phone'}
          {contact.email ? ` · ${contact.email}` : ''}
          {contact.notes ? ` · ${contact.notes}` : ''}
        </Text>
        <Text style={[styles.amount, { color: currentRunningBalance >= 0 ? COLORS.profit : COLORS.loss }]}>
          {Math.abs(currentRunningBalance).toFixed(2)}
        </Text>
        <Text style={styles.sub}>{currentRunningBalance >= 0 ? 'Lena Hai · receivable' : 'Dena Hai · payable'}</Text>

        <View style={styles.headerActions}>
          {!isSharedLedger && (
            <TouchableOpacity style={styles.iconBtn} onPress={handleExportPDF}>
              <MaterialIcons name="picture-as-pdf" size={22} color="#A7F3D0" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={showMenu}>
            <MaterialIcons name="more-vert" size={24} color="#F8FAFC" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={ordered}
        keyExtractor={x => x.transaction_id}
        contentContainerStyle={styles.list}
        renderItem={renderTransactionItem}
      />

      <TouchableOpacity style={styles.fab} onPress={() => start()}>
        <Text style={styles.add}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={avatarMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setAvatarMenuVisible(false)}
        >
          <View style={styles.avatarMenu}>
            <Text style={styles.avatarMenuTitle}>Profile Photo</Text>
            <TouchableOpacity style={styles.avatarMenuOption} onPress={() => handleAvatarAction('camera')}>
              <MaterialIcons name="camera-alt" size={20} color="#A7F3D0" />
              <Text style={styles.avatarMenuText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarMenuOption} onPress={() => handleAvatarAction('gallery')}>
              <MaterialIcons name="photo-library" size={20} color="#A7F3D0" />
              <Text style={styles.avatarMenuText}>Choose from Gallery</Text>
            </TouchableOpacity>
            {contact.person_avatar_uri && (
              <TouchableOpacity style={styles.avatarMenuOption} onPress={() => handleAvatarAction('remove')}>
                <MaterialIcons name="delete" size={20} color="#F87171" />
                <Text style={[styles.avatarMenuText, { color: '#F87171' }]}>Remove Photo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.avatarMenuCancel} onPress={() => setAvatarMenuVisible(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editing ? 'Edit transaction' : 'Add new transaction'}</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor="#94A3B8"
                autoFocus
              />
              <Text style={styles.fieldLabel}>Amount</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.fieldLabel}>Transaction type</Text>
              <View style={styles.selector}>
                <TouchableOpacity
                  onPress={() => setKind('GIVEN')}
                  style={[styles.choice, kind === 'GIVEN' && styles.given]}
                >
                  <Text style={styles.choiceText}>Given (Diye)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setKind('TAKEN')}
                  style={[styles.choice, kind === 'TAKEN' && styles.taken]}
                >
                  <Text style={styles.choiceText}>Taken (Liye)</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Date</Text>
              <TouchableOpacity style={styles.dateButton} onPress={() => setPicker(true)}>
                <Text style={styles.dateButtonText}>{date.toLocaleDateString()}</Text>
                <Text style={styles.calendar}>▣</Text>
              </TouchableOpacity>
              {picker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  onChange={(_, value) => {
                    setPicker(Platform.OS === 'ios');
                    if (value) setDate(value);
                  }}
                />
              )}
              <TouchableOpacity style={styles.save} onPress={save}>
                <Text style={styles.saveText}>Save & recalculate</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Edit Contact Details</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#94A3B8"
                value={editName}
                onChangeText={setEditName}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#94A3B8"
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Phone"
                placeholderTextColor="#94A3B8"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.input}
                placeholder="Notes / Address"
                placeholderTextColor="#94A3B8"
                value={editNotes}
                onChangeText={setEditNotes}
              />
              <TouchableOpacity style={styles.save} onPress={handleSaveContact}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0F172A' },
  hero: { padding: 20, backgroundColor: '#1E293B', alignItems: 'center' },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#047857',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 28 },
  name: { color: '#F8FAFC', fontSize: 23, fontWeight: '700', marginTop: 8 },
  phone: { color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  amount: { color: '#10B981', fontSize: 32, fontWeight: '800', marginTop: 16 },
  sub: { color: '#CBD5E1' },
  headerActions: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: { padding: 8 },
  list: { padding: 16, paddingBottom: 100 },
  row: {
    backgroundColor: '#1E293B',
    padding: 15,
    borderRadius: 10,
    marginBottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowMain: { flex: 1, paddingRight: 10 },
  desc: { color: '#F8FAFC', fontWeight: '600' },
  date: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  value: { fontWeight: '800', textAlign: 'right' },
  delete: { color: '#F87171', fontSize: 12, textAlign: 'right', marginTop: 7 },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: { fontSize: 30, color: '#fff' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  avatarMenu: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    margin: 32,
    padding: 20,
    marginTop: 'auto',
    marginBottom: 32,
  },
  avatarMenuTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  avatarMenuOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  avatarMenuText: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  avatarMenuCancel: { paddingTop: 14, alignItems: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modal: {
    backgroundColor: '#1E293B',
    padding: 22,
    borderRadius: 20,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  modalTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginBottom: 14 },
  input: {
    color: '#F8FAFC',
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  fieldLabel: { color: '#CBD5E1', fontWeight: '700', marginBottom: 7 },
  selector: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  choice: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center' },
  given: { backgroundColor: '#047857' },
  taken: { backgroundColor: '#B91C1C' },
  choiceText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dateButton: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dateButtonText: { color: '#F8FAFC' },
  calendar: { color: '#A7F3D0' },
  save: { backgroundColor: '#10B981', padding: 14, borderRadius: 9, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  cancel: { textAlign: 'center', color: '#94A3B8', padding: 14 },
  empty: { color: '#F8FAFC', padding: 20 },
});
