/* ─────────────────────────────────────────────────────────────────────────────
   reportBuilder.js — assembles the premium, executive-level PDF report HTML:
   Cover → Executive Summary (Key Takeaways, KPI cards, Score breakdown) →
   Performance Overview (trend + comparative analytics) → Detailed Analysis
   (per-section, color-themed, best-fit chart) → Session Timeline →
   AI Insights (8-part executive analysis) → Appendix → Final Summary.

   The resulting HTML string is handed to electron's printToPDF pipeline
   (see exportUtils.js), which renders it with Chromium's print engine for
   real vector output, automatic page numbers, and header/footer templates
   that repeat on every page (see buildHeaderTemplate / buildFooterTemplate).
───────────────────────────────────────────────────────────────────────────── */

import {
  lineAreaChart, barChart, hBarChart, donutChart, comparisonBars,
  circularGauge, stackedBarChart, radarChart, heatmapGrid, timelineChart,
} from './svgCharts';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtNow() {
  return new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toNumber(cell) {
  if (typeof cell === 'number') return cell;
  const m = String(cell ?? '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

// ─── Per-section brand color system ─────────────────────────────────────────
const SECTION_COLORS = {
  productivity: { hex: '#7c6cf2', tint: '#f5f3ff' }, // purple
  deepwork:     { hex: '#5BA7FF', tint: '#eff7ff' }, // blue
  focus:        { hex: '#34D399', tint: '#ecfdf5' }, // green
  meetings:     { hex: '#F87171', tint: '#fef2f2' }, // red
  usage:        { hex: '#22D3EE', tint: '#ecfeff' }, // cyan
  categories:   { hex: '#FB923C', tint: '#fff7ed' }, // orange
  burnout:      { hex: '#FBBF24', tint: '#fffbeb' }, // amber/yellow
  ai:           { hex: '#6366F1', tint: '#eef2ff' }, // indigo
  switching:    { hex: '#A78BFA', tint: '#f5f3ff' }, // violet
};

function sectionAccent(title = '') {
  const t = title.toLowerCase();
  if (/deep ?work/.test(t))            return SECTION_COLORS.deepwork;
  if (/meeting/.test(t))               return SECTION_COLORS.meetings;
  if (/app|usage/.test(t))             return SECTION_COLORS.usage;
  if (/categor|allocation/.test(t))    return SECTION_COLORS.categories;
  if (/burnout|energy/.test(t))        return SECTION_COLORS.burnout;
  if (/switch/.test(t))                return SECTION_COLORS.switching;
  if (/focus|distraction/.test(t))     return SECTION_COLORS.focus;
  return SECTION_COLORS.productivity;
}

function scoreTier(score) {
  if (score >= 85) return { color: '#34D399', label: 'Excellent' };
  if (score >= 70) return { color: '#5BA7FF', label: 'Good' };
  if (score >= 50) return { color: '#FBBF24', label: 'Fair' };
  return { color: '#F87171', label: 'Needs Improvement' };
}

function kpiBadge(tier) {
  const map = {
    excellent: { bg: '#ecfdf5', fg: '#059669', label: 'Excellent' },
    good:      { bg: '#eff7ff', fg: '#2563eb', label: 'Good' },
    warn:      { bg: '#fef2f2', fg: '#dc2626', label: 'Needs Improvement' },
  };
  const t = map[tier];
  return t ? `<span class="rpt-badge" style="background:${t.bg};color:${t.fg}">${t.label}</span>` : '';
}

/** Small colored status pill for common table-status strings. */
function statusBadge(text) {
  const t = String(text);
  const map = [
    [/overwork/i,        '#fef2f2', '#dc2626'],
    [/rest day/i,        '#eff7ff', '#2563eb'],
    [/full day/i,        '#ecfdf5', '#059669'],
    [/light day/i,       '#fffbeb', '#b45309'],
    [/deep work block/i, '#f5f3ff', '#6d28d9'],
    [/switch|short/i,    '#fef2f2', '#dc2626'],
    [/normal/i,          '#f1f5f9', '#475569'],
    [/distraction/i,     '#fef2f2', '#dc2626'],
    [/^yes$/i,           '#ecfdf5', '#059669'],
    [/^no$/i,            '#f1f5f9', '#94a3b8'],
  ];
  for (const [re, bg, fg] of map) {
    if (re.test(t)) return `<span class="rpt-badge" style="background:${bg};color:${fg}">${esc(t)}</span>`;
  }
  return null;
}

/** Small colored circular initial avatar — a lightweight stand-in for app icons in static HTML. */
function initialAvatar(name, color) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="rpt-avatar" style="background:${color}1a;color:${color};border-color:${color}40">${esc(initial)}</span>`;
}

const STATUS_COLUMN_RE = /^(status|type|deep work)$/i;
const APP_COLUMN_RE = /^(application|app)$/i;

// ════════════════════════════════════════════════════════════════════════════
// TABLE RENDERER — zebra striping, numeric right-align, badges, avatars
// ════════════════════════════════════════════════════════════════════════════
function renderTable(headers, rows, opts = {}) {
  const { dense = false, accent = '#7c6cf2' } = opts;
  if (!headers?.length || !rows?.length) return '';

  // Detect numeric columns (right-align) by sampling the first few data rows.
  const numericCol = headers.map((_, c) => {
    const sample = rows.slice(0, 5).map(r => r[c]);
    return sample.length > 0 && sample.every(v => v == null || v === '' || !isNaN(toNumber(v)));
  });

  const thead = `<thead><tr>${headers.map((h, c) => `<th${numericCol[c] ? ' style="text-align:right"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>`;

  const tbody = rows.map(row => `<tr>${row.map((c, i) => {
    if (c == null || c === '') return `<td${numericCol[i] ? ' style="text-align:right"' : ''}>—</td>`;
    const header = headers[i] || '';
    if (APP_COLUMN_RE.test(header)) {
      return `<td><div class="rpt-app-cell">${initialAvatar(c, accent)}<span>${esc(c)}</span></div></td>`;
    }
    if (STATUS_COLUMN_RE.test(header)) {
      const badge = statusBadge(c);
      if (badge) return `<td>${badge}</td>`;
    }
    return `<td${numericCol[i] ? ' style="text-align:right;font-variant-numeric:tabular-nums"' : ''}>${esc(c)}</td>`;
  }).join('')}</tr>`).join('');

  return `<table${dense ? ' class="rpt-dense-table"' : ''}>${thead}<tbody>${tbody}</tbody></table>`;
}

// ════════════════════════════════════════════════════════════════════════════
// COVER PAGE — compact, content-forward (header/footer now live in the
// Chromium print templates, so the cover no longer needs to reserve space
// for them in-page).
// ════════════════════════════════════════════════════════════════════════════
function buildCoverPage(reportTitle, meta) {
  const who = meta.companyName || meta.userName || meta.generatedBy || 'Flow Ledger User';
  const glance = meta.execKpis?.slice(0, 3) || [];

  return `
  <section class="rpt-cover">
    <div class="rpt-cover-brand">
      <span class="rpt-cover-brand-mark"></span>FLOW LEDGER
      <span class="rpt-cover-tagline">Work Analytics &amp; Productivity Intelligence</span>
    </div>

    <div class="rpt-cover-kicker">Business Performance Report</div>
    <h1 class="rpt-cover-title">${esc(reportTitle)}</h1>
    <div class="rpt-cover-rule"></div>

    <table class="rpt-cover-facts">
      <tr><td>Prepared For</td><td>${esc(who)}</td></tr>
      ${meta.dateRange ? `<tr><td>Reporting Period</td><td>${esc(meta.dateRange)}</td></tr>` : ''}
      <tr><td>Generated</td><td>${esc(fmtNow())}</td></tr>
    </table>

    ${glance.length ? `
      <div class="rpt-cover-glance">
        ${glance.map(k => `<div class="rpt-cover-glance-card"><div class="rpt-cover-glance-val">${esc(k.value)}</div><div class="rpt-cover-glance-lbl">${esc(k.label)}</div></div>`).join('')}
      </div>` : ''}

    <p class="rpt-cover-conf">Confidential — prepared for internal and client review purposes only.</p>
  </section>`;
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTIVE SUMMARY — Key Takeaways → KPI cards → Score breakdown
// ════════════════════════════════════════════════════════════════════════════
function buildExecutiveSummary(meta) {
  const kpis = meta.execKpis || [];
  const score = meta.productivityScore;
  const tier  = score ? scoreTier(score.value) : null;
  const accent = SECTION_COLORS.productivity.hex;

  return `
  <section class="rpt-section rpt-page-start">
    <div class="rpt-section-header" style="border-color:${accent}"><div class="rpt-section-title" style="color:${accent}">Executive Summary</div></div>

    ${meta.keyTakeaways?.length ? `
      <div class="rpt-callout" style="background:${SECTION_COLORS.productivity.tint};border-color:${accent}33">
        <div class="rpt-callout-title" style="color:${accent}">Key Takeaways</div>
        <ul class="rpt-callout-list">${meta.keyTakeaways.map(k => `<li>${esc(k)}</li>`).join('')}</ul>
      </div>` : ''}

    ${kpis.length ? `
      <div class="rpt-kpi-row">
        ${kpis.map(k => `
          <div class="rpt-kpi" style="border-top-color:${accent}">
            <div class="rpt-kpi-top">
              <div class="rpt-kpi-value" style="color:${accent}">${esc(k.value)}</div>
              ${k.trend != null ? trendArrow(k.trend, k.inverse) : ''}
            </div>
            <div class="rpt-kpi-label">${esc(k.label)}</div>
            ${k.badge ? kpiBadge(k.badge) : ''}
            ${k.progress != null ? `<div class="rpt-kpi-progress"><div style="width:${Math.max(0, Math.min(100, k.progress))}%;background:${accent}"></div></div>` : ''}
          </div>`).join('')}
      </div>` : ''}

    ${score ? `
      <div class="rpt-score-card">
        <div class="rpt-score-gauge">${circularGauge(score.value, 100, { color: tier.color, sublabel: tier.label })}</div>
        <div class="rpt-score-text">
          <div class="rpt-score-name">Overall Productivity Score</div>
          <p class="rpt-score-desc">${esc(score.description || 'Composite score based on deep work ratio, focus accuracy, and burnout risk over the reporting period.')}</p>
          ${score.breakdown?.length ? `
            <div class="rpt-score-breakdown">
              ${score.breakdown.map(b => `
                <div class="rpt-score-bd-row">
                  <span class="rpt-score-bd-label">${esc(b.label)} <em>(${b.weight}% weight)</em></span>
                  <div class="rpt-score-bd-track"><div style="width:${Math.max(0, Math.min(100, b.value))}%;background:${b.color || tier.color}"></div></div>
                  <span class="rpt-score-bd-val">${Math.round(b.value)}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>
      </div>` : ''}

    ${meta.radar?.length ? `
      <div class="rpt-subsection-title" style="margin:20px 0 10px">Productivity Breakdown</div>
      <div class="rpt-radar-block">
        ${radarChart(meta.radar, { color: accent, size: 220 })}
        <div class="rpt-radar-legend">
          ${meta.radar.map(a => `<div class="rpt-radar-row"><span>${esc(a.label)}</span><strong>${Math.round(a.value)}</strong></div>`).join('')}
        </div>
      </div>` : ''}
  </section>`;
}

function trendArrow(pct, inverse) {
  if (pct === 0) return `<span class="rpt-trend-mini rpt-trend-flat">— 0%</span>`;
  const good = inverse ? pct < 0 : pct > 0;
  return `<span class="rpt-trend-mini ${good ? 'rpt-trend-up' : 'rpt-trend-down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

// ════════════════════════════════════════════════════════════════════════════
// PERFORMANCE OVERVIEW — trend chart + comparative analytics (4 periods)
// ════════════════════════════════════════════════════════════════════════════
function buildPerformanceOverview(meta) {
  const trend = meta.trend;
  const comparative = meta.comparative;
  if (!trend && !comparative?.length) return '';
  const accent = SECTION_COLORS.productivity.hex;

  return `
  <section class="rpt-section">
    <div class="rpt-section-header" style="border-color:${accent}">
      <div class="rpt-section-title" style="color:${accent}">Performance Overview</div>
      <div class="rpt-section-sub">Productivity trend and comparison against prior, best, and average periods</div>
    </div>

    ${trend?.points?.length ? `
      <div class="rpt-chart-block">
        ${lineAreaChart(trend.points, { unit: trend.unit || '', color: accent })}
        <div class="rpt-legend"><span class="rpt-legend-item"><i style="background:${accent}"></i>${esc(trend.label || 'Tracked Time')}</span></div>
      </div>` : ''}

    ${comparative?.length ? `
      <div class="rpt-subsection-title" style="margin:18px 0 10px">Comparative Analytics</div>
      <table class="rpt-compare-table">
        <thead><tr><th>Metric</th><th style="text-align:right">Current</th><th style="text-align:right">Previous</th><th style="text-align:right">Best</th><th style="text-align:right">Average</th><th>vs Previous</th></tr></thead>
        <tbody>
          ${comparative.map(m => `
            <tr>
              <td><strong>${esc(m.label)}</strong></td>
              <td style="text-align:right;font-weight:700;color:${accent}">${m.current}${m.unit || ''}</td>
              <td style="text-align:right">${m.previous}${m.unit || ''}</td>
              <td style="text-align:right">${m.best}${m.unit || ''}</td>
              <td style="text-align:right">${m.average}${m.unit || ''}</td>
              <td>${trendBadgeBlock(m.current, m.previous, m.inverse)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : ''}
  </section>`;
}

function trendBadgeBlock(curr, prev, inverse) {
  if (!prev) return '<span class="rpt-trend-badge rpt-trend-flat">No prior data</span>';
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return '<span class="rpt-trend-badge rpt-trend-flat">No change</span>';
  const good = inverse ? pct < 0 : pct > 0;
  return `<span class="rpt-trend-badge ${good ? 'rpt-trend-up' : 'rpt-trend-down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DETAILED ANALYSIS — color-themed per section, best-fit chart per data shape
// ════════════════════════════════════════════════════════════════════════════
function buildChartForSection(sec, accent) {
  const headers = sec.headers || [];
  const rows = sec.rows || [];
  if (!headers.length || !rows.length) return '';
  const title = sec.title.toLowerCase();

  // Meetings vs Deep Work → stacked bar
  const meetIdx = headers.findIndex(h => /meeting/i.test(h));
  const deepIdx = headers.findIndex(h => /deep work/i.test(h));
  const dateIdx = headers.findIndex(h => /date/i.test(h));
  if (/meeting/.test(title) && meetIdx >= 0 && deepIdx >= 0 && dateIdx >= 0) {
    const categories = rows.map(r => String(r[dateIdx]).slice(5));
    const series = [
      { name: 'Deep Work', color: SECTION_COLORS.deepwork.hex, values: rows.map(r => toNumber(r[deepIdx]) || 0) },
      { name: 'Meetings',  color: accent,                       values: rows.map(r => toNumber(r[meetIdx]) || 0) },
    ];
    return `<div class="rpt-chart-block">${stackedBarChart(categories, series, { height: 180 })}
      <div class="rpt-legend">${series.map(s => `<span class="rpt-legend-item"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div></div>`;
  }

  // App usage → horizontal bar of top apps
  if (/usage|application/.test(title)) {
    const appIdx = headers.findIndex(h => /application|app/i.test(h));
    const hrsIdx = headers.findIndex(h => /^hours$/i.test(h)) >= 0 ? headers.findIndex(h => /^hours$/i.test(h)) : headers.findIndex(h => /hours|time/i.test(h));
    if (appIdx >= 0 && hrsIdx >= 0) {
      const items = rows.slice(0, 8).map(r => ({ label: String(r[appIdx]), value: toNumber(r[hrsIdx]) || 0 }));
      return `<div class="rpt-chart-block">${hBarChart(items, { color: accent, unit: 'h' })}</div>`;
    }
  }

  // Category / allocation breakdown → donut
  if (/categor|allocation/.test(title)) {
    const catIdx = headers.findIndex(h => /categor/i.test(h));
    const hrsIdx = headers.findIndex(h => /hours/i.test(h));
    if (catIdx >= 0 && hrsIdx >= 0) {
      const palette = ['#7c6cf2','#5BA7FF','#34D399','#FB923C','#F87171','#22D3EE','#A78BFA','#FBBF24'];
      const items = rows.slice(0, 8).map((r, i) => ({ value: toNumber(r[hrsIdx]) || 0, color: palette[i % palette.length], label: String(r[catIdx]) }));
      return `<div class="rpt-donut-block">
        ${donutChart(items, { size: 150, strokeWidth: 24 })}
        <div class="rpt-donut-legend">${items.map(it => `<span class="rpt-legend-item"><i style="background:${it.color}"></i>${esc(it.label)}</span>`).join('')}</div>
      </div>`;
    }
  }

  // Date-series (deep work / focus trend) → line chart
  if (dateIdx === 0 && rows.length > 1) {
    let colIdx = -1;
    for (let c = 1; c < headers.length; c++) { if (!isNaN(toNumber(rows[0][c]))) { colIdx = c; break; } }
    if (colIdx !== -1) {
      const points = rows.map(r => ({ label: String(r[0]).slice(5), value: toNumber(r[colIdx]) || 0 }));
      return `<div class="rpt-chart-block">${lineAreaChart(points, { color: accent, height: 170 })}</div>`;
    }
  }

  // Fallback — generic categorical bar
  let numIdx = -1;
  for (let c = 0; c < headers.length; c++) {
    if (/rank|^id$/i.test(headers[c] || '')) continue;
    if (!isNaN(toNumber(rows[0][c]))) { numIdx = c; break; }
  }
  if (numIdx === -1 || rows.length < 2 || rows.length > 60) return '';
  const labelIdx = numIdx === 0 ? 1 : 0;
  const items = rows.slice(0, 8).map(r => ({ label: String(r[labelIdx] ?? ''), value: toNumber(r[numIdx]) || 0 }));
  if (items.every(i => i.value === 0)) return '';
  return `<div class="rpt-chart-block">${barChart(items, { color: accent, height: 170 })}</div>`;
}

function buildDetailedAnalysis(sections) {
  if (!sections?.length) return '';
  const MAX_ROWS_SHOWN = 14;

  const body = sections.map(sec => {
    const accent = sectionAccent(sec.title);
    const chart = buildChartForSection(sec, accent.hex);
    const shownRows = (sec.rows || []).slice(0, MAX_ROWS_SHOWN);
    const truncated = (sec.rows || []).length > MAX_ROWS_SHOWN;

    return `
    <div class="rpt-subsection">
      <div class="rpt-subsection-header">
        <div class="rpt-subsection-title"><span class="rpt-dot" style="background:${accent.hex}"></span>${esc(sec.title)}</div>
        ${sec.subtitle ? `<div class="rpt-subsection-sub">${esc(sec.subtitle)}</div>` : ''}
      </div>

      ${sec.kpis?.length ? `
        <div class="rpt-kpi-row rpt-kpi-row-sm">
          ${sec.kpis.map(k => `
            <div class="rpt-kpi rpt-kpi-sm" style="border-top-color:${accent.hex}">
              <div class="rpt-kpi-value rpt-kpi-value-sm" style="color:${accent.hex}">${esc(k.value)}</div>
              <div class="rpt-kpi-label">${esc(k.label)}</div>
            </div>`).join('')}
        </div>` : ''}

      ${chart}

      ${renderTable(sec.headers, shownRows, { accent: accent.hex })}
      ${truncated ? `<p class="rpt-table-note">Showing ${MAX_ROWS_SHOWN} of ${sec.rows.length} rows — full data is in the Appendix.</p>` : ''}

      ${sec.summary?.length ? `
        <table class="rpt-summary-table">
          <tbody>${sec.summary.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
    </div>`;
  }).join('');

  return `
  <section class="rpt-section rpt-page-start">
    <div class="rpt-section-header"><div class="rpt-section-title">Detailed Analysis</div>
      <div class="rpt-section-sub">${sections.length} section${sections.length === 1 ? '' : 's'} covered in this report</div>
    </div>
    ${body}
  </section>`;
}

// ════════════════════════════════════════════════════════════════════════════
// SESSION TIMELINE — how the workday was structured
// ════════════════════════════════════════════════════════════════════════════
function buildSessionTimeline(timeline) {
  if (!timeline?.blocks?.length) return '';
  const accent = SECTION_COLORS.switching.hex;
  const legendTypes = [...new Map(timeline.blocks.map(b => [b.label, b.color])).entries()];

  return `
  <section class="rpt-section">
    <div class="rpt-section-header" style="border-color:${accent}">
      <div class="rpt-section-title" style="color:${accent}">Session Timeline</div>
      <div class="rpt-section-sub">${esc(timeline.dateLabel || 'A representative workday')} — visual structure of deep work, meetings, breaks, and switching</div>
    </div>
    <div class="rpt-chart-block">
      ${timelineChart(timeline.blocks)}
      <div class="rpt-legend">${legendTypes.map(([label, color]) => `<span class="rpt-legend-item"><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>
    </div>
    ${timeline.heatmap ? `
      <div class="rpt-subsection-title" style="margin:20px 0 10px">Weekly Activity Heatmap</div>
      <div class="rpt-chart-block">${heatmapGrid(timeline.heatmap, { color: accent })}</div>` : ''}
  </section>`;
}

// ════════════════════════════════════════════════════════════════════════════
// AI INSIGHTS — expanded 8-part executive analysis
// ════════════════════════════════════════════════════════════════════════════
function insightCard(title, tone, content) {
  if (!content) return '';
  return `
    <div class="rpt-insight-card rpt-insight-${tone}">
      <div class="rpt-insight-card-title">${esc(title)}</div>
      ${content}
    </div>`;
}

function bulletList(items) {
  if (!items?.length) return '';
  return `<ul class="rpt-insight-list">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function buildAIInsights(ai) {
  if (!ai) return '';
  const accent = SECTION_COLORS.ai.hex;
  const cards = [
    insightCard('Strengths', 'good', bulletList(ai.strengths)),
    insightCard('Weaknesses', 'warn', bulletList(ai.weaknesses)),
    insightCard('Opportunities for Improvement', 'accent', bulletList(ai.opportunities)),
    insightCard('Productivity Bottlenecks', 'warn', bulletList(ai.bottlenecks)),
    ai.burnoutRisk ? insightCard('Burnout Risk Assessment', ai.burnoutRisk.level === 'High' || ai.burnoutRisk.level === 'Elevated' ? 'warn' : 'good',
      `<div class="rpt-insight-stat" style="color:${ai.burnoutRisk.level === 'High' ? '#dc2626' : ai.burnoutRisk.level === 'Elevated' ? '#b45309' : '#059669'}">${esc(ai.burnoutRisk.level)} Risk</div><p class="rpt-insight-text">${esc(ai.burnoutRisk.text)}</p>`) : '',
    ai.focusPattern ? insightCard('Focus Pattern Analysis', 'accent', `<p class="rpt-insight-text">${esc(ai.focusPattern.text)}</p>`) : '',
    ai.predictedNextWeek ? insightCard('Predicted Productivity — Next Week', 'accent',
      `${ai.predictedNextWeek.value != null ? `<div class="rpt-insight-stat" style="color:${accent}">${esc(ai.predictedNextWeek.value)}</div>` : ''}<p class="rpt-insight-text">${esc(ai.predictedNextWeek.text)}</p>`) : '',
    ai.recommendations?.length ? insightCard('Personalized Recommendations', 'good', `
      <ul class="rpt-insight-list rpt-rec-list">
        ${ai.recommendations.map(r => `<li>${esc(r.text)} <span class="rpt-confidence">${r.confidence}% confidence</span></li>`).join('')}
      </ul>`) : '',
  ].filter(Boolean);

  if (!cards.length) return '';

  return `
  <section class="rpt-section rpt-page-start">
    <div class="rpt-section-header" style="border-color:${accent}">
      <div class="rpt-section-title" style="color:${accent}">AI Insights &amp; Recommendations</div>
      <div class="rpt-section-sub">Comprehensive analysis detected automatically from tracked work activity</div>
    </div>
    <div class="rpt-insight-grid">${cards.join('')}</div>
  </section>`;
}

// ════════════════════════════════════════════════════════════════════════════
// APPENDIX — full raw tables + metric glossary (no longer the closing page)
// ════════════════════════════════════════════════════════════════════════════
function buildAppendix(sections, definitions) {
  if (!sections?.length && !definitions?.length) return '';
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const dataTables = (sections || []).filter(s => s.headers?.length && s.rows?.length).map((sec, i) => `
    <div class="rpt-subsection">
      <div class="rpt-subsection-header">
        <div class="rpt-subsection-title">Appendix ${letters[i] || i + 1} — ${esc(sec.title)} (Complete Data)</div>
        <div class="rpt-subsection-sub">${sec.rows.length} total rows</div>
      </div>
      ${renderTable(sec.headers, sec.rows, { dense: true })}
    </div>`).join('');

  const glossary = definitions?.length ? `
    <div class="rpt-subsection">
      <div class="rpt-subsection-header"><div class="rpt-subsection-title">Metric Definitions</div></div>
      <table>
        <thead><tr><th style="width:220px">Term</th><th>Definition</th></tr></thead>
        <tbody>${definitions.map(d => `<tr><td><strong>${esc(d.term)}</strong></td><td>${esc(d.definition)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  return `
  <section class="rpt-section rpt-page-start">
    <div class="rpt-section-header">
      <div class="rpt-section-title">Appendix</div>
      <div class="rpt-section-sub">Complete underlying data and metric definitions</div>
    </div>
    ${dataTables}
    ${glossary}
  </section>`;
}

// ════════════════════════════════════════════════════════════════════════════
// FINAL SUMMARY PAGE — the actual closing page of the report
// ════════════════════════════════════════════════════════════════════════════
function buildFinalSummary(fs) {
  if (!fs) return '';
  const tier = scoreTier(fs.score ?? 0);

  return `
  <section class="rpt-section rpt-page-start rpt-final">
    <div class="rpt-section-header" style="border-color:${tier.color}">
      <div class="rpt-section-title" style="color:${tier.color}">Final Summary</div>
      <div class="rpt-section-sub">A concise close-out of this report's performance period</div>
    </div>

    <div class="rpt-final-grade">
      <div class="rpt-final-grade-badge" style="background:${tier.color}1a;color:${tier.color};border-color:${tier.color}40">${esc(fs.grade)}</div>
      <div>
        <div class="rpt-final-score">${fs.score}<span>/100</span></div>
        <div class="rpt-final-tier" style="color:${tier.color}">${tier.label} Overall Performance</div>
      </div>
    </div>

    ${fs.highlights?.length ? `
      <div class="rpt-subsection-title" style="margin:18px 0 10px">Weekly Highlights</div>
      <ul class="rpt-insight-list">${fs.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}

    <div class="rpt-final-grid">
      ${fs.biggestAchievement ? `<div class="rpt-final-card rpt-final-good"><div class="rpt-insight-card-title">Biggest Achievement</div><p class="rpt-insight-text">${esc(fs.biggestAchievement)}</p></div>` : ''}
      ${fs.biggestOpportunity ? `<div class="rpt-final-card rpt-final-warn"><div class="rpt-insight-card-title">Biggest Improvement Opportunity</div><p class="rpt-insight-text">${esc(fs.biggestOpportunity)}</p></div>` : ''}
    </div>

    ${fs.aiRecommendation ? `
      <div class="rpt-callout" style="background:${SECTION_COLORS.ai.tint};border-color:${SECTION_COLORS.ai.hex}33">
        <div class="rpt-callout-title" style="color:${SECTION_COLORS.ai.hex}">AI Recommendation</div>
        <p class="rpt-insight-text">${esc(fs.aiRecommendation)}</p>
      </div>` : ''}

    ${fs.closing ? `<p class="rpt-final-closing">${esc(fs.closing)}</p>` : ''}
  </section>`;
}

// ════════════════════════════════════════════════════════════════════════════
// CSS — enterprise report styling
// ════════════════════════════════════════════════════════════════════════════
const REPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px; color: #1e293b; background: #fff; line-height: 1.55;
  }
  .rpt-doc { padding: 0 8mm; }

  /* ── Cover page (compact) ── */
  .rpt-cover { page-break-after: always; padding-top: 6mm; }
  .rpt-cover-brand {
    font-size: 14px; font-weight: 900; letter-spacing: 0.05em; color: #0f172a;
    display: flex; align-items: center; gap: 9px; margin-bottom: 22mm;
  }
  .rpt-cover-brand-mark { width: 18px; height: 18px; border-radius: 5px; background: linear-gradient(135deg,#7c6cf2,#5BA7FF); display: inline-block; }
  .rpt-cover-tagline { font-size: 9.5px; font-weight: 500; color: #94a3b8; letter-spacing: 0; margin-left: 8px; }
  .rpt-cover-kicker { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #7c6cf2; margin-bottom: 10px; }
  .rpt-cover-title { font-size: 30px; font-weight: 900; color: #0f172a; letter-spacing: -0.7px; line-height: 1.16; max-width: 480px; }
  .rpt-cover-rule { width: 56px; height: 4px; border-radius: 2px; background: linear-gradient(90deg,#7c6cf2,#5BA7FF); margin: 18px 0 20px; }
  .rpt-cover-facts td { padding: 5px 0; font-size: 11.5px; }
  .rpt-cover-facts td:first-child { color: #94a3b8; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em; width: 150px; }
  .rpt-cover-facts td:last-child { color: #1e293b; font-weight: 700; }
  .rpt-cover-glance { display: flex; gap: 12px; margin: 22px 0; }
  .rpt-cover-glance-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; background: #f8faff; }
  .rpt-cover-glance-val { font-size: 20px; font-weight: 900; color: #7c6cf2; }
  .rpt-cover-glance-lbl { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-top: 4px; }
  .rpt-cover-conf { font-size: 9px; color: #94a3b8; margin-top: 14px; }

  /* ── Section ── */
  .rpt-page-start { page-break-before: always; }
  .rpt-section { margin-bottom: 30px; }
  .rpt-section-header { padding-bottom: 10px; margin-bottom: 16px; border-bottom: 2px solid #7c6cf2; }
  .rpt-section-title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #0f172a; }
  .rpt-section-sub { font-size: 10.5px; color: #64748b; margin-top: 3px; }

  .rpt-subsection { margin-bottom: 26px; page-break-inside: avoid; }
  .rpt-subsection-header { margin-bottom: 10px; }
  .rpt-subsection-title { font-size: 11.5px; font-weight: 800; color: #334155; display: flex; align-items: center; gap: 7px; }
  .rpt-subsection-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .rpt-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

  /* ── Key Takeaways callout ── */
  .rpt-callout { border: 1px solid; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; }
  .rpt-callout-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .rpt-callout-list { list-style: none; }
  .rpt-callout-list li { font-size: 11px; color: #334155; line-height: 1.65; padding-left: 14px; position: relative; margin-bottom: 5px; }
  .rpt-callout-list li::before { content: '→'; position: absolute; left: 0; font-weight: 900; }

  /* ── KPI cards ── */
  .rpt-kpi-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
  .rpt-kpi { flex: 1; min-width: 130px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; background: #f8faff; border-top: 3px solid #7c6cf2; break-inside: avoid; }
  .rpt-kpi-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .rpt-kpi-value { font-size: 21px; font-weight: 900; line-height: 1; }
  .rpt-kpi-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; margin-top: 6px; }
  .rpt-kpi-row-sm .rpt-kpi { padding: 10px 12px; border-top-width: 2px; }
  .rpt-kpi-value-sm { font-size: 16px; }
  .rpt-kpi-progress { height: 4px; border-radius: 99px; background: #e2e8f0; margin-top: 8px; overflow: hidden; }
  .rpt-kpi-progress div { height: 100%; border-radius: 99px; }
  .rpt-badge { display: inline-block; font-size: 8px; font-weight: 800; padding: 2px 7px; border-radius: 99px; margin-top: 7px; text-transform: uppercase; letter-spacing: 0.04em; }
  .rpt-trend-mini { font-size: 9.5px; font-weight: 800; white-space: nowrap; }
  .rpt-trend-up   { color: #059669; }
  .rpt-trend-down { color: #dc2626; }
  .rpt-trend-flat { color: #94a3b8; }

  /* ── Score card ── */
  .rpt-score-card { display: flex; align-items: center; gap: 24px; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 22px; background: #fafbff; }
  .rpt-score-gauge { flex-shrink: 0; width: 140px; }
  .rpt-score-name { font-size: 13px; font-weight: 800; color: #0f172a; }
  .rpt-score-desc { font-size: 10.5px; color: #64748b; margin-top: 4px; max-width: 420px; line-height: 1.6; }
  .rpt-score-breakdown { margin-top: 12px; }
  .rpt-score-bd-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .rpt-score-bd-label { font-size: 9.5px; color: #475569; width: 190px; flex-shrink: 0; }
  .rpt-score-bd-label em { color: #94a3b8; font-style: normal; }
  .rpt-score-bd-track { flex: 1; height: 6px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
  .rpt-score-bd-track div { height: 100%; border-radius: 99px; }
  .rpt-score-bd-val { font-size: 9.5px; font-weight: 700; color: #334155; width: 24px; text-align: right; flex-shrink: 0; }

  /* ── Charts ── */
  .rpt-chart-block { margin: 6px 0 14px; border: 1px solid #f1f5f9; border-radius: 10px; padding: 12px 10px 4px; }
  .rpt-donut-block { display: flex; align-items: center; gap: 24px; margin: 6px 0 14px; border: 1px solid #f1f5f9; border-radius: 10px; padding: 16px; }
  .rpt-donut-legend { display: flex; flex-direction: column; gap: 7px; }
  .rpt-radar-block { display: flex; align-items: center; gap: 20px; margin: 6px 0 14px; border: 1px solid #f1f5f9; border-radius: 10px; padding: 12px 16px; }
  .rpt-radar-legend { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .rpt-radar-row { display: flex; justify-content: space-between; font-size: 9.5px; color: #475569; border-bottom: 1px dashed #f1f5f9; padding-bottom: 4px; }
  .rpt-radar-row strong { color: #0f172a; }
  .rpt-legend { display: flex; gap: 16px; padding: 6px 6px 2px; flex-wrap: wrap; }
  .rpt-legend-item { font-size: 9.5px; color: #64748b; display: flex; align-items: center; gap: 6px; }
  .rpt-legend-item i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

  /* ── Comparative analytics table ── */
  .rpt-compare-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .rpt-compare-table th { text-align: left; padding: 8px 10px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; border-bottom: 2px solid #cbd5e1; }
  .rpt-compare-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
  .rpt-trend-badge { display: inline-block; font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 99px; }
  .rpt-trend-badge.rpt-trend-up   { background: #ecfdf5; color: #059669; }
  .rpt-trend-badge.rpt-trend-down { background: #fef2f2; color: #dc2626; }
  .rpt-trend-badge.rpt-trend-flat { background: #f1f5f9; color: #94a3b8; }

  /* ── AI / final insight cards ── */
  .rpt-insight-grid, .rpt-final-grid { display: flex; gap: 14px; flex-wrap: wrap; }
  .rpt-insight-card, .rpt-final-card { flex: 1 1 46%; min-width: 220px; border-radius: 12px; padding: 16px; break-inside: avoid; border: 1px solid; }
  .rpt-insight-good, .rpt-final-good  { background: #ecfdf5; border-color: #a7f3d0; }
  .rpt-insight-warn, .rpt-final-warn { background: #fffbeb; border-color: #fde68a; }
  .rpt-insight-accent { background: #eef2ff; border-color: #c7d2fe; }
  .rpt-insight-card-title { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; color: #334155; }
  .rpt-insight-list { list-style: none; }
  .rpt-insight-list li { font-size: 10.5px; color: #334155; line-height: 1.6; padding-left: 14px; position: relative; margin-bottom: 8px; }
  .rpt-insight-list li::before { content: '•'; position: absolute; left: 0; font-weight: 900; color: inherit; }
  .rpt-insight-text { font-size: 10.5px; color: #334155; line-height: 1.65; }
  .rpt-insight-stat { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
  .rpt-confidence { display: inline-block; font-size: 8px; font-weight: 800; color: #6366F1; background: #eef2ff; padding: 1px 6px; border-radius: 99px; margin-left: 4px; white-space: nowrap; }
  .rpt-rec-list li::before { content: '✓'; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead { display: table-header-group; } /* repeats table headers across printed pages */
  thead tr { background: #f1f5f9; }
  th { text-align: left; padding: 8px 10px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; border-bottom: 2px solid #cbd5e1; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
  tbody tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #fafbff; }
  tbody tr:last-child td { border-bottom: none; }
  .rpt-dense-table th, .rpt-dense-table td { padding: 5px 8px; font-size: 9.5px; }
  .rpt-table-note { font-size: 9.5px; color: #94a3b8; margin-top: 6px; font-style: italic; }
  .rpt-app-cell { display: flex; align-items: center; gap: 8px; }
  .rpt-avatar { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: 1px solid; font-size: 8.5px; font-weight: 800; flex-shrink: 0; }

  .rpt-summary-table { margin-top: 12px; max-width: 460px; }
  .rpt-summary-table td:first-child { font-weight: 700; color: #475569; width: 55%; }
  .rpt-summary-table td { background: transparent !important; }

  /* ── Final summary page ── */
  .rpt-final-grade { display: flex; align-items: center; gap: 18px; margin-bottom: 8px; }
  .rpt-final-grade-badge { font-size: 30px; font-weight: 900; width: 72px; height: 72px; border-radius: 16px; border: 1px solid; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .rpt-final-score { font-size: 26px; font-weight: 900; color: #0f172a; }
  .rpt-final-score span { font-size: 13px; color: #94a3b8; font-weight: 700; }
  .rpt-final-tier { font-size: 11px; font-weight: 800; margin-top: 2px; }
  .rpt-final-grid { margin-top: 18px; }
  .rpt-final-closing { font-size: 11.5px; color: #334155; line-height: 1.75; margin-top: 18px; font-style: italic; border-left: 3px solid #e2e8f0; padding-left: 14px; }

  @page { margin: 20mm 14mm 16mm; }
`;

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API — header/footer templates rendered by Chromium on every page
// (own isolated document — needs fully inline styles, no external CSS).
// ════════════════════════════════════════════════════════════════════════════
export function buildHeaderTemplate(reportTitle, meta = {}) {
  return `
  <div style="width:100%;font-family:Arial,sans-serif;font-size:7.5px;color:#475569;display:flex;justify-content:space-between;align-items:center;padding:0 14mm;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">
    <span style="display:flex;align-items:center;gap:5px;font-weight:800;color:#0f172a;letter-spacing:0.03em;">
      <span style="width:7px;height:7px;border-radius:2px;background:#7c6cf2;display:inline-block;"></span>
      FLOW LEDGER &middot; ${esc(reportTitle)}
    </span>
    <span style="color:#94a3b8;">${esc(meta.period || meta.dateRange || '')}</span>
  </div>`;
}

export function buildFooterTemplate(reportTitle) {
  return `
  <div style="width:100%;font-family:Arial,sans-serif;font-size:7.5px;color:#94a3b8;display:flex;justify-content:space-between;padding:0 14mm;border-top:1px solid #e2e8f0;padding-top:4px;">
    <span>Confidential &middot; Generated ${esc(fmtNow())}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

/**
 * @param {string} reportTitle
 * @param {object} meta — see field list across the module above (all optional besides dateRange/period)
 * @param {Section[]} sections
 */
export function buildReportHTML(reportTitle, meta, sections) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(reportTitle)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="rpt-doc">
    ${buildCoverPage(reportTitle, meta)}
    ${buildExecutiveSummary(meta)}
    ${buildPerformanceOverview(meta)}
    ${buildDetailedAnalysis(sections)}
    ${buildSessionTimeline(meta.timeline)}
    ${buildAIInsights(meta.aiInsights)}
    ${buildAppendix(sections, meta.definitions)}
    ${buildFinalSummary(meta.finalSummary)}
  </div>
</body>
</html>`;
}
