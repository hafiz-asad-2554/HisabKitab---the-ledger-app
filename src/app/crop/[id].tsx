import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, ScrollView, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CropRecord, useAppStore, ExpenseCategory, ExpenseType } from '../../store';
import { COLORS } from '../../theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function CropLedgerScreen() {
  const { id, isShared } = useLocalSearchParams<{ id: string; isShared?: string }>();
  const isSharedLedger = isShared === 'true';
  const router = useRouter();

  const crop = useAppStore(state => state.crops.find(c => c.crop_id === id));
  const addCropRecord = useAppStore(state => state.addCropRecord);
  const updateCropRecord = useAppStore(state => state.updateCropRecord);
  const deleteCropRecord = useAppStore(state => state.deleteCropRecord);
  const updateCropStatus = useAppStore(state => state.updateCropStatus);
  const updateCrop = useAppStore(state => state.updateCrop);
  const deleteCrop = useAppStore(state => state.deleteCrop);

  const [modalVisible, setModalVisible] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState<ExpenseType>('EXPENSE');
  const [category, setCategory] = useState<ExpenseCategory>('OTHER');
  const [manageVisible, setManageVisible] = useState(false);
  const [cropName, setCropName] = useState('');
  const [acreage, setAcreage] = useState('');
  const [editingRecord, setEditingRecord] = useState<CropRecord | null>(null);

  if (!crop) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Crop not found.</Text>
      </View>
    );
  }

  const totalExpenses = crop.records
    .filter(r => r.type === 'EXPENSE')
    .reduce((acc, r) => acc + r.amount, 0);
  const totalRevenue = crop.records
    .filter(r => r.type === 'INCOME')
    .reduce((acc, r) => acc + r.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const isProfit = netProfit >= 0;

  const handleSaveRecord = () => {
    if (!desc.trim() || !amount.trim()) {
      Alert.alert('Error', 'Description and amount are required');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Error', 'Amount must be a valid positive number');
      return;
    }
    if (editingRecord) {
      updateCropRecord(crop.crop_id, editingRecord.record_id, {
        description: desc.trim(),
        amount: parsedAmount,
        type: txType,
        category,
      });
    } else {
      addCropRecord(crop.crop_id, category, desc.trim(), parsedAmount, txType);
    }
    setDesc('');
    setAmount('');
    setCategory('OTHER');
    setTxType('EXPENSE');
    setEditingRecord(null);
    setModalVisible(false);
  };

  const renderRecord = ({ item }: { item: CropRecord }) => {
    return (
      <Pressable
        style={styles.txRow}
        onPress={() => {
          setEditingRecord(item);
          setDesc(item.description);
          setAmount(item.amount.toString());
          setTxType(item.type);
          setCategory(item.category);
          setModalVisible(true);
        }}
      >
        <View style={styles.txDateDesc}>
          <View style={styles.catBadge}>
            <Text style={styles.catText}>{item.category.replace('_', ' ')}</Text>
          </View>
          <Text style={styles.txDesc}>{item.description}</Text>
          <Text style={styles.txDate}>{new Date(item.date).toLocaleDateString()}</Text>
        </View>
        <View style={styles.txAmounts}>
          <Text
            style={[
              styles.txAmount,
              { color: item.type === 'EXPENSE' ? COLORS.loss : COLORS.profit },
            ]}
          >
            {item.amount.toFixed(0)}
          </Text>
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Delete entry?', 'Remove this transaction?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteCropRecord(crop.crop_id, item.record_id),
                },
              ]);
            }}
            style={styles.deleteIcon}
          >
            <MaterialIcons name="delete" size={20} color={COLORS.loss} />
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  };

  const categories: ExpenseCategory[] = [
    'LAND_PREP',
    'SEEDS',
    'WATER',
    'SPRAY',
    'HARVEST',
    'REVENUE',
    'OTHER',
  ];

  const openManage = () => {
    setCropName(crop.crop_name);
    setAcreage(String(crop.acreage));
    setManageVisible(true);
  };

  const saveCrop = () => {
    const area = Number(acreage);
    if (!cropName.trim() || !Number.isFinite(area) || area <= 0)
      return Alert.alert('Invalid crop', 'Enter a crop name and a positive acreage.');
    updateCrop(crop.crop_id, cropName.trim(), area);
    setManageVisible(false);
  };

  const removeCrop = () =>
    Alert.alert(
      'Delete crop cycle?',
      `Deleting this crop cycle will erase all associated expense logs. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCrop(crop.crop_id);
            router.back();
          },
        },
      ]
    );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={openManage} style={styles.cropTitleHit}>
            <Text style={styles.cropName}>{crop.crop_name}</Text>
            <Text style={styles.editHint}>Edit cycle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.statusBadge,
              { backgroundColor: crop.status === 'ACTIVE' ? '#2563EB' : '#475569' },
            ]}
            onPress={() =>
              updateCropStatus(crop.crop_id, crop.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE')
            }
          >
            <Text style={styles.statusText}>{crop.status}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.acreageText}>{crop.acreage} Acres Cultivation</Text>

        <View style={styles.financialGrid}>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Total Input Costs</Text>
            <Text style={styles.gridExpense}>{totalExpenses.toFixed(0)}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Total Sales Harvested</Text>
            <Text style={styles.gridIncome}>{totalRevenue.toFixed(0)}</Text>
          </View>
        </View>

        <View style={styles.netContainer}>
          <Text style={styles.gridLabel}>Net Gain / Loss</Text>
          <Text
            style={[styles.netBalance, { color: isProfit ? COLORS.profit : COLORS.loss }]}
          >
            {Math.abs(netProfit).toFixed(0)}
          </Text>
        </View>
      </View>

      <FlatList
        data={[...crop.records].reverse()}
        keyExtractor={item => item.record_id}
        renderItem={renderRecord}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No resource inputs logged yet.</Text>
          </View>
        }
      />

      <View style={styles.footerActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.btnRed]}
          onPress={() => {
            setTxType('EXPENSE');
            setCategory('LAND_PREP');
            setEditingRecord(null);
            setModalVisible(true);
          }}
        >
          <MaterialIcons name="money-off" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>Expense</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.btnGreen]}
          onPress={() => {
            setTxType('INCOME');
            setCategory('REVENUE');
            setEditingRecord(null);
            setModalVisible(true);
          }}
        >
          <MaterialIcons name="attach-money" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>Revenue</Text>
        </TouchableOpacity>
      </View>

      {/* Add/Edit Record Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>
                {editingRecord
                  ? 'Edit Transaction'
                  : txType === 'EXPENSE'
                  ? 'Log Expense'
                  : 'Log Revenue'}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.catScroll}
              >
                {categories
                  .filter(c =>
                    txType === 'EXPENSE' ? c !== 'REVENUE' : c === 'REVENUE' || c === 'OTHER'
                  )
                  .map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.catSelectBadge,
                        category === cat && styles.catSelectBadgeActive,
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.catSelectText,
                          category === cat && styles.catSelectTextActive,
                        ]}
                      >
                        {cat.replace('_', ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              <TextInput
                style={styles.input}
                placeholder="Description (e.g. Tractor rental)"
                placeholderTextColor="#94A3B8"
                value={desc}
                onChangeText={setDesc}
              />
              <TextInput
                style={styles.input}
                placeholder="Amount"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: txType === 'EXPENSE' ? '#EF4444' : '#10B981' },
                  ]}
                  onPress={handleSaveRecord}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manage Crop Modal */}
      <Modal visible={manageVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Manage crop cycle</Text>
              <TextInput
                style={styles.input}
                value={cropName}
                onChangeText={setCropName}
                placeholder="Crop name"
                placeholderTextColor="#94A3B8"
              />
              <TextInput
                style={styles.input}
                value={acreage}
                onChangeText={setAcreage}
                keyboardType="decimal-pad"
                placeholder="Acreage"
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={saveCrop}>
                <Text style={styles.saveBtnText}>Save changes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteCycle} onPress={removeCrop}>
                <Text style={styles.deleteCycleText}>Delete entire crop cycle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setManageVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  errorText: { color: '#FCA5A5', fontSize: 18, textAlign: 'center', marginTop: 40 },
  header: { padding: 20, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cropName: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC' },
  cropTitleHit: { flex: 1, paddingRight: 8 },
  editHint: { color: '#94A3B8', fontSize: 11, marginTop: 3 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  acreageText: { fontSize: 14, color: '#94A3B8', marginTop: 8, marginBottom: 16 },
  financialGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  gridItem: { flex: 1 },
  gridLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  gridExpense: { fontSize: 18, fontWeight: 'bold', color: '#EF4444' },
  gridIncome: { fontSize: 18, fontWeight: 'bold', color: '#10B981' },
  netContainer: { alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 16 },
  netBalance: { fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  listContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  txDateDesc: { flex: 1 },
  catBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  catText: { fontSize: 10, color: '#F8FAFC', fontWeight: 'bold' },
  txDesc: { fontSize: 16, color: '#F8FAFC', fontWeight: '500' },
  txDate: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  txAmounts: { alignItems: 'flex-end', justifyContent: 'center' },
  txAmount: { fontSize: 18, fontWeight: 'bold' },
  footerActions: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  btnRed: { backgroundColor: '#EF4444' },
  btnGreen: { backgroundColor: '#10B981' },
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalContainer: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 16 },
  catScroll: { flexDirection: 'row', marginBottom: 16 },
  catSelectBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catSelectBadgeActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  catSelectText: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  catSelectTextActive: { color: '#FFF', fontWeight: 'bold' },
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
  saveBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  deleteCycle: { padding: 13, alignItems: 'center', marginTop: 10 },
  deleteCycleText: { color: '#F87171', fontWeight: '700' },
  deleteIcon: { marginLeft: 8 },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 16, textAlign: 'center' },
});
