import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import XLSX from 'xlsx';
import { Contact, CropExpense } from '../store';

/* ─── Helpers ─── */

const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
};

const formatCurrency = (n: number) => n.toFixed(2);

/* ─── Contact Ledger PDF (per-contact, auditor-ready) ─── */

/**
 * Generate a professional, auditor-ready PDF for a single contact's ledger.
 * Includes: Header with contact metadata, chronological transaction table
 * with Date, Description, Given (Debit), Taken (Credit), Running Balance.
 */
export async function exportContactLedgerPDF(contact: Contact) {
  const sorted = [...contact.transactions].sort(
    (a, b) =>
      a.custom_transaction_date.localeCompare(b.custom_transaction_date) ||
      a.client_mutation_timestamp - b.client_mutation_timestamp
  );

  let runBal = 0;
  const txRows = sorted
    .map(t => {
      runBal += t.given_amount - t.taken_amount;
      const balColor = runBal >= 0 ? '#10B981' : '#EF4444';
      return `<tr>
        <td>${formatDate(t.custom_transaction_date)}</td>
        <td>${esc(t.description)}</td>
        <td class="given">${t.given_amount > 0 ? formatCurrency(t.given_amount) : '—'}</td>
        <td class="taken">${t.taken_amount > 0 ? formatCurrency(t.taken_amount) : '—'}</td>
        <td class="balance" style="color:${balColor}">${runBal >= 0 ? '+' : ''}${formatCurrency(runBal)}</td>
      </tr>`;
    })
    .join('');

  const finalBalance = runBal;
  const balClass = finalBalance >= 0 ? 'receivable' : 'payable';
  const balLabel = finalBalance >= 0 ? 'Net Receivable (Lena Hai)' : 'Net Payable (Dena Hai)';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 40px 30px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: #0F172A;
    color: #F8FAFC;
    font-size: 11px;
    line-height: 1.5;
  }

  .header {
    background: linear-gradient(135deg, #1E293B, #0F172A);
    padding: 24px;
    border-radius: 12px;
    margin-bottom: 20px;
    border: 1px solid #334155;
  }
  .header h1 {
    font-size: 22px;
    font-weight: 800;
    color: #F8FAFC;
    margin-bottom: 4px;
  }
  .header .label {
    font-size: 12px;
    color: #94A3B8;
    margin-bottom: 12px;
  }
  .meta-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
  }
  .meta-item {
    background: #0F172A;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 14px;
    flex: 1;
    min-width: 140px;
  }
  .meta-item .meta-label {
    font-size: 10px;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
  }
  .meta-item .meta-value {
    font-size: 13px;
    color: #CBD5E1;
    margin-top: 2px;
  }

  .summary-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: ${finalBalance >= 0 ? '#064E3B' : '#7F1D1D'};
    padding: 16px 24px;
    border-radius: 10px;
    margin-bottom: 20px;
  }
  .summary-bar .bal-label {
    font-size: 12px;
    color: #F8FAFC;
    opacity: 0.8;
  }
  .summary-bar .bal-amount {
    font-size: 24px;
    font-weight: 800;
    color: ${finalBalance >= 0 ? '#34D399' : '#FCA5A5'};
  }
  .summary-bar .bal-type {
    font-size: 11px;
    color: #F8FAFC;
    opacity: 0.7;
  }

  .section-title {
    font-size: 14px;
    font-weight: 700;
    color: #F8FAFC;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #334155;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  th {
    background: #1E293B;
    color: #94A3B8;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 8px;
    text-align: left;
    border-bottom: 2px solid #334155;
  }
  td {
    padding: 9px 8px;
    border-bottom: 1px solid #1E293B;
    font-size: 11px;
    color: #CBD5E1;
  }
  tr:nth-child(even) td { background: rgba(30, 41, 59, 0.3); }
  .given { color: #10B981; font-weight: 600; text-align: right; }
  .taken { color: #EF4444; font-weight: 600; text-align: right; }
  .balance { font-weight: 700; text-align: right; }
  th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }

  .footer {
    text-align: center;
    color: #475569;
    font-size: 9px;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid #1E293B;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(contact.display_name)}</h1>
    <div class="label">Personal Ledger Statement</div>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Email</div>
        <div class="meta-value">${esc(contact.email || 'Not provided')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Phone</div>
        <div class="meta-value">${esc(contact.phone_number || 'Not provided')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Notes / Address</div>
        <div class="meta-value">${esc(contact.notes || 'N/A')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Total Transactions</div>
        <div class="meta-value">${contact.transactions.length}</div>
      </div>
    </div>
  </div>

  <div class="summary-bar">
    <div>
      <div class="bal-label">Net Balance</div>
      <div class="bal-type">${balLabel}</div>
    </div>
    <div class="bal-amount">${finalBalance >= 0 ? '+' : ''}${formatCurrency(Math.abs(finalBalance))}</div>
  </div>

  <div class="section-title">Transaction History</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Given (Debit)</th>
        <th>Taken (Credit)</th>
        <th>Running Balance</th>
      </tr>
    </thead>
    <tbody>
      ${txRows || '<tr><td colspan="5" style="text-align:center;color:#64748B;padding:20px;">No transactions recorded</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    Generated by HisabKitab · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} · Private & Confidential
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${contact.display_name} – Ledger Statement`,
  });
}

/* ─── Contacts Summary PDF (all contacts overview) ─── */

export async function exportContactsPDF(contacts: Contact[]) {
  const rows = contacts
    .map(c => {
      const net = c.transactions.reduce((a, t) => a + t.given_amount - t.taken_amount, 0);
      const color = net >= 0 ? '#10B981' : '#EF4444';
      return `<tr>
        <td>${esc(c.display_name)}</td>
        <td>${esc(c.phone_number)}</td>
        <td>${esc(c.email ?? '')}</td>
        <td>${c.transactions.length}</td>
        <td style="color:${color};font-weight:700;text-align:right">${net >= 0 ? '+' : ''}${formatCurrency(net)}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0F172A; color:#F8FAFC; font-size:11px; }
  h1 { font-size:20px; margin-bottom:4px; }
  .sub { color:#94A3B8; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; margin-top:12px; }
  th, td { border:1px solid #334155; padding:8px; text-align:left; }
  th { background:#1E293B; color:#94A3B8; font-size:10px; text-transform:uppercase; }
  tr:nth-child(even) td { background:rgba(30,41,59,0.3); }
  .footer { text-align:center; color:#475569; font-size:9px; margin-top:20px; border-top:1px solid #1E293B; padding-top:10px; }
</style>
</head>
<body>
  <h1>HisabKitab – Contacts Directory</h1>
  <div class="sub">Generated ${new Date().toLocaleDateString('en-GB')}</div>
  <table>
    <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Txns</th><th style="text-align:right">Net Balance</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Generated by HisabKitab · Private & Confidential</div>
</body>
</html>`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Contacts PDF' });
}

/* ─── CSV Exports ─── */

export const contactsToCSV = (contacts: Contact[]): string => {
  const header = ['Name', 'Phone', 'Email', 'Notes'];
  const rows = contacts.map(c => [c.display_name, c.phone_number, c.email ?? '', c.notes ?? '']);
  return [header, ...rows].map(row => row.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
};

export async function exportContactsCSV(contacts: Contact[]) {
  const csv = contactsToCSV(contacts);
  const dir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
  const uri = dir + 'contacts.csv';
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export Contacts CSV' });
}

/* ─── XLSX Exports ─── */

export async function exportContactsXLSX(contacts: Contact[]) {
  const ws = XLSX.utils.json_to_sheet(
    contacts.map(c => ({
      Name: c.display_name,
      Phone: c.phone_number,
      Email: c.email ?? '',
      Notes: c.notes ?? '',
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const dir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
  const uri = dir + 'contacts.xlsx';
  await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Contacts XLSX',
  });
}

/* ─── Crops CSV ─── */

export const cropsToCSV = (crops: CropExpense[]): string => {
  const header = ['Crop Name', 'Acreage', 'Status'];
  const rows = crops.map(c => [c.crop_name, c.acreage.toString(), c.status]);
  return [header, ...rows].map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
};

export async function exportCropsCSV(crops: CropExpense[]) {
  const csv = cropsToCSV(crops);
  const dir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
  const uri = dir + 'crops.csv';
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export Crops CSV' });
}
