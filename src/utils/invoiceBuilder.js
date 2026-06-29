/* ─────────────────────────────────────────────────────────────────────────────
   invoiceBuilder.js — builds a clean, professional invoice HTML document and
   exports it via the same native printToPDF pipeline used by exportUtils.js
   (electron's export:pdf IPC handler). Deliberately separate from
   reportBuilder.js — that template is a multi-page executive productivity
   report (cover page, charts, AI insights) and is the wrong shape for a
   one-page invoice a client actually has to read and pay.
───────────────────────────────────────────────────────────────────────────── */

import { fmtMoney } from './currency';

const api = () => window.electron || {};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_STYLES = {
  draft:    { bg: '#f1f5f9', fg: '#475569', label: 'Draft' },
  sent:     { bg: '#eff7ff', fg: '#2563eb', label: 'Sent' },
  paid:     { bg: '#ecfdf5', fg: '#059669', label: 'Paid' },
  overdue:  { bg: '#fef2f2', fg: '#dc2626', label: 'Overdue' },
};

/**
 * @param {Object} invoice  - row from invoices table (line_items_json as a string)
 * @param {Object} client   - { name, email, company, color }
 * @param {string} fromName - the user's display name / business name
 */
export function buildInvoiceHTML(invoice, client, fromName) {
  const lineItems = (() => {
    try { return JSON.parse(invoice.line_items_json || '[]'); } catch { return []; }
  })();
  const currency = invoice.currency || 'USD';
  const statusStyle = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;

  const rowsHTML = lineItems.length
    ? lineItems.map(li => `
        <tr>
          <td>${esc(li.description)}</td>
          <td style="text-align:right">${(li.hours || 0).toFixed(2)}</td>
          <td style="text-align:right">${esc(fmtMoney(li.rate, currency))}</td>
          <td style="text-align:right">${esc(fmtMoney(li.amount, currency))}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px 0">No billable line items for this period</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px 40px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0; color: #0f172a; }
  .inv-number { font-size: 12px; color: #64748b; margin: 4px 0 0; font-variant-numeric: tabular-nums; }
  .status-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 99px; background: ${statusStyle.bg}; color: ${statusStyle.fg}; }
  .parties { display: flex; gap: 40px; margin-bottom: 28px; }
  .party h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin: 0 0 6px; }
  .party p { margin: 0 0 2px; font-size: 13px; }
  .party .name { font-weight: 700; font-size: 14px; color: #0f172a; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; padding: 14px 18px; background: #f8fafc; border-radius: 10px; }
  .meta-grid .label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; margin: 0 0 3px; }
  .meta-grid .value { font-size: 13px; font-weight: 600; color: #0f172a; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; padding: 8px 4px; border-bottom: 2px solid #e2e8f0; }
  tbody td { padding: 10px 4px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .totals { width: 280px; margin-left: auto; margin-top: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 13px; }
  .totals .row.total { border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 10px; font-size: 16px; font-weight: 800; color: #0f172a; }
  .notes { margin-top: 28px; padding: 14px 18px; background: #f8fafc; border-radius: 10px; font-size: 12px; color: #475569; }
  .notes h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; margin: 0 0 6px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="title">INVOICE</p>
      <p class="inv-number">${esc(invoice.invoice_number)}</p>
    </div>
    <span class="status-pill">${statusStyle.label}</span>
  </div>

  <div class="parties">
    <div class="party">
      <h4>From</h4>
      <p class="name">${esc(fromName || 'Flow Ledger User')}</p>
    </div>
    <div class="party">
      <h4>Bill To</h4>
      <p class="name">${esc(client?.company || client?.name || 'Client')}</p>
      ${client?.company && client?.name ? `<p>${esc(client.name)}</p>` : ''}
      ${client?.email ? `<p>${esc(client.email)}</p>` : ''}
    </div>
  </div>

  <div class="meta-grid">
    <div><p class="label">Issue Date</p><p class="value">${fmtDate(invoice.issue_date)}</p></div>
    <div><p class="label">Due Date</p><p class="value">${invoice.due_date ? fmtDate(invoice.due_date) : '—'}</p></div>
    <div><p class="label">Period Covered</p><p class="value">${fmtDate(invoice.period_from)} – ${fmtDate(invoice.period_to)}</p></div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${esc(fmtMoney(invoice.subtotal, currency))}</span></div>
    ${invoice.tax_rate > 0 ? `<div class="row"><span>Tax (${invoice.tax_rate}%)</span><span>${esc(fmtMoney(invoice.tax_amount, currency))}</span></div>` : ''}
    <div class="row total"><span>Total Due</span><span>${esc(fmtMoney(invoice.total, currency))}</span></div>
  </div>

  ${invoice.notes ? `<div class="notes"><h4>Notes</h4><p>${esc(invoice.notes)}</p></div>` : ''}
</body>
</html>`;
}

/** Generates and saves the invoice as a PDF via the native printToPDF pipeline. */
export async function exportInvoicePDF(invoice, client, fromName) {
  const html = buildInvoiceHTML(invoice, client, fromName);
  const defaultFilename = `invoice-${(invoice.invoice_number || 'draft').toLowerCase()}.pdf`;

  if (typeof api().exportReportPDF === 'function') {
    const result = await api().exportReportPDF({
      html,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-size:9px;color:#94a3b8;width:100%;text-align:center;padding-top:6px;">Generated by Flow Ledger</div>`,
      defaultFilename,
    });
    if (!result?.success && !result?.canceled) {
      throw new Error(result?.error || 'PDF export failed');
    }
    return result;
  }

  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) {
    alert('Please allow pop-ups to export PDF.');
    return { success: false };
  }
  win.document.write(html + '<script>window.onload=()=>setTimeout(()=>window.print(),500)</script>');
  win.document.close();
  return { success: true };
}
