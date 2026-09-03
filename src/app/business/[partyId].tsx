import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useBusinessStore, BizTxType, BusinessTransaction } from '../../store/businessStore';
import { usePartyPnL } from '../../hooks/useBusinessLedger';
import { COLORS } from '../../theme';
import { SearchBar } from '../../components/SearchBar';
import { exportBusinessPartyLedgerPDF, exportBusinessPartyLedgerXLSX } from '../../utils/exportLedger';

const TX_CATEGORIES = ['Sales', 'Purchase', 'Return', 'COGS', 'Cash In', 'Cash Out', 'Advance', 'Other'];
const TX_TYPES: { key: BizTxType; label: string; color: string }[] = [
  { key: 'income',  label: 'Income / Jama',  color: COLORS.profit },
  { key: 'expense', label: 'Expense / Kharcha', color: COLORS.loss },
  { key: 'credit',  label: 'Credit (Udhar)',  color: COLORS.warning },
  { key: 'debit',   label: 'Debit (Wapsi)',   color: COLORS.accent },
];

function fmt(n: number) {
  return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/* ────────────────────────────────────────── */
/* Transaction Row                           */
/* ────────────────────────────────────────── */
const TxRow = React.memo(({ item, onDelete }: { item: BusinessTransaction; onDelete: () => void }) => {
  const txMeta = TX_TYPES.find(t => t.key === item.type);
  const isPositive = item.type === 'income' || item.type === 'debit';

  return (
    <View style={styles.txRow}>
      <View style={[styles.txTypeBar, { backgroundColor: txMeta?.color ?? COLORS.accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.txCategory}>{item.category}</Text>
        {item.description ? <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text> : null}
        <Text style={styles.txDate}>{item.transaction_date?.slice(0, 10)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.txAmount, { color: isPositive ? COLORS.profit : COLORS.loss }]}>
          {isPositive ? '+' : '-'} ₨{fmt(item.amount)}
        </Text>
        <Text style={[styles.txTypeLabel, { color: txMeta?.color ?? COLORS.accent }]}>{txMeta?.label}</Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteTxBtn}>
        <MaterialIcons name="delete-outline" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
});

/* ────────────────────────────────────────── */
/* Main Screen                               */
/* ────────────────────────────────────────── */
export default function BusinessPartyScreen() {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const router = useRouter();

  const party              = useBusinessStore(s => s.parties.find(p => p.id === partyId));
  const addBizTransaction  = useBusinessStore(s => s.addBizTransaction);
  const deleteBizTransaction = useBusinessStore(s => s.deleteBizTransaction);
  const deleteParty        = useBusinessStore(s => s.deleteParty);

  const { totalCredit, totalDebit, balance, txns } = usePartyPnL(partyId ?? '');

  const [modalVisible, setModalVisible] = useState(false);
  const [txType, setTxType]             = useState<BizTxType>('income');
  const [amount, setAmount]             = useState('');
  const [category, setCategory]         = useState('Sales');
  const [desc, setDesc]                 = useState('');
  const [date, setDate]                 = useState(new Date().toISOString().slice(0, 10));

  if (!party) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.textSecondary }}>Party not found.</Text>
      </View>
    );
  }

  const isOwed = balance < 0;  // they owe us
  const balColor = isOwed ? COLORS.profit : balance > 0 ? COLORS.loss : COLORS.textSecondary;

  const handleAddTx = () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { Alert.alert('Invalid', 'Enter a valid amount.'); return; }
    if (!isValidDateInput(date)) { Alert.alert('Invalid', 'Enter a valid date in YYYY-MM-DD format.'); return; }
    addBizTransaction(partyId ?? null, txType, parsed, category, desc.trim(), date);
    setAmount(''); setDesc('');
    setModalVisible(false);
  };

  const confirmDelete = () => {
    Alert.alert('Delete Party?', `This will delete ${party.name} and all their transactions. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deleteParty(party.id); router.back(); } },
      ]
    );
  };

  const renderTx = useCallback(({ item }: { item: BusinessTransaction }) => (
    <TxRow
      item={item}
      onDelete={() =>
        Alert.alert('Delete?', 'Remove this transaction?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteBizTransaction(item.id) },
        ])
      }
    />
  ), [deleteBizTransaction]);

  const [searchQuery, setSearchQuery] = useState('');

  const reversedTxns = useMemo(() => [...txns].reverse(), [txns]);

  const filteredTxns = useMemo(() => {
    if (!searchQuery.trim()) return reversedTxns;
    const q = searchQuery.trim().toLowerCase();
    return reversedTxns.filter(t => {
      const catMatch = t.category.toLowerCase().includes(q);
      const descMatch = t.description ? t.description.toLowerCase().includes(q) : false;
      const typeMatch = t.type.toLowerCase().includes(q);
      const amountMatch = t.amount.toString().includes(q);
      const dateMatch = t.transaction_date.toLowerCase().includes(q);
      return catMatch || descMatch || typeMatch || amountMatch || dateMatch;
    });
  }, [reversedTxns, searchQuery]);

  return (
    <View style={styles.container}>
      {/* ── Party Header ── */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: party.party_type === 'customer' ? '#1D4ED8' : '#6D28D9' }]}>
          <MaterialIcons name={party.party_type === 'customer' ? 'person' : 'store'} size={28} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{party.name}</Text>
          <Text style={styles.headerMeta}>
            {party.party_type === 'customer' ? 'Customer' : 'Supplier'}
            {party.phone ? `  ·  ${party.phone}` : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity onPress={() => exportBusinessPartyLedgerPDF(party, txns)} style={{ padding: 6 }}>
            <MaterialIcons name="picture-as-pdf" size={22} color="#A7F3D0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => exportBusinessPartyLedgerXLSX(party, txns)} style={{ padding: 6 }}>
            <MaterialIcons name="table-chart" size={22} color="#A7F3D0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDelete} style={styles.deletePartyBtn}>
            <MaterialIcons name="delete" size={22} color={COLORS.loss} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Balance Card ── */}
      <View style={styles.balCard}>
        <View style={styles.balStat}>
          <Text style={styles.balLabel}>Total In (Jama)</Text>
          <Text style={[styles.balValue, { color: COLORS.profit }]}>₨{fmt(totalCredit)}</Text>
        </View>
        <View style={styles.balDivider} />
        <View style={styles.balStat}>
          <Text style={styles.balLabel}>Total Out (Udhar)</Text>
          <Text style={[styles.balValue, { color: COLORS.loss }]}>₨{fmt(totalDebit)}</Text>
        </View>
        <View style={styles.balDivider} />
        <View style={styles.balStat}>
          <Text style={styles.balLabel}>{isOwed ? 'Lena Hai' : balance > 0 ? 'Dena Hai' : 'Settled'}</Text>
          <Text style={[styles.balValueLarge, { color: balColor }]}>₨{fmt(Math.abs(balance))}</Text>
        </View>
      </View>

      {/* ── Search Bar ── */}
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Filter transactions by category, description, date…"
      />

      {/* ── Transaction List ── */}
      <Text style={styles.sectionTitle}>{filteredTxns.length} Transactions</Text>
      <FlatList
        data={filteredTxns}
        keyExtractor={t => t.id}
        renderItem={renderTx}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No transactions matching search.' : 'No transactions yet. Tap + to add one.'}
            </Text>
          </View>
        }
      />

      {/* ── FAB ── */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={26} color="#FFF" />
      </TouchableOpacity>

      {/* ── Add Transaction Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.overlayScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>New Transaction</Text>

              {/* Type Selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TX_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.typeChip, txType === t.key && { backgroundColor: t.color, borderColor: t.color }]}
                      onPress={() => setTxType(t.key)}
                    >
                      <Text style={[styles.typeChipText, txType === t.key && { color: '#FFF' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <TextInput style={styles.input} placeholder="Amount (₨) *" placeholderTextColor={COLORS.textSecondary}
                keyboardType="numeric" value={amount} onChangeText={setAmount} />

              {/* Category chips */}
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TX_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, category === cat && styles.catChipActive]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[styles.catChipText, category === cat && { color: '#FFF' }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <TextInput style={styles.input} placeholder="Description (optional)"
                placeholderTextColor={COLORS.textSecondary} value={desc} onChangeText={setDesc} />
              <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={COLORS.textSecondary} value={date} onChangeText={setDate} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAddTx}>
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

/* ────────────────────────────────────────── */
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  header:          { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  headerIcon:      { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  headerName:      { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  headerMeta:      { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  deletePartyBtn:  { padding: 8 },
  balCard:         { flexDirection: 'row', backgroundColor: COLORS.surface, marginHorizontal: 16,
                     borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  balStat:         { flex: 1, alignItems: 'center' },
  balDivider:      { width: 1, backgroundColor: COLORS.border },
  balLabel:        { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4, textAlign: 'center' },
  balValue:        { fontSize: 15, fontWeight: 'bold' },
  balValueLarge:   { fontSize: 18, fontWeight: '800' },
  sectionTitle:    { fontSize: 13, color: COLORS.textSecondary, marginHorizontal: 16, marginBottom: 8, fontWeight: '600' },
  list:            { paddingHorizontal: 16, paddingBottom: 100 },
  txRow:           { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
                     borderRadius: 12, marginBottom: 8, padding: 12, gap: 10,
                     borderWidth: 1, borderColor: COLORS.border },
  txTypeBar:       { width: 4, height: 42, borderRadius: 2 },
  txCategory:      { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  txDesc:          { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  txDate:          { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  txAmount:        { fontSize: 16, fontWeight: 'bold' },
  txTypeLabel:     { fontSize: 10, marginTop: 3, fontWeight: '600' },
  deleteTxBtn:     { padding: 4 },
  emptyBox:        { padding: 32, alignItems: 'center' },
  emptyText:       { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center' },
  fab:             { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
                     borderRadius: 28, backgroundColor: COLORS.headerBlue,
                     justifyContent: 'center', alignItems: 'center', elevation: 6 },
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  overlayScroll:   { flexGrow: 1, justifyContent: 'flex-end' },
  modalBox:        { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle:      { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 14 },
  inputLabel:      { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, fontWeight: '600' },
  input:           { backgroundColor: COLORS.background, color: COLORS.textPrimary, padding: 13, borderRadius: 10,
                     marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  typeChip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                     backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  typeChipText:    { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  catChip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                     backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  catChipActive:   { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  catChipText:     { color: COLORS.textSecondary, fontSize: 13 },
  modalActions:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn:       { padding: 13 },
  cancelBtnText:   { color: COLORS.textSecondary, fontSize: 15 },
  saveBtn:         { backgroundColor: COLORS.accent, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10 },
  saveBtnText:     { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
});
