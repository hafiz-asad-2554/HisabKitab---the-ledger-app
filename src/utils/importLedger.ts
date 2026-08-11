import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import XLSX from 'xlsx';
import { useAppStore } from '../store';

/**
 * Import an Excel or CSV workbook.
 * Maps sheets to contacts or crops with resilient parsing.
 * Returns a summary of what was imported.
 */
export async function importWorkbook(): Promise<{
  success: boolean;
  contactsImported: number;
  cropsImported: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let contactsImported = 0;
  let cropsImported = 0;

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'text/comma-separated-values',
      ],
      copyToCacheDirectory: true,
    });

    // Handle new expo-document-picker API (v57+)
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, contactsImported: 0, cropsImported: 0, errors: ['No file selected.'] };
    }

    const asset = result.assets[0];
    const data = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(data, { type: 'base64', cellDates: true });

    const store = useAppStore.getState();

    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

        if (rows.length === 0) {
          errors.push(`Sheet "${sheetName}" is empty – skipped.`);
          continue;
        }

        const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());

        // Detect sheet type by column headers
        const isContactSheet =
          headers.some(h => h.includes('name') || h.includes('contact')) &&
          (headers.some(h => h.includes('phone') || h.includes('tel') || h.includes('mobile')) ||
            headers.some(h => h.includes('email')));

        const isCropSheet =
          headers.some(h => h.includes('crop') || h.includes('farm')) &&
          headers.some(h => h.includes('acre') || h.includes('area') || h.includes('acreage'));

        if (isContactSheet) {
          for (const row of rows) {
            try {
              const name = findField(row, ['name', 'contact', 'full name', 'display_name', 'display name']);
              if (!name) continue;

              const phone = findField(row, ['phone', 'tel', 'mobile', 'phone_number', 'phone number']) || '';
              const email = findField(row, ['email', 'e-mail', 'mail']) || undefined;
              const notes = findField(row, ['notes', 'address', 'note', 'remarks']) || undefined;

              store.addContact(String(name).trim(), String(phone).trim(), undefined, undefined, email ? String(email).trim() : undefined);

              // If notes, update the contact to include notes
              if (notes) {
                const contacts = useAppStore.getState().contacts;
                const lastContact = contacts[contacts.length - 1];
                if (lastContact) {
                  store.updateContact(lastContact.person_id, lastContact.display_name, lastContact.phone_number, String(notes).trim());
                }
              }

              contactsImported++;
            } catch (rowErr) {
              errors.push(`Row error in "${sheetName}": ${rowErr instanceof Error ? rowErr.message : 'Parse error'}`);
            }
          }
        } else if (isCropSheet) {
          for (const row of rows) {
            try {
              const cropName = findField(row, ['crop', 'crop name', 'farm', 'crop_name']);
              const acreageRaw = findField(row, ['acre', 'acreage', 'area', 'acres']);
              if (!cropName) continue;

              const acreage = parseFloat(String(acreageRaw)) || 1;
              store.addCrop(String(cropName).trim(), acreage);
              cropsImported++;
            } catch (rowErr) {
              errors.push(`Row error in "${sheetName}": ${rowErr instanceof Error ? rowErr.message : 'Parse error'}`);
            }
          }
        } else {
          errors.push(`Sheet "${sheetName}" could not be mapped to contacts or crops – skipped.`);
        }
      } catch (sheetErr) {
        errors.push(`Error processing sheet "${sheetName}": ${sheetErr instanceof Error ? sheetErr.message : 'Unknown error'}`);
      }
    }

    return {
      success: contactsImported > 0 || cropsImported > 0,
      contactsImported,
      cropsImported,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      contactsImported: 0,
      cropsImported: 0,
      errors: [err instanceof Error ? err.message : 'Import failed – unknown error.'],
    };
  }
}

/**
 * Find a field value in a row by trying multiple possible header names.
 * Case-insensitive matching.
 */
function findField(row: Record<string, any>, possibleKeys: string[]): any {
  for (const key of Object.keys(row)) {
    const normalizedKey = key.toLowerCase().trim();
    if (possibleKeys.some(pk => normalizedKey.includes(pk))) {
      return row[key];
    }
  }
  return undefined;
}
