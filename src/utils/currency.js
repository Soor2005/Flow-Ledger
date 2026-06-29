/* ─────────────────────────────────────────────────────────────────────────────
   currency.js — supported currencies + formatting helpers.
   Flow Ledger is local-first with no live exchange-rate feed, so amounts are
   never converted between currencies — each client/invoice simply renders in
   whatever currency it was set to. Aggregate totals across clients with
   different currencies are flagged rather than silently summed incorrectly.
───────────────────────────────────────────────────────────────────────────── */

export const CURRENCIES = [
  { code: 'USD', symbol: '$',  label: 'US Dollar',         locale: 'en-US' },
  { code: 'EUR', symbol: '€',  label: 'Euro',               locale: 'de-DE' },
  { code: 'GBP', symbol: '£',  label: 'British Pound',      locale: 'en-GB' },
  { code: 'INR', symbol: '₹',  label: 'Indian Rupee',       locale: 'en-IN' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar',  locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar',    locale: 'en-CA' },
  { code: 'JPY', symbol: '¥',  label: 'Japanese Yen',       locale: 'ja-JP' },
  { code: 'CHF', symbol: 'Fr', label: 'Swiss Franc',        locale: 'de-CH' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar',   locale: 'en-SG' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham',        locale: 'ar-AE' },
  { code: 'ZAR', symbol: 'R',  label: 'South African Rand', locale: 'en-ZA' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian Real',     locale: 'pt-BR' },
];

const DEFAULT_CODE = 'USD';
const BY_CODE = Object.fromEntries(CURRENCIES.map(c => [c.code, c]));

export function getCurrency(code) {
  return BY_CODE[code] || BY_CODE[DEFAULT_CODE];
}

export function currencySymbol(code) {
  return getCurrency(code).symbol;
}

/** Format an amount in a given currency code, e.g. fmtMoney(1234.5, 'EUR') → "€1,234.50". */
export function fmtMoney(value, code = DEFAULT_CODE) {
  if (value == null || Number.isNaN(value)) return '—';
  const cur = getCurrency(code);
  try {
    return new Intl.NumberFormat(cur.locale, {
      style: 'currency', currency: cur.code,
      minimumFractionDigits: cur.code === 'JPY' ? 0 : 2,
      maximumFractionDigits: cur.code === 'JPY' ? 0 : 2,
    }).format(value);
  } catch {
    // Fallback if Intl doesn't recognize the currency code for some reason
    return `${cur.symbol}${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/** Format an amount with just the bare symbol (compact, for table cells). */
export function fmtMoneyCompact(value, code = DEFAULT_CODE) {
  if (!value || value === 0) return '—';
  const cur = getCurrency(code);
  return `${cur.symbol}${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Sum amounts that may span multiple currencies. Returns one total per
 * currency present rather than a single (incorrect) blended number.
 * @param {{amount:number, currency:string}[]} items
 * @returns {{code:string, total:number}[]}
 */
export function sumByCurrency(items = []) {
  const totals = {};
  for (const { amount, currency } of items) {
    const code = currency || DEFAULT_CODE;
    totals[code] = (totals[code] || 0) + (amount || 0);
  }
  return Object.entries(totals).map(([code, total]) => ({ code, total }));
}
