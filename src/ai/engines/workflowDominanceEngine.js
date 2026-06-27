/**
 * Workflow Dominance Engine
 *
 * Solves three critical attribution failures:
 *   1. URL Pollution    — YouTube / entertainment tabs polluting primary workflow context
 *   2. Last-Activity Bias — most-recent app overriding 90 min of real work
 *   3. No Workflow Priority — all activities treated equally regardless of time share
 *
 * Algorithm:
 *   1. Pre-filter noise and idle time
 *   2. Extract a stable workflow identifier from each session
 *   3. Cluster sessions by workflow identity (cross-app merging via shared keywords)
 *   4. Score each cluster using the dominance formula
 *   5. Lock onto the primary workflow; secondary / reference / noise classified separately
 *   6. Return dominantSessions — the filtered set used for title/description generation
 *
 * Dominance Score Formula:
 *   Score = (timeContribution × 50%)
 *         + (projectRelevance  × 20%)
 *         + (workflowContinuity× 15%)
 *         + (focusQuality      × 10%)
 *         + (activityConsistency× 5%)
 *
 * Workflow Locking:
 *   A workflow only switches when a competing workflow:
 *     - Persists for ≥ LOCK_MIN_MINS minutes, AND
 *     - Accounts for ≥ LOCK_MIN_PCT % of total session time
 *   Brief diversions (screenshot tools, YouTube clips, etc.) are treated as
 *   interruptions and do NOT reset the locked workflow.
 */

import { getWorkflowDominanceWeight } from './productivityOntologyEngine.js';

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_ACTIVE_SECS    = 10;   // Ignore sessions shorter than this
const NOISE_MAX_PCT      = 0.05; // ≤ 5 % of total time → noise candidate
const NOISE_MAX_SECS     = 180;  // AND ≤ 3 min of absolute time → definitely noise
const LOCK_MIN_MINS      = 15;   // New workflow must persist ≥ 15 min to unlock
const LOCK_MIN_PCT       = 0.20; // AND be ≥ 20 % of session time to unlock
const MERGE_KEYWORD_OVERLAP = 3; // Minimum shared keywords to merge two clusters

// ─── Classification Labels ────────────────────────────────────────────────────

export const WORKFLOW_CLASS = {
  PRIMARY:      'primary',       // Dominant workflow — source of truth for titles
  SECONDARY:    'secondary',     // Significant but not dominant (≥ lock threshold)
  REFERENCE:    'reference',     // Supporting research / docs (< lock threshold)
  INTERRUPTION: 'interruption',  // Brief app switch (< noise threshold in time)
  DISTRACTION:  'distraction',   // Entertainment / social media
  UTILITY:      'utility',       // OS tools, screenshot apps, file explorers
};

// ─── Entertainment / Distraction Domain Patterns ─────────────────────────────

const DISTRACTION_DOMAIN_RE =
  /^(www\.)?(youtube|netflix|twitch|spotify|soundcloud|vimeo|dailymotion|hulu|disneyplus|primevideo|hbomax|peacock|crunchyroll|reddit|twitter|x\.com|instagram|facebook|tiktok|pinterest|tumblr|imgur|9gag|buzzfeed|quora|nytimes|bbc\.co|cnn\.com|flipboard|feedly)\./i;

const DISTRACTION_TITLE_RE = [
  /\|\s*(youtube|netflix|twitch|spotify|disney\+?|prime video|hbo|hulu|peacock|sony liv|hotstar)\s*$/i,
  /\bep(isode)?\s*\d+\b/i,
  /\bseason\s*\d+\b/i,
  /\b(watch|stream|movie|film|show|series)\b.*\b(on|at)\b.*\b(netflix|hbo|hulu|prime)\b/i,
];

// ─── Utility / OS Tool Patterns ───────────────────────────────────────────────

const UTILITY_APP_RE =
  /^(snipping\s*tool|snip\s*&\s*sketch|screenshot|sharex|greenshot|lightshot|photos|camera|calculator|notepad|wordpad|paint|windows\s*explorer|file\s*explorer|finder|activity\s*monitor|task\s*manager|system\s*preferences|settings|control\s*panel|magnifier|sticky\s*notes|clock|weather|maps|microsoft\s*store|app\s*store|spotlight|cortana|siri|widgets|action\s*center|system\s*info|disk\s*utility|font\s*book|color\s*sync|keychain|airdrop|handoff|universal\s*clipboard)$/i;

// ─── Stop Words for Keyword Extraction ───────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','in','on','at','to','for','of','with','is','are',
  'was','be','been','by','from','as','it','this','that','vs','via','new','tab',
  'untitled','document','window','file','page','home','main','index','app',
  'com','io','net','org','claude','chatgpt','gemini','auto','http','https',
  'www','localhost','code','visual','studio','google','chrome','safari','firefox',
  'edge','brave','arc','opera','browser','search','result','results','how','what',
  'why','when','where','does','can','should','will','using','with','about',
]);

// ─── Browser App Detection ────────────────────────────────────────────────────

const BROWSER_APP_RE = /^(chrome|google chrome|firefox|safari|edge|microsoft edge|brave|arc|opera|vivaldi|chromium)/i;

// ─── AI Tool App Detection ────────────────────────────────────────────────────

const AI_TOOL_APP_RE = /^(claude|chatgpt|gemini|copilot|perplexity|poe|phind)/i;

// ─── App Suffix Strips ────────────────────────────────────────────────────────

const APP_SUFFIX_STRIP_RE = /\s*[—–|·\-]\s*(claude|chatgpt|gemini|visual studio code|vs code|cursor|webstorm|intellij|xcode|google chrome|safari|firefox|edge|arc|brave|notion|figma|slack|linear|github)\s*$/i;
const AI_PREFIX_STRIP_RE  = /^(claude\s*[-—]\s*|chatgpt\s*[-—]\s*|gemini\s*[-—]\s*|new chat\s*[-—]?\s*)/i;

// ─── Helper Utilities ─────────────────────────────────────────────────────────

function sessionDuration(s) {
  if (s.duration_seconds > 0) return s.duration_seconds;
  const toSec = v => {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e10 ? v / 1000 : v;
    const d = new Date(v);
    return isNaN(d) ? 0 : d.getTime() / 1000;
  };
  const start = toSec(s.started_at);
  const end   = toSec(s.ended_at);
  return end > start ? end - start : 0;
}

function normApp(str = '') {
  return String(str).toLowerCase().trim();
}

function extractDomain(url = '') {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '').toLowerCase();
  }
}

/**
 * Check if a window title belongs to an entertainment/distraction source.
 */
function isDistractionTitle(title = '', url = '') {
  if (!title && !url) return false;
  if (url && DISTRACTION_DOMAIN_RE.test(extractDomain(url))) return true;
  return DISTRACTION_TITLE_RE.some(re => re.test(title));
}

/**
 * Extract meaningful keywords from a string, filtered by stop words.
 * Returns normalized lowercase words of length ≥ 3.
 */
export function extractKeywords(text = '') {
  return text
    .replace(APP_SUFFIX_STRIP_RE, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Calculate Jaccard-like overlap between two keyword sets.
 * Returns count of shared keywords.
 */
function sharedKeywords(kws1 = [], kws2 = []) {
  const set2 = new Set(kws2);
  return kws1.filter(k => set2.has(k)).length;
}

// ─── Workflow Identity Extraction ─────────────────────────────────────────────

/**
 * Derive a stable semantic identifier for the workflow a session belongs to.
 *
 * Strategy (priority order):
 *   1. AI conversation topic — most precise semantic signal
 *   2. IDE window title project folder
 *   3. First 2-3 capitalized/meaningful words from window title
 *   4. URL domain for known work domains
 *   5. App name for standalone non-browser tools
 *
 * Returns: { label, keywords, category }
 */
export function extractWorkflowIdentity(session) {
  const app   = normApp(session.app_name || '');
  const title = (session.window_title || '').trim();
  const url   = (session.url || '').trim();

  // ── Distraction / entertainment → own bucket ───────────────────────────────
  if (isDistractionTitle(title, url)) {
    return { label: `_distraction_${extractDomain(url) || app}`, keywords: [], category: 'distraction' };
  }

  // ── OS utility apps → utility bucket ──────────────────────────────────────
  if (UTILITY_APP_RE.test(app)) {
    return { label: `_utility_${app}`, keywords: [], category: 'utility' };
  }

  // ── 1. AI conversation topic ───────────────────────────────────────────────
  if (AI_TOOL_APP_RE.test(app)) {
    const topic = title
      .replace(AI_TOOL_APP_RE, '')
      .replace(AI_PREFIX_STRIP_RE, '')
      .replace(APP_SUFFIX_STRIP_RE, '')
      .trim();
    if (topic.length >= 4) {
      const kws = extractKeywords(topic).slice(0, 5);
      // Use first 3 meaningful words as the stable label
      const label = kws.slice(0, 3).join(' ') || topic.slice(0, 30).toLowerCase();
      return { label, keywords: kws, category: 'ai_work', rawTitle: topic };
    }
  }

  // ── 2. IDE file title: "Component.jsx — ProjectName — VS Code" ────────────
  const IDE_APP_RE = /^(vscode|visual studio code|cursor|webstorm|intellij|xcode|pycharm|rider|sublime|atom|vim|nvim|neovim|emacs)/i;
  if (IDE_APP_RE.test(app)) {
    const parts = title.split(/\s*[—–-]\s*/).map(p => p.trim()).filter(Boolean);
    // parts[1] is usually the project/folder name
    const projectPart = parts.length >= 2 ? parts[1] : parts[0];
    if (projectPart) {
      const kws = extractKeywords(projectPart).slice(0, 5);
      const label = kws.slice(0, 3).join(' ') || projectPart.slice(0, 30).toLowerCase();
      return { label, keywords: kws, category: 'development', rawTitle: title };
    }
  }

  // ── 3. Non-browser standalone app (Figma, Notion, etc.) ───────────────────
  if (!BROWSER_APP_RE.test(app) && app && !IDE_APP_RE.test(app)) {
    const cleanTitle = title.replace(APP_SUFFIX_STRIP_RE, '').trim();
    const kws = extractKeywords(cleanTitle || app).slice(0, 5);
    const label = kws.slice(0, 3).join(' ') || app.slice(0, 20);
    return { label, keywords: kws, category: 'work', rawTitle: cleanTitle };
  }

  // ── 4. Browser session: use window title as primary signal ────────────────
  const cleanTitle = title.replace(APP_SUFFIX_STRIP_RE, '').trim();
  if (cleanTitle.length >= 4) {
    const kws = extractKeywords(cleanTitle).slice(0, 5);
    if (kws.length >= 1) {
      const label = kws.slice(0, 3).join(' ');
      return { label, keywords: kws, category: 'browser_work', rawTitle: cleanTitle };
    }
  }

  // ── 5. URL domain fallback ─────────────────────────────────────────────────
  const domain = extractDomain(url);
  if (domain) {
    const domainKws = extractKeywords(domain.replace(/\.(com|io|org|net|app|ai|dev)$/, ''));
    return {
      label: domain.split('.')[0],
      keywords: domainKws,
      category: 'browser_work',
    };
  }

  // ── 6. App name absolute fallback ─────────────────────────────────────────
  return {
    label: app || 'unknown',
    keywords: extractKeywords(app),
    category: 'work',
  };
}

// ─── Workflow Clustering ──────────────────────────────────────────────────────

/**
 * Group sessions into workflow clusters based on keyword similarity.
 * Sessions with overlapping keywords are merged into the same cluster,
 * enabling cross-app workflow detection:
 *   VS Code "Flow Ledger" + Claude "Flow Ledger" + GitHub "flow-ledger" → one cluster.
 */
function clusterSessions(sessions) {
  const clusters = []; // [{ identity, sessions, totalSecs, keywords }]

  for (const session of sessions) {
    const dur      = sessionDuration(session);
    const identity = extractWorkflowIdentity(session);

    // Distractions and utilities always get their own isolated cluster
    if (identity.category === 'distraction' || identity.category === 'utility') {
      clusters.push({
        id:         identity.label,
        identity,
        sessions:   [session],
        totalSecs:  dur,
        keywords:   identity.keywords,
        category:   identity.category,
      });
      continue;
    }

    // Try to find an existing cluster that shares enough keywords
    let matched = null;
    let bestOverlap = 0;

    for (const cluster of clusters) {
      if (cluster.category === 'distraction' || cluster.category === 'utility') continue;
      const overlap = sharedKeywords(identity.keywords, cluster.keywords);
      if (overlap >= MERGE_KEYWORD_OVERLAP && overlap > bestOverlap) {
        matched = cluster;
        bestOverlap = overlap;
      }
    }

    if (matched) {
      // Merge into existing cluster
      matched.sessions.push(session);
      matched.totalSecs += dur;
      // Enrich cluster keywords with new ones
      for (const kw of identity.keywords) {
        if (!matched.keywords.includes(kw)) matched.keywords.push(kw);
      }
    } else {
      // Start a new cluster
      clusters.push({
        id:         identity.label,
        identity,
        sessions:   [session],
        totalSecs:  dur,
        keywords:   [...identity.keywords],
        category:   identity.category,
      });
    }
  }

  return clusters;
}

// ─── Continuity Score ─────────────────────────────────────────────────────────

/**
 * Measure how continuous (uninterrupted) a cluster's sessions are.
 * Returns 0–1 where 1.0 = fully continuous block.
 */
function computeContinuityScore(sessions) {
  if (sessions.length < 2) return sessions.length ? 0.6 : 0;

  const sorted = [...sessions].sort((a, b) => {
    const toSec = v => typeof v === 'number' ? (v > 1e10 ? v / 1000 : v) : (new Date(v).getTime() / 1000) || 0;
    return toSec(a.started_at) - toSec(b.started_at);
  });

  const GAP_THRESHOLD = 300; // 5 min gap = still continuous
  let maxBlock = sessionDuration(sorted[0]);
  let currentBlock = maxBlock;

  for (let i = 1; i < sorted.length; i++) {
    const toSec = v => typeof v === 'number' ? (v > 1e10 ? v / 1000 : v) : (new Date(v).getTime() / 1000) || 0;
    const prevEnd    = toSec(sorted[i - 1].ended_at) || (toSec(sorted[i - 1].started_at) + sessionDuration(sorted[i - 1]));
    const currStart  = toSec(sorted[i].started_at);
    const gap        = Math.max(0, currStart - prevEnd);

    if (gap < GAP_THRESHOLD) {
      currentBlock += gap + sessionDuration(sorted[i]);
    } else {
      maxBlock = Math.max(maxBlock, currentBlock);
      currentBlock = sessionDuration(sorted[i]);
    }
  }
  maxBlock = Math.max(maxBlock, currentBlock);

  const totalSecs = sorted.reduce((s, x) => s + sessionDuration(x), 0);
  return Math.min(maxBlock / Math.max(totalSecs, 1), 1);
}

// ─── Dominance Scoring ────────────────────────────────────────────────────────

/**
 * Score a workflow cluster using the dominance formula.
 *
 * Score = (timeContribution × 50%)
 *       + (projectRelevance  × 20%)
 *       + (workflowContinuity× 15%)
 *       + (focusQuality      × 10%)
 *       + (activityConsistency× 5%)
 */
// Map cluster category to a WORKFLOW_DOMINANCE_WEIGHTS archetype key
const CATEGORY_TO_ARCHETYPE = {
  development:    'deep_implementation',
  ai_work:        'deep_implementation',
  design:         'design_work',
  writing:        'documenting',
  planning:       'planning',
  browser_work:   'research',
  work:           'deep_implementation',
  distraction:    'media_consumption',
  utility:        'utility',
};

function scoreCluster(cluster, totalSecs, project) {
  const timeContribution = totalSecs > 0 ? cluster.totalSecs / totalSecs : 0; // 0–1

  // Project relevance: does this workflow relate to the known project?
  // Uses the productivityOntologyEngine archetype weight as a base relevance signal,
  // boosted when the cluster's keywords overlap with the known project name.
  const archetypeKey = CATEGORY_TO_ARCHETYPE[cluster.category] || 'deep_implementation';
  const archetypeBaseWeight = getWorkflowDominanceWeight(archetypeKey);

  let projectRelevance;
  if (project?.name) {
    const projKws = extractKeywords(project.name);
    const overlap  = sharedKeywords(cluster.keywords, projKws);
    if (overlap >= 1) {
      // Explicit keyword match → strong project association, boosted by archetype quality
      projectRelevance = Math.min(0.70 + archetypeBaseWeight * 0.30, 1.0);
    } else {
      // No direct keyword match — use archetype weight to score development-adjacent work
      projectRelevance = archetypeBaseWeight * 0.60;
    }
  } else {
    // No project context: rely entirely on archetype's productivity weight
    projectRelevance = archetypeBaseWeight * 0.55;
  }

  // Workflow continuity (0–1)
  const workflowContinuity = computeContinuityScore(cluster.sessions);

  // Focus quality: low context-switches relative to time → high focus
  const totalSwitches = cluster.sessions.reduce((s, x) => s + (x.context_switches || 0), 0);
  const switchRate    = cluster.sessions.length > 0 ? totalSwitches / cluster.sessions.length : 0;
  const focusQuality  = Math.max(0, Math.min(1, 1 - switchRate / 20));

  // Activity consistency: more sessions = more sustained engagement
  const activityConsistency = Math.min(cluster.sessions.length / 8, 1);

  const score = (
    timeContribution    * 0.50 +
    projectRelevance    * 0.20 +
    workflowContinuity  * 0.15 +
    focusQuality        * 0.10 +
    activityConsistency * 0.05
  );

  return {
    ...cluster,
    dominanceScore:      Math.round(score * 100),
    timeContributionPct: Math.round(timeContribution * 100),
    projectRelevance:    Math.round(projectRelevance * 100),
    workflowContinuity:  Math.round(workflowContinuity * 100),
    focusQuality:        Math.round(focusQuality * 100),
    activityConsistency: Math.round(activityConsistency * 100),
  };
}

// ─── Workflow Classification ───────────────────────────────────────────────────

/**
 * Classify each scored cluster as primary, secondary, reference,
 * interruption, distraction, or utility.
 */
function classifyWorkflows(scoredClusters, totalSecs) {
  // Sort by dominance score descending
  const sorted = [...scoredClusters].sort((a, b) => b.dominanceScore - a.dominanceScore);

  const primary      = [];
  const secondary    = [];
  const references   = [];
  const interruptions = [];
  const distractions  = [];
  const utilities     = [];

  for (const cluster of sorted) {
    const timePct    = cluster.timeContributionPct / 100;
    const totalMins  = cluster.totalSecs / 60;

    if (cluster.category === 'distraction') {
      distractions.push({ ...cluster, workflowClass: WORKFLOW_CLASS.DISTRACTION });
      continue;
    }
    if (cluster.category === 'utility') {
      utilities.push({ ...cluster, workflowClass: WORKFLOW_CLASS.UTILITY });
      continue;
    }

    // Noise: tiny time contribution AND short absolute duration
    const isNoise = timePct <= NOISE_MAX_PCT && cluster.totalSecs <= NOISE_MAX_SECS;
    if (isNoise) {
      interruptions.push({ ...cluster, workflowClass: WORKFLOW_CLASS.INTERRUPTION });
      continue;
    }

    // Workflow locking: only promote to primary/secondary if it crossed the
    // threshold documented above (≥15 min AND ≥20% of session time). This
    // used to auto-promote whichever cluster scored highest to `primary`
    // regardless of threshold, so a session fragmented into many small
    // clusters (none individually crossing the lock threshold) would still
    // get a confident-looking "dominant workflow" label instead of falling
    // through to the fragmented-session fallback in analyzeDominance().
    const crossedLockThreshold = totalMins >= LOCK_MIN_MINS && timePct >= LOCK_MIN_PCT;

    if (crossedLockThreshold && primary.length === 0) {
      primary.push({ ...cluster, workflowClass: WORKFLOW_CLASS.PRIMARY });
    } else if (crossedLockThreshold) {
      secondary.push({ ...cluster, workflowClass: WORKFLOW_CLASS.SECONDARY });
    } else {
      // Sub-threshold work that isn't noise — treat as reference/supporting
      references.push({ ...cluster, workflowClass: WORKFLOW_CLASS.REFERENCE });
    }
  }

  return { primary, secondary, references, interruptions, distractions, utilities };
}

// ─── Dominant Session Label Builder ───────────────────────────────────────────

// Generic suffix to add semantic meaning without just listing raw keywords
const CATEGORY_LABEL_SUFFIX = {
  development: 'Development',
  ai_work:     'Implementation',
  design:      'Design',
  writing:     'Documentation',
  planning:    'Planning',
  browser_work:'Research',
  work:        'Work',
};

const GENERIC_KW = new Set([
  'flow', 'ledger', 'development', 'implementation', 'work', 'coding',
  'programming', 'system', 'module', 'feature', 'project', 'task',
]);

/**
 * Build a human-readable label for the dominant workflow.
 * Avoids raw keyword concatenation; produces semantic labels with context suffix.
 */
function buildWorkflowLabel(cluster) {
  const cat     = cluster.category;
  const rawKws  = cluster.keywords || [];

  const fallback = {
    development: 'Development Session',
    ai_work:     'AI-Assisted Implementation',
    design:      'Design Session',
    writing:     'Documentation Session',
    planning:    'Planning Session',
    browser_work:'Research Session',
  }[cat] || 'Focused Work Session';

  // Filter out pure generics from the cluster keywords
  const meaningful = rawKws.filter(k => !GENERIC_KW.has(k.toLowerCase()) && k.length >= 4);

  if (!meaningful.length) return fallback;

  // Use up to 2 meaningful keywords, then add a semantic suffix
  const topKws  = meaningful.slice(0, 2);
  const suffix  = CATEGORY_LABEL_SUFFIX[cat] || 'Work';
  const subject = topKws.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // Avoid redundant suffix: "Narrative Implementation" not "Narrative Development Development"
  if (subject.toLowerCase().includes(suffix.toLowerCase())) return subject;

  return `${subject} ${suffix}`;
}

// ─── Main Export: analyzeDominance ───────────────────────────────────────────

/**
 * Analyze a session's auto-tracked activity and identify the dominant workflow.
 *
 * @param {Array}  autoSessions  - Raw auto-tracked session rows
 * @param {Object} [options]
 * @param {Object} [options.project]  - { id, name } if known
 * @param {Object} [options.client]   - { id, name } if known
 * @returns {DominanceResult}
 */
export function analyzeDominance(autoSessions = [], options = {}) {
  const { project = null } = options;

  // ── 1. Pre-filter ──────────────────────────────────────────────────────────
  const active = autoSessions.filter(s => !s.is_idle && sessionDuration(s) >= MIN_ACTIVE_SECS);

  if (!active.length) {
    return buildEmptyResult();
  }

  const totalSecs = active.reduce((sum, s) => sum + sessionDuration(s), 0);

  // ── 2. Cluster ─────────────────────────────────────────────────────────────
  const clusters = clusterSessions(active);

  // ── 3. Score ───────────────────────────────────────────────────────────────
  const scored = clusters.map(c => scoreCluster(c, totalSecs, project));

  // ── 4. Classify ────────────────────────────────────────────────────────────
  const classified = classifyWorkflows(scored, totalSecs);

  // ── 5. Build dominant session set ─────────────────────────────────────────
  const primaryCluster = classified.primary[0] || null;

  // dominantSessions: sessions from the primary workflow
  // If no clear primary (session is too fragmented), fall back to all non-noise sessions
  let dominantSessions;
  let dominantLabel;
  let dominantKeywords;
  let dominanceScore;

  if (primaryCluster) {
    dominantSessions  = primaryCluster.sessions;
    dominantLabel     = buildWorkflowLabel(primaryCluster);
    dominantKeywords  = primaryCluster.keywords;
    dominanceScore    = primaryCluster.dominanceScore;
  } else {
    // Fragmented session — use all non-distraction, non-utility sessions
    const usable = active.filter(s => {
      const id = extractWorkflowIdentity(s);
      return id.category !== 'distraction' && id.category !== 'utility';
    });
    dominantSessions  = usable;
    dominantLabel     = 'Work Session';
    dominantKeywords  = [];
    dominanceScore    = 0;
  }

  // ── 6. Noise statistics ────────────────────────────────────────────────────
  const noiseSecs = [
    ...classified.distractions,
    ...classified.utilities,
    ...classified.interruptions,
  ].reduce((s, c) => s + c.totalSecs, 0);

  const filteredCount = active.length - dominantSessions.length;

  return {
    // Primary
    dominantWorkflow:   primaryCluster ? { ...primaryCluster, label: dominantLabel } : null,
    dominantSessions,
    dominantLabel,
    dominantKeywords,
    dominanceScore,

    // All classifications (useful for session breakdown UI)
    primaryWorkflows:   classified.primary,
    secondaryWorkflows: classified.secondary,
    referenceActivities:classified.references,
    interruptions:      classified.interruptions,
    distractions:       classified.distractions,
    utilityActivities:  classified.utilities,

    // Stats
    totalSecs,
    totalActiveSecs:    totalSecs,
    noiseSecs,
    noisePct:           totalSecs > 0 ? Math.round(noiseSecs / totalSecs * 100) : 0,
    filteredCount,
    clusterCount:       clusters.length,
    workflowCount:      classified.primary.length + classified.secondary.length,

    // Continuity intelligence: has this workflow appeared before?
    isContinuingWorkflow: false, // set by sessionContinuityEngine upstream
    isEmpty: false,
  };
}

function buildEmptyResult() {
  return {
    dominantWorkflow:    null,
    dominantSessions:    [],
    dominantLabel:       '',
    dominantKeywords:    [],
    dominanceScore:      0,
    primaryWorkflows:    [],
    secondaryWorkflows:  [],
    referenceActivities: [],
    interruptions:       [],
    distractions:        [],
    utilityActivities:   [],
    totalSecs:           0,
    totalActiveSecs:     0,
    noiseSecs:           0,
    noisePct:            0,
    filteredCount:       0,
    clusterCount:        0,
    workflowCount:       0,
    isContinuingWorkflow:false,
    isEmpty:             true,
  };
}

// ─── Convenience Export: filter to dominant sessions only ────────────────────

/**
 * Lightweight entry point — returns only the dominant workflow sessions.
 * Use this when you just need filtered input for compressContext / analyzeContext.
 *
 * @param {Array}  autoSessions
 * @param {Object} [options]   - { project, client }
 * @returns {{ dominantSessions: Array, metadata: Object }}
 */
export function getDominantSessions(autoSessions = [], options = {}) {
  const result = analyzeDominance(autoSessions, options);
  return {
    dominantSessions: result.dominantSessions,
    metadata: {
      label:             result.dominantLabel,
      keywords:          result.dominantKeywords,
      score:             result.dominanceScore,
      timeContributionPct: result.dominantWorkflow?.timeContributionPct ?? 0,
      noisePct:          result.noisePct,
      filteredCount:     result.filteredCount,
      totalSecs:         result.totalSecs,
      isEmpty:           result.isEmpty,
      workflowCount:     result.workflowCount,
    },
  };
}

// ─── Session Segmentation Summary ────────────────────────────────────────────

/**
 * Return a human-readable session segmentation breakdown.
 * Used by the summary panel to show "Primary: Flow Ledger (90%), Reference: GitHub (7%)".
 */
export function getSessionSegmentation(autoSessions = [], options = {}) {
  const result = analyzeDominance(autoSessions, options);

  const segments = [];

  for (const c of result.primaryWorkflows) {
    segments.push({ class: WORKFLOW_CLASS.PRIMARY,      label: buildWorkflowLabel(c), pct: c.timeContributionPct, secs: c.totalSecs });
  }
  for (const c of result.secondaryWorkflows) {
    segments.push({ class: WORKFLOW_CLASS.SECONDARY,    label: buildWorkflowLabel(c), pct: c.timeContributionPct, secs: c.totalSecs });
  }
  for (const c of result.referenceActivities) {
    segments.push({ class: WORKFLOW_CLASS.REFERENCE,    label: buildWorkflowLabel(c), pct: c.timeContributionPct, secs: c.totalSecs });
  }
  if (result.distractions.length) {
    const distSecs = result.distractions.reduce((s, c) => s + c.totalSecs, 0);
    const distPct  = result.totalSecs > 0 ? Math.round(distSecs / result.totalSecs * 100) : 0;
    if (distPct > 0) segments.push({ class: WORKFLOW_CLASS.DISTRACTION, label: 'Entertainment / Distractions', pct: distPct, secs: distSecs });
  }

  return {
    segments,
    dominantLabel:   result.dominantLabel,
    dominanceScore:  result.dominanceScore,
    workflowCount:   result.workflowCount,
    noisePct:        result.noisePct,
  };
}
