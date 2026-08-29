import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useCapitalStore, CapitalExpense, PaymentMethod } from '../../store/capitalStore';
import { useCapitalPoolSummary } from '../../hooks/useCapitalPool';
import { COLORS } from '../../theme';

const EXPENSE_CATEGORIES = ['Materials', 'Labour', 'Equipment', 'Transport', 'Finishing', 'Electrical', 'Plumbing', 'Other'];
const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'cash',   label: 'Cash',   icon: 'payments' },
  { key: 'bank',   label: 'Bank',   icon: 'account-balance' },
  { key: 'credit', label: 'Credit', icon: 'credit-card' },
];

function fmt(n: number) {
  return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/* ────────────────────────────────────────── */
/* Expense Row                               */
/* ────────────────────────────────────────── */
const ExpenseRow = React.memo(({ item, onDelete }: { item: CapitalExpense; onDelete: () => void }) => (
  <View style={styles.expRow}>
    <View style={{ flex: 1 }}>
      <View style={styles.expRowTop}>
        <Text style={styles.expItemName}>{item.item_name}</Text>
        <Text style={[styles.expTotalCost, { color: COLORS.loss }]}>₨{fmt(item.total_cost)}</Text>
      </View>
      <Text style={styles.expMeta}>
        {item.quantity} × ₨{fmt(item.unit_price)}
        {item.vendor_name ? `  ·  ${item.vendor_name}` : ''}
      </Text>
      <View style={styles.expTags}>
        <View style={styles.expTag}>
          <Text style={styles.expTagText}>{item.category}</Text>
        </View>
        <View style={[styles.expTag, { backgroundColor: '#1E3A2B' }]}>
          <Text style={[styles.expTagText, { color: '#34D399' }]}>{item.payment_method.toUpperCase()}</Text>
        </View>
        <Text style={styles.expDate}>{item.expense_date?.slice(0, 10)}</Text>
      </View>
    </View>
    <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
      <MaterialIcons name="delete-outline" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  </View>
));

/* ────────────────────────────────────────── */
/* Main Screen                               */
/* ────────────────────────────────────────── */
export default function CapitalPoolScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>();
  const router = useRouter();

  const pool               = useCapitalStore(s => s.capitalPools.find(p => p.id === poolId));
  const addCapitalExpense  = useCapitalStore(s => s.addCapitalExpense);
  const deleteCapitalExpense = useCapitalStore(s => s.deleteCapitalExpense);
  const deleteCapitalPool  = useCapitalStore(s => s.deleteCapitalPool);

  const summary = useCapitalPoolSummary(poolId ?? '');

  const [modalVisible, setModalVisible]   = useState(false);
  const [itemName, setItemName]           = useState('');
  const [quantity, setQuantity]           = useState('');
  const [unitPrice, setUnitPrice]         = useState('');
  const [vendorName, setVendorName]       = useState('');
  const [payMethod, setPayMethod]         = useState<PaymentMethod>('cash');
  const [category, setCategory]           = useState('Materials');
  const [expDate, setExpDate]             = useState(new Date().toISOString().slice(0, 10));

  // Derived total cost display (live preview)
  const previewTotal = (() => {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    return Number.isFinite(q) && Number.isFinite(p) ? q * p : null;
  })();

  if (!pool) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.textSecondary }}>Pool not found.</Text>
      </View>
    );
  }

  const pct = summary.percentUsed;
  const barColor = summary.isOverBudget ? COLORS.loss : summary.isWarning ? COLORS.warning : COLORS.profit;

  const resetForm = () => {
    setItemName(''); setQuantity(''); setUnitPrice('');
    setVendorName(''); setPayMethod('cash'); setCategory('Materials');
    setExpDate(new Date().toISOString().slice(0, 10));
  };

  const handleAdd = () => {
    if (!itemName.trim()) { Alert.alert('Required', 'Item name is required.'); return; }
    const q = Number(quantity);
    const p = Number(unitPrice);
    if (!Number.isFinite(q) || q <= 0) { Alert.alert('Invalid', 'Enter a valid quantity.'); return; }
    if (!Number.isFinite(p) || p < 0) { Alert.alert('Invalid', 'Enter a valid unit price.'); return; }
    if (!isValidDateInput(expDate)) { Alert.alert('Invalid', 'Enter a valid date in YYYY-MM-DD format.'); return; }

    const computedTotal = parseFloat((q * p).toFixed(2));

    // PRD validation: quantity × unit_price must equal total_cost
    // (Store enforces this; we just show a clear message if inputs are bad)
    addCapitalExpense(poolId!, itemName.trim(), q, p, vendorName.trim(), payMethod, category, expDate);

    if (summary.totalSpent + computedTotal > pool.total_budget * 0.8 && summary.totalSpent <= pool.total_budget * 0.8) {
      Alert.alert('⚠️ Budget Warning', 'This pool has now exceeded 80% of its allocated budget.');
    }
    resetForm();
    setModalVisible(false);
  };

  const confirmDeletePool = () =>
    Alert.alert('Delete Pool?', `Delete "${pool.title}" and all its expenses?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteCapitalPool(pool.id); router.back(); } },
    ]);

  const renderExpense = useCallback(({ item }: { item: CapitalExpense }) => (
    <ExpenseRow
      item={item}
      onDelete={() =>
        Alert.alert('Delete?', 'Remove this expense?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteCapitalExpense(item.id) },
        ])
      }
    />
  ), [deleteCapitalExpense]);

  return (
    <View style={styles.container}>
      {/* ── Pool Header ── */}
      <View style={styles.poolHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.poolTitle}>{pool.title}</Text>
          {pool.description ? <Text style={styles.poolDesc}>{pool.description}</Text> : null}
        </View>
        <TouchableOpacity onPress={confirmDeletePool} style={styles.deletePoolBtn}>
          <MaterialIcons name="delete" size={22} color={COLORS.loss} />
        </TouchableOpacity>
      </View>

      {/* ── Summary Dashboard ── */}
      <View style={[styles.summaryCard, summary.isWarning && styles.summaryWarning, summary.isOverBudget && styles.summaryOver]}>
        {/* Warning / Over-Budget Banner */}
        {(summary.isWarning || summary.isOverBudget) && (
          <View style={styles.alertBanner}>
            <MaterialIcons
              name={summary.isOverBudget ? 'error' : 'warning'}
              size={18}
              color={summary.isOverBudget ? COLORS.loss : COLORS.warning}
            />
            <Text style={[styles.alertText, { color: summary.isOverBudget ? COLORS.loss : COLORS.warning }]}>
              {summary.isOverBudget
                ? `Over budget by ₨${fmt(Math.abs(summary.remaining))}!`
                : `Warning: ${(pct * 100).toFixed(0)}% of budget exhausted`}
            </Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Budget</Text>
            <Text style={[styles.statValue, { color: COLORS.poolBudget }]}>₨{fmt(summary.totalBudget)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Spent</Text>
            <Text style={[styles.statValue, { color: COLORS.loss }]}>₨{fmt(summary.totalSpent)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Remaining</Text>
            <Text style={[styles.statValue, { color: summary.remaining < 0 ? COLORS.loss : COLORS.profit }]}>
              ₨{fmt(Math.abs(summary.remaining))}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(pct * 100, 100)}%` as any, backgroundColor: barColor }]} />
        </View>
        <Text style={styles.pctText}>{(pct * 100).toFixed(1)}% utilized · {summary.expenses.length} items logged</Text>

        {/* Category breakdown */}
        {Object.keys(summary.expensesByCategory).length > 0 && (
          <View style={styles.catBreakdown}>
            {Object.entries(summary.expensesByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => (
                <View key={cat} style={styles.catRow}>
                  <Text style={styles.catRowLabel}>{cat}</Text>
                  <Text style={[styles.catRowValue, { color: COLORS.loss }]}>₨{fmt(total)}</Text>
                </View>
              ))}
          </View>
        )}
      </View>

      {/* ── Expense List ── */}
      <Text style={styles.sectionTitle}>{summary.expenses.length} Expenses</Text>
      <FlatList
        data={[...summary.expenses].reverse()}
        keyExtractor={e => e.id}
        renderItem={renderExpense}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No expenses logged yet.{'\n'}Tap + to add the first item.</Text>
          </View>
        }
      />

      {/* ── FAB ── */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={26} color="#FFF" />
      </TouchableOpacity>

      {/* ── Add Expense Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.overlayScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Log Expense</Text>

              <TextInput style={styles.input} placeholder="Item Name *" placeholderTextColor={COLORS.textSecondary}
                value={itemName} onChangeText={setItemName} />

              <View style={styles.rowInputs}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Quantity *"
                  placeholderTextColor={COLORS.textSecondary} keyboardType="numeric"
                  value={quantity} onChangeText={setQuantity} />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Unit Price (₨) *"
                  placeholderTextColor={COLORS.textSecondary} keyboardType="numeric"
                  value={unitPrice} onChangeText={setUnitPrice} />
              </View>

              {/* Live total cost preview */}
              <View style={styles.totalPreview}>
                <Text style={styles.totalPreviewLabel}>Total Cost =</Text>
                <Text style={[styles.totalPreviewValue, { color: previewTotal !== null ? COLORS.loss : COLORS.textMuted }]}>
                  {previewTotal !== null ? `₨${fmt(previewTotal)}` : '—'}
                </Text>
              </View>

              <TextInput style={styles.input} placeholder="Vendor Name (optional)"
                placeholderTextColor={COLORS.textSecondary} value={vendorName} onChangeText={setVendorName} />

              {/* Category */}
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat}
                      style={[styles.catChip, category === cat && styles.catChipActive]}
                      onPress={() => setCategory(cat)}>
                      <Text style={[styles.catChipText, category === cat && { color: '#FFF' }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Payment Method */}
              <Text style={styles.inputLabel}>Payment Method</Text>
              <View style={styles.payRow}>
                {PAYMENT_METHODS.map(m => (
                  <TouchableOpacity key={m.key}
                    style={[styles.payBtn, payMethod === m.key && styles.payBtnActive]}
                    onPress={() => setPayMethod(m.key)}>
                    <MaterialIcons name={m.icon as any} size={18}
                      color={payMethod === m.key ? '#FFF' : COLORS.textSecondary} />
                    <Text style={[styles.payBtnText, payMethod === m.key && { color: '#FFF' }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={[styles.input, { marginTop: 12 }]} placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={COLORS.textSecondary} value={expDate} onChangeText={setExpDate} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); setModalVisible(false); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                  <Text style={styles.saveBtnText}>Log Expense</Text>
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
  container:      { flex: 1, backgroundColor: COLORS.background },
  poolHeader:     { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  poolTitle:      { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  poolDesc:       { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  deletePoolBtn:  { padding: 6 },
  summaryCard:    { marginHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: 16,
                    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  summaryWarning: { borderColor: COLORS.warning },
  summaryOver:    { borderColor: COLORS.loss },
  alertBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
                    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 },
  alertText:      { fontSize: 13, fontWeight: '700', flex: 1 },
  statsRow:       { flexDirection: 'row', justifyContent: 'space-around' },
  statBox:        { alignItems: 'center', flex: 1 },
  statLabel:      { fontSize: 10, color: COLORS.textMuted, marginBottom: 4, textAlign: 'center' },
  statValue:      { fontSize: 14, fontWeight: 'bold' },
  progressTrack:  { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4,
                    marginVertical: 14, overflow: 'hidden' },
  progressFill:   { height: 8, borderRadius: 4 },
  pctText:        { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  catBreakdown:   { marginTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, gap: 6 },
  catRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  catRowLabel:    { fontSize: 13, color: COLORS.textSecondary },
  catRowValue:    { fontSize: 13, fontWeight: '600' },
  sectionTitle:   { fontSize: 13, color: COLORS.textSecondary, marginHorizontal: 16, marginBottom: 8, fontWeight: '600' },
  list:           { paddingHorizontal: 16, paddingBottom: 100 },
  expRow:         { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.surface,
                    borderRadius: 12, marginBottom: 8, padding: 14, gap: 10,
                    borderWidth: 1, borderColor: COLORS.border },
  expRowTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  expItemName:    { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, flex: 1, marginRight: 8 },
  expTotalCost:   { fontSize: 16, fontWeight: 'bold' },
  expMeta:        { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  expTags:        { flexDirection: 'row', gap: 8, alignItems: 'center' },
  expTag:         { backgroundColor: '#1E2D42', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  expTagText:     { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  expDate:        { fontSize: 11, color: COLORS.textMuted },
  deleteBtn:      { padding: 4 },
  emptyBox:       { padding: 40, alignItems: 'center' },
  emptyText:      { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  fab:            { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
                    backgroundColor: COLORS.poolBudget, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  overlayScroll:  { flexGrow: 1, justifyContent: 'flex-end' },
  modalBox:       { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:     { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 14 },
  input:          { backgroundColor: COLORS.background, color: COLORS.textPrimary, padding: 13, borderRadius: 10,
                    marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  rowInputs:      { flexDirection: 'row', gap: 10 },
  halfInput:      { flex: 1 },
  totalPreview:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                    backgroundColor: COLORS.background, borderRadius: 10, padding: 12,
                    marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  totalPreviewLabel: { fontSize: 13, color: COLORS.textSecondary },
  totalPreviewValue: { fontSize: 18, fontWeight: 'bold' },
  inputLabel:     { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, fontWeight: '600' },
  catChip:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  catChipActive:  { backgroundColor: COLORS.poolBudget, borderColor: COLORS.poolBudget },
  catChipText:    { color: COLORS.textSecondary, fontSize: 13 },
  payRow:         { flexDirection: 'row', gap: 10, marginBottom: 4 },
  payBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    backgroundColor: COLORS.background, borderRadius: 10, paddingVertical: 10,
                    borderWidth: 1, borderColor: COLORS.border },
  payBtnActive:   { backgroundColor: COLORS.profit, borderColor: COLORS.profit },
  payBtnText:     { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  modalActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn:      { padding: 13 },
  cancelBtnText:  { color: COLORS.textSecondary, fontSize: 15 },
  saveBtn:        { backgroundColor: COLORS.poolBudget, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10 },
  saveBtnText:    { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
});
