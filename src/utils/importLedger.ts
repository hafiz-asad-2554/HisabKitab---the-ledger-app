// Bug 3 fix: use legacy API to avoid expo-file-system v54 breaking change
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import XLSX from 'xlsx';
import { useAppStore } from '../store';

/**
 * Import an Excel or CSV workbook.
 * Maps sheets to contacts or crops with resilient parsing.
 * Returns a summary of what was imported.
 *
 * Handles the multi-sheet format produced by exportLedger:
 *   - "Summary Dashboard" → skip (read-only overview)
 *   - "Account Statement Ledger - {Name}" → import transactions for that contact
 *   - "Crop & Field Analytics" → import crop data
 *   - Any sheet with Name/Phone/Email → import as contacts
 */
export async function importWorkbook(): Promise<{
  success: boolean;
  contactsImported: number;
  cropsImported: number;
  transactionsImported: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let contactsImported = 0;
  let cropsImported = 0;
  let transactionsImported = 0;

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

    // Handle expo-document-picker v57+ API
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, contactsImported: 0, cropsImported: 0, transactionsImported: 0, errors: ['No file selected.'] };
    }

    const asset = result.assets[0];
    // Bug 3 fix: readAsStringAsync from legacy import — no longer throws deprecation error
    const data = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(data, { type: 'base64', cellDates: true });

    const store = useAppStore.getState();

    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

        // ── Skip the Summary Dashboard (it's a derived view) ──
        if (sheetName === 'Summary Dashboard') {
          errors.push(`Sheet "Summary Dashboard" skipped (summary view, not imported).`);
          continue;
        }

        // ── Account Statement sheets (produced by our exporter) ──
        if (sheetName.startsWith('Account Statement Ledger - ')) {
          const contactName = sheetName.replace('Account Statement Ledger - ', '').trim();

          // Find or create the contact
          let contact = store.contacts.find(
            c => c.display_name.toLowerCase() === contactName.toLowerCase()
          );
          if (!contact) {
            store.addContact(contactName, '', undefined, undefined, undefined);
            contact = useAppStore.getState().contacts.find(
              c => c.display_name.toLowerCase() === contactName.toLowerCase()
            );
            if (contact) contactsImported++;
          }

          if (!contact) {
            errors.push(`Could not create contact for sheet "${sheetName}" – skipped.`);
            continue;
          }

          // Import transactions; skip the TOTAL CHECK row
          for (const row of rows) {
            try {
              const desc = String(findField(row, ['description', 'reason', 'description/reason']) || '').trim();
              if (!desc || desc.toUpperCase().includes('TOTAL CHECK')) continue;

              const given = parseAmount(findField(row, ['given', 'given (you paid)', 'debit']));
              const taken = parseAmount(findField(row, ['taken', 'taken (you borrowed)', 'credit']));
              if (given === 0 && taken === 0) continue;

              const rawDate = findField(row, ['transaction date', 'date']);
              const dateStr = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();

              store.addTransaction(contact.person_id, desc, given, taken, dateStr);
              transactionsImported++;
            } catch (rowErr) {
              errors.push(`Row error in "${sheetName}": ${rowErr instanceof Error ? rowErr.message : 'Parse error'}`);
            }
          }
          continue;
        }

        // ── Crop & Field Analytics sheet ──
        if (sheetName === 'Crop & Field Analytics') {
          errors.push(`Sheet "Crop & Field Analytics" detected — crop import from this format is not yet automated (skipped).`);
          continue;
        }

        if (rows.length === 0) {
          errors.push(`Sheet "${sheetName}" is empty – skipped.`);
          continue;
        }

        const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());

        // ── Generic Contact sheet detection ──
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
              const name = findField(row, ['name', 'contact', 'full name', 'display_name', 'display name', 'ledger name']);
              if (!name) continue;

              // Skip aggregate rows like "Total Summary Balance"
              if (String(name).toLowerCase().includes('total')) continue;

              const phone = findField(row, ['phone', 'tel', 'mobile', 'phone_number', 'phone number']) || '';
              const email = findField(row, ['email', 'e-mail', 'mail']) || undefined;
              const notes = findField(row, ['notes', 'address', 'note', 'remarks']) || undefined;

              store.addContact(
                String(name).trim(),
                String(phone).trim(),
                undefined,
                undefined,
                email ? String(email).trim() : undefined
              );

              if (notes) {
                const contacts = useAppStore.getState().contacts;
                const lastContact = contacts[contacts.length - 1];
                if (lastContact) {
                  store.updateContact(
                    lastContact.person_id,
                    lastContact.display_name,
                    lastContact.phone_number,
                    String(notes).trim()
                  );
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
      success: contactsImported > 0 || cropsImported > 0 || transactionsImported > 0,
      contactsImported,
      cropsImported,
      transactionsImported,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      contactsImported: 0,
      cropsImported: 0,
      transactionsImported: 0,
      errors: [err instanceof Error ? err.message : 'Import failed – unknown error.'],
    };
  }
}

/** Find a field value in a row by trying multiple possible header names (case-insensitive). */
function findField(row: Record<string, any>, possibleKeys: string[]): any {
  for (const key of Object.keys(row)) {
    const normalizedKey = key.toLowerCase().trim();
    if (possibleKeys.some(pk => normalizedKey.includes(pk))) {
      return row[key];
    }
  }
  return undefined;
}

/** Safely parse a numeric amount from various cell types. */
function parseAmount(raw: any): number {
  if (!raw && raw !== 0) return 0;
  const n = parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
