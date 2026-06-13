/**
 * Session Continuity Engine
 * Detects when a new session continues previous work rather than starting fresh.
 * Generates "Continuing X" / "Resuming Y" context labels.
 */

const CONTINUITY_WINDOW_SECS = 4 * 3600; // 4-hour recency window

// ─── Workflow similarity scoring ──────────────────────────────────────────────
function workflowSimilarity(w1, w2) {
  if (!w1 || !w2) return 0;
  // Same type is strong signal
  if (w1.type === w2.type) return 0.6;
  // Same project name
  if (w1.projectName && w2.projectName &&
      w1.projectName.toLowerCase() === w2.projectName.toLowerCase()) return 0.9;
  // Related types
  const related = {
    development: ['development','research','ai_research'],
    design:      ['design','writing'],
    writing:     ['writing','research','planning'],
    research:    ['research','ai_research','development'],
    planning:    ['planning','writing'],
  };
  if (related[w1.type]?.includes(w2.type)) return 0.45;
  return 0.1;
}

// ─── App overlap between sessions ────────────────────────────────────────────
function computeAppOverlap(autoSessions1, autoSessions2) {
  const apps1 = new Set((autoSessions1 || []).map(s => (s.app_name || '').toLowerCase()).filter(Boolean));
  const apps2 = new Set((autoSessions2 || []).map(s => (s.app_name || '').toLowerCase()).filter(Boolean));
  if (!apps1.size || !apps2.size) return 0;
  let overlap = 0;
  for (const a of apps1) { if (apps2.has(a)) overlap++; }
  return overlap / Math.max(apps1.size, apps2.size);
}

// ─── Main continuity detection ────────────────────────────────────────────────
export function detectContinuity(currentSession, currentAutoSessions = [], recentSessions = []) {
  const nowTs = Math.floor(Date.now() / 1000);

  // Filter to sessions within the continuity window
  const window = recentSessions.filter(s => {
    const ended = s.ended_at || (s.started_at + (s.duration_seconds || 0));
    return (nowTs - ended) <= CONTINUITY_WINDOW_SECS && s.id !== currentSession?.id;
  }).sort((a, b) => {
    const aEnded = a.ended_at || (a.started_at + (a.duration_seconds || 0));
    const bEnded = b.ended_at || (b.started_at + (b.duration_seconds || 0));
    return bEnded - aEnded; // most recent first
  });

  if (!window.length) return null;

  const prev = window[0];
  const prevEndedAgo = nowTs - (prev.ended_at || (prev.started_at + (prev.duration_seconds || 0)));

  // Category match
  const catMatch = (currentSession?.category || '').toLowerCase() === (prev.category || '').toLowerCase();

  // Project match
  const projMatch = currentSession?.project_id && prev.project_id &&
    currentSession.project_id === prev.project_id;

  // Title similarity (simple keyword overlap)
  const currentWords = new Set(
    (currentSession?.title || currentSession?.category || '').toLowerCase().split(/\W+/).filter(w => w.length > 3)
  );
  const prevWords = new Set(
    (prev.title || prev.category || '').toLowerCase().split(/\W+/).filter(w => w.length > 3)
  );
  let titleOverlap = 0;
  for (const w of currentWords) { if (prevWords.has(w)) titleOverlap++; }
  const titleSimilarity = currentWords.size > 0 ? titleOverlap / currentWords.size : 0;

  // Compute continuity score
  let score = 0;
  if (catMatch)                    score += 0.30;
  if (projMatch)                   score += 0.35;
  if (titleSimilarity >= 0.5)      score += 0.20;
  if (titleSimilarity >= 0.3)      score += 0.10;
  if (prevEndedAgo <= 1800)        score += 0.15; // within 30 min
  else if (prevEndedAgo <= 3600)   score += 0.08; // within 1 hour
  else if (prevEndedAgo <= 7200)   score += 0.04; // within 2 hours

  const isContinuation = score >= 0.40;
  if (!isContinuation) return null;

  // Determine gap label
  const gapLabel = prevEndedAgo < 300  ? 'just now'
    : prevEndedAgo < 900   ? `${Math.round(prevEndedAgo / 60)}m ago`
    : prevEndedAgo < 3600  ? `${Math.round(prevEndedAgo / 60)}m ago`
    : prevEndedAgo < 7200  ? '1h ago'
    : 'earlier today';

  // Build continuation message
  const prevTitle = prev.title && !['session','focus session','focus block'].includes(prev.title.toLowerCase())
    ? prev.title
    : (prev.category || 'previous work');

  const verb = prevEndedAgo < 600 ? 'Continuing' : 'Resuming';
  const message = `${verb} ${prevTitle}`;

  return {
    isContinuation: true,
    verb,
    message,
    prevSession: prev,
    prevTitle,
    gapLabel,
    score,
    confidence: Math.min(0.97, score),
  };
}

// ─── Project recurrence detection ────────────────────────────────────────────
export function detectProjectRecurrence(projectId, recentSessions = []) {
  if (!projectId) return null;
  const projectSessions = recentSessions.filter(s => s.project_id === projectId);
  if (projectSessions.length < 2) return null;

  const totalSecs = projectSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const sessionCount = projectSessions.length;

  return {
    isRecurring: true,
    sessionCount,
    totalHours: Math.round((totalSecs / 3600) * 10) / 10,
    message: `Session ${sessionCount + 1} on this project`,
  };
}

// ─── Workflow continuation across multiple sessions ───────────────────────────
export function detectWorkflowContinuity(currentWorkflow, recentSessions = []) {
  if (!currentWorkflow || !recentSessions.length) return null;

  const nowTs = Math.floor(Date.now() / 1000);
  const recentEnough = recentSessions.filter(s => {
    const ended = s.ended_at || (s.started_at + (s.duration_seconds || 0));
    return (nowTs - ended) <= CONTINUITY_WINDOW_SECS;
  });

  if (!recentEnough.length) return null;

  // Count sessions with matching workflow type
  let matchCount = 0;
  let streakSecs = 0;
  for (const s of recentEnough) {
    const cat = (s.category || '').toLowerCase();
    const matchesType = (
      (currentWorkflow.type === 'development' && /develop|code|engineer/.test(cat)) ||
      (currentWorkflow.type === 'design' && /design/.test(cat)) ||
      (currentWorkflow.type === 'writing' && /writ|doc/.test(cat)) ||
      (currentWorkflow.type === 'research' && /research/.test(cat)) ||
      cat === currentWorkflow.type
    );
    if (matchesType) {
      matchCount++;
      streakSecs += s.duration_seconds || 0;
    }
  }

  if (matchCount < 2) return null;

  return {
    isWorkflowContinuity: true,
    matchCount,
    streakHours: Math.round((streakSecs / 3600) * 10) / 10,
    message: `Part of an ongoing ${currentWorkflow.label} workflow`,
  };
}
