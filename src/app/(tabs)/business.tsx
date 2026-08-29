import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useBusinessStore, BusinessParty, PartyType } from '../../store/businessStore';
import { useBusinessPnL } from '../../hooks/useBusinessLedger';
import { COLORS } from '../../theme';
import { ContextSwitcher } from '../../components/ContextSwitcher';

/* ────────────────────────────────────────── */
/* P&L Summary Banner                        */
/* ────────────────────────────────────────── */
function PnLBanner() {
  const pnl = useBusinessPnL();
  const isProfit = pnl.netProfit >= 0;
  return (
    <View style={[styles.pnlBanner, { backgroundColor: isProfit ? '#064E3B' : '#7F1D1D' }]}>
      <View style={styles.pnlRow}>
        <View style={styles.pnlStat}>
          <Text style={styles.pnlLabel}>Revenue</Text>
          <Text style={[styles.pnlValue, { color: COLORS.profit }]}>
            +{pnl.revenue.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.pnlDivider} />
        <View style={styles.pnlStat}>
          <Text style={styles.pnlLabel}>Expenses</Text>
          <Text style={[styles.pnlValue, { color: COLORS.loss }]}>
            -{pnl.expenses.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.pnlDivider} />
        <View style={styles.pnlStat}>
          <Text style={styles.pnlLabel}>Net Profit</Text>
          <Text style={[styles.pnlValue, { color: isProfit ? COLORS.profit : COLORS.loss, fontSize: 18 }]}>
            {isProfit ? '+' : ''}{pnl.netProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
      </View>
      <Text style={styles.pnlFooter}>{pnl.txCount} transactions recorded</Text>
    </View>
  );
}

/* ────────────────────────────────────────── */
/* Party Card                                */
/* ────────────────────────────────────────── */
const PartyCard = React.memo(({ item, onPress }: { item: BusinessParty; onPress: () => void }) => {
  const isOwed = item.balance < 0;      // they owe us
  const isOwing = item.balance > 0;     // we owe them
  const balColor = isOwed ? COLORS.profit : isOwing ? COLORS.loss : COLORS.textSecondary;

  return (
    <TouchableOpacity style={styles.partyCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.partyIcon, { backgroundColor: item.party_type === 'customer' ? '#1D4ED8' : '#6D28D9' }]}>
        <MaterialIcons
          name={item.party_type === 'customer' ? 'person' : 'store'}
          size={22} color="#FFF"
        />
      </View>
      <View style={styles.partyInfo}>
        <Text style={styles.partyName}>{item.name}</Text>
        <Text style={styles.partyMeta}>
          {item.party_type === 'customer' ? 'Customer' : 'Supplier'}
          {item.phone ? `  ·  ${item.phone}` : ''}
        </Text>
      </View>
      <View style={styles.partyBalance}>
        <Text style={styles.partyBalLabel}>
          {isOwed ? 'Lena Hai' : isOwing ? 'Dena Hai' : 'Settled'}
        </Text>
        <Text style={[styles.partyBalValue, { color: balColor }]}>
          {Math.abs(item.balance).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

/* ────────────────────────────────────────── */
/* Main Screen                               */
/* ────────────────────────────────────────── */
export default function BusinessScreen() {
  const router = useRouter();
  const parties    = useBusinessStore(s => s.parties);
  const addParty   = useBusinessStore(s => s.addParty);
  const deleteParty = useBusinessStore(s => s.deleteParty);

  const [modalVisible, setModalVisible]   = useState(false);
  const [newName, setNewName]             = useState('');
  const [newPhone, setNewPhone]           = useState('');
  const [newNotes, setNewNotes]           = useState('');
  const [partyType, setPartyType]         = useState<PartyType>('customer');
  const [query, setQuery]                 = useState('');
  const [filterType, setFilterType]       = useState<'all' | 'customer' | 'supplier'>('all');

  const filteredParties = useMemo(() => {
    let list = parties;
    if (filterType !== 'all') list = list.filter(p => p.party_type === filterType);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, filterType, query]);

  const resetForm = () => { setNewName(''); setNewPhone(''); setNewNotes(''); setPartyType('customer'); };

  const handleAdd = () => {
    if (!newName.trim()) { Alert.alert('Required', 'Party name is required.'); return; }
    addParty(newName.trim(), newPhone.trim(), partyType, newNotes.trim() || undefined);
    resetForm();
    setModalVisible(false);
  };

  const renderParty = useCallback(({ item }: { item: BusinessParty }) => (
    <PartyCard
      item={item}
      onPress={() => router.push(`/business/${item.id}` as any)}
    />
  ), [router]);

  return (
    <View style={styles.container}>
      {/* ── Pillar Switcher ── */}
      <ContextSwitcher activePillar="business" />

      {/* ── P&L Banner ── */}
      <PnLBanner />

      {/* ── Search + Filter ── */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Search parties…"
          placeholderTextColor={COLORS.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <View style={styles.filterRow}>
        {(['all', 'customer', 'supplier'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filterType === f && styles.filterChipActive]}
            onPress={() => setFilterType(f)}
          >
            <Text style={[styles.filterChipText, filterType === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All' : f === 'customer' ? 'Customers' : 'Suppliers'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>
        {filteredParties.length} {filterType === 'all' ? 'Parties' : filterType === 'customer' ? 'Customers' : 'Suppliers'}
      </Text>

      {/* ── List ── */}
      <FlatList
        data={filteredParties}
        keyExtractor={item => item.id}
        renderItem={renderParty}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialIcons name="store" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No parties found.{'\n'}Add a customer or supplier to get started.</Text>
          </View>
        }
      />

      {/* ── FAB ── */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={26} color="#FFF" />
      </TouchableOpacity>

      {/* ── Add Party Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.overlayScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>New Party</Text>

              {/* Party Type Selector */}
              <View style={styles.typeRow}>
                {(['customer', 'supplier'] as PartyType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, partyType === t && styles.typeBtnActive]}
                    onPress={() => setPartyType(t)}
                  >
                    <MaterialIcons name={t === 'customer' ? 'person' : 'store'} size={18}
                      color={partyType === t ? '#FFF' : COLORS.textSecondary} />
                    <Text style={[styles.typeBtnText, partyType === t && styles.typeBtnTextActive]}>
                      {t === 'customer' ? 'Customer' : 'Supplier'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={styles.input} placeholder="Full Name *" placeholderTextColor={COLORS.textSecondary}
                value={newName} onChangeText={setNewName} />
              <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
              <TextInput style={[styles.input, { height: 72 }]} placeholder="Notes (optional)"
                placeholderTextColor={COLORS.textSecondary} multiline value={newNotes} onChangeText={setNewNotes} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); setModalVisible(false); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                  <Text style={styles.saveBtnText}>Save Party</Text>
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
/* Styles                                    */
/* ────────────────────────────────────────── */
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  pnlBanner:       { margin: 16, borderRadius: 16, padding: 20 },
  pnlRow:          { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  pnlStat:         { alignItems: 'center', flex: 1 },
  pnlDivider:      { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.15)' },
  pnlLabel:        { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4, fontWeight: '600' },
  pnlValue:        { fontSize: 15, fontWeight: 'bold' },
  pnlFooter:       { textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 12 },
  searchRow:       { paddingHorizontal: 16, marginBottom: 8 },
  search:          { backgroundColor: COLORS.surface, color: COLORS.textPrimary, padding: 12,
                     borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  filterRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  filterChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                     backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive:{ backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterChipText:  { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#FFF' },
  sectionTitle:    { fontSize: 13, color: COLORS.textSecondary, marginHorizontal: 16, marginBottom: 8, fontWeight: '600' },
  list:            { paddingHorizontal: 16, paddingBottom: 100 },
  partyCard:       { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10,
                     flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  partyIcon:       { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  partyInfo:       { flex: 1 },
  partyName:       { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  partyMeta:       { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  partyBalance:    { alignItems: 'flex-end' },
  partyBalLabel:   { fontSize: 11, color: COLORS.textSecondary, marginBottom: 3 },
  partyBalValue:   { fontSize: 17, fontWeight: 'bold' },
  emptyBox:        { padding: 48, alignItems: 'center', gap: 12 },
  emptyText:       { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fab:             { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
                     backgroundColor: COLORS.headerBlue, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  overlayScroll:   { flexGrow: 1, justifyContent: 'flex-end' },
  modalBox:        { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle:      { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 16 },
  typeRow:         { flexDirection: 'row', gap: 10, marginBottom: 14 },
  typeBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                     backgroundColor: COLORS.background, borderRadius: 10, padding: 12,
                     borderWidth: 1, borderColor: COLORS.border },
  typeBtnActive:   { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  typeBtnText:     { color: COLORS.textSecondary, fontWeight: '600' },
  typeBtnTextActive: { color: '#FFF' },
  input:           { backgroundColor: COLORS.background, color: COLORS.textPrimary, padding: 13, borderRadius: 10,
                     marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  modalActions:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn:       { padding: 13 },
  cancelBtnText:   { color: COLORS.textSecondary, fontSize: 15 },
  saveBtn:         { backgroundColor: COLORS.accent, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10 },
  saveBtnText:     { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
});
