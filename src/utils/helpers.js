// ─── Duration ─────────────────────────────────────────────────────────────────
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatHours(seconds) {
  return (seconds / 3600).toFixed(1) + 'h';
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
export function todayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function monthStart() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function dateKey(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().split('T')[0];
}

export function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

// ─── Global format settings (set by Dashboard on startup + pref change) ────────
let _timeFormat = '12h';   // '12h' | '24h'
let _dateFormat = 'MMM D'; // 'MMM D' | 'DD/MM' | 'MM/DD' | 'YYYY-MM-DD'

export function setGlobalTimeFormat(fmt) { _timeFormat = fmt || '12h'; }
export function setGlobalDateFormat(fmt) { _dateFormat = fmt || 'MMM D'; }

// ─── Time formatter — respects the user's 12h/24h preference ─────────────────
export function formatTime(unixSeconds) {
  const opts = _timeFormat === '24h'
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: 'numeric', minute: '2-digit', hour12: true };
  return new Date(unixSeconds * 1000).toLocaleTimeString([], opts);
}

// ─── Date formatter — respects the user's date format preference ───────────────
export function formatDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  switch (_dateFormat) {
    case 'DD/MM':
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    case 'MM/DD':
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    case 'YYYY-MM-DD':
      return d.toISOString().split('T')[0];
    default: // 'MMM D'
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

// ─── Accent color — dynamically inject a <style> tag overriding Tailwind ──────
/**
 * Apply a new accent color by injecting CSS overrides for every Tailwind
 * accent-color utility class (text-accent, bg-accent, bg-accent/10, etc.)
 * as well as their hover and focus variants.
 *
 * Call this whenever prefs.accentColor changes (and on app startup).
 */
export function applyAccentColor(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;

  // ── Parse RGB channels ───────────────────────────────────────────────────────
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const ch = `${r} ${g} ${b}`;
  const c  = (a) => `rgb(${ch} / ${a})`;

  // ── Derived semantic tokens ───────────────────────────────────────────────────
  const light = `rgb(${Math.min(255,r+42)} ${Math.min(255,g+38)} ${Math.min(255,b+28)})`;
  const dim   = `rgb(${Math.round(r*.28)} ${Math.round(g*.25)} ${Math.round(b*.35)})`;
  const bg    = `rgb(${Math.round(r*.18)} ${Math.round(g*.16)} ${Math.round(b*.24)})`;

  // Nav active gradient tokens
  const navStart  = c(0.86);
  const navEnd2   = `rgb(${Math.round(r*.78)} ${Math.round(g*.63)} ${b} / 0.80)`;
  const navShadow = `0 4px 18px ${c(0.26)}, inset 0 1px 0 rgba(255,255,255,0.16)`;
  const navBorder = c(0.38);
  // Avatar / profile gradient
  const avatarGrad = `linear-gradient(135deg, ${hex} 0%, #6b6dff 100%)`;
  // Button gradient (solid with slight end shift)
  const btnGrad    = `linear-gradient(135deg, ${hex} 0%, #6b6dff 100%)`;

  // ── Full 1-99 alpha variants ─────────────────────────────────────────────────
  const ALPHAS = Array.from({ length: 99 }, (_, i) => i + 1);

  // ── Tailwind class override generator ────────────────────────────────────────
  const OPS = [5,7,8,10,12,14,15,16,18,20,22,24,25,28,30,35,40,50,60,70,75,80,90];
  const row = (prefix, prop, base = hex) => [
    `.${prefix} { ${prop}: ${base} !important; }`,
    ...OPS.map(o => `.${prefix}\\/${o} { ${prop}: ${c(o/100)} !important; }`),
    `.hover\\:${prefix}:hover { ${prop}: ${base} !important; }`,
    ...OPS.map(o => `.hover\\:${prefix}\\/${o}:hover { ${prop}: ${c(o/100)} !important; }`),
    `.focus\\:${prefix}:focus { ${prop}: ${base} !important; }`,
    `.focus-within\\:${prefix}:focus-within { ${prop}: ${base} !important; }`,
    `.active\\:${prefix}:active { ${prop}: ${base} !important; }`,
    `.group-hover\\:${prefix} { ${prop}: ${base} !important; }`,
  ].join('\n');

  const css = `
    /* ════════════════════════════════════════════════════════════
       Flow Ledger Dynamic Accent — ${hex}
       Generated by applyAccentColor()
    ════════════════════════════════════════════════════════════ */

    /* ── Semantic CSS custom properties ── */
    :root {
      /* Core */
      --color-accent:              ${hex};
      /* Derived variants */
      --color-accent-light:        ${light};
      --color-accent-dim:          ${dim};
      --color-accent-bg:           ${bg};
      /* Alpha 1-99 */
      ${ALPHAS.map(a => `--color-accent-a${String(a).padStart(2,'0')}: ${c(a/100)};`).join('\n      ')}
      /* Composite tokens */
      --color-accent-nav-bg:       linear-gradient(135deg, ${navStart} 0%, ${navEnd2} 100%);
      --color-accent-nav-shadow:   ${navShadow};
      --color-accent-nav-border:   ${navBorder};
      --color-accent-avatar:       ${avatarGrad};
      --color-accent-btn:          ${btnGrad};
      --color-accent-glow-sm:      0 2px 8px ${c(0.45)};
      --color-accent-glow-md:      0 5px 16px ${c(0.40)};
      --color-accent-glow-lg:      0 8px 28px ${c(0.38)};
      --color-accent-ring:         0 0 0 3px ${c(0.22)};
      --color-accent-focus-ring:   0 0 0 2px ${c(0.30)}, 0 0 0 4px ${c(0.12)};
    }

    /* ── Tailwind class overrides ── */
    ${row('text-accent',   'color')}
    ${row('bg-accent',     'background-color')}
    ${row('border-accent', 'border-color')}
    ${row('ring-accent',   '--tw-ring-color')}
    ${row('fill-accent',   'fill')}
    ${row('stroke-accent', 'stroke')}
    ${row('shadow-accent', '--tw-shadow-color')}
    ${row('outline-accent','outline-color')}
    ${row('caret-accent',  'caret-color')}
    ${row('accent-accent', 'accent-color')}

    /* Derived Tailwind variants */
    .text-accent-light  { color:            ${light} !important; }
    .bg-accent-dim      { background-color: ${dim}   !important; }
    .bg-accent-bg       { background-color: ${bg}    !important; }
    .border-accent-dim  { border-color:     ${dim}   !important; }

    /* ── Recharts / SVG chart fills ── */
    .recharts-active-dot circle {
      stroke: ${hex} !important;
    }
    .recharts-dot.recharts-line-dot {
      stroke: ${hex} !important;
    }
  `;

  let el = document.getElementById('fl-accent-override');
  if (!el) {
    el = document.createElement('style');
    el.id = 'fl-accent-override';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// ─── Misc ──────────────────────────────────────────────────────────────────────
export function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

export const CATEGORY_COLORS = {
  Coding:   '#6366f1',
  Meetings: '#f59e0b',
  Writing:  '#10b981',
  Research: '#3b82f6',
  Admin:    '#ef4444',
  Break:    '#6b7280',
  General:  '#8b5cf6',
};

export function getCategoryColor(name, categories = []) {
  const found = categories.find(c => c.name === name);
  return found?.color || CATEGORY_COLORS[name] || '#8b5cf6';
}
