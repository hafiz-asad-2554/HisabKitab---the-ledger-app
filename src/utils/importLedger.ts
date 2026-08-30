// Bug 3 fix: use legacy API to avoid expo-file-system v54 breaking change
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import XLSX from 'xlsx';
import { useAppStore } from '../store';

/* ─────────────────────────────────────────────────────────────────────────────
   CANONICAL FIELD MAPPING
   Maps every known header variant (lower-cased, trimmed) → canonical field name.
   Used by detectHeaderRow() to find the header row and map columns.
───────────────────────────────────────────────────────────────────────────── */

const COLUMN_MAP: Record<string, string> = {
  // date
  'date': 'date',
  'transaction date': 'date',

  // description
  'description': 'description',
  'description / reason': 'description',
  'description/reason': 'description',
  'expense item / description': 'description',
  'expense item/description': 'description',

  // amount_in (given / debit / jama)
  'given (you paid) [rs.]': 'amount_in',
  'given (you paid)': 'amount_in',
  'given / debit (dr)': 'amount_in',
  'given/debit (dr)': 'amount_in',
  'amount in (jama)': 'amount_in',
  'amount in': 'amount_in',

  // amount_out (taken / credit / naam)
  'taken (you borrowed) [rs.]': 'amount_out',
  'taken (you borrowed)': 'amount_out',
  'taken / credit (cr)': 'amount_out',
  'taken/credit (cr)': 'amount_out',
  'amount out (naam)': 'amount_out',
  'amount out': 'amount_out',

  // running balance
  'running balance [rs.]': 'running_balance',
  'running balance': 'running_balance',
  'balance': 'running_balance',

  // amount (capital / project sheets – single amount column)
  'amount': 'amount',

  // agriculture cost columns
  'khad / fertilizer [rs.]': 'fertilizer',
  'khad/fertilizer [rs.]': 'fertilizer',
  'spray / pesticides [rs.]': 'spray',
  'spray/pesticides [rs.]': 'spray',
  'labor (baig muzara) [rs.]': 'labor',
  'tractor & logistics [rs.]': 'tractor',
  'diesel & extras [rs.]': 'diesel',
  'total cost [rs.]': 'total_cost',

  // business ledger extras
  'ledger name': 'ledger_name',
  'notes': 'notes',
};

/* ─────────────────────────────────────────────────────────────────────────────
   ROLLUP / SUMMARY SHEET SIGNATURES
   A sheet is a rollup if its first non-empty row matches one of these.
───────────────────────────────────────────────────────────────────────────── */

const ROLLUP_SIGNATURES = new Set([
  'summary dashboard',
  'summary',
  // The capital_projects_demo sheet is named after the workbook – we detect it
  // by checking if its columns are the rollup schema (Ledger Name | budget | …)
]);

/** True when a cell value looks like a rollup/dashboard header cell */
function isRollupHeader(val: string): boolean {
  const v = val.toLowerCase().trim();
  return (
    v === 'ledger name' && !v.includes('transaction') // summary dashboard
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHEET TYPE DETECTION
───────────────────────────────────────────────────────────────────────────── */

type SheetType =
  | 'personal_transaction'    // personal ledger sheets (given/taken)
  | 'business_transaction'    // business ledger (Jama/Naam)
  | 'capital_project'         // capital project sheet (budget + amount)
  | 'agriculture_crop'        // agriculture crop cost sheet
  | 'rollup'                  // summary/dashboard sheet – skip transaction import
  | 'unknown';

interface DetectedHeader {
  rowIndex: number;                         // 0-based row index of the header
  colMap: Record<string, string>;           // rawColName → canonical field
  sheetType: SheetType;
}

/**
 * Scan a sheet's raw rows (from sheet_to_json with header:1) and find the
 * header row by matching known column-name variants.  Returns null if no
 * recognisable header is found.
 */
function detectHeaderRow(
  rawRows: any[][],
  sheetName: string
): DetectedHeader | null {
  const sn = sheetName.toLowerCase().trim();

  // Explicit rollup sheet names
  if (ROLLUP_SIGNATURES.has(sn)) {
    return { rowIndex: 0, colMap: {}, sheetType: 'rollup' };
  }

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!row || row.every(c => c === '' || c == null)) continue;

    const cells: string[] = row.map(c => String(c ?? '').toLowerCase().trim());
    const colMap: Record<string, string> = {};

    // Check each cell against the canonical map
    for (let j = 0; j < cells.length; j++) {
      const canonical = COLUMN_MAP[cells[j]];
      if (canonical) {
        colMap[row[j]] = canonical; // preserve original casing as key
      }
    }

    const canons = new Set(Object.values(colMap));

    // Agriculture: must have fertilizer OR spray (or total_cost + description)
    if (
      canons.has('fertilizer') ||
      canons.has('spray') ||
      (canons.has('total_cost') && canons.has('description'))
    ) {
      return { rowIndex: i, colMap, sheetType: 'agriculture_crop' };
    }

    // Capital project: amount (single) + running_balance + description + date
    if (canons.has('amount') && canons.has('running_balance') && canons.has('date')) {
      return { rowIndex: i, colMap, sheetType: 'capital_project' };
    }

    // Business: amount_in + amount_out + running_balance (Jama/Naam schema)
    if (canons.has('amount_in') && canons.has('amount_out') && canons.has('running_balance')) {
      return { rowIndex: i, colMap, sheetType: 'business_transaction' };
    }

    // Personal: amount_in + amount_out + date (running_balance optional)
    if (canons.has('amount_in') && canons.has('amount_out') && canons.has('date')) {
      return { rowIndex: i, colMap, sheetType: 'personal_transaction' };
    }

    // Capital rollup: check for 'budget' header (rollup sheet named same as workbook)
    if (cells.includes('budget') && cells.includes('ledger name')) {
      return { rowIndex: i, colMap, sheetType: 'rollup' };
    }

    // Agriculture summary
    if (cells.includes('crop') || (cells.includes('acers') && cells.includes('profit'))) {
      return { rowIndex: i, colMap, sheetType: 'rollup' };
    }

    // Business summary
    if (cells.includes('bussiness') || cells.includes('business')) {
      if (cells.includes('profit') || cells.includes('loss')) {
        return { rowIndex: i, colMap, sheetType: 'rollup' };
      }
    }
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

/** Safely parse a numeric amount from various cell types. */
function parseAmount(raw: any): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const n = parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a date cell.  Tolerates:
 *  - JS Date objects (from cellDates:true)
 *  - ISO strings
 *  - Bare year strings like '2025' → Jan 1 that year
 *  - Placeholder strings like '---' → null (skip date, use today)
 */
function parseDate(raw: any): string | null {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  const s = String(raw).trim();
  if (!s || s === '---' || s === '-' || s === 'n/a') return null;
  // Bare year e.g. "2025"
  if (/^\d{4}$/.test(s)) return new Date(`${s}-01-01`).toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Build an object with canonical field names from a raw data row using the column map. */
function mapRow(
  rawRow: Record<string, any>,
  colMap: Record<string, string>
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const canonical = colMap[rawKey];
    if (canonical) out[canonical] = value;
  }
  return out;
}

/** True if a row is completely blank (all empty strings / null). */
function isBlankRow(row: Record<string, any>): boolean {
  return Object.values(row).every(v => v === '' || v == null);
}

/** True if the row is a summary / total sentinel. */
function isTotalRow(mapped: Record<string, any>, rawRow: Record<string, any>): boolean {
  const allVals = Object.values(rawRow).join(' ').toLowerCase();
  return (
    allVals.includes('total check') ||
    allVals.includes('total kharcha') ||
    allVals.includes('total cost (total') ||
    allVals.includes('total revenue') ||
    allVals.includes('net profit') ||
    allVals.includes('total summary')
  );
}

/** True if the row looks like the EXAMPLE placeholder row from business sheets. */
function isPlaceholderRow(rawRow: Record<string, any>): boolean {
  return Object.values(rawRow).join(' ').toLowerCase().includes('example');
}

/* ─────────────────────────────────────────────────────────────────────────────
   IMPORT RESULT TYPE
───────────────────────────────────────────────────────────────────────────── */

export interface ImportResult {
  success: boolean;
  contactsImported: number;
  cropsImported: number;
  transactionsImported: number;
  cropRecordsImported: number;
  sheetsProcessed: number;
  sheetsSkipped: string[];
  warnings: string[];
  errors: string[];
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN IMPORT FUNCTION
───────────────────────────────────────────────────────────────────────────── */

/**
 * Import an Excel or CSV workbook.
 *
 * Handles all four HisabKitab ledger workbook types:
 *   A. Personal (given/taken per person)
 *   B. Business (Jama/Naam per business)
 *   C. Capital Projects (budget + amount per project)
 *   D. Agriculture / Crop (categorised cost rows per season)
 *
 * Header-row detection is resilient: it scans up to the first 10 rows and
 * matches known column-name variants rather than assuming a fixed row index.
 *
 * Returns a detailed summary: sheets processed, skipped, warnings, errors.
 */
export async function importWorkbook(): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    contactsImported: 0,
    cropsImported: 0,
    transactionsImported: 0,
    cropRecordsImported: 0,
    sheetsProcessed: 0,
    sheetsSkipped: [],
    warnings: [],
    errors: [],
  };

  try {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'text/comma-separated-values',
      ],
      copyToCacheDirectory: true,
    });

    if (picked.canceled || !picked.assets?.length) {
      result.errors.push('No file selected.');
      return result;
    }

    const asset = picked.assets[0];
    // Bug 3 fix: readAsStringAsync from legacy import — no deprecation error
    const data = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const workbook = XLSX.read(data, { type: 'base64', cellDates: true });
    const store = useAppStore.getState();

    for (const sheetName of workbook.SheetNames) {
      try {
        await processSheet(sheetName, workbook.Sheets[sheetName], store, result);
      } catch (sheetErr) {
        result.errors.push(
          `Error processing sheet "${sheetName}": ${
            sheetErr instanceof Error ? sheetErr.message : 'Unknown error'
          }`
        );
      }
    }

    result.success =
      result.contactsImported > 0 ||
      result.cropsImported > 0 ||
      result.transactionsImported > 0 ||
      result.cropRecordsImported > 0;

    return result;
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : 'Import failed – unknown error.'
    );
    return result;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHEET PROCESSOR (dispatches by detected type)
───────────────────────────────────────────────────────────────────────────── */

async function processSheet(
  sheetName: string,
  sheet: XLSX.WorkSheet,
  store: ReturnType<typeof useAppStore.getState>,
  result: ImportResult
): Promise<void> {
  // Read as raw 2D array to allow header-row scanning
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  });

  if (rawRows.length === 0) {
    result.sheetsSkipped.push(`"${sheetName}" (empty sheet)`);
    return;
  }

  const detected = detectHeaderRow(rawRows, sheetName);

  if (!detected) {
    result.sheetsSkipped.push(`"${sheetName}" (no recognisable header found)`);
    return;
  }

  if (detected.sheetType === 'rollup') {
    result.sheetsSkipped.push(
      `"${sheetName}" (summary/rollup sheet – skipped from transaction import)`
    );
    return;
  }

  // Build data rows: everything after the header row, mapped to objects
  const headerRow = rawRows[detected.rowIndex];
  const dataRows: Record<string, any>[] = rawRows
    .slice(detected.rowIndex + 1)
    .map(row => {
      const obj: Record<string, any> = {};
      headerRow.forEach((col: any, i: number) => {
        if (col !== '' && col != null) obj[String(col)] = row[i] ?? '';
      });
      return obj;
    });

  switch (detected.sheetType) {
    case 'personal_transaction':
    case 'business_transaction':
      await importTransactionSheet(sheetName, dataRows, detected.colMap, store, result);
      break;
    case 'capital_project':
      await importCapitalSheet(sheetName, dataRows, detected.colMap, store, result);
      break;
    case 'agriculture_crop':
      await importAgricultureSheet(sheetName, dataRows, detected.colMap, store, result);
      break;
    default:
      result.sheetsSkipped.push(`"${sheetName}" (unrecognised sheet type)`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   PERSONAL / BUSINESS TRANSACTION SHEETS
   Each sheet → one contact/ledger in the app.
───────────────────────────────────────────────────────────────────────────── */

async function importTransactionSheet(
  sheetName: string,
  dataRows: Record<string, any>[],
  colMap: Record<string, string>,
  store: ReturnType<typeof useAppStore.getState>,
  result: ImportResult
): Promise<void> {
  const contactName = sheetName.trim();

  // Find or create the contact
  let contact = useAppStore
    .getState()
    .contacts.find(
      c => c.display_name.toLowerCase() === contactName.toLowerCase()
    );

  if (!contact) {
    store.addContact(contactName, '', undefined, undefined, undefined);
    contact = useAppStore
      .getState()
      .contacts.find(
        c => c.display_name.toLowerCase() === contactName.toLowerCase()
      );
    if (contact) result.contactsImported++;
  }

  if (!contact) {
    result.errors.push(
      `Could not create contact for sheet "${sheetName}" – skipped.`
    );
    return;
  }

  let txImported = 0;
  const importedBalance: number[] = [];

  for (const rawRow of dataRows) {
    try {
      if (isBlankRow(rawRow)) continue;
      if (isPlaceholderRow(rawRow)) {
        result.warnings.push(
          `Sheet "${sheetName}": placeholder/example row skipped.`
        );
        continue;
      }
      if (isTotalRow({}, rawRow)) {
        // Use for validation only – don't import as a transaction
        const mapped = mapRow(rawRow, colMap);
        const bal = parseAmount(mapped.running_balance);
        if (bal !== 0) importedBalance.push(bal);
        continue;
      }

      const mapped = mapRow(rawRow, colMap);
      const desc = String(mapped.description ?? '').trim();
      if (!desc) continue;

      const given = parseAmount(mapped.amount_in);
      const taken = parseAmount(mapped.amount_out);
      if (given === 0 && taken === 0) continue;

      const rawDate = mapped.date;
      const dateStr = parseDate(rawDate) ?? new Date().toISOString();

      // Re-fetch store state for each transaction (store updates are synchronous)
      useAppStore.getState().addTransaction(contact.person_id, desc, given, taken, dateStr);
      txImported++;
    } catch (rowErr) {
      result.errors.push(
        `Row error in "${sheetName}": ${
          rowErr instanceof Error ? rowErr.message : 'Parse error'
        }`
      );
    }
  }

  result.transactionsImported += txImported;
  result.sheetsProcessed++;

  // Validation pass: recompute running balance vs stated total
  if (importedBalance.length > 0) {
    const stated = importedBalance[importedBalance.length - 1];
    const currentContact = useAppStore
      .getState()
      .contacts.find(c => c.person_id === contact!.person_id);
    if (currentContact) {
      const computed = currentContact.transactions.reduce(
        (acc, t) => acc + t.given_amount - t.taken_amount,
        0
      );
      if (Math.abs(computed - stated) > 0.01) {
        result.warnings.push(
          `Sheet "${sheetName}": computed balance ${computed.toFixed(2)} ≠ stated balance ${stated.toFixed(2)} – check source data.`
        );
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   CAPITAL PROJECT SHEETS
   Single-amount column (Amount) + Running Balance.
   Each sheet → one contact in the app (projects tracked as contacts).
───────────────────────────────────────────────────────────────────────────── */

async function importCapitalSheet(
  sheetName: string,
  dataRows: Record<string, any>[],
  colMap: Record<string, string>,
  store: ReturnType<typeof useAppStore.getState>,
  result: ImportResult
): Promise<void> {
  const contactName = sheetName.trim();

  let contact = useAppStore
    .getState()
    .contacts.find(
      c => c.display_name.toLowerCase() === contactName.toLowerCase()
    );

  if (!contact) {
    store.addContact(contactName, '', undefined, undefined, undefined);
    contact = useAppStore
      .getState()
      .contacts.find(
        c => c.display_name.toLowerCase() === contactName.toLowerCase()
      );
    if (contact) result.contactsImported++;
  }

  if (!contact) {
    result.errors.push(
      `Could not create contact for capital sheet "${sheetName}" – skipped.`
    );
    return;
  }

  let txImported = 0;
  let statedBalance: number | null = null;

  for (const rawRow of dataRows) {
    try {
      if (isBlankRow(rawRow)) continue;
      if (isTotalRow({}, rawRow)) {
        const mapped = mapRow(rawRow, colMap);
        statedBalance = parseAmount(mapped.running_balance ?? mapped.amount);
        continue;
      }

      const mapped = mapRow(rawRow, colMap);
      const desc = String(mapped.description ?? '').trim();
      if (!desc) continue;

      // Capital sheets use a single "amount" column that is an outflow (expense)
      const amount = parseAmount(mapped.amount);
      if (amount === 0) continue;

      const rawDate = mapped.date;
      const dateStr = parseDate(rawDate) ?? new Date().toISOString();

      // Treat capital outflows as "taken" (money spent from budget)
      useAppStore.getState().addTransaction(contact.person_id, desc, 0, amount, dateStr);
      txImported++;
    } catch (rowErr) {
      result.errors.push(
        `Row error in capital sheet "${sheetName}": ${
          rowErr instanceof Error ? rowErr.message : 'Parse error'
        }`
      );
    }
  }

  result.transactionsImported += txImported;
  result.sheetsProcessed++;

  // Validation
  if (statedBalance !== null) {
    const currentContact = useAppStore
      .getState()
      .contacts.find(c => c.person_id === contact!.person_id);
    if (currentContact) {
      const computed = currentContact.transactions.reduce(
        (acc, t) => acc + t.given_amount - t.taken_amount,
        0
      );
      if (Math.abs(computed - statedBalance) > 0.01) {
        result.warnings.push(
          `Capital sheet "${sheetName}": computed balance ${computed.toFixed(2)} ≠ stated balance ${statedBalance.toFixed(2)}.`
        );
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   AGRICULTURE / CROP SHEETS
   Cost-category layout – each sheet → one CropExpense in the app.
───────────────────────────────────────────────────────────────────────────── */

const EXPENSE_CATEGORY_MAP: Record<string, string> = {
  fertilizer: 'SEEDS',    // Khad / Fertilizer → SEEDS category (closest match)
  spray: 'SPRAY',
  labor: 'HARVEST',       // Labor → HARVEST category
  tractor: 'TRANSPORT',
  diesel: 'OTHER',
} as const;

async function importAgricultureSheet(
  sheetName: string,
  dataRows: Record<string, any>[],
  colMap: Record<string, string>,
  store: ReturnType<typeof useAppStore.getState>,
  result: ImportResult
): Promise<void> {
  const cropName = sheetName.trim();

  // Find existing crop or create new
  let crop = useAppStore
    .getState()
    .crops.find(c => c.crop_name.toLowerCase() === cropName.toLowerCase());

  if (!crop) {
    store.addCrop(cropName, 1);
    crop = useAppStore
      .getState()
      .crops.find(c => c.crop_name.toLowerCase() === cropName.toLowerCase());
    if (crop) result.cropsImported++;
  }

  if (!crop) {
    result.errors.push(
      `Could not create crop for sheet "${sheetName}" – skipped.`
    );
    return;
  }

  let recordsImported = 0;
  let totalRevenue = 0;

  for (const rawRow of dataRows) {
    try {
      if (isBlankRow(rawRow)) continue;

      const mapped = mapRow(rawRow, colMap);
      const desc = String(mapped.description ?? '').trim();
      if (!desc) continue;

      // Summary aggregation rows – extract revenue for P/L, skip as records
      const descLower = desc.toLowerCase();
      if (descLower.includes('total cost') && descLower.includes('total kharcha')) continue;
      if (descLower.includes('total revenue') || descLower.includes('gross sales')) {
        totalRevenue = parseAmount(mapped.total_cost); // total_cost column holds the value
        // Add as INCOME record
        if (totalRevenue > 0 && crop) {
          useAppStore.getState().addCropRecord(
            crop.crop_id,
            'REVENUE',
            'Total Revenue / Gross Sales',
            totalRevenue,
            'INCOME',
          );
          recordsImported++;
        }
        continue;
      }
      if (descLower.includes('net profit') || descLower.includes('net loss')) continue;

      // Regular expense row – each filled cost column becomes a record
      const costCategories: Array<[string, string]> = [
        ['fertilizer', 'SEEDS'],
        ['spray', 'SPRAY'],
        ['labor', 'HARVEST'],
        ['tractor', 'TRANSPORT'],
        ['diesel', 'OTHER'],
      ];

      let hasAnyAmount = false;
      for (const [field, category] of costCategories) {
        const amount = parseAmount(mapped[field]);
        if (amount > 0 && crop) {
          useAppStore.getState().addCropRecord(
            crop.crop_id,
            category as any,
            desc,
            amount,
            'EXPENSE',
          );
          recordsImported++;
          hasAnyAmount = true;
        }
      }

      // If no individual cost columns were filled, use the total_cost column
      if (!hasAnyAmount) {
        const totalCost = parseAmount(mapped.total_cost);
        if (totalCost > 0 && crop) {
          useAppStore.getState().addCropRecord(
            crop.crop_id,
            'OTHER',
            desc,
            totalCost,
            'EXPENSE',
          );
          recordsImported++;
        }
      }
    } catch (rowErr) {
      result.errors.push(
        `Row error in crop sheet "${sheetName}": ${
          rowErr instanceof Error ? rowErr.message : 'Parse error'
        }`
      );
    }
  }

  result.cropRecordsImported += recordsImported;
  result.sheetsProcessed++;
}
