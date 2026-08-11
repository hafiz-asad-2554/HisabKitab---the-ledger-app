import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useAppStore } from '../../store';
import { exportContactsCSV, exportContactsPDF, exportCropsCSV } from '../../utils/exportLedger';
import { importWorkbook } from '../../utils/importLedger';

export default function Reports() {
  const contacts = useAppStore(s => s.contacts);
  const crops = useAppStore(s => s.crops);
  const rows = contacts.reduce((n, c) => n + c.transactions.length, 0);

  const [importing, setImporting] = useState(false);

  const handleImportWorkbook = async () => {
    setImporting(true);
    try {
      const res = await importWorkbook();
      if (res.success) {
        Alert.alert(
          'Import Successful',
          `Imported ${res.contactsImported} contacts and ${res.cropsImported} crops.${
            res.errors.length > 0 ? `\n\nWarnings:\n${res.errors.join('\n')}` : ''
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
      <Text style={styles.head}>Ledger statements & Data</Text>
      <Text style={styles.copy}>
        Your local ledger contains {contacts.length} contacts ({rows} transactions) and {crops.length} crop cycles.
      </Text>

      {/* Export Section */}
      <Text style={styles.sectionHeader}>Exports</Text>

      <TouchableOpacity style={styles.card} onPress={() => exportContactsPDF(contacts)}>
        <Text style={styles.cardTitle}>Export Contacts Summary PDF</Text>
        <Text style={styles.cardCopy}>Generate a printable overview statement of all contacts</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => exportContactsCSV(contacts)}>
        <Text style={styles.cardTitle}>Export Contacts CSV</Text>
        <Text style={styles.cardCopy}>Download contacts as CSV for spreadsheet software</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => exportCropsCSV(crops)}>
        <Text style={styles.cardTitle}>Export Crops CSV</Text>
        <Text style={styles.cardCopy}>Export all crop cycles and financial tallies to CSV</Text>
      </TouchableOpacity>

      {/* Import Section */}
      <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Data Import</Text>

      <TouchableOpacity style={styles.card} onPress={handleImportWorkbook} disabled={importing}>
        {importing ? (
          <ActivityIndicator color="#10B981" />
        ) : (
          <>
            <Text style={styles.cardTitle}>Import Excel / CSV Workbook</Text>
            <Text style={styles.cardCopy}>
              Select a multi-sheet Excel (.xlsx) or CSV file. Automatically maps sheets to contacts or crop cycles.
            </Text>
          </>
        )}
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
