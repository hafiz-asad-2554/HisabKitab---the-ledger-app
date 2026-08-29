import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useCapitalStore, CapitalPool } from '../../store/capitalStore';
import { useAllPoolsSummary, useCapitalPoolSummary } from '../../hooks/useCapitalPool';
import { COLORS } from '../../theme';
import { ContextSwitcher } from '../../components/ContextSwitcher';

/* ────────────────────────────────────────── */
/* Global summary banner                     */
/* ────────────────────────────────────────── */
function GlobalCapitalBanner() {
  const s = useAllPoolsSummary();
  const pct = s.totalBudget > 0 ? s.totalSpent / s.totalBudget : 0;
  return (
    <View style={styles.globalBanner}>
      <Text style={styles.bannerTitle}>Capital Budget Overview</Text>
      <View style={styles.bannerRow}>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Total Allocated</Text>
          <Text style={[styles.bannerStatValue, { color: COLORS.poolBudget }]}>
            ₨{s.totalBudget.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.bannerDivider} />
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Total Spent</Text>
          <Text style={[styles.bannerStatValue, { color: COLORS.loss }]}>
            ₨{s.totalSpent.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.bannerDivider} />
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Remaining</Text>
          <Text style={[styles.bannerStatValue, { color: s.remaining < 0 ? COLORS.loss : COLORS.profit }]}>
            ₨{Math.abs(s.remaining).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
      </View>
      {/* Overall progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {
          width: `${Math.min(pct * 100, 100)}%` as any,
          backgroundColor: pct >= 1 ? COLORS.loss : pct >= 0.8 ? COLORS.warning : COLORS.profit,
        }]} />
      </View>
      <Text style={styles.bannerFooterText}>
        {s.poolCount} pools  ·  {(pct * 100).toFixed(1)}% utilized
        {s.warningCount > 0 ? `  ·  ⚠️ ${s.warningCount} pool(s) near limit` : ''}
      </Text>
    </View>
  );
}

/* ────────────────────────────────────────── */
/* Pool Card                                 */
/* ────────────────────────────────────────── */
function PoolCard({ pool, onPress }: { pool: CapitalPool; onPress: () => void }) {
  const summary = useCapitalPoolSummary(pool.id);
  const pct = summary.percentUsed;
  const barColor = summary.isOverBudget ? COLORS.loss : summary.isWarning ? COLORS.warning : COLORS.profit;

  return (
    <TouchableOpacity style={styles.poolCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.poolHeader}>
        <View style={styles.poolIconWrap}>
          <MaterialIcons name="account-balance-wallet" size={22} color={COLORS.poolBudget} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.poolTitle} numberOfLines={1}>{pool.title}</Text>
          {pool.description ? <Text style={styles.poolDesc} numberOfLines={1}>{pool.description}</Text> : null}
        </View>
        {(summary.isWarning || summary.isOverBudget) && (
          <MaterialIcons
            name={summary.isOverBudget ? 'error' : 'warning'}
            size={22}
            color={summary.isOverBudget ? COLORS.loss : COLORS.warning}
          />
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(pct * 100, 100)}%` as any, backgroundColor: barColor }]} />
      </View>

      <View style={styles.poolStats}>
        <View style={styles.poolStat}>
          <Text style={styles.poolStatLabel}>Budget</Text>
          <Text style={[styles.poolStatValue, { color: COLORS.poolBudget }]}>
            ₨{pool.total_budget.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.poolStat}>
          <Text style={styles.poolStatLabel}>Spent</Text>
          <Text style={[styles.poolStatValue, { color: COLORS.loss }]}>
            ₨{summary.totalSpent.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.poolStat}>
          <Text style={styles.poolStatLabel}>Left</Text>
          <Text style={[styles.poolStatValue, { color: summary.remaining < 0 ? COLORS.loss : COLORS.profit }]}>
            ₨{Math.abs(summary.remaining).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.poolStat}>
          <Text style={styles.poolStatLabel}>Used</Text>
          <Text style={[styles.poolStatValue, { color: barColor }]}>{(pct * 100).toFixed(0)}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ────────────────────────────────────────── */
/* Main Screen                               */
/* ────────────────────────────────────────── */
export default function CapitalScreen() {
  const router         = useRouter();
  const pools          = useCapitalStore(s => s.capitalPools);
  const addCapitalPool = useCapitalStore(s => s.addCapitalPool);
  const deleteCapitalPool = useCapitalStore(s => s.deleteCapitalPool);

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle]               = useState('');
  const [budget, setBudget]             = useState('');
  const [desc, setDesc]                 = useState('');

  const resetForm = () => { setTitle(''); setBudget(''); setDesc(''); };

  const handleAdd = () => {
    if (!title.trim()) { Alert.alert('Required', 'Pool title is required.'); return; }
    const parsedBudget = Number(budget);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      Alert.alert('Invalid', 'Please enter a valid budget amount.');
      return;
    }
    addCapitalPool(title.trim(), parsedBudget, desc.trim());
    resetForm();
    setModalVisible(false);
  };

  const renderPool = useCallback(({ item }: { item: CapitalPool }) => (
    <PoolCard pool={item} onPress={() => router.push(`/capital/${item.id}` as any)} />
  ), [router]);

  return (
    <View style={styles.container}>
      {/* ── Pillar Switcher ── */}
      <ContextSwitcher activePillar="capital" />

      <GlobalCapitalBanner />

      <Text style={styles.sectionTitle}>{pools.length} Active Project Pool{pools.length !== 1 ? 's' : ''}</Text>

      <FlatList
        data={pools}
        keyExtractor={p => p.id}
        renderItem={renderPool}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialIcons name="account-balance-wallet" size={52} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              No capital pools yet.{'\n'}Create one to track a project budget.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={26} color="#FFF" />
      </TouchableOpacity>

      {/* ── Add Pool Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.overlayScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>New Capital Pool</Text>

              <TextInput style={styles.input} placeholder="Project Title *  (e.g. House Construction)"
                placeholderTextColor={COLORS.textSecondary} value={title} onChangeText={setTitle} />
              <TextInput style={styles.input} placeholder="Total Budget (₨) *"
                placeholderTextColor={COLORS.textSecondary} keyboardType="numeric"
                value={budget} onChangeText={setBudget} />
              <TextInput style={[styles.input, { height: 72 }]} placeholder="Description (optional)"
                placeholderTextColor={COLORS.textSecondary} multiline value={desc} onChangeText={setDesc} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); setModalVisible(false); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                  <Text style={styles.saveBtnText}>Create Pool</Text>
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
  container:        { flex: 1, backgroundColor: COLORS.background },
  globalBanner:     { margin: 16, backgroundColor: '#1A1036', borderRadius: 16, padding: 18,
                      borderWidth: 1, borderColor: '#3B2D6A' },
  bannerTitle:      { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 14,
                      textTransform: 'uppercase', letterSpacing: 0.8 },
  bannerRow:        { flexDirection: 'row', justifyContent: 'space-around' },
  bannerDivider:    { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.1)' },
  bannerStat:       { alignItems: 'center', flex: 1 },
  bannerStatLabel:  { fontSize: 10, color: COLORS.textMuted, marginBottom: 4, fontWeight: '600' },
  bannerStatValue:  { fontSize: 14, fontWeight: 'bold' },
  bannerFooterText: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 10 },
  progressTrack:    { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3,
                      marginVertical: 12, overflow: 'hidden' },
  progressFill:     { height: 6, borderRadius: 3 },
  sectionTitle:     { fontSize: 13, color: COLORS.textSecondary, marginHorizontal: 16, marginBottom: 8, fontWeight: '600' },
  list:             { paddingHorizontal: 16, paddingBottom: 100 },
  poolCard:         { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12,
                      borderWidth: 1, borderColor: COLORS.border },
  poolHeader:       { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 12 },
  poolIconWrap:     { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1A1036',
                      justifyContent: 'center', alignItems: 'center' },
  poolTitle:        { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  poolDesc:         { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  poolStats:        { flexDirection: 'row', justifyContent: 'space-between' },
  poolStat:         { alignItems: 'center', flex: 1 },
  poolStatLabel:    { fontSize: 10, color: COLORS.textMuted, marginBottom: 3 },
  poolStatValue:    { fontSize: 13, fontWeight: 'bold' },
  emptyBox:         { padding: 48, alignItems: 'center', gap: 12 },
  emptyText:        { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fab:              { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
                      backgroundColor: COLORS.poolBudget, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  overlayScroll:    { flexGrow: 1, justifyContent: 'flex-end' },
  modalBox:         { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle:       { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 16 },
  input:            { backgroundColor: COLORS.background, color: COLORS.textPrimary, padding: 13, borderRadius: 10,
                      marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  modalActions:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn:        { padding: 13 },
  cancelBtnText:    { color: COLORS.textSecondary, fontSize: 15 },
  saveBtn:          { backgroundColor: COLORS.poolBudget, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10 },
  saveBtnText:      { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
});
