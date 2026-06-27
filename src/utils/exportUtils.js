/* ─────────────────────────────────────────────────────────────────────────────
   exportUtils.js — professional report export helpers for Flow Ledger
   Supports: CSV (one clean dataset per file) and PDF (native printToPDF,
   real page numbers + repeating footer — see reportBuilder.js / main.js).
───────────────────────────────────────────────────────────────────────────── */

import { buildReportHTML, buildHeaderTemplate, buildFooterTemplate } from './reportBuilder';
import { buildCleanCSV, downloadCSV, downloadDatasets } from './csvNormalize';

const api = () => window.electron || {};

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtH(s) {
  const h = (s || 0) / 3600;
  return h >= 10 ? `${h.toFixed(0)}h` : `${h.toFixed(1)}h`;
}

export function fmtDuration(s) {
  if (!s || s < 0) return '0m';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function fmtMoney(v) {
  if (!v || v === 0) return '—';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(part, total) {
  if (!total) return '0%';
  return `${Math.round(((part || 0) / total) * 100)}%`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtNow() {
  return new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function fmtDateRange(fromTs, toTs) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(fromTs * 1000).toLocaleDateString('en-US', opts)} – ${new Date(toTs * 1000).toLocaleDateString('en-US', opts)}`;
}

function slugify(s) {
  return String(s || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── CSV export — one clean dataset per file, analysis-ready ──────────────────
//
// Section shape (unchanged, shared with the PDF builder):
//   { title, subtitle?, kpis?:[{label,value}], headers?:string[], rows?:any[][], summary?:[string,string][] }

export function exportAsCSV(reportTitle, meta, sections, filename) {
  const base = (filename || 'flow-ledger-report').replace(/\.csv$/i, '');

  const datasets = [];

  // Metadata file — plain two-column table, no banners or decoration.
  const metaRows = [['Report Title', reportTitle], ['Generated', fmtNow()]];
  for (const [k, v] of Object.entries(meta || {})) {
    if (v == null || v === '' || typeof v === 'object') continue;
    metaRows.push([k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), v]);
  }
  datasets.push({ name: `${base}-metadata`, headers: ['Field', 'Value'], rows: metaRows });

  // One CSV per section/dataset.
  for (const sec of sections || []) {
    if (sec.headers?.length && sec.rows?.length) {
      datasets.push({ name: `${base}-${slugify(sec.title)}`, headers: sec.headers, rows: sec.rows });
    }
    if (sec.kpis?.length) {
      datasets.push({
        name: `${base}-${slugify(sec.title)}-summary-metrics`,
        headers: ['Metric', 'Value'],
        rows: sec.kpis.map(k => [k.label, k.value]),
      });
    }
  }

  downloadDatasets(datasets);
}

/** Export a single already-clean dataset (headers + raw rows) as one CSV file — no normalization pass. */
export function exportSingleDatasetCSV(filename, headers, rows) {
  downloadCSV(filename.endsWith('.csv') ? filename : `${filename}.csv`, buildCleanCSV(headers, rows));
}

// ─── PDF export — native Chromium printToPDF via Electron main process ────────

/**
 * @param {string}   reportTitle
 * @param {object}   meta          — { dateRange, period, filters?, generatedBy?, companyName?, userName?,
 *                                      execKpis?, productivityScore?, summaryText?, trend?, previousPeriod?,
 *                                      aiInsights?, definitions? } — only dateRange/period are required
 * @param {Section[]} sections
 */
export async function exportAsPDF(reportTitle, meta, sections) {
  const html = buildReportHTML(reportTitle, meta, sections);

  if (typeof api().exportReportPDF === 'function') {
    const defaultFilename = `${(reportTitle || 'flow-ledger-report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
    const result = await api().exportReportPDF({
      html,
      headerTemplate: buildHeaderTemplate(reportTitle, meta),
      footerTemplate: buildFooterTemplate(reportTitle),
      defaultFilename,
    });
    if (!result?.success && !result?.canceled) {
      throw new Error(result?.error || 'PDF export failed');
    }
    return result;
  }

  // Fallback (e.g. running in a plain browser without the Electron preload bridge):
  // open a print-ready window and let the user "Save as PDF" from the print dialog.
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) {
    alert('Please allow pop-ups to export PDF, or use CSV export instead.');
    return { success: false };
  }
  win.document.write(html + '<script>window.onload=()=>setTimeout(()=>window.print(),500)</script>');
  win.document.close();
  return { success: true };
}
