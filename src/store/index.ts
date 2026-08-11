import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

export type SyncStatus = 'PENDING' | 'SYNCED';
export type AccessTier = 'OWNER' | 'FULL_EDITOR' | 'VIEW_ONLY_STAFF';
export type Language = 'en' | 'ur' | 'hi';
export type ExpenseCategory = 'LAND_PREP' | 'SEEDS' | 'WATER' | 'SPRAY' | 'HARVEST' | 'TRANSPORT' | 'REVENUE' | 'OTHER';
export type ExpenseType = 'EXPENSE' | 'INCOME';

export interface Transaction {
  transaction_id: string;
  custom_transaction_date: string;
  description: string;
  given_amount: number;
  taken_amount: number;
  created_by_device: string;
  client_mutation_timestamp: number;
  sync_status: SyncStatus;
}

export interface Contact {
  person_id: string;
  display_name: string;
  phone_number: string;
  email?: string;
  person_avatar_uri?: string;
  is_linked_to_device_contacts: boolean;
  device_contact_identifier?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  transactions: Transaction[];
}

export interface CropRecord {
  record_id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  type: ExpenseType;
  client_mutation_timestamp: number;
  sync_status: SyncStatus;
}

export interface CropExpense {
  crop_id: string;
  crop_name: string;
  acreage: number;
  status: 'ACTIVE' | 'COMPLETED';
  created_at: string;
  records: CropRecord[];
}

export interface SyncLog {
  id: string;
  timestamp: number;
  message: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUri?: string;
}

export interface DeletionTombstone {
  entity: 'TRANSACTION' | 'CONTACT' | 'CROP' | 'CROP_RECORD';
  id: string;
  deleted_at: number;
  device_id: string;
  is_deleted?: boolean;
}

/* ── Shared Ledger Types ── */

export type SharedLedgerType = 'PERSONAL' | 'BUSINESS_CROP';

export interface SharedLedgerGrant {
  /** Unique ID for this share grant */
  grant_id: string;
  /** The email of the user who has access */
  grantee_email: string;
  /** Which type of ledger is shared */
  ledger_type: SharedLedgerType;
  /** Drive file ID the grantee can access */
  drive_file_id: string;
  /** When access was granted */
  granted_at: string;
  /** Display name of grantee (if known) */
  grantee_name?: string;
}

export interface SharedLedgerReceived {
  /** Unique ID */
  share_id: string;
  /** Owner's email */
  owner_email: string;
  /** Owner's display name */
  owner_name: string;
  /** Which type of ledger is shared */
  ledger_type: SharedLedgerType;
  /** Drive file ID to read from */
  drive_file_id: string;
  /** When we first received access */
  received_at: string;
}

/* ── Notification Types ── */

export type NotificationType = 'SHARE_REQUEST' | 'SYNC_CHANGE_REQUEST' | 'ACCESS_GRANTED' | 'ACCESS_REVOKED' | 'CHANGE_APPROVED' | 'CHANGE_DENIED';

export interface AppNotification {
  notification_id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  is_read: boolean;
  /** For approval workflows, the payload of changes */
  payload?: {
    requester_email: string;
    changes: Array<{
      entity_type: 'TRANSACTION' | 'CONTACT' | 'CROP_RECORD';
      entity_id: string;
      action: 'CREATE' | 'UPDATE' | 'DELETE';
      data?: any;
    }>;
  };
  /** Whether this has been acted on (approved/denied) */
  resolved?: boolean;
  resolution?: 'APPROVED' | 'DENIED';
}

/* ── State Interface ── */

interface AppState {
  contacts: Contact[];
  crops: CropExpense[];
  profile: UserProfile;
  deletionTombstones: DeletionTombstone[];
  driveFileId?: string;
  deviceId: string;
  appDisplayLanguage: Language;
  accessControlTier: AccessTier;
  biometricLockEnabled: boolean;
  sharedAccessToken?: string;
  syncLogs: SyncLog[];
  /** Whether auto-sync to Drive is enabled */
  autoSyncEnabled: boolean;
  /** Ledgers this user has shared with others */
  sharedLedgerGrants: SharedLedgerGrant[];
  /** Ledgers others have shared with this user */
  sharedLedgersReceived: SharedLedgerReceived[];
  /** Notification center */
  notifications: AppNotification[];
  /** Unread notification count */
  unreadNotificationCount: number;

  // ── Contact CRUD ──
  addContact: (name: string, phone?: string, avatar?: string, deviceContactId?: string, email?: string) => void;
  updateContact: (id: string, name: string, phone: string, notes?: string, avatar?: string, email?: string) => void;
  deleteContact: (id: string) => void;

  // ── Transaction CRUD ──
  addTransaction: (personId: string, description: string, given: number, taken: number, date?: string) => void;
  updateTransaction: (personId: string, transactionId: string, data: Pick<Transaction, 'description' | 'given_amount' | 'taken_amount' | 'custom_transaction_date'>) => void;
  deleteTransaction: (personId: string, transactionId: string) => void;

  // ── Crop CRUD ──
  addCrop: (name: string, acreage: number) => void;
  updateCrop: (id: string, name: string, acreage: number) => void;
  updateCropStatus: (id: string, status: 'ACTIVE' | 'COMPLETED') => void;
  deleteCrop: (id: string) => void;
  addCropRecord: (cropId: string, category: ExpenseCategory, description: string, amount: number, type: ExpenseType, date?: string) => void;
  updateCropRecord: (cropId: string, recordId: string, data: Partial<CropRecord>) => void;
  deleteCropRecord: (cropId: string, recordId: string) => void;

  // ── Profile ──
  updateProfile: (profile: UserProfile) => void;
  removeProfileAvatar: () => void;

  // ── Sync ──
  setDriveFileId: (id: string) => void;
  replaceLedgerFromSync: (contacts: Contact[], crops: CropExpense[], tombstones: DeletionTombstone[]) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;

  // ── Settings (kept for backward compat, but Language/AccessTier removed from UI) ──
  setLanguage: (language: Language) => void;
  setBiometricLock: (enabled: boolean) => void;
  setAccessTier: (tier: AccessTier) => void;
  setSharedAccessToken: (token: string) => void;
  setContacts: (contacts: Contact[]) => void;
  setCrops: (crops: CropExpense[]) => void;
  addSyncLog: (message: string, status: SyncLog['status']) => void;
  markAllSynced: () => void;

  // ── Shared Ledger Management ──
  addSharedLedgerGrant: (grant: Omit<SharedLedgerGrant, 'grant_id' | 'granted_at'>) => void;
  removeSharedLedgerGrant: (grantId: string) => void;
  addSharedLedgerReceived: (share: Omit<SharedLedgerReceived, 'share_id' | 'received_at'>) => void;
  removeSharedLedgerReceived: (shareId: string) => void;

  // ── Notifications ──
  addNotification: (notification: Omit<AppNotification, 'notification_id' | 'timestamp' | 'is_read'>) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  resolveNotification: (notificationId: string, resolution: 'APPROVED' | 'DENIED') => void;
  clearNotifications: () => void;
}

const now = () => new Date().toISOString();
const mutation = () => Date.now();
const transactionSort = (items: Transaction[]) =>
  [...items].sort((a, b) =>
    a.custom_transaction_date.localeCompare(b.custom_transaction_date) ||
    a.client_mutation_timestamp - b.client_mutation_timestamp
  );

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      contacts: [],
      crops: [],
      profile: { name: 'My HisabKitab', email: '' },
      deletionTombstones: [],
      deviceId: `device-${uuid.v4() as string}`,
      appDisplayLanguage: 'en',
      accessControlTier: 'OWNER',
      biometricLockEnabled: false,
      syncLogs: [],
      autoSyncEnabled: false,
      sharedLedgerGrants: [],
      sharedLedgersReceived: [],
      notifications: [],
      unreadNotificationCount: 0,

      // ── Contact CRUD ──
      addContact: (display_name, phone_number = '', person_avatar_uri, device_contact_identifier, email) =>
        set(s => ({
          contacts: [
            ...s.contacts,
            {
              person_id: uuid.v4() as string,
              display_name,
              phone_number,
              email,
              person_avatar_uri,
              is_linked_to_device_contacts: Boolean(device_contact_identifier),
              device_contact_identifier,
              created_at: now(),
              updated_at: now(),
              transactions: [],
            },
          ],
        })),

      updateContact: (id, display_name, phone_number, notes, person_avatar_uri, email) =>
        set(s => ({
          contacts: s.contacts.map(c =>
            c.person_id === id
              ? {
                  ...c,
                  display_name,
                  phone_number,
                  notes,
                  email: email !== undefined ? email : c.email,
                  person_avatar_uri: person_avatar_uri !== undefined ? person_avatar_uri : c.person_avatar_uri,
                  updated_at: now(),
                }
              : c
          ),
        })),

      deleteContact: id =>
        set(s => ({
          contacts: s.contacts.filter(c => c.person_id !== id),
          deletionTombstones: [
            ...s.deletionTombstones,
            { entity: 'CONTACT', id, deleted_at: mutation(), device_id: s.deviceId },
          ],
        })),

      // ── Transaction CRUD ──
      addTransaction: (personId, description, given, taken, date = now()) =>
        set(s => ({
          contacts: s.contacts.map(c =>
            c.person_id !== personId
              ? c
              : {
                  ...c,
                  updated_at: now(),
                  transactions: transactionSort([
                    ...c.transactions,
                    {
                      transaction_id: uuid.v4() as string,
                      custom_transaction_date: date,
                      description,
                      given_amount: given,
                      taken_amount: taken,
                      created_by_device: s.deviceId,
                      client_mutation_timestamp: mutation(),
                      sync_status: 'PENDING',
                    },
                  ]),
                }
          ),
        })),

      updateTransaction: (personId, transactionId, data) =>
        set(s => ({
          contacts: s.contacts.map(c =>
            c.person_id !== personId
              ? c
              : {
                  ...c,
                  updated_at: now(),
                  transactions: transactionSort(
                    c.transactions.map(t =>
                      t.transaction_id === transactionId
                        ? { ...t, ...data, client_mutation_timestamp: mutation(), sync_status: 'PENDING' }
                        : t
                    )
                  ),
                }
          ),
        })),

      deleteTransaction: (personId, transactionId) =>
        set(s => ({
          contacts: s.contacts.map(c =>
            c.person_id === personId
              ? { ...c, updated_at: now(), transactions: c.transactions.filter(t => t.transaction_id !== transactionId) }
              : c
          ),
          deletionTombstones: [
            ...s.deletionTombstones,
            { entity: 'TRANSACTION', id: transactionId, deleted_at: mutation(), device_id: s.deviceId },
          ],
        })),

      // ── Crop CRUD ──
      addCrop: (crop_name, acreage) =>
        set(s => ({
          crops: [
            ...s.crops,
            { crop_id: uuid.v4() as string, crop_name, acreage, status: 'ACTIVE', created_at: now(), records: [] },
          ],
        })),

      updateCrop: (id, crop_name, acreage) =>
        set(s => ({ crops: s.crops.map(c => (c.crop_id === id ? { ...c, crop_name, acreage } : c)) })),

      updateCropStatus: (id, status) =>
        set(s => ({ crops: s.crops.map(c => (c.crop_id === id ? { ...c, status } : c)) })),

      deleteCrop: id =>
        set(s => {
          const crop = s.crops.find(c => c.crop_id === id);
          return {
            crops: s.crops.filter(c => c.crop_id !== id),
            deletionTombstones: [
              ...s.deletionTombstones,
              { entity: 'CROP', id, deleted_at: mutation(), device_id: s.deviceId },
              ...(crop?.records.map(r => ({
                entity: 'CROP_RECORD' as const,
                id: r.record_id,
                deleted_at: mutation(),
                device_id: s.deviceId,
              })) || []),
            ],
          };
        }),

      addCropRecord: (cropId, category, description, amount, type, date = now()) =>
        set(s => ({
          crops: s.crops.map(c =>
            c.crop_id !== cropId
              ? c
              : {
                  ...c,
                  records: [
                    ...c.records,
                    {
                      record_id: uuid.v4() as string,
                      date,
                      category,
                      description,
                      amount,
                      type,
                      client_mutation_timestamp: mutation(),
                      sync_status: 'PENDING',
                    },
                  ],
                }
          ),
        })),

      updateCropRecord: (cropId, recordId, data) =>
        set(s => ({
          crops: s.crops.map(c =>
            c.crop_id !== cropId
              ? c
              : {
                  ...c,
                  records: c.records.map(r =>
                    r.record_id === recordId
                      ? { ...r, ...data, client_mutation_timestamp: mutation(), sync_status: 'PENDING' }
                      : r
                  ),
                }
          ),
        })),

      deleteCropRecord: (cropId, recordId) =>
        set(s => ({
          crops: s.crops.map(c =>
            c.crop_id === cropId ? { ...c, records: c.records.filter(r => r.record_id !== recordId) } : c
          ),
          deletionTombstones: [
            ...s.deletionTombstones,
            { entity: 'CROP_RECORD', id: recordId, deleted_at: mutation(), device_id: s.deviceId, is_deleted: true },
          ],
        })),

      // ── Profile ──
      updateProfile: profile => set({ profile }),
      removeProfileAvatar: () =>
        set(s => ({ profile: { ...s.profile, avatarUri: undefined } })),

      // ── Sync ──
      setDriveFileId: driveFileId => set({ driveFileId }),
      replaceLedgerFromSync: (contacts, crops, deletionTombstones) =>
        set({ contacts, crops, deletionTombstones }),
      setAutoSyncEnabled: autoSyncEnabled => set({ autoSyncEnabled }),

      // ── Settings ──
      setLanguage: appDisplayLanguage => set({ appDisplayLanguage }),
      setBiometricLock: biometricLockEnabled => set({ biometricLockEnabled }),
      setAccessTier: accessControlTier => set({ accessControlTier }),
      setSharedAccessToken: sharedAccessToken => set({ sharedAccessToken }),
      setContacts: contacts => set({ contacts }),
      setCrops: crops => set({ crops }),
      addSyncLog: (message, status) =>
        set(s => ({
          syncLogs: [
            { id: uuid.v4() as string, timestamp: Date.now(), message, status },
            ...s.syncLogs,
          ].slice(0, 20),
        })),
      markAllSynced: () =>
        set(s => ({
          contacts: s.contacts.map(c => ({
            ...c,
            transactions: c.transactions.map(t => ({ ...t, sync_status: 'SYNCED' as SyncStatus })),
          })),
          crops: s.crops.map(c => ({
            ...c,
            records: c.records.map(r => ({ ...r, sync_status: 'SYNCED' as SyncStatus })),
          })),
        })),

      // ── Shared Ledger Management ──
      addSharedLedgerGrant: grant =>
        set(s => ({
          sharedLedgerGrants: [
            ...s.sharedLedgerGrants,
            { ...grant, grant_id: uuid.v4() as string, granted_at: now() },
          ],
        })),

      removeSharedLedgerGrant: grantId =>
        set(s => ({
          sharedLedgerGrants: s.sharedLedgerGrants.filter(g => g.grant_id !== grantId),
        })),

      addSharedLedgerReceived: share =>
        set(s => ({
          sharedLedgersReceived: [
            ...s.sharedLedgersReceived,
            { ...share, share_id: uuid.v4() as string, received_at: now() },
          ],
        })),

      removeSharedLedgerReceived: shareId =>
        set(s => ({
          sharedLedgersReceived: s.sharedLedgersReceived.filter(sl => sl.share_id !== shareId),
        })),

      // ── Notifications ──
      addNotification: notification =>
        set(s => ({
          notifications: [
            {
              ...notification,
              notification_id: uuid.v4() as string,
              timestamp: Date.now(),
              is_read: false,
            },
            ...s.notifications,
          ].slice(0, 50),
          unreadNotificationCount: s.unreadNotificationCount + 1,
        })),

      markNotificationRead: notificationId =>
        set(s => {
          const wasUnread = s.notifications.find(n => n.notification_id === notificationId && !n.is_read);
          return {
            notifications: s.notifications.map(n =>
              n.notification_id === notificationId ? { ...n, is_read: true } : n
            ),
            unreadNotificationCount: wasUnread
              ? Math.max(0, s.unreadNotificationCount - 1)
              : s.unreadNotificationCount,
          };
        }),

      markAllNotificationsRead: () =>
        set(s => ({
          notifications: s.notifications.map(n => ({ ...n, is_read: true })),
          unreadNotificationCount: 0,
        })),

      resolveNotification: (notificationId, resolution) =>
        set(s => ({
          notifications: s.notifications.map(n =>
            n.notification_id === notificationId ? { ...n, resolved: true, resolution, is_read: true } : n
          ),
        })),

      clearNotifications: () => set({ notifications: [], unreadNotificationCount: 0 }),
    }),
    {
      name: 'hisabkitab-local-ledger',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
