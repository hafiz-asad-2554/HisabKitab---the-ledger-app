// Bug 3 fix: import from legacy sub-path to avoid expo-file-system v54 breaking change
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import XLSX from 'xlsx';
import { Contact, CropExpense, useAppStore } from '../store';
import { BusinessParty, BusinessTransaction, useBusinessStore } from '../store/businessStore';
import { CapitalPool, CapitalExpense, useCapitalStore } from '../store/capitalStore';

/* ─── Directory Fallback & File Conflict Helper ─── */
function getExportDirectory(): string {
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('Unable to access device storage. Neither documentDirectory nor cacheDirectory is available.');
  }
  return baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
}

/** Check if local export file exists; if so, generate a unique timestamped path to prevent overwriting */
async function getUniqueExportPath(baseName: string, ext: string): Promise<string> {
  const dir = getExportDirectory();
  let uri = `${dir}${baseName}.${ext}`;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      uri = `${dir}${baseName}_${ts}.${ext}`;
    }
  } catch {
    // If check fails, use default path
  }
  return uri;
}

/* ─── Helpers ─── */
const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => n.toFixed(2);
const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return (iso || '').slice(0, 10); }
};

function netBalance(contact: Contact) {
  return contact.transactions.reduce((a, t) => a + t.given_amount - t.taken_amount, 0);
}
function totalGiven(contact: Contact) {
  return contact.transactions.reduce((a, t) => a + t.given_amount, 0);
}
function totalTaken(contact: Contact) {
  return contact.transactions.reduce((a, t) => a + t.taken_amount, 0);
}
function statusLabel(net: number) {
  if (net > 0) return 'They Owe Us (Receivable)';
  if (net < 0) return 'We Owe Them (Payable)';
  return 'Settled';
}

/* ───────────────────────────────────────────────
   CSS Base for HTML Print / PDF Generation
   ─────────────────────────────────────────────── */

const pdfBase = `
  @page { margin: 32px 28px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0F172A; color:#F8FAFC; font-size:11px; line-height:1.5; }
  .page-header { background:linear-gradient(135deg,#1E293B,#0F172A); padding:20px 24px; border-radius:12px; margin-bottom:20px; border:1px solid #334155; }
  .page-header h1 { font-size:20px; font-weight:800; color:#F8FAFC; }
  .page-header .sub { color:#94A3B8; font-size:11px; margin-top:4px; }
  .section-title { font-size:13px; font-weight:800; color:#A7F3D0; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #334155; text-transform:uppercase; letter-spacing:0.5px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { background:#1E293B; color:#94A3B8; font-size:9px; text-transform:uppercase; letter-spacing:0.4px; padding:9px 8px; text-align:left; border-bottom:2px solid #334155; }
  td { padding:8px; border-bottom:1px solid #1E293B; font-size:10px; color:#CBD5E1; }
  tr:nth-child(even) td { background:rgba(30,41,59,0.4); }
  .num { text-align:right; }
  .green { color:#10B981; font-weight:700; }
  .red { color:#EF4444; font-weight:700; }
  .purple { color:#A78BFA; font-weight:700; }
  .total-row td { background:#0F172A !important; color:#F8FAFC; font-weight:800; border-top:2px solid #334155; }
  .contact-header { background:#1E293B; padding:14px 18px; border-radius:10px; margin:20px 0 8px; border-left:3px solid #10B981; }
  .contact-header h2 { font-size:15px; font-weight:800; color:#F8FAFC; }
  .contact-header .meta { color:#94A3B8; font-size:10px; margin-top:3px; }
  .summary-bar { display:flex; justify-content:space-between; align-items:center; background:#1E293B; padding:16px 24px; border-radius:10px; margin-bottom:20px; border:1px solid #334155; }
  .bal-label { font-size:12px; color:#F8FAFC; opacity:.8; }
  .bal-amount { font-size:24px; font-weight:800; }
  .footer { text-align:center; color:#475569; font-size:9px; margin-top:24px; padding-top:12px; border-top:1px solid #1E293B; }
`;

/* ───────────────────────────────────────────────
   INDIVIDUAL LEDGER EXPORTS — PDF & EXCEL
   ─────────────────────────────────────────────── */

/** 1A. Person Contact Ledger — PDF */
export async function exportContactLedgerPDF(contact: Contact) {
  const sorted = [...contact.transactions].sort(
    (a, b) => a.custom_transaction_date.localeCompare(b.custom_transaction_date) || a.client_mutation_timestamp - b.client_mutation_timestamp
  );
  let runBal = 0;
  const txRows = sorted.map(t => {
    runBal += t.given_amount - t.taken_amount;
    const bc = runBal >= 0 ? '#10B981' : '#EF4444';
    return `<tr>
      <td>${fmtDate(t.custom_transaction_date)}</td>
      <td>${esc(t.description)}</td>
      <td class="num green">${t.given_amount > 0 ? fmt(t.given_amount) : '—'}</td>
      <td class="num red">${t.taken_amount > 0 ? fmt(t.taken_amount) : '—'}</td>
      <td class="num" style="color:${bc}">${runBal >= 0 ? '+' : ''}${fmt(runBal)}</td>
    </tr>`;
  }).join('');

  const finalBalance = runBal;
  const balLabel = finalBalance >= 0 ? 'Net Receivable (Lena Hai)' : 'Net Payable (Dena Hai)';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${pdfBase}</style></head><body>
    <div class="page-header">
      <h1>${esc(contact.display_name)}</h1>
      <div class="sub">Personal Account Statement Ledger · ${esc(contact.phone_number || 'No Phone')}${contact.email ? ' · ' + esc(contact.email) : ''}</div>
    </div>
    <div class="summary-bar" style="background:${finalBalance >= 0 ? '#064E3B' : '#7F1D1D'}">
      <div><div class="bal-label">Net Running Balance</div><div class="bal-label">${balLabel}</div></div>
      <div class="bal-amount" style="color:${finalBalance >= 0 ? '#34D399' : '#FCA5A5'}">${finalBalance >= 0 ? '+' : ''}${fmt(Math.abs(finalBalance))}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Given (You Paid) [Rs.]</th><th>Taken (You Borrowed) [Rs.]</th><th>Running Balance [Rs.]</th></tr></thead>
      <tbody>
        ${txRows || '<tr><td colspan="5" style="text-align:center;color:#64748B;padding:20px;">No transactions logged</td></tr>'}
        <tr class="total-row">
          <td colspan="2">TOTAL CHECK &amp; BALANCE</td>
          <td class="num green">${fmt(totalGiven(contact))}</td>
          <td class="num red">${fmt(totalTaken(contact))}</td>
          <td class="num" style="color:${finalBalance>=0?'#10B981':'#EF4444'}">${finalBalance>=0?'+':''}${fmt(finalBalance)}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Generated by HisabKitab · Private &amp; Confidential</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${contact.display_name} – Ledger Statement` });
}

/** 1B. Person Contact Ledger — Excel (.xlsx) */
export async function exportContactLedgerXLSX(contact: Contact) {
  const wb = XLSX.utils.book_new();
  const sorted = [...contact.transactions].sort(
    (a, b) => a.custom_transaction_date.localeCompare(b.custom_transaction_date) || a.client_mutation_timestamp - b.client_mutation_timestamp
  );
  let runBal = 0;
  const txRows = sorted.map(t => {
    runBal += t.given_amount - t.taken_amount;
    return {
      'Date': fmtDate(t.custom_transaction_date),
      'Description': t.description,
      'Given (You Paid) [Rs.]': t.given_amount || '',
      'Taken (You Borrowed) [Rs.]': t.taken_amount || '',
      'Running Balance [Rs.]': runBal,
    };
  });
  txRows.push({
    'Date': 'TOTAL CHECK & BALANCE',
    'Description': '',
    'Given (You Paid) [Rs.]': totalGiven(contact),
    'Taken (You Borrowed) [Rs.]': totalTaken(contact),
    'Running Balance [Rs.]': netBalance(contact),
  });

  const sheetName = `Statement - ${contact.display_name}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), sheetName);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const baseName = `Ledger_${contact.display_name.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const uri = await getUniqueExportPath(baseName, 'xlsx');
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export ${contact.display_name} Ledger Excel`,
  });
}

/** 2A. Crop Ledger — PDF */
export async function exportCropLedgerPDF(crop: CropExpense) {
  const expenses = crop.records.filter(r => r.type === 'EXPENSE');
  const revenue = crop.records.filter(r => r.type === 'INCOME');
  const totalCost = expenses.reduce((a, r) => a + r.amount, 0);
  const totalRev = revenue.reduce((a, r) => a + r.amount, 0);
  const netPL = totalRev - totalCost;

  const rows = crop.records.map(r => `<tr>
    <td>${fmtDate(r.date)}</td>
    <td><span class="purple">${esc(r.category.replace('_', ' '))}</span></td>
    <td>${esc(r.description)}</td>
    <td class="num ${r.type === 'INCOME' ? 'green' : 'red'}">${r.type === 'INCOME' ? '+' : '-'}${fmt(r.amount)}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${pdfBase}</style></head><body>
    <div class="page-header">
      <h1>${esc(crop.crop_name.toUpperCase())}</h1>
      <div class="sub">Crop Financial Cycle Statement · ${crop.acreage} Acres · Status: ${crop.status}</div>
    </div>
    <div class="summary-bar" style="background:${netPL >= 0 ? '#064E3B' : '#7F1D1D'}">
      <div>
        <div class="bal-label">Total Input Costs: ₨ ${fmt(totalCost)} | Total Revenue: ₨ ${fmt(totalRev)}</div>
        <div class="bal-label">Net Profit / Loss</div>
      </div>
      <div class="bal-amount" style="color:${netPL >= 0 ? '#34D399' : '#FCA5A5'}">${netPL >= 0 ? '+' : ''}${fmt(netPL)}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount [Rs.]</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="4" style="text-align:center;color:#64748B;padding:20px;">No entries logged</td></tr>'}
        <tr class="total-row">
          <td colspan="3">TOTAL INPUT COSTS (EXPENSES)</td>
          <td class="num red">-${fmt(totalCost)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3">TOTAL SALES HARVESTED (REVENUE)</td>
          <td class="num green">+${fmt(totalRev)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3">NET PROFIT / LOSS</td>
          <td class="num ${netPL >= 0 ? 'green' : 'red'}">${netPL >= 0 ? '+' : ''}${fmt(netPL)}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Generated by HisabKitab · Private &amp; Confidential</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${crop.crop_name} – Crop Statement` });
}

/** 2B. Crop Ledger — Excel (.xlsx) */
export async function exportCropLedgerXLSX(crop: CropExpense) {
  const wb = XLSX.utils.book_new();
  const expenses = crop.records.filter(r => r.type === 'EXPENSE');
  const revenue = crop.records.filter(r => r.type === 'INCOME');
  const totalCost = expenses.reduce((a, r) => a + r.amount, 0);
  const totalRev = revenue.reduce((a, r) => a + r.amount, 0);

  const rows: Record<string, any>[] = crop.records.map(r => ({
    'Date': fmtDate(r.date),
    'Category': r.category.replace('_', ' '),
    'Description': r.description,
    'Type': r.type,
    'Amount [Rs.]': r.amount,
  }));

  rows.push(
    { 'Date': 'TOTAL INPUT COSTS', 'Category': '', 'Description': '', 'Type': 'EXPENSE', 'Amount [Rs.]': totalCost },
    { 'Date': 'TOTAL REVENUE', 'Category': '', 'Description': '', 'Type': 'INCOME', 'Amount [Rs.]': totalRev },
    { 'Date': 'NET PROFIT/LOSS', 'Category': '', 'Description': '', 'Type': totalRev >= totalCost ? 'PROFIT' : 'LOSS', 'Amount [Rs.]': totalRev - totalCost }
  );

  const sheetName = `Crop - ${crop.crop_name}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const baseName = `Crop_${crop.crop_name.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const uri = await getUniqueExportPath(baseName, 'xlsx');
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export ${crop.crop_name} Crop Excel`,
  });
}

/** 3A. Capital Pool Ledger — PDF */
export async function exportCapitalPoolLedgerPDF(pool: CapitalPool, expenses: CapitalExpense[]) {
  const totalSpent = expenses.reduce((a, e) => a + e.total_cost, 0);
  const remaining = pool.total_budget - totalSpent;
  const isOver = remaining < 0;

  const rows = expenses.map(e => `<tr>
    <td>${fmtDate(e.expense_date)}</td>
    <td>${esc(e.item_name)}</td>
    <td>${esc(e.category)}</td>
    <td>${esc(e.vendor_name || '—')}</td>
    <td>${esc(e.payment_method.toUpperCase())}</td>
    <td class="num">${e.quantity} × ₨${fmt(e.unit_price)}</td>
    <td class="num red">₨${fmt(e.total_cost)}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${pdfBase}</style></head><body>
    <div class="page-header">
      <h1>${esc(pool.title)}</h1>
      <div class="sub">Capital Project Pool Statement · Budget: ₨ ${fmt(pool.total_budget)} · Started: ${fmtDate(pool.start_date)}</div>
    </div>
    <div class="summary-bar" style="background:${isOver ? '#7F1D1D' : '#1E293B'}">
      <div>
        <div class="bal-label">Total Allocated Budget: ₨ ${fmt(pool.total_budget)} | Total Spent: ₨ ${fmt(totalSpent)}</div>
        <div class="bal-label">Remaining Unallocated Funds</div>
      </div>
      <div class="bal-amount" style="color:${isOver ? '#FCA5A5' : '#34D399'}">${isOver ? '-' : '+'}${fmt(Math.abs(remaining))}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Vendor</th><th>Payment</th><th>Qty × Unit Price</th><th>Total Cost [Rs.]</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="7" style="text-align:center;color:#64748B;padding:20px;">No expenses logged</td></tr>'}
        <tr class="total-row">
          <td colspan="6">TOTAL PROJECT BUDGET ALLOCATED</td>
          <td class="num green">₨${fmt(pool.total_budget)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="6">TOTAL EXPENDITURE TO DATE</td>
          <td class="num red">₨${fmt(totalSpent)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="6">REMAINING CAPITAL BALANCE</td>
          <td class="num ${isOver ? 'red' : 'green'}">${isOver ? '-' : '+'}${fmt(Math.abs(remaining))}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Generated by HisabKitab · Private &amp; Confidential</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${pool.title} – Capital Pool Statement` });
}

/** 3B. Capital Pool Ledger — Excel (.xlsx) */
export async function exportCapitalPoolLedgerXLSX(pool: CapitalPool, expenses: CapitalExpense[]) {
  const wb = XLSX.utils.book_new();
  const totalSpent = expenses.reduce((a, e) => a + e.total_cost, 0);

  const rows: Record<string, any>[] = expenses.map(e => ({
    'Date': fmtDate(e.expense_date),
    'Item Name': e.item_name,
    'Category': e.category,
    'Vendor': e.vendor_name,
    'Payment Method': e.payment_method,
    'Quantity': e.quantity,
    'Unit Price [Rs.]': e.unit_price,
    'Total Cost [Rs.]': e.total_cost,
  }));

  rows.push(
    { 'Date': 'TOTAL BUDGET', 'Item Name': '', 'Category': '', 'Vendor': '', 'Payment Method': '', 'Quantity': 0, 'Unit Price [Rs.]': 0, 'Total Cost [Rs.]': pool.total_budget },
    { 'Date': 'TOTAL SPENT', 'Item Name': '', 'Category': '', 'Vendor': '', 'Payment Method': '', 'Quantity': 0, 'Unit Price [Rs.]': 0, 'Total Cost [Rs.]': totalSpent },
    { 'Date': 'REMAINING BUDGET', 'Item Name': '', 'Category': '', 'Vendor': '', 'Payment Method': '', 'Quantity': 0, 'Unit Price [Rs.]': 0, 'Total Cost [Rs.]': pool.total_budget - totalSpent }
  );

  const sheetName = `Capital - ${pool.title}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const baseName = `Capital_${pool.title.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const uri = await getUniqueExportPath(baseName, 'xlsx');
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export ${pool.title} Capital Excel`,
  });
}

/** 4A. Business Party Ledger — PDF */
export async function exportBusinessPartyLedgerPDF(party: BusinessParty, txns: BusinessTransaction[]) {
  const isOwed = party.balance < 0; // they owe us
  const balLabel = isOwed ? 'Lena Hai (Receivable)' : party.balance > 0 ? 'Dena Hai (Payable)' : 'Settled';

  const rows = [...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)).map(t => {
    const isPos = t.type === 'income' || t.type === 'debit';
    return `<tr>
      <td>${fmtDate(t.transaction_date)}</td>
      <td>${esc(t.category)}</td>
      <td>${esc(t.description || '—')}</td>
      <td>${esc(t.type.toUpperCase())}</td>
      <td class="num ${isPos ? 'green' : 'red'}">${isPos ? '+' : '-'}₨${fmt(t.amount)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${pdfBase}</style></head><body>
    <div class="page-header">
      <h1>${esc(party.name)}</h1>
      <div class="sub">Business Khata Statement · ${party.party_type.toUpperCase()} · ${esc(party.phone || 'No Phone')}</div>
    </div>
    <div class="summary-bar" style="background:${isOwed ? '#064E3B' : party.balance > 0 ? '#7F1D1D' : '#1E293B'}">
      <div>
        <div class="bal-label">Current Net Account Status</div>
        <div class="bal-label">${balLabel}</div>
      </div>
      <div class="bal-amount" style="color:${isOwed ? '#34D399' : '#FCA5A5'}">₨${fmt(Math.abs(party.balance))}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Type</th><th>Amount [Rs.]</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="text-align:center;color:#64748B;padding:20px;">No business transactions recorded</td></tr>'}
        <tr class="total-row">
          <td colspan="4">NET RUNNING KHATA BALANCE</td>
          <td class="num ${party.balance <= 0 ? 'green' : 'red'}">${party.balance < 0 ? 'Lena: ' : party.balance > 0 ? 'Dena: ' : ''}₨${fmt(Math.abs(party.balance))}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Generated by HisabKitab · Private &amp; Confidential</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${party.name} – Business Khata` });
}

/** 4B. Business Party Ledger — Excel (.xlsx) */
export async function exportBusinessPartyLedgerXLSX(party: BusinessParty, txns: BusinessTransaction[]) {
  const wb = XLSX.utils.book_new();

  const rows: Record<string, any>[] = [...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)).map(t => ({
    'Date': fmtDate(t.transaction_date),
    'Category': t.category,
    'Description': t.description,
    'Type': t.type,
    'Amount [Rs.]': t.amount,
  }));

  rows.push({
    'Date': 'NET RUNNING BALANCE',
    'Category': party.party_type,
    'Description': party.balance < 0 ? 'Lena Hai (Receivable)' : party.balance > 0 ? 'Dena Hai (Payable)' : 'Settled',
    'Type': 'SUMMARY',
    'Amount [Rs.]': party.balance,
  });

  const sheetName = `Business - ${party.name}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const baseName = `Business_${party.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const uri = await getUniqueExportPath(baseName, 'xlsx');
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export ${party.name} Business Excel`,
  });
}


/* ───────────────────────────────────────────────
   MASTER EXPORTS — ACROSS ALL 4 CATEGORIES IN ONE GO
   ─────────────────────────────────────────────── */

/** Full multi-section Master PDF Report covering Personal, Agriculture, Business, and Capital */
export async function exportMasterLedgerPDF(
  contactsInput?: Contact[],
  cropsInput?: CropExpense[],
  bizPartiesInput?: BusinessParty[],
  bizTxnsInput?: BusinessTransaction[],
  capitalPoolsInput?: CapitalPool[],
  capitalExpsInput?: CapitalExpense[]
) {
  const contacts = contactsInput ?? useAppStore.getState().contacts;
  const crops = cropsInput ?? useAppStore.getState().crops;
  const bizParties = bizPartiesInput ?? useBusinessStore.getState().parties;
  const bizTxns = bizTxnsInput ?? useBusinessStore.getState().bizTransactions;
  const capitalPools = capitalPoolsInput ?? useCapitalStore.getState().capitalPools;
  const capitalExps = capitalExpsInput ?? useCapitalStore.getState().capitalExpenses;

  const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  /* ── 1. Master Summary Dashboard ── */
  const contactSummaryRows = contacts.map(c => {
    const net = netBalance(c);
    return `<tr>
      <td>Personal: ${esc(c.display_name)}</td>
      <td>${esc(c.notes || c.email || 'Contact Ledger')}</td>
      <td class="num green">${fmt(totalGiven(c))}</td>
      <td class="num red">${fmt(totalTaken(c))}</td>
      <td class="num ${net >= 0 ? 'green' : 'red'}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
      <td>${statusLabel(net)}</td>
    </tr>`;
  }).join('');

  const bizSummaryRows = bizParties.map(p => {
    const net = p.balance;
    return `<tr>
      <td>Business: ${esc(p.name)} (${p.party_type})</td>
      <td>Khata Party</td>
      <td class="num green">${net < 0 ? fmt(Math.abs(net)) : '0.00'}</td>
      <td class="num red">${net > 0 ? fmt(net) : '0.00'}</td>
      <td class="num ${net <= 0 ? 'green' : 'red'}">${net < 0 ? 'Lena: ' : net > 0 ? 'Dena: ' : ''}${fmt(Math.abs(net))}</td>
      <td>${net < 0 ? 'Lena Hai' : net > 0 ? 'Dena Hai' : 'Settled'}</td>
    </tr>`;
  }).join('');

  const capSummaryRows = capitalPools.map(pool => {
    const spent = capitalExps.filter(e => e.pool_id === pool.id).reduce((a, e) => a + e.total_cost, 0);
    const rem = pool.total_budget - spent;
    return `<tr>
      <td>Capital Pool: ${esc(pool.title)}</td>
      <td>Project Pool</td>
      <td class="num green">${fmt(pool.total_budget)}</td>
      <td class="num red">${fmt(spent)}</td>
      <td class="num ${rem >= 0 ? 'green' : 'red'}">${rem >= 0 ? '+' : '-'}${fmt(Math.abs(rem))}</td>
      <td>${rem >= 0 ? 'Under Budget' : 'Over Budget'}</td>
    </tr>`;
  }).join('');

  const cropSummaryRows = crops.map(c => {
    const cost = c.records.filter(r => r.type === 'EXPENSE').reduce((a, r) => a + r.amount, 0);
    const rev = c.records.filter(r => r.type === 'INCOME').reduce((a, r) => a + r.amount, 0);
    const net = rev - cost;
    return `<tr>
      <td>Crop: ${esc(c.crop_name)}</td>
      <td>Agricultural Season (${c.acreage} Acres)</td>
      <td class="num green">${fmt(rev)}</td>
      <td class="num red">${fmt(cost)}</td>
      <td class="num ${net >= 0 ? 'green' : 'red'}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
      <td>${net >= 0 ? 'Profit' : 'Loss'}</td>
    </tr>`;
  }).join('');

  /* ── 2. Detailed Sections ── */
  const contactSections = contacts.map(c => {
    const sorted = [...c.transactions].sort(
      (a, b) => a.custom_transaction_date.localeCompare(b.custom_transaction_date) || a.client_mutation_timestamp - b.client_mutation_timestamp
    );
    let runBal = 0;
    const txRows = sorted.map(t => {
      runBal += t.given_amount - t.taken_amount;
      return `<tr>
        <td>${fmtDate(t.custom_transaction_date)}</td>
        <td>${esc(t.description)}</td>
        <td class="num green">${t.given_amount > 0 ? fmt(t.given_amount) : '—'}</td>
        <td class="num red">${t.taken_amount > 0 ? fmt(t.taken_amount) : '—'}</td>
        <td class="num ${runBal >= 0 ? 'green' : 'red'}">${runBal >= 0 ? '+' : ''}${fmt(runBal)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" style="text-align:center;color:#64748B;padding:16px;">No transactions</td></tr>`;

    const net = netBalance(c);
    return `
      <div class="contact-header">
        <h2>Personal Ledger — ${esc(c.display_name)}</h2>
        <div class="meta">${esc(c.phone_number || '')}${c.email ? ' · ' + esc(c.email) : ''}</div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Given (Paid)</th><th>Taken (Borrowed)</th><th>Balance</th></tr></thead>
        <tbody>
          ${txRows}
          <tr class="total-row">
            <td colspan="2">TOTAL BALANCE</td>
            <td class="num green">${fmt(totalGiven(c))}</td>
            <td class="num red">${fmt(totalTaken(c))}</td>
            <td class="num ${net >= 0 ? 'green' : 'red'}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
          </tr>
        </tbody>
      </table>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${pdfBase}</style></head>
<body>
  <div class="page-header">
    <h1>HisabKitab – Master Database Report</h1>
    <div class="sub">Generated ${genDate} · All Financial Pillars (Personal, Business, Capital &amp; Crops)</div>
  </div>

  <div class="section-title">Master Financial Summary Dashboard</div>
  <table>
    <thead><tr><th>Ledger / Entity</th><th>Type / Notes</th><th>Income / Budget / Given</th><th>Expenses / Spent / Taken</th><th>Net Balance</th><th>Status</th></tr></thead>
    <tbody>
      ${contactSummaryRows}
      ${bizSummaryRows}
      ${capSummaryRows}
      ${cropSummaryRows}
    </tbody>
  </table>

  ${contacts.length > 0 ? `<div class="section-title">Personal Contact Ledgers</div>${contactSections}` : ''}

  <div class="footer">Generated by HisabKitab · Master Export · ${genDate} · Confidential</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export HisabKitab Master PDF' });
}

/** Master Excel (.xlsx) Export covering all 4 database categories */
export async function exportMasterLedgerXLSX(
  contactsInput?: Contact[],
  cropsInput?: CropExpense[],
  bizPartiesInput?: BusinessParty[],
  bizTxnsInput?: BusinessTransaction[],
  capitalPoolsInput?: CapitalPool[],
  capitalExpsInput?: CapitalExpense[]
) {
  const contacts = contactsInput ?? useAppStore.getState().contacts;
  const crops = cropsInput ?? useAppStore.getState().crops;
  const bizParties = bizPartiesInput ?? useBusinessStore.getState().parties;
  const bizTxns = bizTxnsInput ?? useBusinessStore.getState().bizTransactions;
  const capitalPools = capitalPoolsInput ?? useCapitalStore.getState().capitalPools;
  const capitalExps = capitalExpsInput ?? useCapitalStore.getState().capitalExpenses;

  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: Master Summary Dashboard ── */
  const summaryRows: any[] = [];
  contacts.forEach(c => {
    summaryRows.push({
      'Category/Domain': 'Personal Contact',
      'Ledger Name': c.display_name,
      'Given / Income / Budget [Rs.]': totalGiven(c),
      'Taken / Expense / Spent [Rs.]': totalTaken(c),
      'Net Balance / Profit [Rs.]': netBalance(c),
      'Status': statusLabel(netBalance(c)),
    });
  });
  bizParties.forEach(p => {
    summaryRows.push({
      'Category/Domain': `Business (${p.party_type})`,
      'Ledger Name': p.name,
      'Given / Income / Budget [Rs.]': p.balance < 0 ? Math.abs(p.balance) : 0,
      'Taken / Expense / Spent [Rs.]': p.balance > 0 ? p.balance : 0,
      'Net Balance / Profit [Rs.]': p.balance,
      'Status': p.balance < 0 ? 'Lena Hai' : p.balance > 0 ? 'Dena Hai' : 'Settled',
    });
  });
  capitalPools.forEach(pool => {
    const spent = capitalExps.filter(e => e.pool_id === pool.id).reduce((a, e) => a + e.total_cost, 0);
    summaryRows.push({
      'Category/Domain': 'Capital Pool',
      'Ledger Name': pool.title,
      'Given / Income / Budget [Rs.]': pool.total_budget,
      'Taken / Expense / Spent [Rs.]': spent,
      'Net Balance / Profit [Rs.]': pool.total_budget - spent,
      'Status': pool.total_budget - spent >= 0 ? 'Under Budget' : 'Over Budget',
    });
  });
  crops.forEach(c => {
    const cost = c.records.filter(r => r.type === 'EXPENSE').reduce((a, r) => a + r.amount, 0);
    const rev = c.records.filter(r => r.type === 'INCOME').reduce((a, r) => a + r.amount, 0);
    summaryRows.push({
      'Category/Domain': 'Agriculture Crop',
      'Ledger Name': c.crop_name,
      'Given / Income / Budget [Rs.]': rev,
      'Taken / Expense / Spent [Rs.]': cost,
      'Net Balance / Profit [Rs.]': rev - cost,
      'Status': rev - cost >= 0 ? 'Profit' : 'Loss',
    });
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Master Dashboard');

  /* ── Sheets for Personal Contacts ── */
  for (const c of contacts) {
    const sorted = [...c.transactions].sort(
      (a, b) => a.custom_transaction_date.localeCompare(b.custom_transaction_date) || a.client_mutation_timestamp - b.client_mutation_timestamp
    );
    let runBal = 0;
    const txRows = sorted.map(t => {
      runBal += t.given_amount - t.taken_amount;
      return {
        'Date': fmtDate(t.custom_transaction_date),
        'Description': t.description,
        'Given (Paid) [Rs.]': t.given_amount || '',
        'Taken (Borrowed) [Rs.]': t.taken_amount || '',
        'Running Balance [Rs.]': runBal,
      };
    });
    const sheetName = `Personal - ${c.display_name}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), sheetName);
  }

  /* ── Sheets for Business Parties ── */
  for (const p of bizParties) {
    const pTxns = bizTxns.filter(t => t.party_id === p.id);
    const txRows = pTxns.map(t => ({
      'Date': fmtDate(t.transaction_date),
      'Category': t.category,
      'Description': t.description,
      'Type': t.type,
      'Amount [Rs.]': t.amount,
    }));
    const sheetName = `Biz - ${p.name}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), sheetName);
  }

  /* ── Sheets for Capital Pools ── */
  for (const pool of capitalPools) {
    const pExps = capitalExps.filter(e => e.pool_id === pool.id);
    const expRows = pExps.map(e => ({
      'Date': fmtDate(e.expense_date),
      'Item': e.item_name,
      'Category': e.category,
      'Vendor': e.vendor_name,
      'Payment': e.payment_method,
      'Total Cost [Rs.]': e.total_cost,
    }));
    const sheetName = `Capital - ${pool.title}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), sheetName);
  }

  /* ── Sheet for Crops ── */
  if (crops.length > 0) {
    const cropRows: Record<string, any>[] = [];
    for (const crop of crops) {
      cropRows.push({ 'Crop Name': crop.crop_name, 'Acreage': crop.acreage, 'Status': crop.status, 'Record Description': `── ${crop.crop_name} SEASON ──`, 'Type': '', 'Amount [Rs.]': '' });
      for (const r of crop.records) {
        cropRows.push({ 'Crop Name': crop.crop_name, 'Acreage': crop.acreage, 'Status': crop.status, 'Record Description': `${r.category}: ${r.description}`, 'Type': r.type, 'Amount [Rs.]': r.amount });
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cropRows), 'Crop Analytics');
  }

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const uri = await getUniqueExportPath('HisabKitab_Master_Database', 'xlsx');
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Master Database Excel',
  });
}

/* ───────────────────────────────────────────────
   BACKWARD-COMPAT ALIASES & CSV EXPORTS
   ─────────────────────────────────────────────── */

export async function exportFullLedgerPDF(contacts?: Contact[], crops?: CropExpense[]) {
  await exportMasterLedgerPDF(contacts, crops);
}

export async function exportLedgerXLSX(contacts?: Contact[], crops?: CropExpense[]) {
  await exportMasterLedgerXLSX(contacts, crops);
}

export async function exportContactsPDF(contacts: Contact[]) {
  await exportMasterLedgerPDF(contacts, []);
}

export async function exportContactsCSV(contacts: Contact[]) {
  const header = ['Name', 'Phone', 'Email', 'Notes', 'Net Balance [Rs.]', 'Status'];
  const rows = contacts.map(c => {
    const net = netBalance(c);
    return [c.display_name, c.phone_number, c.email ?? '', c.notes ?? '', net.toFixed(2), statusLabel(net)];
  });
  const csv = [header, ...rows].map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const uri = await getUniqueExportPath('hisabkitab_contacts', 'csv');
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export Contacts CSV' });
}

export async function exportCropsCSV(crops: CropExpense[]) {
  const header = ['Crop Name', 'Acreage', 'Status', 'Total Cost [Rs.]', 'Total Revenue [Rs.]', 'Net Profit/Loss [Rs.]'];
  const rows = crops.map(c => {
    const cost = c.records.filter(r => r.type === 'EXPENSE').reduce((a, r) => a + r.amount, 0);
    const rev  = c.records.filter(r => r.type === 'INCOME').reduce((a, r) => a + r.amount, 0);
    return [c.crop_name, c.acreage.toString(), c.status, cost.toFixed(2), rev.toFixed(2), (rev - cost).toFixed(2)];
  });
  const csv = [header, ...rows].map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const uri = await getUniqueExportPath('hisabkitab_crops', 'csv');
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export Crops CSV' });
}

export async function exportContactsXLSX(contacts: Contact[]) {
  await exportMasterLedgerXLSX(contacts, []);
}
