/**
 * Signal Ranking Engine
 * Stage 2 of the contextual intelligence pipeline.
 *
 * Scores and ranks all extracted semantic signals by their contextual value.
 * High-value signals (project names, workflow phrases, feature names) are
 * surfaced; low-value noise (browser tabs, system utilities, generic verbs)
 * is suppressed or eliminated before reasoning begins.
 */

import { isGenericSubject, scoreSubjectSpecificity, ABSOLUTE_GENERICS } from './genericKeywordFilter.js';

// ─── Signal Type Weights ──────────────────────────────────────────────────────

const TYPE_BASE_SCORE = {
  window_title_phrase: 80,   // Most reliable — direct work context
  ide_file_context:    75,   // IDE file name → feature context
  ai_conversation:     70,   // Claude/ChatGPT topic → research context
  feature_name:        65,   // Detected product feature
  project_name:        60,   // Known project being worked on
  domain_topic:        50,   // Meaningful website domain
  keyword_cluster:     40,   // Recurring keyword signal
  app_category:        25,   // App category (broad signal)
  raw_keyword:         15,   // Individual word (lowest reliability)
};

// ─── High-Value Technical Terms ────────────────────────────────────────────────
// These words add genuine signal ONLY when part of a multi-word phrase.
// IMPORTANT: generic app-category terms (dashboard, analytics, productivity,
// system, module, feature) have been intentionally REMOVED from this list —
// they inflate the score of meaningless phrases like "Productivity Dashboard".

const HIGH_VALUE_TERMS = new Set([
  // Concrete engineering constructs
  'engine', 'api', 'service', 'logic', 'pipeline', 'algorithm', 'schema',
  'integration', 'architecture', 'calendar', 'scheduler', 'routing',
  'authentication', 'renderer', 'parser', 'handler',
  'middleware', 'endpoint', 'migration', 'query', 'context', 'reasoning',
  'embedding', 'semantic', 'inference', 'continuity', 'workflow',
  // UI interaction work (specific enough to be meaningful)
  'interaction', 'animation', 'tooltip', 'drag', 'drop', 'transition',
  // Engineering action signals (never standalone subjects)
  'debug', 'test', 'refactor', 'optimize', 'implement', 'build', 'design',
  'research', 'review', 'deploy', 'document', 'plan', 'architect',
  // Concrete named concepts
  'burnout', 'deepwork', 'telemetry', 'ontology', 'classification',
  'dominance', 'segmentation', 'tokenization', 'clustering',
]);

// ─── Low-Value / Generic Terms ─────────────────────────────────────────────────
// These terms are PENALIZED in signal scoring.
// Includes app-category labels, UI route names, and frequency-inflated generics.

const LOW_VALUE_TERMS = new Set([
  // Generic verbs already added by verb templates
  'working', 'using', 'open', 'opening', 'running', 'started', 'starting',
  // Basic noise
  'auto', 'untitled', 'new', 'tab', 'window', 'general', 'misc', 'other',
  // Temporal filler
  'today', 'yesterday', 'now', 'currently', 'session', 'time', 'work',
  // Vague function/feature nouns that add no semantic value
  'functions', 'features', 'tasks', 'items', 'things', 'stuff', 'activity',
  // AI chat UI noise
  'new chat', 'conversation', 'assistant', 'prompt',
  // ── APP CATEGORY LABELS (the main offenders) ──
  // These appear in every Flow Ledger window title and inflate generic phrases.
  // They carry ZERO workflow meaning as standalone or primary terms.
  'productivity', 'dashboard', 'analytics', 'application', 'app',
  'platform', 'workspace', 'management', 'portal', 'overview', 'summary',
  'system', 'module', 'feature', 'component', 'interface', 'utility',
  'service', 'tool', 'page', 'screen', 'view', 'section', 'home', 'main',
]);

// ─── Pattern Suppressors ──────────────────────────────────────────────────────

const SUPPRESS_PATTERNS = [
  /^(auto\s*:|auto\s*-)/i,
  /\.(exe|dll|bat|cmd|sh|ps1)(\s|$)/i,
  /localhost:\d+/i,
  /127\.0\.0\.1/i,
  /[A-Z]:\\Windows/i,
  /node_modules/i,
  /^(cmd|powershell|terminal)\s*$/i,
  /^\d+$/,                            // pure numbers
  /^[a-z]{1,2}$/,                     // single/double char noise
  /chrome-extension:\/\//i,
  /^(google|bing|yahoo)\s*$/i,        // bare search engine names
  // Vague AI chat window titles — generic conversation labels with no specificity
  /^(new chat|untitled.*chat|claude\s*-\s*new|chatgpt\s*-\s*new)$/i,
  // "App Functions" / "App Features" patterns — vague, add no meaning
  /\bapp\s+functions?\b/i,
  /\bapp\s+features?\b/i,
];

function shouldSuppress(text = '') {
  if (SUPPRESS_PATTERNS.some(re => re.test(text.trim()))) return true;
  // Suppress single-word absolute generics outright — they cannot be meaningful
  // work signals ("productivity", "dashboard", "analytics", "system", etc.)
  const lower = text.trim().toLowerCase();
  if (!lower.includes(' ') && ABSOLUTE_GENERICS.has(lower)) return true;
  return false;
}

// ─── Semantic Richness Scorer ─────────────────────────────────────────────────

function scoreSemanticRichness(phrase = '') {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  let bonus = 0;

  // Multi-word phrases are more specific
  bonus += Math.min(words.length, 6) * 5;

  // Contains high-value technical terms
  const highValueCount = words.filter(w => HIGH_VALUE_TERMS.has(w)).length;
  bonus += highValueCount * 15;

  // Contains low-value / generic terms → penalty
  const lowValueCount = words.filter(w => LOW_VALUE_TERMS.has(w)).length;
  bonus -= lowValueCount * 12;

  // Phrase length (more specific = better)
  if (phrase.length > 20) bonus += 10;
  if (phrase.length > 40) bonus += 8;

  // Contains file extensions (IDE context — very specific)
  if (/\.[a-z]{2,5}$/.test(phrase)) bonus += 20;

  // ── Generic-subject penalty ────────────────────────────────────────────────
  // If the ENTIRE phrase has no specific content (all generic words), apply a
  // heavy penalty so it never becomes the primary subject signal.
  // This is the key fix for "productivity" dominating as a phrase.
  if (isGenericSubject(phrase)) {
    bonus -= 60;
  } else {
    // Bonus for specificity score (rewards "Workflow Dominance Engine" over "productivity")
    const specificity = scoreSubjectSpecificity(phrase);
    bonus += Math.round(specificity * 25);
  }

  return Math.max(bonus, -100);
}

// ─── Signal Record ────────────────────────────────────────────────────────────

function makeSignal(text, type, source, extra = {}) {
  return {
    text,
    type,
    source,
    score: 0,
    ...extra,
  };
}

// ─── Extract Signals from Compressed Context ──────────────────────────────────

/**
 * Extract all candidate signals from a compressed context object.
 * Returns an array of typed signal records, unscored.
 */
export function extractSignals(compressed) {
  const signals = [];

  // Window title phrases — highest fidelity
  for (const p of compressed.titlePhrases || []) {
    if (shouldSuppress(p.phrase)) continue;
    signals.push(makeSignal(p.phrase, 'window_title_phrase', 'title', {
      durationSecs: p.durationSecs,
    }));
  }

  // App signals — only meaningful ones
  for (const app of compressed.apps || []) {
    if (!app.name || shouldSuppress(app.name)) continue;
    // AI tools with conversation context → upgrade to ai_conversation type
    const isAI = /claude|chatgpt|gemini|perplexity|copilot/i.test(app.normalizedName);
    const type = isAI ? 'ai_conversation' : 'app_category';
    signals.push(makeSignal(app.name, type, 'app', {
      totalSecs: app.totalSecs,
    }));
  }

  // Domain topics
  for (const d of compressed.domains || []) {
    if (!d.topic || shouldSuppress(d.topic)) continue;
    signals.push(makeSignal(d.topic, 'domain_topic', 'url', {
      totalSecs: d.totalSecs,
    }));
  }

  // Feature matches — from product ontology
  for (const f of compressed.features || []) {
    signals.push(makeSignal(f.label, 'feature_name', 'ontology', {
      featureId: f.featureId,
      strength: f.strength,
    }));
  }

  // Keywords — lowest priority
  for (const kw of (compressed.keywords || []).slice(0, 10)) {
    if (shouldSuppress(kw) || LOW_VALUE_TERMS.has(kw)) continue;
    signals.push(makeSignal(kw, 'raw_keyword', 'keyword'));
  }

  return signals;
}

// ─── Score All Signals ────────────────────────────────────────────────────────

/**
 * Score each signal based on:
 * 1. Type base score
 * 2. Semantic richness of the text
 * 3. Time-weight (longer exposure = more relevant)
 * 4. Suppression penalties
 */
export function scoreSignals(signals = [], totalSecs = 1) {
  return signals.map(sig => {
    let score = TYPE_BASE_SCORE[sig.type] || 10;

    // Semantic richness bonus
    score += scoreSemanticRichness(sig.text);

    // Time-weight: normalize to 0-30 bonus
    const sigSecs = sig.durationSecs || sig.totalSecs || 0;
    if (sigSecs > 0 && totalSecs > 0) {
      const fraction = Math.min(sigSecs / totalSecs, 1);
      score += Math.round(fraction * 30);
    }

    // Feature ontology match bonus
    if (sig.type === 'feature_name' && sig.strength) {
      score += Math.round(sig.strength * 20);
    }

    // Suppress if needed
    if (shouldSuppress(sig.text)) score = -100;

    return { ...sig, score };
  });
}

// ─── Main Ranking Function ────────────────────────────────────────────────────

/**
 * Rank signals extracted from a compressed context.
 * Returns sorted signals (best first), with low-score ones filtered out.
 *
 * @param {Object} compressed - output of contextCompressionEngine
 * @returns {Object} rankingResult
 */
export function rankSignals(compressed) {
  const totalSecs = compressed.totalActiveSecs || 1;
  const raw = extractSignals(compressed);
  const scored = scoreSignals(raw, totalSecs);

  const ranked = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const suppressed = scored.filter(s => s.score <= 0);

  // Top signals by type
  const topByType = {};
  for (const sig of ranked) {
    if (!topByType[sig.type]) topByType[sig.type] = sig;
  }

  // Primary signal = highest overall score
  const primary = ranked[0] || null;

  // Context signals = top 5 meaningful (diverse types)
  const seen = new Set();
  const contextSignals = [];
  for (const sig of ranked) {
    if (contextSignals.length >= 5) break;
    const key = sig.text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      contextSignals.push(sig);
    }
  }

  return {
    ranked,
    primary,
    contextSignals,
    topByType,
    suppressedCount: suppressed.length,
    totalSignals: raw.length,
    qualityScore: primary ? Math.min(primary.score / 150, 1) : 0,
  };
}

/**
 * Get a ranked list of descriptive text strings (most meaningful first).
 * Used by humanizationEngine for phrase generation.
 * Only returns actual work content signals — excludes feature ontology labels
 * (those are for the feature graph, not for activity phrase generation).
 */
export function getTopPhrases(ranking, limit = 4) {
  return ranking.contextSignals
    .filter(s =>
      s.type === 'window_title_phrase' ||
      s.type === 'ide_file_context'    ||
      s.type === 'domain_topic'
    )
    .slice(0, limit)
    .map(s => s.text);
}

/**
 * Get a clean list of meaningful tool names from rankings.
 * Excludes browsers, utility apps, and suppressed names.
 */
export function getMeaningfulTools(ranking) {
  const BROWSER_RE = /chrome|firefox|safari|arc|brave|edge|opera/i;
  const UTILITY_RE = /snipping\s*tool|photos|calculator|notepad|paint|explorer/i;

  return ranking.ranked
    .filter(s => (s.type === 'app_category' || s.type === 'ai_conversation') &&
                 !BROWSER_RE.test(s.text) &&
                 !UTILITY_RE.test(s.text) &&
                 s.score > 0)
    .slice(0, 3)
    .map(s => s.text);
}
