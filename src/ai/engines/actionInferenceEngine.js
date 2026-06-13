/**
 * Action Inference Engine
 *
 * Determines WHAT ACTION was being performed BEFORE generating titles.
 * This ensures titles follow the "Action + Specific Subject" structure
 * where both parts are derived from actual work signals rather than
 * keyword frequency counts.
 *
 * Problem this solves:
 *   Old flow: topKeyword("productivity") → verb("Inspecting") → "Inspecting Productivity"
 *   New flow: action("reviewing") + subject("AI Implementation") → "Reviewing AI Implementation"
 *
 * Priority chain:
 *   1. Explicit verb pattern in window titles
 *      "debugging workflow state resolution" → action: debugging
 *   2. AI conversation topic verb patterns
 *      Claude: "Fix burnout risk calculation" → action: debugging, subject: burnout risk calculation
 *   3. IDE file + work mode compound inference
 *      workflowDominanceEngine.js + work_mode:implementing → subject: Workflow Dominance Engine
 *   4. App context signals
 *      Figma primary → designing, Notion primary → planning
 *   5. Behavior profile work mode as canonical fallback
 *
 * Returns: ActionResult { action, verb, pastVerb, subject, confidence, source }
 */

import { isGenericSubject, filterGenericKeywords } from './genericKeywordFilter.js';

// ─── Action Verb Canonical Map ─────────────────────────────────────────────────

export const ACTION_DEFINITIONS = {
  implementing: {
    verb:     'Implementing',
    pastVerb: 'Implemented',
    altVerbs: ['Building', 'Developing', 'Engineering', 'Creating', 'Constructing'],
  },
  debugging: {
    verb:     'Debugging',
    pastVerb: 'Debugged',
    altVerbs: ['Fixing', 'Resolving', 'Troubleshooting', 'Diagnosing', 'Investigating'],
  },
  reviewing: {
    verb:     'Reviewing',
    pastVerb: 'Reviewed',
    altVerbs: ['Auditing', 'Evaluating', 'Inspecting', 'Assessing', 'Analyzing'],
  },
  refactoring: {
    verb:     'Refactoring',
    pastVerb: 'Refactored',
    altVerbs: ['Improving', 'Restructuring', 'Optimizing', 'Simplifying', 'Cleaning up'],
  },
  testing: {
    verb:     'Testing',
    pastVerb: 'Tested',
    altVerbs: ['Validating', 'Verifying', 'QA-testing', 'Writing tests for'],
  },
  designing: {
    verb:     'Designing',
    pastVerb: 'Designed',
    altVerbs: ['Crafting', 'Refining', 'Prototyping', 'Wireframing', 'Shaping'],
  },
  researching: {
    verb:     'Analyzing',
    pastVerb: 'Analyzed',
    altVerbs: ['Evaluating', 'Exploring', 'Investigating', 'Studying', 'Examining'],
  },
  planning: {
    verb:     'Planning',
    pastVerb: 'Planned',
    altVerbs: ['Architecting', 'Scoping', 'Mapping out', 'Structuring', 'Designing'],
  },
  documenting: {
    verb:     'Documenting',
    pastVerb: 'Documented',
    altVerbs: ['Writing', 'Drafting', 'Authoring', 'Composing'],
  },
};

// Work mode → canonical action key
const WORK_MODE_TO_ACTION = {
  deep_implementation: 'implementing',
  debugging:           'debugging',
  design_work:         'designing',
  research:            'researching',
  planning:            'planning',
  refactoring:         'refactoring',
  documenting:         'documenting',
  documentation:       'documenting',
  code_review:         'reviewing',
  testing:             'testing',
  analyzing:           'reviewing',
};

// ─── Title Verb Pattern Detection ───────────────────────────────────────────────
// When a window title STARTS with an action verb, extract verb + subject.
// Priority order matters — more specific verbs are matched first.

const TITLE_ACTION_PATTERNS = [
  // Debugging & fixing
  { re: /^(?:debugging?|debug)\s+(.+)/i,                    action: 'debugging',    confidence: 0.93 },
  { re: /^(?:fix(?:ing)?)\s+(.+)/i,                         action: 'debugging',    confidence: 0.92 },
  { re: /^(?:resolv(?:ing)?|troubleshoot(?:ing)?)\s+(.+)/i, action: 'debugging',    confidence: 0.88 },
  // Implementing
  { re: /^(?:implement(?:ing)?)\s+(.+)/i,                   action: 'implementing', confidence: 0.92 },
  { re: /^(?:build(?:ing)?|creat(?:ing)?)\s+(.+)/i,         action: 'implementing', confidence: 0.88 },
  { re: /^(?:develop(?:ing)?|engineer(?:ing)?)\s+(.+)/i,    action: 'implementing', confidence: 0.86 },
  { re: /^(?:add(?:ing)?|extend(?:ing)?|integrat(?:ing)?)\s+(.+)/i, action: 'implementing', confidence: 0.82 },
  // Reviewing & auditing
  { re: /^(?:review(?:ing)?)\s+(.+)/i,                      action: 'reviewing',    confidence: 0.90 },
  { re: /^(?:audit(?:ing)?|inspect(?:ing)?|evaluat(?:ing)?|assess(?:ing)?)\s+(.+)/i, action: 'reviewing', confidence: 0.87 },
  { re: /^(?:analyz(?:ing)?|analys(?:ing|is))\s+(.+)/i,     action: 'reviewing',    confidence: 0.84 },
  // Refactoring
  { re: /^(?:refactor(?:ing)?|restructur(?:ing)?)\s+(.+)/i, action: 'refactoring',  confidence: 0.90 },
  { re: /^(?:optimiz(?:ing)?|improv(?:ing)?|clean(?:ing)?\s+up)\s+(.+)/i, action: 'refactoring', confidence: 0.82 },
  // Testing
  { re: /^(?:test(?:ing)?|validat(?:ing)?|verif(?:y|ying))\s+(.+)/i, action: 'testing', confidence: 0.90 },
  // Planning
  { re: /^(?:plan(?:ning)?|architect(?:ing)?|scop(?:ing)?|design(?:ing)?)\s+(.+)/i, action: 'planning', confidence: 0.82 },
  // Documenting
  { re: /^(?:document(?:ing)?|writ(?:ing)?|draft(?:ing)?)\s+(.+)/i, action: 'documenting', confidence: 0.80 },
  // Researching
  { re: /^(?:research(?:ing)?|investigat(?:ing)?|explor(?:ing)?|study(?:ing)?)\s+(.+)/i, action: 'researching', confidence: 0.80 },
];

// App suffixes to strip before pattern matching
const TITLE_SUFFIX_STRIP = /\s*[—–|·\-]\s*(claude|chatgpt|gemini|visual studio code|vs code|cursor|webstorm|intellij|xcode|google chrome|safari|firefox|edge|arc|brave|notion|figma|slack|linear|github|flow\s*ledger|flow-ledger)\s*$/i;

// ─── AI Topic Action Extractor ──────────────────────────────────────────────────
// Claude/ChatGPT conversations often encode the action in the title:
// "Fix meeting time calculation" → action: debugging, subject: "meeting time calculation"
// "Implement workflow dominance scoring" → action: implementing, subject: "workflow dominance scoring"

function extractActionFromAITopic(topic = '') {
  // aiTopics can be objects like { topic, durationSecs } — ensure we have a string
  if (!topic || typeof topic !== 'string') return null;
  const clean = topic.replace(TITLE_SUFFIX_STRIP, '').trim();
  for (const { re, action, confidence } of TITLE_ACTION_PATTERNS) {
    const m = clean.match(re);
    if (m && m[1]) {
      const subject = cleanSubject(m[1]);
      if (subject && !isGenericSubject(subject)) {
        return { action, subject, confidence: confidence * 0.95, source: 'ai_topic_verb' };
      }
    }
  }
  // No verb pattern — the topic IS the subject
  if (clean.length >= 6 && !isGenericSubject(clean)) {
    return { action: null, subject: clean, confidence: 0.75, source: 'ai_topic_subject' };
  }
  return null;
}

// ─── Window Title Action Extractor ─────────────────────────────────────────────

function extractActionFromWindowTitle(title = '') {
  if (!title || title.length < 4) return null;

  const clean = title
    .replace(TITLE_SUFFIX_STRIP, '')
    .trim();

  // Try direct verb-pattern matching
  for (const { re, action, confidence } of TITLE_ACTION_PATTERNS) {
    const m = clean.match(re);
    if (m && m[1]) {
      const subject = cleanSubject(m[1]);
      if (subject && !isGenericSubject(subject)) {
        return { action, subject, confidence, source: 'window_title_verb' };
      }
    }
  }

  return null;
}

// ─── IDE Title Subject Extractor ───────────────────────────────────────────────
// "workflowDominanceEngine.js — Flow Ledger — VS Code"
// → "Workflow Dominance Engine"

// Internal implementation-detail suffixes that should be stripped from IDE-filename
// subjects. "workflowDominanceEngine.js" → "Workflow Dominance Engine" is accurate
// but meaningless to a user reviewing their calendar — they think in features and
// outcomes, not internal class names. We strip the suffix and lower confidence so
// these inferences don't force-override the humanization pipeline (NQ-07).
const INTERNAL_SUFFIX_RE = /\s+(Engine|Manager|Service|Controller|Handler|Processor|Factory|Builder|Resolver|Provider|Reducer|Middleware|Utility|Utils|Helper|Store|Hook|Adapter|Gateway|Repository|Transformer|Validator|Emitter|Listener|Observer|Strategy|Coordinator|Dispatcher|Orchestrator|Registry|Analyzer|Extractor|Formatter|Parser|Serializer|Deserializer|Encoder|Decoder)$/i;

function extractSubjectFromIDETitle(title = '', workMode = '') {
  // Split on em-dash / en-dash separators
  const parts = title.split(/\s*[—–]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const filename = parts[0]; // e.g., "workflowDominanceEngine.js"
  // Strip file extension
  const nameOnly = filename.replace(/\.[a-z]{1,6}$/i, '');
  // Convert camelCase/PascalCase to words
  const readable = nameOnly
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

  if (readable.length < 4 || isGenericSubject(readable)) return null;

  // Strip internal implementation suffixes to produce user-readable subjects.
  // "Workflow Dominance Engine" → "Workflow Dominance"
  // Confidence is reduced (0.65) so these won't force-override the 0.80 threshold
  // in the humanization pipeline — they still contribute as informative fallbacks.
  const hasInternalSuffix = INTERNAL_SUFFIX_RE.test(readable);
  const cleanSubject = readable.replace(INTERNAL_SUFFIX_RE, '').trim();

  // If stripping left nothing meaningful, discard
  if (!cleanSubject || cleanSubject.length < 3 || isGenericSubject(cleanSubject)) return null;

  return {
    subject:    cleanSubject,
    confidence: hasInternalSuffix ? 0.65 : 0.88,
    source:     'ide_filename',
  };
}

// ─── Clean Subject ──────────────────────────────────────────────────────────────

function cleanSubject(raw = '') {
  return raw
    .replace(TITLE_SUFFIX_STRIP, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/['"]/g, '')
    .trim()
    .slice(0, 60)
    // Capitalize first letter
    .replace(/^[a-z]/, c => c.toUpperCase());
}

// ─── App Context → Action Inference ──────────────────────────���─────────────────

const APP_ACTION_MAP = {
  'figma':          'designing',
  'sketch':         'designing',
  'adobe xd':       'designing',
  'framer':         'designing',
  'notion':         'planning',
  'linear':         'planning',
  'jira':           'planning',
  'obsidian':       'documenting',
  'terminal':       'implementing',
  'iterm':          'implementing',
  'postman':        'debugging',
  'insomnia':       'debugging',
};

function inferActionFromPrimaryApp(apps = []) {
  for (const app of apps) {
    const norm = (app.normalizedName || app.name || '').toLowerCase();
    if (APP_ACTION_MAP[norm]) {
      return { action: APP_ACTION_MAP[norm], confidence: 0.72, source: 'primary_app' };
    }
  }
  return null;
}

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Infer the primary action being performed and the specific subject
 * it was applied to. Returns a structured ActionResult used by title generators
 * to produce "Action + Subject" outputs.
 *
 * @param {Object} compressed    - from contextCompressionEngine
 * @param {Object} behaviorProfile - from behaviorInferenceEngine
 * @param {Object} [options]
 * @param {Object} [options.project]
 * @returns {ActionResult}
 */
export function inferAction(compressed = {}, behaviorProfile = {}, options = {}) {
  const titlePhrases     = compressed.titlePhrases || [];
  const aiTopics         = compressed.aiConversationTopics || [];
  const apps             = compressed.apps || [];
  const keywords         = compressed.keywords || [];
  const workMode         = behaviorProfile?.workMode?.primary || 'deep_implementation';

  // ── Priority 1: AI conversation topic (highest specificity) ────────────────
  // Claude/ChatGPT window titles embed both action AND subject explicitly.
  for (const t of aiTopics.slice(0, 3)) {
    // Normalize: topic entry may be a string OR an object { topic, durationSecs, ... }
    const topicStr = typeof t === 'string' ? t : (typeof t?.topic === 'string' ? t.topic : '');
    const result = extractActionFromAITopic(topicStr);
    if (result && result.subject) {
      const def = ACTION_DEFINITIONS[result.action || WORK_MODE_TO_ACTION[workMode] || 'implementing'];
      return buildResult(result.action || WORK_MODE_TO_ACTION[workMode], result.subject, result.confidence, result.source, def);
    }
  }

  // ── Priority 2: Window title verb patterns ──────────────────────────────────
  for (const p of titlePhrases.slice(0, 6)) {
    const phrase = typeof p === 'string' ? p : (p.phrase || '');
    const result = extractActionFromWindowTitle(phrase);
    if (result && result.subject) {
      const def = ACTION_DEFINITIONS[result.action] || ACTION_DEFINITIONS.implementing;
      return buildResult(result.action, result.subject, result.confidence, result.source, def);
    }
  }

  // ── Priority 3: IDE file title → subject, work mode → action ───────────────
  const IDE_APP_RE = /^(vscode|visual studio code|cursor|webstorm|intellij|xcode|pycharm|rider|sublime|vim|nvim)/i;
  const ideApp = apps.find(a => IDE_APP_RE.test(a.normalizedName || a.name || ''));
  if (ideApp) {
    for (const p of titlePhrases.slice(0, 4)) {
      const phrase = typeof p === 'string' ? p : (p.phrase || '');
      const ideResult = extractSubjectFromIDETitle(phrase, workMode);
      if (ideResult) {
        const action = WORK_MODE_TO_ACTION[workMode] || 'implementing';
        const def = ACTION_DEFINITIONS[action];
        return buildResult(action, ideResult.subject, ideResult.confidence, ideResult.source, def);
      }
    }
  }

  // ── Priority 4: Best non-generic title phrase as subject ────────────────────
  // Action comes from work mode, subject comes from the best available phrase.
  const action = WORK_MODE_TO_ACTION[workMode] || 'implementing';
  const def = ACTION_DEFINITIONS[action] || ACTION_DEFINITIONS.implementing;

  for (const p of titlePhrases.slice(0, 8)) {
    const phrase = typeof p === 'string' ? p : (p.phrase || '');
    if (phrase.length < 5) continue;
    const cleaned = phrase.replace(TITLE_SUFFIX_STRIP, '').trim();
    if (!isGenericSubject(cleaned)) {
      return buildResult(action, cleanSubject(cleaned), 0.75, 'title_phrase', def);
    }
  }

  // ── Priority 5: App context → action ───────────────────────────────────────
  const appActionResult = inferActionFromPrimaryApp(apps);
  if (appActionResult) {
    const appDef = ACTION_DEFINITIONS[appActionResult.action] || def;
    // Subject: try keywords filtered of generics
    const kws = filterGenericKeywords(keywords, { strict: false }).slice(0, 3);
    const subjectFromKws = kws.length >= 2
      ? kws.slice(0, 2).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(' ')
      : kws[0]
        ? kws[0].charAt(0).toUpperCase() + kws[0].slice(1)
        : null;
    return buildResult(appActionResult.action, subjectFromKws, appActionResult.confidence, appActionResult.source, appDef);
  }

  // ── Priority 6: Work mode fallback (no specific subject available) ──────────
  return buildResult(action, null, 0.40, 'work_mode_fallback', def);
}

function buildResult(action, subject, confidence, source, def) {
  return {
    action:     action || 'implementing',
    verb:       def?.verb || 'Implementing',
    pastVerb:   def?.pastVerb || 'Implemented',
    altVerbs:   def?.altVerbs || [],
    subject:    subject || null,
    confidence,
    source,
    hasSubject: !!subject && !isGenericSubject(subject),
  };
}

/**
 * Get the canonical verb set for a given work mode.
 * Convenience helper for title generators.
 */
export function getActionVerbsForMode(workMode = 'deep_implementation') {
  const action = WORK_MODE_TO_ACTION[workMode] || 'implementing';
  const def = ACTION_DEFINITIONS[action];
  return {
    action,
    verb:     def?.verb || 'Implementing',
    pastVerb: def?.pastVerb || 'Implemented',
    altVerbs: def?.altVerbs || [],
  };
}
