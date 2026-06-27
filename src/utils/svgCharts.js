/* ─────────────────────────────────────────────────────────────────────────────
   svgCharts.js — dependency-free static SVG chart generators for exported
   PDF reports. The live app renders charts with Recharts inside React, but
   the PDF pipeline renders a plain HTML string outside the React tree (see
   electron's printToPDF flow in exportUtils.js), so charts there are built
   as plain inline SVG markup instead.
───────────────────────────────────────────────────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Line + filled-area trend chart.
 * @param {{label:string, value:number}[]} points
 * @param {object} opts { width,height,color,unit,maxTicks }
 */
export function lineAreaChart(points, opts = {}) {
  const {
    width = 680, height = 220, color = '#7c6cf2', unit = '',
    maxTicks = 8, secondSeries = null, secondColor = '#5BA7FF',
  } = opts;
  const margin = { top: 16, right: 16, bottom: 28, left: 40 };
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;
  const n = points.length;
  if (!n) return emptyChart(width, height, 'No data for this period');

  const allVals = points.map(p => p.value).concat(secondSeries ? secondSeries.map(p => p.value) : []);
  const maxVal  = Math.max(1, ...allVals) * 1.12;

  const xAt = (i) => margin.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => margin.top + innerH * (1 - Math.min(v, maxVal) / maxVal);

  const buildLine = (series) => series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const buildArea = (series) => `${buildLine(series)} L ${xAt(n - 1).toFixed(1)},${(margin.top + innerH).toFixed(1)} L ${xAt(0).toFixed(1)},${(margin.top + innerH).toFixed(1)} Z`;

  // Gridlines (4 horizontal bands) + Y-axis labels
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = margin.top + innerH * (1 - f);
    const val = Math.round(maxVal * f);
    return `
      <line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${width - margin.right}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2 4"/>
      <text x="${margin.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${val}${unit}</text>`;
  }).join('');

  // X-axis labels — thinned to avoid overlap
  const step = Math.max(1, Math.ceil(n / maxTicks));
  const xLabels = points.map((p, i) => (i % step === 0 || i === n - 1) ? `
      <text x="${xAt(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="8.5" fill="#94a3b8" font-family="Arial,sans-serif">${esc(p.label)}</text>` : '').join('');

  const gradId = `g${Math.random().toString(36).slice(2, 8)}`;

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${secondSeries ? `<path d="${buildLine(secondSeries)}" fill="none" stroke="${secondColor}" stroke-width="1.5" stroke-dasharray="3 3"/>` : ''}
    <path d="${buildArea(points)}" fill="url(#${gradId})" stroke="none"/>
    <path d="${buildLine(points)}" fill="none" stroke="${color}" stroke-width="2"/>
    ${points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="2.2" fill="${color}"/>`).join('')}
    ${xLabels}
  </svg>`;
}

/**
 * Vertical bar chart.
 * @param {{label:string, value:number, color?:string}[]} items
 */
export function barChart(items, opts = {}) {
  const { width = 680, height = 220, color = '#7c6cf2', unit = '', maxBars = 14 } = opts;
  const data = items.slice(0, maxBars);
  const margin = { top: 16, right: 16, bottom: 30, left: 40 };
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;
  const n = data.length;
  if (!n) return emptyChart(width, height, 'No data for this period');

  const maxVal  = Math.max(1, ...data.map(d => d.value)) * 1.12;
  const slot    = innerW / n;
  const barW    = Math.min(38, slot * 0.55);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = margin.top + innerH * (1 - f);
    const val = Math.round(maxVal * f);
    return `
      <line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${width - margin.right}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2 4"/>
      <text x="${margin.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${val}${unit}</text>`;
  }).join('');

  const bars = data.map((d, i) => {
    const x = margin.left + i * slot + (slot - barW) / 2;
    const h = innerH * Math.min(d.value, maxVal) / maxVal;
    const y = margin.top + innerH - h;
    const c = d.color || color;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="3" fill="${c}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="8.5" fill="#94a3b8" font-family="Arial,sans-serif">${esc(d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label)}</text>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${bars}
  </svg>`;
}

/**
 * Donut chart — returns SVG only; render the legend separately in HTML
 * (a list with color swatches reads far better on paper than SVG text).
 */
export function donutChart(items, opts = {}) {
  const { size = 168, strokeWidth = 26 } = opts;
  const total = items.reduce((s, d) => s + (d.value || 0), 0);
  if (!total) return emptyChart(size, size, '');

  const r  = (size - strokeWidth) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0;

  const segments = items.map(d => {
    const frac = (d.value || 0) / total;
    const len  = frac * circumference;
    const seg  = `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}"
        stroke-dashoffset="${(-offsetAcc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offsetAcc += len;
    return seg;
  }).join('');

  return `
  <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${strokeWidth}"/>
    ${segments}
  </svg>`;
}

/** Two-bar this-period-vs-last-period mini comparison. */
export function comparisonBars(currLabel, currVal, prevLabel, prevVal, opts = {}) {
  const { width = 280, height = 130, color = '#7c6cf2', prevColor = '#cbd5e1', unit = '' } = opts;
  const margin = { top: 14, right: 14, bottom: 26, left: 14 };
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;
  const maxVal = Math.max(1, currVal, prevVal) * 1.15;
  const barW   = innerW * 0.28;
  const gap    = innerW * 0.18;
  const x1 = margin.left + innerW / 2 - gap / 2 - barW;
  const x2 = margin.left + innerW / 2 + gap / 2;
  const h1 = innerH * Math.min(prevVal, maxVal) / maxVal;
  const h2 = innerH * Math.min(currVal, maxVal) / maxVal;
  const y1 = margin.top + innerH - h1;
  const y2 = margin.top + innerH - h2;

  return `
  <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}" stroke="#e2e8f0" stroke-width="1"/>
    <rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h1, 1).toFixed(1)}" rx="4" fill="${prevColor}"/>
    <rect x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h2, 1).toFixed(1)}" rx="4" fill="${color}"/>
    <text x="${(x1 + barW / 2).toFixed(1)}" y="${(y1 - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#475569" font-family="Arial,sans-serif">${prevVal.toFixed(1)}${unit}</text>
    <text x="${(x2 + barW / 2).toFixed(1)}" y="${(y2 - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" font-family="Arial,sans-serif">${currVal.toFixed(1)}${unit}</text>
    <text x="${(x1 + barW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${esc(prevLabel)}</text>
    <text x="${(x2 + barW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${esc(currLabel)}</text>
  </svg>`;
}

function emptyChart(width, height, msg) {
  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="11" fill="#cbd5e1" font-family="Arial,sans-serif">${esc(msg)}</text>
  </svg>`;
}

/**
 * Horizontal bar chart — best for ranked categorical data with longer labels
 * (e.g. application names), since vertical bars crowd long labels together.
 * @param {{label:string, value:number, color?:string}[]} items
 */
export function hBarChart(items, opts = {}) {
  const { width = 680, color = '#22D3EE', unit = '', maxBars = 10, rowHeight = 28, labelWidth = 140 } = opts;
  const data = items.slice(0, maxBars);
  if (!data.length) return emptyChart(width, 120, 'No data for this period');

  const margin = { top: 8, right: 56, bottom: 8, left: labelWidth };
  const innerW = width - margin.left - margin.right;
  const height = margin.top + margin.bottom + data.length * rowHeight;
  const maxVal = Math.max(1, ...data.map(d => d.value)) * 1.08;
  const barH = rowHeight * 0.56;

  const bars = data.map((d, i) => {
    const y = margin.top + i * rowHeight + (rowHeight - barH) / 2;
    const w = Math.max(2, innerW * Math.min(d.value, maxVal) / maxVal);
    const c = d.color || color;
    const lbl = d.label.length > 22 ? d.label.slice(0, 21) + '…' : d.label;
    return `
      <text x="${margin.left - 10}" y="${(y + barH / 2 + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#475569" font-family="Arial,sans-serif">${esc(lbl)}</text>
      <rect x="${margin.left}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${c}"/>
      <text x="${(margin.left + w + 8).toFixed(1)}" y="${(y + barH / 2 + 3.5).toFixed(1)}" font-size="9.5" font-weight="700" fill="#334155" font-family="Arial,sans-serif">${d.value}${unit}</text>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#e2e8f0" stroke-width="1"/>
    ${bars}
  </svg>`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end   = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Circular gauge — 260° sweep, value 0..max with a colored arc + center readout.
 * Used for the overall Productivity Score.
 */
export function circularGauge(value, max = 100, opts = {}) {
  const { size = 140, strokeWidth = 14, color = '#7c6cf2', label = '', sublabel = '' } = opts;
  const cx = size / 2, cy = size / 2 + 6;
  const r  = size / 2 - strokeWidth;
  const startA = -130, endA = 130;
  const pct = Math.max(0, Math.min(1, value / max));
  const valueAngle = startA + (endA - startA) * pct;

  return `
  <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <path d="${describeArc(cx, cy, r, startA, endA)}" fill="none" stroke="#eef0fb" stroke-width="${strokeWidth}" stroke-linecap="round"/>
    <path d="${describeArc(cx, cy, r, startA, valueAngle)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="26" font-weight="900" fill="#0f172a" font-family="Arial,sans-serif">${Math.round(value)}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${esc(label || `of ${max}`)}</text>
    ${sublabel ? `<text x="${cx}" y="${size - 4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${color}" font-family="Arial,sans-serif">${esc(sublabel)}</text>` : ''}
  </svg>`;
}

/**
 * Stacked vertical bar chart — multiple series per category (e.g. Deep Work
 * vs Meetings vs Breaks per day).
 * @param {string[]} categories
 * @param {{name:string, color:string, values:number[]}[]} series
 */
export function stackedBarChart(categories, series, opts = {}) {
  const { width = 680, height = 220, unit = '', maxTicks = 8 } = opts;
  const margin = { top: 16, right: 16, bottom: 28, left: 40 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const n = categories.length;
  if (!n || !series.length) return emptyChart(width, height, 'No data for this period');

  const totals = categories.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] || 0), 0));
  const maxVal = Math.max(1, ...totals) * 1.15;
  const slot = innerW / n;
  const barW = Math.min(34, slot * 0.6);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = margin.top + innerH * (1 - f);
    const val = Math.round(maxVal * f);
    return `
      <line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${width - margin.right}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2 4"/>
      <text x="${margin.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${val}${unit}</text>`;
  }).join('');

  const step = Math.max(1, Math.ceil(n / maxTicks));
  let bars = '';
  for (let i = 0; i < n; i++) {
    const x = margin.left + i * slot + (slot - barW) / 2;
    let yCursor = margin.top + innerH;
    for (const ser of series) {
      const v = ser.values[i] || 0;
      const h = innerH * Math.min(v, maxVal) / maxVal;
      yCursor -= h;
      if (h > 0.4) bars += `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${ser.color}"/>`;
    }
    if (i % step === 0 || i === n - 1) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="8.5" fill="#94a3b8" font-family="Arial,sans-serif">${esc(categories[i])}</text>`;
    }
  }

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${bars}
  </svg>`;
}

/**
 * Radar / spider chart — for a multi-axis productivity breakdown.
 * @param {{label:string, value:number}[]} axes values 0..100
 */
export function radarChart(axes, opts = {}) {
  const { size = 240, color = '#7c6cf2', rings = 4 } = opts;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 34;
  const n = axes.length;
  if (n < 3) return emptyChart(size, size, 'Not enough dimensions');
  const angleStep = 360 / n;

  const ringPolys = Array.from({ length: rings }, (_, i) => {
    const rr = r * ((i + 1) / rings);
    const pts = axes.map((_, j) => { const p = polarToCartesian(cx, cy, rr, j * angleStep); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
  }).join('');

  const spokes = axes.map((_, j) => {
    const p = polarToCartesian(cx, cy, r, j * angleStep);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
  }).join('');

  const valuePts = axes.map((a, j) => {
    const rr = r * Math.max(0, Math.min(1, a.value / 100));
    return polarToCartesian(cx, cy, rr, j * angleStep);
  });
  const valuePoly = valuePts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const labels = axes.map((a, j) => {
    const p = polarToCartesian(cx, cy, r + 22, j * angleStep);
    const anchor = Math.abs(p.x - cx) < 4 ? 'middle' : (p.x > cx ? 'start' : 'end');
    return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${anchor}" font-size="9.5" font-weight="700" fill="#475569" font-family="Arial,sans-serif">${esc(a.label)}</text>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${size} ${size}" width="100%" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${ringPolys}
    ${spokes}
    <polygon points="${valuePoly}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2"/>
    ${valuePts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="${color}"/>`).join('')}
    ${labels}
  </svg>`;
}

/**
 * Day × hour activity heatmap (GitHub-contributions style intensity grid).
 * @param {number[][]} grid 7 rows (Mon..Sun) × 24 cols (hour 0..23), values = minutes active
 */
export function heatmapGrid(grid, opts = {}) {
  const { width = 680, color = '#7c6cf2', dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] } = opts;
  const margin = { top: 16, right: 8, bottom: 18, left: 34 };
  const cols = 24;
  const cellW = (width - margin.left - margin.right) / cols;
  const cellH = 18;
  const height = margin.top + margin.bottom + grid.length * cellH;
  const maxVal = Math.max(1, ...grid.flat());

  let cells = '';
  grid.forEach((row, r) => {
    row.forEach((v, c) => {
      const alpha = v <= 0 ? 0.04 : 0.12 + 0.78 * Math.min(1, v / maxVal);
      cells += `<rect x="${(margin.left + c * cellW).toFixed(1)}" y="${(margin.top + r * cellH).toFixed(1)}" width="${(cellW - 1.5).toFixed(1)}" height="${cellH - 1.5}" rx="2" fill="${color}" fill-opacity="${alpha.toFixed(2)}"/>`;
    });
    cells += `<text x="${margin.left - 6}" y="${(margin.top + r * cellH + cellH / 2 + 3).toFixed(1)}" text-anchor="end" font-size="8.5" fill="#94a3b8" font-family="Arial,sans-serif">${dayLabels[r]}</text>`;
  });

  const hourLabels = [0, 6, 12, 18, 23].map(h =>
    `<text x="${(margin.left + h * cellW + cellW / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="Arial,sans-serif">${h}:00</text>`
  ).join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${cells}
    ${hourLabels}
  </svg>`;
}

/**
 * Chronological session timeline across a single 24h axis.
 * @param {{startSec:number, durSec:number, color:string, label:string}[]} blocks startSec = seconds since midnight
 */
export function timelineChart(blocks, opts = {}) {
  const { width = 680, height = 64, trackHeight = 28 } = opts;
  const margin = { left: 36, right: 16 };
  const innerW = width - margin.left - margin.right;
  const daySec = 24 * 3600;
  const y = (height - trackHeight) / 2;

  const segs = blocks.map(b => {
    const x = margin.left + innerW * Math.max(0, b.startSec) / daySec;
    const w = Math.max(2, innerW * b.durSec / daySec);
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${trackHeight}" rx="3" fill="${b.color}"><title>${esc(b.label)}</title></rect>`;
  }).join('');

  const hourTicks = [0, 6, 12, 18, 24].map(h => {
    const x = margin.left + innerW * h / 24;
    return `
      <line x1="${x.toFixed(1)}" y1="${y - 4}" x2="${x.toFixed(1)}" y2="${y + trackHeight + 4}" stroke="#e2e8f0" stroke-width="1"/>
      <text x="${x.toFixed(1)}" y="${height - 2}" text-anchor="middle" font-size="8.5" fill="#94a3b8" font-family="Arial,sans-serif">${h === 24 ? '24:00' : `${String(h).padStart(2,'0')}:00`}</text>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${margin.left}" y="${y}" width="${innerW}" height="${trackHeight}" rx="3" fill="#f8faff" stroke="#e2e8f0"/>
    ${segs}
    ${hourTicks}
  </svg>`;
}
