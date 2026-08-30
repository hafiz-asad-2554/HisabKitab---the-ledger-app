// Bug 3 fix: import from legacy sub-path to avoid expo-file-system v54 breaking change
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import XLSX from 'xlsx';
import { Contact, CropExpense } from '../store';

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

/** Helper to attempt saving directly via Android Storage Access Framework (SAF) if requested */
async function exportWithSAF(content: string, mimeType: string, baseName: string, ext: string, isBase64: boolean): Promise<boolean> {
  try {
    if (FileSystem.StorageAccessFramework) {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          `${baseName}.${ext}`,
          mimeType
        );
        await FileSystem.writeAsStringAsync(fileUri, content, {
          encoding: isBase64 ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
        });
        return true;
      }
    }
  } catch (e) {
    console.warn('[HisabKitab Export] SAF export skipped/failed, falling back to Sharing dialog:', e);
  }
  return false;
}

/* ─── Helpers ─── */
const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => n.toFixed(2);
const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso.slice(0, 10); }
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
   XLSX / CSV EXPORT — reference format
   ─────────────────────────────────────────────── */

export async function exportLedgerXLSX(contacts: Contact[], crops: CropExpense[]) {
  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: Summary Dashboard ── */
  const summaryRows = contacts.map(c => ({
    'Ledger Name': c.display_name,
    'Category/Description': c.notes || c.email || '',
    'Total Given (Green) [Rs.]': totalGiven(c),
    'Total Taken (Red) [Rs.]': totalTaken(c),
    'Net Balance [Rs.]': netBalance(c),
    'Status': statusLabel(netBalance(c)),
  }));
  const totGiven = contacts.reduce((a, c) => a + totalGiven(c), 0);
  const totTaken = contacts.reduce((a, c) => a + totalTaken(c), 0);
  const totNet = totGiven - totTaken;
  summaryRows.push({
    'Ledger Name': 'Total Summary Balance',
    'Category/Description': '',
    'Total Given (Green) [Rs.]': totGiven,
    'Total Taken (Red) [Rs.]': totTaken,
    'Net Balance [Rs.]': totNet,
    'Status': statusLabel(totNet),
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary Dashboard');

  /* ── Sheet per contact: Account Statement Ledger ── */
  for (const c of contacts) {
    const sorted = [...c.transactions].sort(
      (a, b) => a.custom_transaction_date.localeCompare(b.custom_transaction_date) || a.client_mutation_timestamp - b.client_mutation_timestamp
    );
    let runBal = 0;
    const txRows = sorted.map(t => {
      runBal += t.given_amount - t.taken_amount;
      return {
        'Transaction Date': fmtDate(t.custom_transaction_date),
        'Description/Reason': t.description,
        'Given (You Paid) [Rs.]': t.given_amount || '',
        'Taken (You Borrowed) [Rs.]': t.taken_amount || '',
        'Running Balance [Rs.]': runBal,
      };
    });
    txRows.push({
      'Transaction Date': 'TOTAL CHECK & BALANCE',
      'Description/Reason': '',
      'Given (You Paid) [Rs.]': totalGiven(c),
      'Taken (You Borrowed) [Rs.]': totalTaken(c),
      'Running Balance [Rs.]': netBalance(c),
    });
    const sheetName = `Account Statement Ledger - ${c.display_name}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), sheetName);
  }

  /* ── Sheet: Crop & Field Analytics ── */
  if (crops.length > 0) {
    const cropRows: Record<string, any>[] = [];
    for (const crop of crops) {
      cropRows.push({ 'Expense Item/Description': `── ${crop.crop_name.toUpperCase()} SEASON ──`, 'Khad/Fertilizer [Rs.]': '', 'Spray/Pesticides [Rs.]': '', 'Labor (Baig Muzara) [Rs.]': '', 'Tractor & Logistics [Rs.]': '', 'Diesel & Extras [Rs.]': '', 'Total Cost [Rs.]': '' });
      const expenses = crop.records.filter(r => r.type === 'EXPENSE');
      const revenue = crop.records.filter(r => r.type === 'INCOME');
      const catMap: Record<string, number> = {};
      for (const r of expenses) { catMap[r.category] = (catMap[r.category] || 0) + r.amount; }
      cropRows.push({
        'Expense Item/Description': crop.crop_name,
        'Khad/Fertilizer [Rs.]': catMap['SEEDS'] || '',
        'Spray/Pesticides [Rs.]': catMap['SPRAY'] || '',
        'Labor (Baig Muzara) [Rs.]': catMap['HARVEST'] || '',
        'Tractor & Logistics [Rs.]': catMap['TRANSPORT'] || '',
        'Diesel & Extras [Rs.]': catMap['OTHER'] || '',
        'Total Cost [Rs.]': expenses.reduce((a, r) => a + r.amount, 0),
      });
      const totalRev = revenue.reduce((a, r) => a + r.amount, 0);
      const totalCost = expenses.reduce((a, r) => a + r.amount, 0);
      cropRows.push({ 'Expense Item/Description': 'Total Cost (Total Kharcha)', 'Khad/Fertilizer [Rs.]': '', 'Spray/Pesticides [Rs.]': '', 'Labor (Baig Muzara) [Rs.]': '', 'Tractor & Logistics [Rs.]': '', 'Diesel & Extras [Rs.]': '', 'Total Cost [Rs.]': totalCost });
      cropRows.push({ 'Expense Item/Description': 'Total Revenue/Gross Sales', 'Khad/Fertilizer [Rs.]': '', 'Spray/Pesticides [Rs.]': '', 'Labor (Baig Muzara) [Rs.]': '', 'Tractor & Logistics [Rs.]': '', 'Diesel & Extras [Rs.]': '', 'Total Cost [Rs.]': totalRev });
      cropRows.push({ 'Expense Item/Description': 'Net Profit/Loss', 'Khad/Fertilizer [Rs.]': '', 'Spray/Pesticides [Rs.]': '', 'Labor (Baig Muzara) [Rs.]': '', 'Tractor & Logistics [Rs.]': '', 'Diesel & Extras [Rs.]': '', 'Total Cost [Rs.]': totalRev - totalCost });
      cropRows.push({ 'Expense Item/Description': '', 'Khad/Fertilizer [Rs.]': '', 'Spray/Pesticides [Rs.]': '', 'Labor (Baig Muzara) [Rs.]': '', 'Tractor & Logistics [Rs.]': '', 'Diesel & Extras [Rs.]': '', 'Total Cost [Rs.]': '' });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cropRows), 'Crop & Field Analytics');
  }

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const uri = await getUniqueExportPath('HisabKitab_Ledger', 'xlsx');
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export HisabKitab Ledger',
  });
}

/* ───────────────────────────────────────────────
   PDF EXPORT — mirrors Excel structure
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
  .total-row td { background:#0F172A !important; color:#F8FAFC; font-weight:800; border-top:2px solid #334155; }
  .contact-header { background:#1E293B; padding:14px 18px; border-radius:10px; margin:20px 0 8px; border-left:3px solid #10B981; }
  .contact-header h2 { font-size:15px; font-weight:800; color:#F8FAFC; }
  .contact-header .meta { color:#94A3B8; font-size:10px; margin-top:3px; }
  .crop-section { background:#1E293B; padding:10px 14px; border-radius:8px; margin:14px 0 4px; border-left:3px solid #F59E0B; }
  .crop-section h3 { color:#F59E0B; font-size:12px; font-weight:800; }
  .footer { text-align:center; color:#475569; font-size:9px; margin-top:24px; padding-top:12px; border-top:1px solid #1E293B; }
`;

/** Full multi-section PDF matching the reference Excel format */
export async function exportFullLedgerPDF(contacts: Contact[], crops: CropExpense[]) {
  const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  /* ── Summary Dashboard table ── */
  const summaryRows = contacts.map(c => {
    const net = netBalance(c);
    const color = net >= 0 ? 'green' : 'red';
    return `<tr>
      <td>${esc(c.display_name)}</td>
      <td>${esc(c.notes || c.email || '—')}</td>
      <td class="num green">${fmt(totalGiven(c))}</td>
      <td class="num red">${fmt(totalTaken(c))}</td>
      <td class="num ${color}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
      <td>${statusLabel(net)}</td>
    </tr>`;
  }).join('');
  const totG = contacts.reduce((a, c) => a + totalGiven(c), 0);
  const totT = contacts.reduce((a, c) => a + totalTaken(c), 0);
  const totN = totG - totT;

  /* ── Per-contact Account Statement sections ── */
  const contactSections = contacts.map(c => {
    const sorted = [...c.transactions].sort(
      (a, b) => a.custom_transaction_date.localeCompare(b.custom_transaction_date) || a.client_mutation_timestamp - b.client_mutation_timestamp
    );
    let runBal = 0;
    const txRows = sorted.map(t => {
      runBal += t.given_amount - t.taken_amount;
      const bc = runBal >= 0 ? 'green' : 'red';
      return `<tr>
        <td>${fmtDate(t.custom_transaction_date)}</td>
        <td>${esc(t.description)}</td>
        <td class="num green">${t.given_amount > 0 ? fmt(t.given_amount) : '—'}</td>
        <td class="num red">${t.taken_amount > 0 ? fmt(t.taken_amount) : '—'}</td>
        <td class="num ${bc}">${runBal >= 0 ? '+' : ''}${fmt(runBal)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" style="text-align:center;color:#64748B;padding:16px;">No transactions</td></tr>`;

    const net = netBalance(c);
    const netColor = net >= 0 ? 'green' : 'red';
    return `
      <div class="contact-header">
        <h2>Account Statement Ledger — ${esc(c.display_name)}</h2>
        <div class="meta">${esc(c.phone_number || '')}${c.email ? ' · ' + esc(c.email) : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</div>
      </div>
      <table>
        <thead><tr><th>Transaction Date</th><th>Description/Reason</th><th>Given (You Paid) [Rs.]</th><th>Taken (You Borrowed) [Rs.]</th><th>Running Balance [Rs.]</th></tr></thead>
        <tbody>
          ${txRows}
          <tr class="total-row">
            <td colspan="2">TOTAL CHECK &amp; BALANCE</td>
            <td class="num green">${fmt(totalGiven(c))}</td>
            <td class="num red">${fmt(totalTaken(c))}</td>
            <td class="num ${netColor}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
          </tr>
        </tbody>
      </table>`;
  }).join('');

  /* ── Crop & Field Analytics ── */
  const cropSections = crops.length > 0 ? crops.map(crop => {
    const expenses = crop.records.filter(r => r.type === 'EXPENSE');
    const revenue = crop.records.filter(r => r.type === 'INCOME');
    const catMap: Record<string, number> = {};
    for (const r of expenses) catMap[r.category] = (catMap[r.category] || 0) + r.amount;
    const totalCost = expenses.reduce((a, r) => a + r.amount, 0);
    const totalRev = revenue.reduce((a, r) => a + r.amount, 0);
    const profitLoss = totalRev - totalCost;
    const plColor = profitLoss >= 0 ? 'green' : 'red';
    return `
      <div class="crop-section"><h3>${esc(crop.crop_name.toUpperCase())} SEASON</h3></div>
      <table>
        <thead><tr><th>Expense Item</th><th>Khad/Fertilizer</th><th>Spray/Pesticides</th><th>Labor (Baig Muzara)</th><th>Tractor &amp; Logistics</th><th>Diesel &amp; Extras</th><th>Total Cost [Rs.]</th></tr></thead>
        <tbody>
          <tr>
            <td>${esc(crop.crop_name)}</td>
            <td class="num">${catMap['SEEDS'] ? fmt(catMap['SEEDS']) : '—'}</td>
            <td class="num">${catMap['SPRAY'] ? fmt(catMap['SPRAY']) : '—'}</td>
            <td class="num">${catMap['HARVEST'] ? fmt(catMap['HARVEST']) : '—'}</td>
            <td class="num">${catMap['TRANSPORT'] ? fmt(catMap['TRANSPORT']) : '—'}</td>
            <td class="num">${catMap['OTHER'] ? fmt(catMap['OTHER']) : '—'}</td>
            <td class="num">${fmt(totalCost)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="6">Total Cost (Total Kharcha)</td><td class="num red">${fmt(totalCost)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="6">Total Revenue/Gross Sales</td><td class="num green">${fmt(totalRev)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="6">Net Profit/Loss</td><td class="num ${plColor}">${profitLoss >= 0 ? '+' : ''}${fmt(profitLoss)}</td>
          </tr>
        </tbody>
      </table>`;
  }).join('') : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${pdfBase}</style></head>
<body>
  <div class="page-header">
    <h1>HisabKitab – Complete Ledger Report</h1>
    <div class="sub">Generated ${genDate} · Private &amp; Confidential</div>
  </div>

  <div class="section-title">Summary Dashboard</div>
  <table>
    <thead><tr><th>Ledger Name</th><th>Category/Description</th><th>Total Given (Green) [Rs.]</th><th>Total Taken (Red) [Rs.]</th><th>Net Balance [Rs.]</th><th>Status</th></tr></thead>
    <tbody>
      ${summaryRows}
      <tr class="total-row">
        <td colspan="2">Total Summary Balance</td>
        <td class="num green">${fmt(totG)}</td>
        <td class="num red">${fmt(totT)}</td>
        <td class="num ${totN >= 0 ? 'green' : 'red'}">${totN >= 0 ? '+' : ''}${fmt(totN)}</td>
        <td>${statusLabel(totN)}</td>
      </tr>
    </tbody>
  </table>

  ${contactSections}

  ${crops.length > 0 ? `<div class="section-title">Crop &amp; Field Analytics</div>${cropSections}` : ''}

  <div class="footer">Generated by HisabKitab · ${genDate} · Private &amp; Confidential</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Full Ledger PDF' });
}

/* ─── Per-contact PDF (unchanged, used from Ledger screen) ─── */
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
      <td class="given">${t.given_amount > 0 ? fmt(t.given_amount) : '—'}</td>
      <td class="taken">${t.taken_amount > 0 ? fmt(t.taken_amount) : '—'}</td>
      <td class="balance" style="color:${bc}">${runBal >= 0 ? '+' : ''}${fmt(runBal)}</td>
    </tr>`;
  }).join('');

  const finalBalance = runBal;
  const balLabel = finalBalance >= 0 ? 'Net Receivable (Lena Hai)' : 'Net Payable (Dena Hai)';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${pdfBase}
    .given{color:#10B981;font-weight:600;text-align:right;}
    .taken{color:#EF4444;font-weight:600;text-align:right;}
    .balance{font-weight:700;text-align:right;}
    th:nth-child(3),th:nth-child(4),th:nth-child(5){text-align:right;}
    .summary-bar{display:flex;justify-content:space-between;align-items:center;background:${finalBalance >= 0 ? '#064E3B' : '#7F1D1D'};padding:16px 24px;border-radius:10px;margin-bottom:20px;}
    .bal-label{font-size:12px;color:#F8FAFC;opacity:.8;}
    .bal-amount{font-size:24px;font-weight:800;color:${finalBalance >= 0 ? '#34D399' : '#FCA5A5'};}
  </style></head><body>
    <div class="page-header">
      <h1>${esc(contact.display_name)}</h1>
      <div class="sub">Account Statement Ledger · ${esc(contact.phone_number || '')}${contact.email ? ' · ' + esc(contact.email) : ''}</div>
    </div>
    <div class="summary-bar">
      <div><div class="bal-label">Net Balance</div><div class="bal-label">${balLabel}</div></div>
      <div class="bal-amount">${finalBalance >= 0 ? '+' : ''}${fmt(Math.abs(finalBalance))}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Given (You Paid)</th><th>Taken (You Borrowed)</th><th>Running Balance</th></tr></thead>
      <tbody>
        ${txRows || '<tr><td colspan="5" style="text-align:center;color:#64748B;padding:20px;">No transactions</td></tr>'}
        <tr class="total-row">
          <td colspan="2">TOTAL CHECK &amp; BALANCE</td>
          <td class="given">${fmt(totalGiven(contact))}</td>
          <td class="taken">${fmt(totalTaken(contact))}</td>
          <td class="balance" style="color:${finalBalance>=0?'#10B981':'#EF4444'}">${finalBalance>=0?'+':''}${fmt(finalBalance)}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Generated by HisabKitab · Private &amp; Confidential</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${contact.display_name} – Ledger Statement` });
}

/* ─── Legacy thin wrappers kept for backward-compat with reports.tsx ─── */
export async function exportContactsPDF(contacts: Contact[]) {
  await exportFullLedgerPDF(contacts, []);
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

// Keep old XLSX export (contacts-only) — still callable if needed
export async function exportContactsXLSX(contacts: Contact[]) {
  await exportLedgerXLSX(contacts, []);
}
