/**
 * Event Intelligence Engine
 * Analyzes calendar events and auto-sessions to intelligently suggest
 * project, client, category, focus type, and estimated duration.
 */

import { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';

// ─── Keyword Pattern Maps ─────────────────────────────────────────────────────

const CATEGORY_PATTERNS = {
  meeting: {
    titles: ['meeting', 'standup', 'sync', 'call', '1:1', 'one-on-one', 'interview', 'demo', 'review', 'retrospective', 'sprint planning', 'kickoff', 'check-in', 'catchup', 'catch-up', 'discussion', 'webinar', 'conference'],
    apps: ['zoom', 'teams', 'meet', 'webex', 'whereby', 'skype', 'slack', 'discord'],
  },
  deep_work: {
    titles: ['deep work', 'focus block', 'coding', 'development', 'implementation', 'architecture', 'writing', 'design', 'analysis', 'research', 'build', 'sprint', 'hack', 'feature', 'refactor'],
    apps: ['vscode', 'xcode', 'android studio', 'intellij', 'rider', 'figma', 'sketch', 'notion'],
  },
  planning: {
    titles: ['planning', 'roadmap', 'strategy', 'brainstorm', 'ideation', 'workshop', 'proposal', 'scope', 'estimate', 'backlog'],
    apps: ['notion', 'jira', 'linear', 'trello', 'asana', 'clickup', 'monday'],
  },
  admin: {
    titles: ['admin', 'email', 'inbox', 'reports', 'invoicing', 'billing', 'hr', 'paperwork', 'documentation', 'docs', 'wiki'],
    apps: ['gmail', 'outlook', 'thunderbird'],
  },
  learning: {
    titles: ['learning', 'course', 'training', 'study', 'tutorial', 'reading', 'certification', 'workshop', 'bootcamp'],
    apps: ['udemy', 'coursera', 'youtube', 'khan academy'],
  },
  break: {
    titles: ['break', 'lunch', 'coffee', 'walk', 'gym', 'workout', 'exercise', 'rest', 'meditation', 'yoga'],
    apps: [],
  },
};

const SESSION_TYPE_MAP = {
  meeting: 'meeting',
  deep_work: 'deep_work',
  planning: 'shallow_work',
  admin: 'shallow_work',
  learning: 'deep_work',
  break: 'break',
};

const TYPICAL_DURATIONS = {
  meeting: 60,
  deep_work: 90,
  planning: 60,
  admin: 30,
  learning: 60,
  break: 15,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str = '') {
  return str.toLowerCase().trim();
}

function tokenize(str = '') {
  return normalize(str).split(/[\s\-_/\\,.:;]+/).filter(Boolean);
}

function scoreKeywordMatch(text, keywords) {
  const norm = normalize(text);
  let score = 0;
  for (const kw of keywords) {
    if (norm.includes(normalize(kw))) score += kw.split(' ').length; // multi-word = more weight
  }
  return score;
}

function stringSimilarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Category Detection ───────────────────────────────────────────────────────

/**
 * Detect category from event title and (optionally) associated app/url.
 * @returns {{ category: string, confidence: number }}
 */
export function detectCategory(title = '', appName = '', url = '') {
  const scores = {};
  const combined = `${title} ${appName} ${url}`;

  for (const [cat, { titles, apps }] of Object.entries(CATEGORY_PATTERNS)) {
    let score = scoreKeywordMatch(title, titles);
    score += scoreKeywordMatch(appName, apps) * 0.8;
    score += scoreKeywordMatch(url, apps) * 0.6;
    if (score > 0) scores[cat] = score;
  }

  if (!Object.keys(scores).length) {
    return { category: 'focus', confidence: 0.3 };
  }

  const best = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = Math.min(0.95, best[1] / Math.max(totalScore, 1));

  return { category: best[0], confidence: Math.round(confidence * 100) / 100 };
}

// ─── Session Type Detection ───────────────────────────────────────────────────

export function detectSessionType(category) {
  return SESSION_TYPE_MAP[category] || 'shallow_work';
}

export function isDeepWork(category, sessionType) {
  return sessionType === 'deep_work' || category === 'deep_work' || category === 'learning';
}

// ─── Duration Estimation ──────────────────────────────────────────────────────

/**
 * Estimate typical duration for an event based on category + memory.
 * @param {string} category
 * @param {string} projectId
 * @returns {number} Estimated duration in minutes
 */
export function estimateDuration(category, projectId = null) {
  const typical = TYPICAL_DURATIONS[category] || 60;

  if (projectId) {
    const projectHistory = calendarMemoryEngine.snapshot().projectTimings?.[projectId];
    if (projectHistory?.avgDurationMins > 0) {
      // Blend project history with typical
      return Math.round(projectHistory.avgDurationMins * 0.6 + typical * 0.4);
    }
  }

  return typical;
}

// ─── Project Matching ─────────────────────────────────────────────────────────

/**
 * Find the best-matching project for an event title.
 * @param {string} eventTitle
 * @param {Array} projects - [{ id, name, keywords? }]
 * @returns {{ projectId: string, confidence: number } | null}
 */
export function matchProject(eventTitle, projects = []) {
  if (!projects.length || !eventTitle) return null;

  const candidates = projects.map(p => ({
    id: p.id,
    name: p.name,
    score: stringSimilarity(eventTitle, p.name),
    keywordScore: p.keywords
      ? scoreKeywordMatch(eventTitle, p.keywords.split(','))
      : 0,
  }));

  const best = candidates
    .map(c => ({ ...c, total: c.score * 0.6 + (Math.min(c.keywordScore, 5) / 5) * 0.4 }))
    .sort((a, b) => b.total - a.total)[0];

  if (!best || best.total < 0.3) return null;

  return {
    projectId: best.id,
    projectName: best.name,
    confidence: Math.round(best.total * 100) / 100,
  };
}

// ─── Client Matching ──────────────────────────────────────────────────────────

/**
 * Find the best-matching client for an event.
 * @param {string} eventTitle
 * @param {Array} clients - [{ id, name }]
 * @returns {{ clientId: string, confidence: number } | null}
 */
export function matchClient(eventTitle, clients = []) {
  if (!clients.length || !eventTitle) return null;

  const candidates = clients.map(c => ({
    id: c.id,
    name: c.name,
    score: stringSimilarity(eventTitle, c.name),
  })).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < 0.35) return null;

  return {
    clientId: best.id,
    clientName: best.name,
    confidence: Math.round(best.score * 100) / 100,
  };
}

// ─── Auto-Session Project Suggestion ─────────────────────────────────────────

/**
 * Suggest the best matching project for a focus session using auto-session
 * telemetry signals: window titles, app names, and keywords — not just the
 * manually entered session title.
 *
 * This is significantly more accurate than matchProject() because it searches
 * across ALL captured window titles during the session, not just the title field.
 *
 * @param {Array}  autoSessions - raw or sanitized auto-sessions for this time window
 * @param {Array}  projects     - user's project list [{ id, name, color, keywords? }]
 * @param {string} sessionTitle - user-entered or AI-generated session title (optional)
 * @returns {{ projectId, projectName, projectColor, confidence, source } | null}
 */
export function suggestProjectFromAutoSessions(autoSessions = [], projects = [], sessionTitle = '') {
  if (!projects.length || !autoSessions.length) return null;

  // Gather all textual signals from auto-sessions
  const titleTexts  = autoSessions.map(s => s.window_title || '').filter(Boolean);
  const appNames    = [...new Set(autoSessions.map(s => s.app_name || '').filter(Boolean))];
  const allText     = [sessionTitle, ...titleTexts, ...appNames].join(' ');
  const allNorm     = normalize(allText);

  const scored = projects.map(proj => {
    const projName    = normalize(proj.name);
    const projKeywords = proj.keywords
      ? proj.keywords.split(/[,;]+/).map(k => normalize(k.trim())).filter(Boolean)
      : [];

    let score = 0;
    let source = 'none';

    // 1. Project name in session title (strong signal)
    const titleNorm = normalize(sessionTitle);
    if (titleNorm && (titleNorm.includes(projName) || projName.includes(titleNorm.split(' ')[0]))) {
      score += 60;
      source = 'session_title';
    }

    // 2. Project name appears in window titles (strongest signal)
    const nameInTitles = titleTexts.filter(t => normalize(t).includes(projName)).length;
    if (nameInTitles > 0) {
      score += Math.min(nameInTitles * 25, 60);
      if (score > 0) source = 'window_title';
    }

    // 3. Project keywords in window titles + app names (semantic signal)
    if (projKeywords.length) {
      let kwMatches = 0;
      for (const kw of projKeywords) {
        if (kw.length >= 3 && allNorm.includes(kw)) kwMatches++;
      }
      if (kwMatches > 0) {
        score += Math.min(kwMatches * 20, 50);
        if (source === 'none') source = 'keyword_match';
      }
    }

    // 4. Token-level overlap between project name words and all titles
    const projTokens = tokenize(proj.name);
    const titleTokens = new Set(titleTexts.flatMap(t => tokenize(t)));
    const tokenMatches = projTokens.filter(t => t.length >= 4 && titleTokens.has(t)).length;
    if (tokenMatches > 0) {
      score += tokenMatches * 12;
      if (source === 'none') source = 'token_match';
    }

    // 5. Dominant app time: if project keywords include an app and user spent time there
    const dominantApp = appNames[0] || '';
    if (projKeywords.some(kw => normalize(dominantApp).includes(kw))) {
      score += 15;
      if (source === 'none') source = 'app_match';
    }

    // 6. Memory: project historical session hours as mild tiebreaker
    const mem = calendarMemoryEngine.snapshot?.();
    const projHistoryMins = mem?.projectTimings?.[proj.id]?.avgDurationMins || 0;
    if (projHistoryMins > 0) score += Math.min(projHistoryMins / 60, 8);

    return { projectId: proj.id, projectName: proj.name, projectColor: proj.color || '#7c6cf2', score, source };
  });

  const sorted = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (!sorted.length) return null;

  const best = sorted[0];
  // Need a minimum score to suggest — avoids false positives
  if (best.score < 20) return null;

  // Confidence: normalize score to 0-1 (max meaningful score ~120)
  const confidence = Math.min(Math.round((best.score / 120) * 100) / 100, 0.97);

  return {
    projectId:    best.projectId,
    projectName:  best.projectName,
    projectColor: best.projectColor,
    confidence,
    source:       best.source,
  };
}

// ─── Full Event Analysis ──────────────────────────────────────────────────────

/**
 * Main analysis function — enriches an event with AI-derived metadata.
 * @param {Object} event - calendar event
 * @param {Object} context - { projects, clients, historicalSessions }
 * @returns {Object} Enriched event with AI suggestions
 */
export function analyzeEvent(event, context = {}) {
  const { projects = [], clients = [], historicalSessions = [] } = context;
  const title = event.title_override || event.title || '';
  const description = event.description || '';
  const combined = `${title} ${description}`;

  // Category detection
  const { category, confidence: catConfidence } = detectCategory(title);

  // Session type
  const sessionType = detectSessionType(category);
  const deepWork = isDeepWork(category, sessionType);

  // Project matching
  const projectMatch = event.project_id ? null : matchProject(title, projects);
  const clientMatch = event.client_id ? null : matchClient(title, clients);

  // Duration estimation
  const eventDurationMins = event.start_time && event.end_time
    ? (new Date(event.end_time) - new Date(event.start_time)) / 60000
    : null;
  const estimatedDurationMins = eventDurationMins || estimateDuration(category, projectMatch?.projectId);

  // Historical pattern check (how often has this title been worked on)
  const similarSessions = historicalSessions.filter(s =>
    stringSimilarity(s.title || '', title) > 0.5
  );
  const historicalDuration = similarSessions.length
    ? similarSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / similarSessions.length / 60
    : null;

  return {
    eventId: event.id,
    title,

    // AI-derived attributes
    suggestedCategory: category,
    categoryConfidence: catConfidence,
    suggestedSessionType: sessionType,
    suggestedIsDeepWork: deepWork,
    suggestedProject: projectMatch,
    suggestedClient: clientMatch,
    estimatedDurationMins,
    historicalAvgDurationMins: historicalDuration ? Math.round(historicalDuration) : null,
    similarSessionCount: similarSessions.length,

    // Focus label for UI
    focusLabel: category === 'deep_work' ? 'Deep Focus'
      : category === 'meeting' ? 'Meeting'
      : category === 'planning' ? 'Planning'
      : category === 'learning' ? 'Learning'
      : category === 'admin' ? 'Admin'
      : category === 'break' ? 'Break'
      : 'Focused Work',

    // Confidence metadata
    overallConfidence: Math.round(
      catConfidence * 0.5 +
      (projectMatch?.confidence || 0) * 0.3 +
      (clientMatch?.confidence || 0) * 0.2
    ),
  };
}

/**
 * Analyze a batch of events efficiently.
 * @param {Array} events
 * @param {Object} context
 * @returns {Map<string, Object>} eventId → analysis
 */
export function analyzeEvents(events, context = {}) {
  const results = new Map();
  for (const event of events) {
    if (event.id) {
      results.set(event.id, analyzeEvent(event, context));
    }
  }
  return results;
}

/**
 * Auto-tag auto-session with category, project, client from known patterns.
 * @param {Object} autoSession - { app_name, window_title, url, ... }
 * @param {Object} context - { projects, clients }
 * @returns {Object} Enrichment suggestions
 */
export function enrichAutoSession(autoSession, context = {}) {
  const { projects = [], clients = [] } = context;
  const appName = autoSession.app_name || '';
  const windowTitle = autoSession.window_title || '';
  const url = autoSession.url || '';

  const { category, confidence } = detectCategory(windowTitle, appName, url);
  const sessionType = detectSessionType(category);
  const projectMatch = matchProject(windowTitle, projects);
  const clientMatch = matchClient(windowTitle, clients);

  return {
    suggestedCategory: category,
    suggestedSessionType: sessionType,
    suggestedIsDeepWork: isDeepWork(category, sessionType),
    suggestedProject: projectMatch,
    suggestedClient: clientMatch,
    confidence,
  };
}

/**
 * Generate smart event title suggestions from partial input.
 * @param {string} partial - what the user has typed so far
 * @param {Array} projects
 * @param {Array} recentTitles - recently used event titles
 * @returns {Array<string>} Suggestions
 */
export function suggestEventTitles(partial, projects = [], recentTitles = []) {
  if (!partial || partial.length < 2) return [];
  const norm = normalize(partial);

  const suggestions = new Set();

  // Match recent titles
  for (const title of recentTitles) {
    if (normalize(title).includes(norm)) suggestions.add(title);
  }

  // Match project names → "Work on [Project]"
  for (const p of projects) {
    if (normalize(p.name).includes(norm)) {
      suggestions.add(`Work on ${p.name}`);
      suggestions.add(`${p.name} - Deep Work`);
      suggestions.add(`${p.name} - Planning`);
    }
  }

  // Common templates
  const templates = [
    'Deep Work Session',
    'Focus Block',
    'Team Standup',
    'Client Call',
    'Code Review',
    'Design Review',
    'Planning Session',
    'Weekly Review',
    'Admin & Email',
    'Learning & Research',
  ];
  for (const t of templates) {
    if (normalize(t).includes(norm)) suggestions.add(t);
  }

  return [...suggestions].slice(0, 8);
}
