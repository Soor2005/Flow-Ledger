/**
 * Workflow Segmentation Engine
 * Pipeline stage: after sanitization, before signal ranking.
 *
 * Transforms fragmented auto-session telemetry into coherent semantic workflow
 * segments — inspired by Rize.io's internal workblock architecture.
 *
 * Instead of treating each captured window/app as an isolated event, this engine
 * groups temporally and semantically related sessions into meaningful work blocks.
 *
 * Segmentation criteria:
 *   - Temporal continuity  (idle gap > threshold → new segment)
 *   - App ecosystem compatibility  (Figma→VS Code = ok, VS Code→Zoom = break)
 *   - Semantic keyword overlap  (low overlap across gap → new segment)
 *   - Communication boundaries  (meetings always start a new segment)
 *
 * Output: WorkflowSegment[] — each segment is a coherent, fusable work block.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const GAP_BREAK_MINS    = 14;   // Gap larger than this → new segment
const SOFT_GAP_MINS     = 6;    // Soft boundary — break if ecosystem also diverges
const MIN_SEGMENT_SECS  = 20;   // Drop trivially short segments
const MAX_SESSIONS_PER  = 100;  // Safety cap

// ─── App Ecosystem Clusters ───────────────────────────────────────────────────
// Semantic groupings of apps. Used to decide if an app switch breaks a segment.

const ECOSYSTEMS = {
  coding:      ['VS Code', 'Cursor', 'WebStorm', 'IntelliJ', 'Zed', 'Xcode', 'Rider', 'Neovim', 'Vim', 'Android Studio', 'PyCharm', 'RubyMine'],
  design:      ['Figma', 'Sketch', 'Adobe XD', 'Framer', 'Canva', 'Affinity', 'Excalidraw', 'Miro', 'InVision', 'Balsamiq', 'Whimsical'],
  browser:     ['Chrome', 'Firefox', 'Safari', 'Arc', 'Edge', 'Brave', 'Opera', 'Chromium'],
  terminal:    ['Terminal', 'iTerm', 'Warp', 'Hyper', 'Alacritty', 'Kitty', 'Tabby'],
  communication: ['Slack', 'Discord', 'Teams', 'Zoom', 'Meet', 'Loom', 'Gather', 'Webex'],
  notes:       ['Notion', 'Obsidian', 'Typora', 'Bear', 'Roam', 'LogSeq', 'Craft', 'Evernote', 'OneNote'],
  ai_tools:    ['Claude', 'ChatGPT', 'Gemini', 'Copilot', 'Perplexity', 'Poe', 'Phind'],
  git:         ['GitHub', 'GitLab', 'Bitbucket', 'Fork', 'Tower', 'Sourcetree', 'GitKraken'],
  project_mgmt: ['Linear', 'Jira', 'Trello', 'Asana', 'ClickUp', 'Height', 'Shortcut', 'Basecamp'],
  data:        ['Supabase', 'Airtable', 'Metabase', 'Tableau', 'DataGrip', 'TablePlus', 'DBngin', 'Postico'],
  media:       ['YouTube', 'Spotify', 'Figma Community', 'Dribbble', 'Behance', 'Lottie'],
};

// Which ecosystem pairs can coexist inside one workflow segment
const COMPATIBLE_PAIRS = new Set([
  'coding-browser', 'browser-coding',
  'coding-terminal', 'terminal-coding',
  'coding-ai_tools', 'ai_tools-coding',
  'coding-git', 'git-coding',
  'coding-notes', 'notes-coding',
  'design-browser', 'browser-design',
  'design-coding', 'coding-design',
  'browser-ai_tools', 'ai_tools-browser',
  'browser-notes', 'notes-browser',
  'notes-project_mgmt', 'project_mgmt-notes',
  'terminal-browser', 'browser-terminal',
  'git-browser', 'browser-git',
  'ai_tools-notes', 'notes-ai_tools',
  'ai_tools-design', 'design-ai_tools',
  'data-coding', 'coding-data',
  'data-browser', 'browser-data',
]);

export function getEcosystem(appName = '') {
  const lower = appName.toLowerCase();
  for (const [eco, apps] of Object.entries(ECOSYSTEMS)) {
    if (apps.some(a => lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower))) {
      return eco;
    }
  }
  return null;
}

function areCompatible(ecoA, ecoB) {
  if (!ecoA || !ecoB || ecoA === ecoB) return true;
  return COMPATIBLE_PAIRS.has(`${ecoA}-${ecoB}`);
}

// ─── Timestamp Utilities ──────────────────────────────────────────────────────

function toSecs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v > 1e10 ? v / 1000 : v;
  const d = new Date(v);
  return isNaN(d) ? 0 : d.getTime() / 1000;
}

function sessionStart(s) { return toSecs(s.started_at); }
function sessionEnd(s) {
  if (s.ended_at) return toSecs(s.ended_at);
  return sessionStart(s) + (s.duration_seconds || 30);
}
function sessionDurMins(s) { return (sessionEnd(s) - sessionStart(s)) / 60; }

// ─── Semantic Keyword Extraction ──────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','for','in','on','at','to','with',
  'of','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'new','tab','window','loading','connecting','localhost',
]);

function extractKeywords(session) {
  const words = new Set();
  const text = [session.window_title || '', session.app_name || ''].join(' ')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  for (const w of text.split(/\s+/)) {
    if (w.length >= 4 && !STOP_WORDS.has(w)) words.add(w);
  }
  return words;
}

function keywordOverlap(kwA, kwB) {
  if (!kwA.size || !kwB.size) return 0;
  let shared = 0;
  for (const w of kwA) if (kwB.has(w)) shared++;
  return shared / Math.max(kwA.size, kwB.size);
}

// ─── Boundary Detection ───────────────────────────────────────────────────────

function shouldBreak(prev, next) {
  const gap = (sessionStart(next) - sessionEnd(prev)) / 60;

  // Hard break: large temporal gap
  if (gap > GAP_BREAK_MINS) return 'temporal_gap';

  // Hard break: communication apps (meetings are always their own segment)
  const nextEco = getEcosystem(next.app_name || '');
  const prevEco = getEcosystem(prev.app_name || '');
  if (nextEco === 'communication' || prevEco === 'communication') return 'meeting_boundary';

  // Soft break: moderate gap AND ecosystem divergence
  if (gap > SOFT_GAP_MINS && prevEco && nextEco && !areCompatible(prevEco, nextEco)) {
    const overlap = keywordOverlap(extractKeywords(prev), extractKeywords(next));
    if (overlap < 0.12) return 'ecosystem_shift';
  }

  // Soft break: full ecosystem incompatibility with very low semantic overlap
  if (prevEco && nextEco && !areCompatible(prevEco, nextEco)) {
    const overlap = keywordOverlap(extractKeywords(prev), extractKeywords(next));
    if (overlap < 0.08) return 'semantic_divergence';
  }

  return null;
}

// ─── Segment Profile ──────────────────────────────────────────────────────────

function buildProfile(sessions) {
  const appSecs = {};
  const ecoSecs = {};
  const allKeywords = new Set();
  const phrases = [];
  let totalSecs = 0;
  let switches = 0;
  let lastApp = null;

  for (const s of sessions) {
    const dur = s.duration_seconds || Math.max(sessionEnd(s) - sessionStart(s), 1);
    totalSecs += dur;

    const app = s.app_name || 'Unknown';
    appSecs[app] = (appSecs[app] || 0) + dur;

    const eco = getEcosystem(app);
    if (eco) ecoSecs[eco] = (ecoSecs[eco] || 0) + dur;

    if (lastApp && lastApp !== app) switches++;
    lastApp = app;

    if (s.window_title) {
      phrases.push({ phrase: s.window_title, durationSecs: dur });
      for (const kw of extractKeywords(s)) allKeywords.add(kw);
    }
  }

  const topApps = Object.entries(appSecs)
    .sort(([, a], [, b]) => b - a).slice(0, 6)
    .map(([name, secs]) => ({ name, secs, eco: getEcosystem(name), pct: Math.round(secs / totalSecs * 100) }));

  const topEcos = Object.entries(ecoSecs)
    .sort(([, a], [, b]) => b - a)
    .map(([eco]) => eco);

  const topPhrases = phrases
    .sort((a, b) => b.durationSecs - a.durationSecs)
    .reduce((acc, p) => {
      if (!acc.some(x => x.phrase === p.phrase)) acc.push(p);
      return acc;
    }, [])
    .slice(0, 8);

  return {
    topApps,
    topEcos,
    topPhrases,
    keywords: [...allKeywords].slice(0, 24),
    totalSecs,
    durationMins: totalSecs / 60,
    contextSwitches: switches,
  };
}

// ─── Workflow Type Classification ─────────────────────────────────────────────

const WORKFLOW_TYPES = [
  {
    id: 'design_to_implementation',
    label: 'Design & Implementation',
    narrative: 'designing and implementing',
    requires: [['design'], ['coding']],
    priority: 10,
  },
  {
    id: 'ai_assisted_development',
    label: 'AI-Assisted Development',
    narrative: 'building with AI assistance',
    requires: [['ai_tools'], ['coding']],
    priority: 9,
  },
  {
    id: 'research_driven_implementation',
    label: 'Research-Driven Implementation',
    narrative: 'researching and implementing',
    requires: [['browser'], ['coding']],
    priority: 8,
  },
  {
    id: 'deep_coding',
    label: 'Deep Implementation',
    narrative: 'implementing and engineering',
    requires: [['coding']],
    priority: 7,
  },
  {
    id: 'design_exploration',
    label: 'Design Exploration',
    narrative: 'designing and exploring',
    requires: [['design']],
    optional: [['browser', 'ai_tools']],
    priority: 6,
  },
  {
    id: 'technical_research',
    label: 'Technical Research',
    narrative: 'researching and evaluating',
    requires: [['browser']],
    optional: [['ai_tools', 'notes']],
    priority: 5,
  },
  {
    id: 'planning_and_architecture',
    label: 'Planning & Architecture',
    narrative: 'planning and structuring',
    requires: [['notes', 'project_mgmt']],
    priority: 4,
  },
  {
    id: 'devops_and_deployment',
    label: 'DevOps & Deployment',
    narrative: 'deploying and configuring',
    requires: [['terminal']],
    optional: [['browser', 'git']],
    priority: 5,
  },
  {
    id: 'code_review',
    label: 'Code Review',
    narrative: 'reviewing and auditing',
    requires: [['git']],
    optional: [['browser', 'coding']],
    priority: 6,
  },
];

export function classifyWorkflowType(ecosystems) {
  const ecoSet = new Set(ecosystems);

  const candidates = WORKFLOW_TYPES
    .filter(wt => wt.requires.every(group => group.some(eco => ecoSet.has(eco))))
    .sort((a, b) => b.priority - a.priority);

  return candidates[0] || { id: 'focused_work', label: 'Focused Work', narrative: 'working' };
}

// ─── Semantic Label Builder ───────────────────────────────────────────────────

const TITLE_STRIP_RE = /\s*[-—|·•]\s*(VS Code|Visual Studio Code|Cursor|Chrome|Firefox|Safari|Arc|Edge|Brave|Figma|Claude|ChatGPT|GitHub|GitLab|Linear|Notion|Obsidian|Slack|Discord|Teams|Zoom)\s*$/i;

function buildSemanticLabel(profile, workflowType) {
  // Best window title phrase
  for (const p of profile.topPhrases) {
    const clean = p.phrase.replace(TITLE_STRIP_RE, '').trim();
    if (clean.length >= 5 && clean.length <= 90 && !/^(New Tab|localhost|about:blank)/i.test(clean)) {
      return clean;
    }
  }

  // Workflow type + primary app
  const primaryApp = profile.topApps[0]?.name;
  if (primaryApp) return `${workflowType.label} — ${primaryApp}`;

  return workflowType.label;
}

// ─── Segment Confidence ───────────────────────────────────────────────────────

function computeConfidence(profile, sessionCount) {
  let score = 0.35;
  if (sessionCount >= 3)             score += 0.10;
  if (profile.topPhrases.length >= 2) score += 0.15;
  if (profile.topEcos.length >= 2)   score += 0.12;
  if (profile.contextSwitches < 6)   score += 0.10;
  if (profile.durationMins >= 10)    score += 0.08;
  if (profile.durationMins >= 30)    score += 0.08;
  if (profile.keywords.length >= 5)  score += 0.07;
  return Math.min(Math.round(score * 100) / 100, 0.95);
}

// ─── Segment Builder ──────────────────────────────────────────────────────────

let _segIdx = 0;

function buildSegment(sessions, index) {
  const profile      = buildProfile(sessions);
  const workflowType = classifyWorkflowType(profile.topEcos);
  const label        = buildSemanticLabel(profile, workflowType);

  const start = sessionStart(sessions[0]);
  const end   = sessionEnd(sessions[sessions.length - 1]);

  return {
    id:           `seg_${++_segIdx}_${Math.round(start)}`,
    index,
    sessions,
    sessionCount: sessions.length,

    startTime:    start,
    endTime:      end,
    durationMins: profile.durationMins,

    semanticLabel: label,
    workflowType,
    topApps:       profile.topApps,
    topPhrases:    profile.topPhrases,
    keywords:      profile.keywords,
    ecosystems:    profile.topEcos,

    contextSwitches: profile.contextSwitches,
    isContinuous:    profile.contextSwitches < 8,
    switchesPerHour: profile.durationMins > 0
      ? Math.round((profile.contextSwitches / (profile.durationMins / 60)) * 10) / 10
      : 0,

    confidence: computeConfidence(profile, sessions.length),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Segment a stream of sanitized auto-sessions into coherent workflow blocks.
 *
 * @param {Array} sanitizedSessions - output of telemetrySanitizer.sanitizeSessions()
 * @returns {{ segments: WorkflowSegment[], stats: Object }}
 */
export function segmentWorkflow(sanitizedSessions = []) {
  if (!sanitizedSessions.length) {
    return { segments: [], stats: { input: 0, segments: 0 } };
  }

  // Phase 1: when tracker tagged all segments with workflow_id, group by ownership
  // instead of app-centric fingerprint boundaries.
  const workflowTagged = sanitizedSessions.filter(s => s.workflow_id);
  if (workflowTagged.length >= Math.ceil(sanitizedSessions.length * 0.5)) {
    const groups = new Map();
    const sorted = [...sanitizedSessions].sort((a, b) => sessionStart(a) - sessionStart(b));
    for (const s of sorted) {
      const key = s.workflow_id || `legacy_${sessionStart(s)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const segments = [...groups.values()].map((sessions, index) => buildSegment(sessions, index));
    const filtered = segments.filter(s => s.durationMins >= (MIN_SEGMENT_SECS / 60));
    const totalMins = filtered.reduce((sum, seg) => sum + seg.durationMins, 0);
    return {
      segments: filtered,
      stats: {
        input: sanitizedSessions.length,
        segments: filtered.length,
        totalMins,
        viaWorkflowManager: true,
      },
    };
  }

  // Legacy app-ecosystem segmentation (fallback for untagged historical data)
  const sorted = [...sanitizedSessions].sort((a, b) => sessionStart(a) - sessionStart(b));

  const rawSegments = [];
  let batch = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const reason = shouldBreak(batch[batch.length - 1], sorted[i]);
    if (reason || batch.length >= MAX_SESSIONS_PER) {
      rawSegments.push(buildSegment(batch, rawSegments.length));
      batch = [sorted[i]];
    } else {
      batch.push(sorted[i]);
    }
  }
  if (batch.length) rawSegments.push(buildSegment(batch, rawSegments.length));

  // Filter trivially short segments
  const segments = rawSegments.filter(s => s.durationMins >= (MIN_SEGMENT_SECS / 60));

  const totalMins = segments.reduce((s, seg) => s + seg.durationMins, 0);

  return {
    segments,
    stats: {
      input:          sanitizedSessions.length,
      segments:       segments.length,
      totalMins:      Math.round(totalMins * 10) / 10,
      avgSegmentMins: segments.length ? Math.round(totalMins / segments.length * 10) / 10 : 0,
    },
  };
}

/**
 * Merge two segments into one (used by workblockFusionEngine when segments
 * are semantically close but were separated by a soft boundary).
 */
export function mergeSegments(segA, segB) {
  const allSessions = [...segA.sessions, ...segB.sessions]
    .sort((a, b) => sessionStart(a) - sessionStart(b));
  return buildSegment(allSessions, segA.index);
}

/**
 * Get primary ecosystem for a segment (the ecosystem that dominated by time).
 */
export function getSegmentPrimaryEco(segment) {
  return segment.ecosystems[0] || null;
}

/**
 * Check if two segments share enough semantic overlap to be fused.
 */
export function segmentsAreRelated(segA, segB, threshold = 0.15) {
  const kwA = new Set(segA.keywords);
  const kwB = new Set(segB.keywords);
  if (!kwA.size || !kwB.size) return false;
  let shared = 0;
  for (const w of kwA) if (kwB.has(w)) shared++;
  return (shared / Math.max(kwA.size, kwB.size)) >= threshold;
}
