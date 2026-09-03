import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useAppStore } from '../../store';
import { useBusinessStore } from '../../store/businessStore';
import { useCapitalStore } from '../../store/capitalStore';
import {
  exportFullLedgerPDF,
  exportLedgerXLSX,
  exportContactsCSV,
  exportCropsCSV,
} from '../../utils/exportLedger';
import { importWorkbook } from '../../utils/importLedger';

export default function Reports() {
  const contacts = useAppStore(s => s.contacts);
  const crops = useAppStore(s => s.crops);
  const bizParties = useBusinessStore(s => s.parties);
  const bizTxns = useBusinessStore(s => s.bizTransactions);
  const capitalPools = useCapitalStore(s => s.capitalPools);
  const capitalExps = useCapitalStore(s => s.capitalExpenses);

  const rows = contacts.reduce((n, c) => n + c.transactions.length, 0);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setExporting(true);
    try { await fn(); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Unknown error'); }
    finally { setExporting(false); }
  };

  const handleImportWorkbook = async () => {
    setImporting(true);
    try {
      const res = await importWorkbook();
      if (res.success) {
        Alert.alert(
          'Import Successful',
          `Imported ${res.contactsImported} contacts, ${res.transactionsImported} transactions, ${res.cropsImported} crops, and ${res.cropRecordsImported} crop records across ${res.sheetsProcessed} sheets.${
            res.warnings.length > 0 ? `\n\n⚠️ Warnings:\n${res.warnings.join('\n')}` : ''
          }${
            res.errors.length > 0 ? `\n\n❌ Errors:\n${res.errors.join('\n')}` : ''
          }`
        );
      } else if (res.errors.length > 0) {
        Alert.alert('Import Result', res.errors.join('\n'));
      }
    } catch (err) {
      Alert.alert('Import Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.head}>Ledger Statements & Data</Text>
      <Text style={styles.copy}>
        {contacts.length} contacts ({rows} tx) · {crops.length} crop cycles · {bizParties.length} biz parties ({bizTxns.length} tx) · {capitalPools.length} capital pools ({capitalExps.length} items)
      </Text>

      {/* Export Section */}
      <Text style={styles.sectionHeader}>Master Database Exports</Text>

      <TouchableOpacity style={styles.card} onPress={() => run(() => exportFullLedgerPDF())} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#10B981" /> : <>
          <Text style={styles.cardTitle}>📄 Master Database PDF Report</Text>
          <Text style={styles.cardCopy}>Includes overall financial summary dashboard + detailed statements for Personal, Business, Capital, and Agricultural ledgers.</Text>
        </>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => run(() => exportLedgerXLSX())} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#10B981" /> : <>
          <Text style={styles.cardTitle}>📊 Master Database Excel (.xlsx)</Text>
          <Text style={styles.cardCopy}>Complete multi-sheet Excel workbook containing Master Dashboard + individual sheets for Personal, Business, Capital, and Crops.</Text>
        </>}
      </TouchableOpacity>

      <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Category CSV Summaries</Text>

      <TouchableOpacity style={styles.card} onPress={() => run(() => exportContactsCSV(contacts))} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#10B981" /> : <>
          <Text style={styles.cardTitle}>📋 Personal Contacts CSV</Text>
          <Text style={styles.cardCopy}>Name, Phone, Email, Net Balance, Status</Text>
        </>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => run(() => exportCropsCSV(crops))} disabled={exporting}>
        {exporting ? <ActivityIndicator color="#10B981" /> : <>
          <Text style={styles.cardTitle}>🌾 Crop Cycles CSV</Text>
          <Text style={styles.cardCopy}>Crop cycles with total cost, revenue, and net profit/loss</Text>
        </>}
      </TouchableOpacity>

      {/* Import Section */}
      <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Data Import</Text>

      <TouchableOpacity style={styles.card} onPress={handleImportWorkbook} disabled={importing}>
        {importing ? <ActivityIndicator color="#10B981" /> : <>
          <Text style={styles.cardTitle}>⬆ Import Excel / CSV Workbook</Text>
          <Text style={styles.cardCopy}>
            Supports all 4 HisabKitab workbook types: Personal (given/taken), Business (Jama/Naam), Capital Projects (budget/amount), Agriculture (crop cost categories). Each data sheet becomes its own ledger. Summary/rollup sheets are auto-skipped.
          </Text>
        </>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20, paddingBottom: 40 },
  head: { color: '#F8FAFC', fontSize: 23, fontWeight: '700' },
  copy: { color: '#94A3B8', marginTop: 8, marginBottom: 16 },
  sectionHeader: { color: '#CBD5E1', fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  card: {
    backgroundColor: '#1E293B',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '700' },
  cardCopy: { color: '#94A3B8', marginTop: 6, lineHeight: 18 },
});
