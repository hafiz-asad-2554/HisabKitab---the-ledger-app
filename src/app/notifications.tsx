import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { useAppStore, AppNotification } from '../store';
import { MaterialIcons } from '@expo/vector-icons';
import { SyncEngine } from '../sync';

export default function NotificationsScreen() {
  const notifications = useAppStore(s => s.notifications);
  const markRead = useAppStore(s => s.markNotificationRead);
  const markAllRead = useAppStore(s => s.markAllNotificationsRead);
  const resolveNotification = useAppStore(s => s.resolveNotification);
  const clearNotifications = useAppStore(s => s.clearNotifications);
  const addTransaction = useAppStore(s => s.addTransaction);
  const addCropRecord = useAppStore(s => s.addCropRecord);

  /* ── Approve Change Request ── */
  const handleApprove = async (n: AppNotification) => {
    if (!n.payload) return;

    // Apply the changes to owner's local master store
    for (const change of n.payload.changes) {
      if (change.entity_type === 'TRANSACTION' && change.data) {
        addTransaction(
          change.data.person_id,
          change.data.description,
          change.data.given_amount,
          change.data.taken_amount,
          change.data.custom_transaction_date
        );
      } else if (change.entity_type === 'CROP_RECORD' && change.data) {
        addCropRecord(
          change.data.crop_id,
          change.data.category,
          change.data.description,
          change.data.amount,
          change.data.type,
          change.data.date
        );
      }
    }

    resolveNotification(n.notification_id, 'APPROVED');

    // Trigger sync to update master ledger on Google Drive
    void SyncEngine.syncNow();

    Alert.alert(
      'Change Approved',
      `The requested changes from ${n.payload.requester_email} have been merged into your master ledger and synced to Google Drive.`
    );
  };

  /* ── Deny Change Request ── */
  const handleDeny = (n: AppNotification) => {
    resolveNotification(n.notification_id, 'DENIED');
    Alert.alert(
      'Change Denied',
      `The requested changes from ${n.payload?.requester_email ?? 'user'} were denied. Your master ledger remains unchanged.`
    );
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'SHARE_REQUEST':
      case 'ACCESS_GRANTED':
        return <MaterialIcons name="share" size={24} color="#3B82F6" />;
      case 'SYNC_CHANGE_REQUEST':
        return <MaterialIcons name="sync" size={24} color="#F59E0B" />;
      case 'ACCESS_REVOKED':
        return <MaterialIcons name="block" size={24} color="#EF4444" />;
      case 'CHANGE_APPROVED':
        return <MaterialIcons name="check-circle" size={24} color="#10B981" />;
      case 'CHANGE_DENIED':
        return <MaterialIcons name="cancel" size={24} color="#EF4444" />;
      default:
        return <MaterialIcons name="notifications" size={24} color="#94A3B8" />;
    }
  };

  const renderNotification = ({ item }: { item: AppNotification }) => {
    return (
      <TouchableOpacity
        style={[
          styles.card,
          !item.is_read && styles.unreadCard,
        ]}
        onPress={() => markRead(item.notification_id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>{getIcon(item.type)}</View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.time}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {!item.is_read && <View style={styles.dot} />}
        </View>

        <Text style={styles.message}>{item.message}</Text>

        {/* Change Request Approval / Denial Workflow */}
        {item.type === 'SYNC_CHANGE_REQUEST' && item.payload && !item.resolved && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.denyBtn}
              onPress={() => handleDeny(item)}
            >
              <Text style={styles.denyText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approveBtn}
              onPress={() => void handleApprove(item)}
            >
              <Text style={styles.approveText}>Approve & Sync</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Show Resolution Status */}
        {item.resolved && (
          <View
            style={[
              styles.resolutionBadge,
              { backgroundColor: item.resolution === 'APPROVED' ? '#064E3B' : '#7F1D1D' },
            ]}
          >
            <Text
              style={[
                styles.resolutionText,
                { color: item.resolution === 'APPROVED' ? '#34D399' : '#FCA5A5' },
              ]}
            >
              {item.resolution === 'APPROVED' ? '✓ Approved & Merged' : '✕ Denied'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.page}>
      {/* Action Header */}
      <View style={styles.topActions}>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={styles.actionText}>Mark all as read</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearNotifications}>
          <Text style={[styles.actionText, { color: '#F87171' }]}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.notification_id}
        renderItem={renderNotification}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="notifications-none" size={48} color="#475569" />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyText}>
              Shared ledger access requests and owner approval updates will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0F172A' },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  actionText: { color: '#10B981', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  unreadCard: {
    borderColor: '#10B981',
    backgroundColor: '#1E293B',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconContainer: { marginRight: 12 },
  headerText: { flex: 1 },
  title: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  time: { color: '#64748B', fontSize: 11, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginLeft: 8 },
  message: { color: '#CBD5E1', fontSize: 13, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  denyBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  denyText: { color: '#F87171', fontWeight: '700', fontSize: 13 },
  approveBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  approveText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  resolutionBadge: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  resolutionText: { fontSize: 12, fontWeight: '700' },
  emptyContainer: { padding: 48, alignItems: 'center' },
  emptyTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});
