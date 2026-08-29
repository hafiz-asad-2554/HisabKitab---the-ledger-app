import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { CropExpense, useAppStore } from '../../store';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ContextSwitcher } from '../../components/ContextSwitcher';

export default function CropsScreen() {
  const router = useRouter();
  const crops = useAppStore(state => state.crops);
  const addCrop = useAppStore(state => state.addCrop);
  const updateCrop = useAppStore(state => state.updateCrop);
  const deleteCrop = useAppStore(state => state.deleteCrop);
  // state for add modal
  const [modalVisible, setModalVisible] = useState(false);
  const [cropName, setCropName] = useState('');
  const [acreage, setAcreage] = useState('');
  // state for edit modal
  const [editCropModalVisible, setEditCropModalVisible] = useState(false);
  const [editCropTarget, setEditCropTarget] = useState(null as any);
  const [editName, setEditName] = useState('');
  const [editAcreage, setEditAcreage] = useState('');




  const handleAddCrop = () => {
    if (!cropName.trim() || !acreage.trim()) {
      Alert.alert('Error', 'Name and acreage are required');
      return;
    }
    const parsedAcreage = parseFloat(acreage);
    if (!Number.isFinite(parsedAcreage) || parsedAcreage <= 0) {
      Alert.alert('Error', 'Acreage must be a positive number');
      return;
    }
    
    addCrop(cropName.trim(), parsedAcreage);
    setCropName('');
    setAcreage('');
    setModalVisible(false);
  };

  const renderCrop = ({ item }: { item: CropExpense }) => {
    const totalExpenses = item.records
      .filter(r => r.type === 'EXPENSE')
      .reduce((acc, r) => acc + r.amount, 0);
    const totalRevenue = item.records
      .filter(r => r.type === 'INCOME')
      .reduce((acc, r) => acc + r.amount, 0);
    
    const netProfit = totalRevenue - totalExpenses;
    const isProfit = netProfit >= 0;

    return (
      <TouchableOpacity 
        style={styles.cropCard} 
        onPress={() => router.push(`/crop/${item.crop_id}`)}
      >
        <View style={styles.cropHeader}>
          <Text style={styles.cropName}>{item.crop_name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: item.status === 'ACTIVE' ? '#2563EB' : '#475569' }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        
        <Text style={styles.acreage}>{item.acreage} Acres</Text>

        {/* Three-dot menu for edit / delete */}
        <TouchableOpacity style={{position: 'absolute', top: 12, right: 12}} onPress={() => {
          setEditCropTarget(item);
          setEditName(item.crop_name);
          setEditAcreage(String(item.acreage));
          setEditCropModalVisible(true);
        }}>
          <MaterialIcons name="more-vert" size={24} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Input</Text>
            <Text style={styles.statExpense}>-{totalExpenses.toFixed(0)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Revenue</Text>
            <Text style={styles.statIncome}>+{totalRevenue.toFixed(0)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Net P/L</Text>
            <Text style={[styles.statNet, { color: isProfit ? '#10B981' : '#EF4444' }]}>
              {isProfit ? '+' : ''}{netProfit.toFixed(0)}
            </Text>
          </View>
        </View>


      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ContextSwitcher activePillar="crops" />
      <Text style={styles.sectionTitle}>Active Crop Cycles</Text>

      <FlatList
        data={crops}
        keyExtractor={item => item.crop_id}
        renderItem={renderCrop}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No crops tracked. Start a new cycle.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialIcons name="add" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Edit Crop Modal */}
      <Modal visible={editCropModalVisible} transparent animationType="slide" onRequestClose={() => setEditCropModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Crop Cycle</Text>
            <TextInput style={styles.input} placeholder="Crop Name (optional)" placeholderTextColor="#94A3B8" value={editName} onChangeText={setEditName} />
            <TextInput style={styles.input} placeholder="Acreage (optional)" placeholderTextColor="#94A3B8" value={editAcreage} onChangeText={setEditAcreage} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={() => {
                if (editCropTarget) {
                  const newName = editName.trim() || editCropTarget.crop_name;
                  const newAcreage = editAcreage.trim() ? parseFloat(editAcreage) : editCropTarget.acreage;
                  if (Number.isFinite(newAcreage) && newAcreage > 0) {
                    updateCrop(editCropTarget.crop_id, newName, newAcreage);
                  }
                }
                setEditCropModalVisible(false);
              }}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditCropModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.deleteCycle} onPress={() => {
              if (editCropTarget) {
                Alert.alert('Delete crop?', 'This will delete the crop and all its records.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => {
                    deleteCrop(editCropTarget.crop_id);
                    setEditCropModalVisible(false);
                  } }
                ]);
              }
            }}>
              <Text style={styles.deleteCycleText}>Delete Crop Cycle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>New Crop Cycle</Text>
            <TextInput
              style={styles.input}
              placeholder="Crop Name (e.g., Wheat 2026)"
              placeholderTextColor="#94A3B8"
              value={cropName}
              onChangeText={setCropName}
            />
            <TextInput
              style={styles.input}
              placeholder="Acreage"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={acreage}
              onChangeText={setAcreage}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddCrop}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC', marginHorizontal: 16, marginTop: 16, marginBottom: 12 },
  listContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  cropCard: { backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 12 },
  cropHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cropName: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  acreage: { fontSize: 14, color: '#94A3B8', marginTop: 4, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  statExpense: { fontSize: 14, fontWeight: 'bold', color: '#EF4444' },
  statIncome: { fontSize: 14, fontWeight: 'bold', color: '#10B981' },
  statNet: { fontSize: 16, fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '85%', backgroundColor: '#1E293B', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 16 },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: { padding: 12, marginRight: 8 },
  cancelBtnText: { color: '#94A3B8', fontSize: 16 },
  saveBtn: { backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 16, textAlign: 'center' },
  deleteCycle: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  deleteCycleText: { color: '#EF4444', fontSize: 16, fontWeight: 'bold' },
});
