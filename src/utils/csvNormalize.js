/* ─────────────────────────────────────────────────────────────────────────────
   csvNormalize.js — turns the display-formatted strings already produced for
   the PDF/HTML report ("2h 15m", "85%", "$1,234.56", "Yes", "—", "Jan 5, 2026")
   into clean, analysis-ready values for CSV export:
     - durations  → decimal hours (e.g. "2h 15m" -> 2.25)
     - percents   → plain numbers, no "%" sign (header already states the unit)
     - money      → plain numbers, no "$" / thousands separators
     - booleans   → TRUE / FALSE literals
     - dates      → ISO 8601 (YYYY-MM-DD)
     - times      → ISO 8601 24-hour (HH:MM)
     - blanks     → "" instead of "—" / "N/A"
   This lets every existing report-section builder stay untouched (they keep
   producing nice display strings for the PDF) while CSV output independently
   meets "clean dataset, no decorative formatting" requirements.
───────────────────────────────────────────────────────────────────────────── */

const RE_BLANK    = /^(—|-|n\/a|none)$/i;
const RE_BOOL_YES = /^(yes|true)$/i;
const RE_BOOL_NO  = /^(no|false)$/i;
const RE_PERCENT  = /^(-?\d+(?:\.\d+)?)\s*%$/;
const RE_MONEY    = /^\$\s?(-?[\d,]+(?:\.\d+)?)$/;
const RE_DURATION = /^(?:(\d+)h)?\s?(?:(\d+)m)?$/i; // "2h 15m" | "2h" | "45m" | "0m"
const RE_PLAIN_HRS = /^(-?\d+(?:\.\d+)?)h$/i;         // "2.3h"
const RE_LONGDATE  = /^([A-Za-z]{3})\s(\d{1,2}),\s(\d{4})$/; // "Jan 5, 2026"
const RE_TIME_12H  = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/i;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad2(n) { return String(n).padStart(2, '0'); }

/** Normalize a single display-string cell value into a clean CSV-ready value. */
export function normalizeCellForCSV(raw) {
  if (raw == null) return '';
  const v = String(raw).trim();
  if (v === '') return '';
  if (RE_BLANK.test(v)) return '';
  if (RE_BOOL_YES.test(v)) return 'TRUE';
  if (RE_BOOL_NO.test(v))  return 'FALSE';

  let m;
  if ((m = v.match(RE_PERCENT)))   return m[1];
  if ((m = v.match(RE_MONEY)))     return m[1].replace(/,/g, '');
  if ((m = v.match(RE_PLAIN_HRS))) return m[1];

  if ((m = v.match(RE_DURATION)) && (m[1] || m[2]) && /[hm]/i.test(v)) {
    const hrs = (parseInt(m[1] || '0', 10)) + (parseInt(m[2] || '0', 10)) / 60;
    return hrs.toFixed(2).replace(/\.00$/, '');
  }

  if ((m = v.match(RE_LONGDATE))) {
    const mi = MONTHS.indexOf(m[1]);
    if (mi >= 0) return `${m[3]}-${pad2(mi + 1)}-${pad2(+m[2])}`;
  }

  if ((m = v.match(RE_TIME_12H))) {
    let h = parseInt(m[1], 10) % 12;
    if (/PM/i.test(m[3])) h += 12;
    return `${pad2(h)}:${m[2]}`;
  }

  return v;
}

/** Normalize a full row (array of display-string cells). */
export function normalizeRowForCSV(row) {
  return row.map(normalizeCellForCSV);
}

/** Build a single clean CSV string — one dataset, no decoration, UTF-8 ready. */
export function buildCleanCSV(headers, rows) {
  const escCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escCell).join(',')];
  for (const row of rows) lines.push(normalizeRowForCSV(row).map(escCell).join(','));
  return lines.join('\r\n');
}

/** Trigger a browser download for a single CSV string. BOM keeps Excel-on-Windows happy with UTF-8. */
export function downloadCSV(filename, csvString) {
  const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download one CSV file per dataset (the "one dataset per CSV file" rule).
 * Browsers/Electron throttle simultaneous multi-file downloads triggered in
 * the same tick, so files are staggered slightly.
 * @param {{name:string, headers:string[], rows:any[][]}[]} datasets
 */
export function downloadDatasets(datasets) {
  datasets.forEach((ds, i) => {
    setTimeout(() => {
      downloadCSV(`${ds.name}.csv`, buildCleanCSV(ds.headers, ds.rows));
    }, i * 350);
  });
}
