import { AppState as RNAppState } from 'react-native';
import { Contact, CropExpense, CropRecord, DeletionTombstone, Transaction, useAppStore } from '../store';
import { secureCredentials } from '../services/secure-credentials';

/* ─── Merge Helpers ─── */

export function mergeTransactions(local: Transaction[], remote: Transaction[]) {
  const byId = new Map<string, Transaction>();
  [...local, ...remote].forEach(record => {
    const current = byId.get(record.transaction_id);
    if (
      !current ||
      record.client_mutation_timestamp > current.client_mutation_timestamp ||
      (record.client_mutation_timestamp === current.client_mutation_timestamp &&
        record.created_by_device > current.created_by_device)
    )
      byId.set(record.transaction_id, record);
  });
  return [...byId.values()].sort(
    (a, b) =>
      a.custom_transaction_date.localeCompare(b.custom_transaction_date) ||
      a.client_mutation_timestamp - b.client_mutation_timestamp
  );
}

export const runningBalance = (transactions: Transaction[]) =>
  mergeTransactions(transactions, []).reduce(
    (balance, item) => balance + item.given_amount - item.taken_amount,
    0
  );

type Snapshot = {
  version: 1;
  contacts: Contact[];
  crops: CropExpense[];
  tombstones: DeletionTombstone[];
};

const tombstoneMap = (items: DeletionTombstone[]) =>
  new Map(items.map(item => [`${item.entity}:${item.id}`, item]));

const mergeTombstones = (a: DeletionTombstone[], b: DeletionTombstone[]) => [
  ...tombstoneMap([...a, ...b]).values(),
];

const isDeleted = (
  map: Map<string, DeletionTombstone>,
  entity: DeletionTombstone['entity'],
  id: string,
  changed = 0
) => (map.get(`${entity}:${id}`)?.deleted_at ?? -1) >= changed;

const mergeRecords = (
  a: CropRecord[],
  b: CropRecord[],
  tombstones: Map<string, DeletionTombstone>
) => {
  const records = new Map<string, CropRecord>();
  [...a, ...b].forEach(record => {
    const current = records.get(record.record_id);
    if (!current || record.client_mutation_timestamp > current.client_mutation_timestamp)
      records.set(record.record_id, record);
  });
  return [...records.values()].filter(
    record => !isDeleted(tombstones, 'CROP_RECORD', record.record_id, record.client_mutation_timestamp)
  );
};

export const mergeSnapshot = (local: Snapshot, remote: Snapshot): Snapshot => {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const deleted = tombstoneMap(tombstones);
  const contacts = new Map<string, Contact>();
  [...local.contacts, ...remote.contacts].forEach(contact => {
    if (isDeleted(deleted, 'CONTACT', contact.person_id, Date.parse(contact.updated_at))) return;
    const current = contacts.get(contact.person_id);
    const winner =
      !current || Date.parse(contact.updated_at) >= Date.parse(current.updated_at)
        ? contact
        : current;
    contacts.set(contact.person_id, {
      ...winner,
      transactions: mergeTransactions(current?.transactions ?? [], contact.transactions).filter(
        transaction =>
          !isDeleted(
            deleted,
            'TRANSACTION',
            transaction.transaction_id,
            transaction.client_mutation_timestamp
          )
      ),
    });
  });
  const crops = new Map<string, CropExpense>();
  [...local.crops, ...remote.crops].forEach(crop => {
    if (isDeleted(deleted, 'CROP', crop.crop_id, Date.parse(crop.created_at))) return;
    const current = crops.get(crop.crop_id);
    crops.set(crop.crop_id, {
      ...(current ?? crop),
      ...crop,
      records: mergeRecords(current?.records ?? [], crop.records, deleted),
    });
  });
  return { version: 1, contacts: [...contacts.values()], crops: [...crops.values()], tombstones };
};

/* ─── Drive API Helper ─── */

const request = async (url: string, token: string, options: RequestInit = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!response.ok) throw new Error(`Drive sync failed (${response.status})`);
  return response;
};

/* ─── Smart Delta Sync (PATCH existing, never creates duplicates) ─── */

let activeSync: Promise<boolean> | undefined;

const syncNow = async (): Promise<boolean> => {
  const initial = useAppStore.getState();

  // Pre-flight: Check Drive file ID
  if (!initial.driveFileId) {
    initial.addSyncLog('Select the Drive database file before syncing.', 'ERROR');
    return false;
  }

  // Pre-flight: Check auth token
  const token = await secureCredentials.getDriveToken();
  if (!token) {
    initial.addSyncLog('Google sign-in is required before syncing.', 'ERROR');
    return false;
  }

  // Validate token is still valid
  try {
    const tokenCheck = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!tokenCheck.ok) {
      initial.addSyncLog('Google token expired. Please sign in again.', 'ERROR');
      await secureCredentials.clearDriveToken();
      return false;
    }
  } catch {
    initial.addSyncLog('Cannot verify Google token. Check internet connection.', 'ERROR');
    return false;
  }

  try {
    initial.addSyncLog('Downloading private Drive ledger snapshot.', 'PENDING');

    const download = await request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(initial.driveFileId)}?alt=media`,
      token
    );
    const remote = (await download.json()) as Snapshot;

    const latest = useAppStore.getState();
    const merged = mergeSnapshot(
      { version: 1, contacts: latest.contacts, crops: latest.crops, tombstones: latest.deletionTombstones },
      remote
    );

    // Smart delta: PATCH the existing file, never create a new one
    await request(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(initial.driveFileId)}?uploadType=media`,
      token,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': download.headers.get('etag') ?? '*',
        },
        body: JSON.stringify(merged),
      }
    );

    latest.replaceLedgerFromSync(merged.contacts, merged.crops, merged.tombstones);
    latest.markAllSynced();
    latest.addSyncLog('Drive ledger merged and saved.', 'COMPLETE');
    return true;
  } catch (error) {
    initial.addSyncLog(error instanceof Error ? error.message : 'Drive sync failed.', 'ERROR');
    return false;
  }
};

/* ─── Auto-Sync Lifecycle Hooks ─── */

let autoSyncDebounce: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule an auto-sync after data mutations if auto-sync is enabled.
 * Debounced to avoid rapid-fire syncs during bulk edits.
 */
export function scheduleAutoSync() {
  const { autoSyncEnabled, driveFileId } = useAppStore.getState();
  if (!autoSyncEnabled || !driveFileId) return;

  if (autoSyncDebounce) clearTimeout(autoSyncDebounce);
  autoSyncDebounce = setTimeout(() => {
    void SyncEngine.syncNow();
  }, 5000); // 5-second debounce
}

/**
 * Initialize app-lifecycle auto-sync hooks.
 * Call once from _layout.tsx or App entry.
 */
export function initAutoSyncListeners() {
  // Subscribe to store changes: auto-sync when contacts or crops change
  useAppStore.subscribe((state, prevState) => {
    if (!state.autoSyncEnabled) return;
    if (state.contacts !== prevState.contacts || state.crops !== prevState.crops) {
      scheduleAutoSync();
    }
  });

  // Sync when app goes to background
  const subscription = RNAppState.addEventListener('change', nextState => {
    if (nextState === 'background' || nextState === 'inactive') {
      const { autoSyncEnabled, driveFileId } = useAppStore.getState();
      if (autoSyncEnabled && driveFileId) {
        void SyncEngine.syncNow();
      }
    }
  });

  return () => {
    subscription.remove();
    if (autoSyncDebounce) clearTimeout(autoSyncDebounce);
  };
}

/* ─── Public Sync Engine ─── */

export const SyncEngine = {
  syncNow: () => {
    if (!activeSync)
      activeSync = syncNow().finally(() => {
        activeSync = undefined;
      });
    return activeSync;
  },
};
