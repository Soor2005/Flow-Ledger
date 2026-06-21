const DEFAULT_IDLE_GAP_SECS = 5 * 60;

const HIDDEN_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;
const BROWSER_SUFFIX_RE = /\s+[-–—]\s+(Google Chrome|Chrome|Microsoft Edge|Edge|Brave|Firefox|Arc|Opera|Safari)$/i;
const TRACKER_PREFIX_RE = /^\s*(Auto:\s*)?/i;
const VOLATILE_QUERY_RE = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|vero_id$|session|token|auth|cache|ts|t)$/i;

function cleanString(value) {
  return String(value || '')
    .replace(HIDDEN_CHARS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWorkflowTitle(title = '') {
  return cleanString(title)
    .replace(TRACKER_PREFIX_RE, '')
    .replace(BROWSER_SUFFIX_RE, '')
    .toLowerCase();
}

export function normalizeWorkflowApp(appName = '') {
  return cleanString(appName)
    .replace(/\.exe$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeWorkflowUrl(url = '') {
  const raw = cleanString(url);
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    parsed.hash = '';
    [...parsed.searchParams.keys()].forEach((key) => {
      if (VOLATILE_QUERY_RE.test(key)) parsed.searchParams.delete(key);
    });
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    const query = parsed.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('#')[0]
      .trim()
      .toLowerCase();
  }
}

function sessionStart(session) {
  return Number(session?.started_at) || 0;
}

function sessionEnd(session) {
  const start = sessionStart(session);
  const ended = Number(session?.ended_at) || 0;
  if (ended > start) return ended;
  return start + Math.max(0, Number(session?.duration_seconds) || 0);
}

function workflowCluster(session = {}) {
  const app = normalizeWorkflowApp(session.app_name);
  const url = normalizeWorkflowUrl(session.url);
  const title = normalizeWorkflowTitle(session.window_title || session.title || '');
  const category = cleanString(session.ai_category || session.category || session.ai_session_type || '').toLowerCase();
  const browserFamily = /chrome|edge|brave|firefox|safari|arc|opera/.test(app) ? 'browser' : app;
  const urlScope = url ? url.split('/')[0] : '';
  const titleScope = title.split(/\s+/).slice(0, 8).join(' ');
  return [browserFamily, urlScope, category, titleScope].filter(Boolean).join('|') || app || 'unknown';
}

function workflowOwnership(session = {}) {
  return [
    session.user_id || '',
    session.project_id || '',
    session.client_id || '',
    cleanString(session.ai_category || session.category || session.ai_session_type || '').toLowerCase(),
  ].join('|');
}

function workflowKey(session = {}) {
  if (session.workflow_id) {
    return `${workflowOwnership(session)}::wf:${session.workflow_id}`;
  }
  return `${workflowOwnership(session)}::${workflowCluster(session)}`;
}

function canMergeWorkflow(current, next, options) {
  if (!current || !next) return false;
  if (current.is_idle || next.is_idle) return false;
  const gap = sessionStart(next) - sessionEnd(current);
  if (gap > options.idleGapSecs) return false;
  // Same workflow_id always merges regardless of app/url fingerprint
  if (current.workflow_id && next.workflow_id && current.workflow_id === next.workflow_id) {
    return current.user_id === next.user_id
      && (current.project_id || '') === (next.project_id || '');
  }
  return current._workflow_key === workflowKey(next);
}

function mergeInto(current, next) {
  const nextEnd = sessionEnd(next);
  const currentEnd = sessionEnd(current);
  const nextDuration = Number(next.duration_seconds) || Math.max(0, nextEnd - sessionStart(next));

  current.ended_at = Math.max(currentEnd, nextEnd);
  current.duration_seconds = (Number(current.duration_seconds) || 0) + nextDuration;
  current.source_session_ids.push(next.id);
  current.source_sessions.push(next);
  current._mergedCount = sourceCount(current);
  current._telemetry_segment_count = current._mergedCount;
  if (next.workflow_id && !current.workflow_id) current.workflow_id = next.workflow_id;
  if (next.ai_workflow_name && !current.ai_workflow_name) current.ai_workflow_name = next.ai_workflow_name;

  const currentTitle = cleanString(current.window_title);
  const nextTitle = cleanString(next.window_title);
  if ((!currentTitle || currentTitle.length < 8) && nextTitle) current.window_title = next.window_title;

  current._workflow_end_reason = 'merged_contiguous_telemetry';
  return current;
}

function sourceCount(session) {
  return Array.isArray(session.source_session_ids) ? session.source_session_ids.length : 1;
}

function makeWorkflowSession(session) {
  const start = sessionStart(session);
  const end = sessionEnd(session);
  const duration = Number(session.duration_seconds) || Math.max(0, end - start);
  const key = workflowKey(session);
  return {
    ...session,
    id: session.workflow_id ? `wf-${session.workflow_id}` : `wf-${key}-${start}`,
    started_at: start,
    ended_at: end,
    duration_seconds: duration,
    source_session_ids: [session.id].filter(Boolean),
    source_sessions: [session],
    _workflow_key: key,
    _workflow_cluster: workflowCluster(session),
    _workflow_ownership: workflowOwnership(session),
    _workflow_layer: 'workflow_session',
    _telemetry_segment_count: 1,
    _mergedCount: 1,
    workflow_id: session.workflow_id || null,
  };
}

export function mergeWorkflowSessions(sessions = [], options = {}) {
  const opts = { idleGapSecs: DEFAULT_IDLE_GAP_SECS, ...options };
  const sorted = [...sessions]
    .filter(s => s && !s.is_idle && sessionStart(s) > 0 && (Number(s.duration_seconds) || sessionEnd(s) > sessionStart(s)))
    .sort((a, b) => sessionStart(a) - sessionStart(b));

  const merged = [];
  let current = null;

  for (const raw of sorted) {
    const next = makeWorkflowSession(raw);
    if (canMergeWorkflow(current, raw, opts)) {
      mergeInto(current, raw);
      continue;
    }
    if (current) merged.push(current);
    current = next;
  }
  if (current) merged.push(current);

  if (options.trace && sorted.length !== merged.length) {
    console.debug('[WORKFLOW_SESSION_MERGE]', {
      inputSegments: sorted.length,
      outputSessions: merged.length,
      mergedSessions: merged.filter(s => s._telemetry_segment_count > 1).map(s => ({
        id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        segments: s._telemetry_segment_count,
        key: s._workflow_key,
      })),
    });
  }

  return merged;
}

export function explainWorkflowSplit(prev, next, options = {}) {
  if (!prev) return 'START_SESSION:first_segment';
  if (!next) return 'END_SESSION:no_next_segment';
  const opts = { idleGapSecs: DEFAULT_IDLE_GAP_SECS, ...options };
  const gap = sessionStart(next) - sessionEnd(prev);
  if (prev.is_idle || next.is_idle) return 'IDLE_CHANGE:idle_segment';
  if (gap > opts.idleGapSecs) return `IDLE_CHANGE:gap_${gap}s`;
  const prevKey = workflowKey(prev);
  const nextKey = workflowKey(next);
  if (prevKey !== nextKey) return `WORKFLOW_CHANGE:${prevKey}=>${nextKey}`;
  return 'UPDATE_SESSION:continuous_workflow';
}
