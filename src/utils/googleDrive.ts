import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../store';

/**
 * Sync contacts and crops data to a hidden Google Drive folder.
 * This is a minimal implementation: it obtains the stored access token,
 * ensures a folder named "HisabKitabBackup" exists (creates if missing),
 * and uploads a JSON file `ledger_backup.json` containing the current store data.
 */
export async function syncToDrive() {
  try {
    const token = await SecureStore.getItemAsync('googleAccessToken');
    if (!token) {
      console.warn('Google token not available – user must sign‑in first');
      return;
    }

    // Retrieve ledger data from the zustand store.
    const { contacts, crops } = useAppStore.getState();
    const backup = JSON.stringify({ contacts, crops }, null, 2);

    // Helper to call Drive API with auth header.
    const driveFetch = (url: string, options: RequestInit = {}) =>
      fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });

    // 1️⃣ Find existing backup folder.
    const query = encodeURIComponent("name='HisabKitabBackup' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const listResp = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
    const listData = await listResp.json();
    let folderId: string | undefined = listData.files?.[0]?.id;

    // 2️⃣ Create folder if it does not exist.
    if (!folderId) {
      const createResp = await driveFetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'HisabKitabBackup', mimeType: 'application/vnd.google-apps.folder' }),
      });
      const createData = await createResp.json();
      folderId = createData.id;
    }

    if (!folderId) {
      console.error('Failed to obtain/create Google Drive backup folder');
      return;
    }

    // 3️⃣ Upload (or replace) backup JSON file.
    const metadata = {
      name: 'ledger_backup.json',
      parents: [folderId],
    };
    const multipartBody = `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n${backup}\r\n--boundary--`;

    await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=boundary' },
      body: multipartBody,
    });

    console.log('✅ Ledger data synced to Google Drive');
  } catch (err) {
    console.error('Google Drive sync failed', err);
  }
}

/**
 * Restore ledger data from the hidden Google Drive backup folder.
 * It fetches `ledger_backup.json`, parses it, and merges contacts & crops
 * into the Zustand store.
 */
export async function restoreFromDrive() {
  try {
    const token = await SecureStore.getItemAsync('googleAccessToken');
    if (!token) {
      console.warn('Google token not available – sign‑in required');
      return;
    }

    // Locate the backup folder.
    const query = encodeURIComponent("name='HisabKitabBackup' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const listResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listResp.json();
    const folderId = listData.files?.[0]?.id;
    if (!folderId) {
      console.warn('Backup folder not found');
      return;
    }

    // Locate the backup JSON file within the folder.
    const fileQuery = encodeURIComponent(`name='ledger_backup.json' and '${folderId}' in parents and trashed=false`);
    const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQuery}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fileData = await fileResp.json();
    const fileId = fileData.files?.[0]?.id;
    if (!fileId) {
      console.warn('Backup file not found in Drive');
      return;
    }

    // Download the file content.
    const downloadResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const backupJson = await downloadResp.text();
    const { contacts, crops } = JSON.parse(backupJson);

    // Update the Zustand store.
    const { setContacts, setCrops } = useAppStore.getState();
    if (Array.isArray(contacts)) setContacts(contacts);
    if (Array.isArray(crops)) setCrops(crops);

    console.log('✅ Ledger data restored from Google Drive');
  } catch (err) {
    console.error('Google Drive restore failed', err);
  }
}
