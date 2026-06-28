/**
 * Rewrite Engine
 *
 * Powers the "Rewrite with AI" action with TRUE contextual regeneration —
 * not paraphrasing. The existing title/description are NEVER read as input
 * here; they are only handed back to the caller for a post-generation
 * similarity check (sessionSummaryEngine.isTooSimilar).
 *
 * Generation always starts from the underlying session intelligence already
 * computed by the reasoning pipeline (orchestrateSync): workflow ownership,
 * intent, feature graph, activity phrases, tool usage, and project context.
 * That is the single source of facts. What changes between rewrites is the
 * REASONING STYLE used to narrate those facts — a different sentence
 * structure, opening, and framing — not a synonym swap of one word.
 */

import { INTENT_TYPES, getIntentVerb } from './intentInferenceEngine.js';
import { isGenericSubject } from './genericKeywordFilter.js';

function capitalizeFirst(str = '') {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function lowerFirst(str = '') {
  return str ? str.charAt(0).toLowerCase() + str.slice(1) : '';
}

function clean(str = '') {
  return str.replace(/^[A-Za-z]+ing\s+/, '').trim();
}

// ─── Style Catalogue ───────────────────────────────────────────────────────────
// Seven distinct reasoning styles. Each defines its own TITLE shape and
// DESCRIPTION shape — different opening words, different sentence skeleton,
// different framing of the same underlying facts. This is what makes a
// rewrite a genuine regeneration instead of a word-replacement pass.

const STYLES = {
  technical: {
    label: 'Technical',
    title: (f) => `${f.verb} ${f.subject}`,
    description: (f) => {
      const parts = [`${f.pastVerb} ${f.subject}`];
      if (f.contextPhrase) parts[0] += `, with focus on ${f.contextPhrase}`;
      let s = parts[0] + '.';
      if (f.purpose) s += ` ${capitalizeFirst(f.purpose)}.`;
      if (f.toolPhrase) s += ` ${capitalizeFirst(f.toolPhrase)}.`;
      return s;
    },
  },
  executive: {
    label: 'Executive Summary',
    title: (f) => `${f.subject} — Progress Update`,
    description: (f) => {
      let s = `Made progress on ${f.subject}${f.project ? ` for ${f.project}` : ''}.`;
      if (f.purpose) s += ` ${capitalizeFirst(f.purpose)}.`;
      if (f.durationLabel) s += ` Time invested: ${f.durationLabel}.`;
      return s;
    },
  },
  engineering_log: {
    label: 'Engineering Log',
    title: (f) => `Engineering Log: ${f.subject}`,
    description: (f) => {
      let s = `Worked through ${f.subject}`;
      if (f.contextPhrase) s += `, touching on ${f.contextPhrase}`;
      s += '.';
      if (f.toolPhrase) s += ` ${capitalizeFirst(f.toolPhrase)}.`;
      if (f.purpose) s += ` Goal: ${f.purpose}.`;
      return s;
    },
  },
  product: {
    label: 'Product Development',
    title: (f) => `Advancing ${f.subject}`,
    description: (f) => {
      // f.purpose already reads as "to ... " (see INTENT_TYPES[*].purpose), so
      // it slots in directly without a connecting "to" here.
      let s = `Continued building toward ${f.subject}${f.purpose ? ` ${f.purpose}` : ', supporting the broader product roadmap'}.`;
      if (f.contextPhrase) s += ` Explored ${f.contextPhrase} along the way.`;
      return s;
    },
  },
  research: {
    label: 'Research',
    title: (f) => `Researching ${f.subject}`,
    description: (f) => {
      let s = `Explored ${f.subject}, comparing approaches and weighing trade-offs`;
      if (f.contextPhrase) s += ` around ${f.contextPhrase}`;
      s += '.';
      if (f.purpose) s += ` ${capitalizeFirst(f.purpose)}.`;
      return s;
    },
  },
  architecture: {
    label: 'Architecture',
    title: (f) => `Architecting ${f.subject}`,
    description: (f) => {
      let s = `Reviewed structural approaches for ${f.subject}, evaluating long-term maintainability`;
      if (f.contextPhrase) s += ` and ${f.contextPhrase}`;
      s += '.';
      if (f.purpose) s += ` ${capitalizeFirst(f.purpose)}.`;
      return s;
    },
  },
  problem_solving: {
    label: 'Problem Solving',
    title: (f) => `Solving ${f.subject} Challenges`,
    description: (f) => {
      let s = `Tackled open questions around ${f.subject}, identifying blockers and validating possible solutions`;
      if (f.contextPhrase) s += ` related to ${f.contextPhrase}`;
      s += '.';
      if (f.purpose) s += ` ${capitalizeFirst(f.purpose)}.`;
      return s;
    },
  },
};

const STYLE_KEYS = Object.keys(STYLES);

// Preferred style ordering per detected intent — the first entry is tried
// first (most contextually appropriate), the rest provide variety for
// subsequent rewrite clicks while staying broadly plausible for the work.
const STYLE_ORDER_BY_INTENT = {
  implementing:  ['technical', 'engineering_log', 'product', 'architecture', 'executive', 'research', 'problem_solving'],
  debugging:     ['problem_solving', 'technical', 'engineering_log', 'architecture', 'research', 'executive', 'product'],
  researching:   ['research', 'architecture', 'technical', 'executive', 'product', 'engineering_log', 'problem_solving'],
  analyzing:     ['research', 'technical', 'architecture', 'executive', 'product', 'engineering_log', 'problem_solving'],
  designing:     ['architecture', 'product', 'technical', 'executive', 'research', 'engineering_log', 'problem_solving'],
  planning:      ['architecture', 'executive', 'product', 'research', 'technical', 'engineering_log', 'problem_solving'],
  refactoring:   ['technical', 'architecture', 'engineering_log', 'problem_solving', 'product', 'research', 'executive'],
  reviewing:     ['technical', 'executive', 'architecture', 'research', 'product', 'engineering_log', 'problem_solving'],
  documenting:   ['product', 'executive', 'technical', 'research', 'architecture', 'engineering_log', 'problem_solving'],
  testing:       ['technical', 'problem_solving', 'engineering_log', 'executive', 'product', 'research', 'architecture'],
  deploying:     ['engineering_log', 'technical', 'executive', 'product', 'architecture', 'problem_solving', 'research'],
  collaborating: ['executive', 'product', 'technical', 'research', 'architecture', 'engineering_log', 'problem_solving'],
};
const DEFAULT_STYLE_ORDER = ['technical', 'research', 'architecture', 'engineering_log', 'product', 'problem_solving', 'executive'];

function getStyleOrder(intentType) {
  const preferred = STYLE_ORDER_BY_INTENT[intentType] || DEFAULT_STYLE_ORDER;
  // Guarantee every style key is present even if a custom ordering above
  // were ever edited to drop one.
  const missing = STYLE_KEYS.filter(k => !preferred.includes(k));
  return [...preferred, ...missing];
}

// ─── Subject Resolution ────────────────────────────────────────────────────────
// Priority mirrors the required signal list: action-inference (window titles /
// AI topics) > workflow ownership > humanized activity phrase > project name.
// Never the existing manual title or description.

function resolveSubject(result, project) {
  const { humanized, ownership } = result;
  const actionInferred = humanized?.actionInferred;

  if (actionInferred?.hasSubject && actionInferred.confidence >= 0.7 &&
      !isGenericSubject(actionInferred.subject)) {
    return clean(actionInferred.subject);
  }
  if (ownership?.subject && !isGenericSubject(ownership.subject)) {
    return clean(ownership.subject);
  }
  if (humanized?.activityPhrase && !isGenericSubject(humanized.activityPhrase)) {
    return clean(humanized.activityPhrase);
  }
  if (project?.name) return project.name;
  return 'this work';
}

function buildDurationLabel(mins) {
  if (!mins || mins < 5) return null;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function renderStyle(intentType, subject, contextPhrase, toolPhrase, project, client, durationMins, styleIndex) {
  const intentDef = INTENT_TYPES[intentType] || INTENT_TYPES.implementing;
  const styleOrder = getStyleOrder(intentType);
  const styleKey = styleOrder[styleIndex % styleOrder.length];
  const style = STYLES[styleKey];

  // Verb variety is keyed to the SAME styleIndex so verb word and sentence
  // skeleton change together — not just one or the other.
  const verb     = getIntentVerb(intentType, styleIndex, false);
  const pastVerb = getIntentVerb(intentType, styleIndex, true);
  const purpose  = intentDef.purpose ? intentDef.purpose(lowerFirst(subject), project?.name) : null;

  const facts = {
    verb,
    pastVerb,
    subject,
    contextPhrase: contextPhrase || null,
    toolPhrase:    toolPhrase || null,
    purpose,
    project: project?.name || null,
    client:  client?.name || null,
    durationLabel: buildDurationLabel(durationMins),
  };

  let title = style.title(facts);
  if (title.length > 70) title = title.slice(0, 67).trim() + '…';
  title = capitalizeFirst(title);

  const description = style.description(facts);

  return { title, description, style: styleKey };
}

/**
 * Generate a rewrite candidate using session intelligence only — never the
 * existing title/description. `styleIndex` selects which reasoning style to
 * use (rotated by the caller across rewrite attempts); the style ordering is
 * itself chosen based on the detected intent so the first attempt is already
 * contextually appropriate.
 *
 * @param {Object} result - the object returned by reasoningOrchestrator.orchestrateSync()
 * @param {Object} [project]
 * @param {Object} [client]
 * @param {number} [durationMins]
 * @param {number} [styleIndex]
 * @returns {{ title: string, description: string, style: string }}
 */
export function generateRewriteCandidate(result, project = null, client = null, durationMins = null, styleIndex = 0) {
  const { humanized = {}, intent = {}, reasoning = {} } = result;
  const intentType = intent.type || reasoning.workMode || 'implementing';
  const subject = resolveSubject(result, project);
  const mins = durationMins ?? reasoning.sessionDurationMins ?? reasoning.compressed?.totalActiveMins ?? 0;

  return renderStyle(
    intentType, subject, humanized.contextPhrase, humanized.toolPhrase,
    project, client, mins, styleIndex,
  );
}

// ─── Context-based fallback (no autoSessions available) ──────────────────────
// Sessions with no matched auto-tracked activity (manually created sessions)
// never reach orchestrateSync. This variant derives the same kind of facts —
// subject, intent, context phrase — from the legacy analyzeContext() output
// instead, so "Rewrite with AI" still does true regeneration rather than
// falling back to deterministic, non-varying text.
const WORK_SUBTYPE_TO_INTENT = {
  debugging: 'debugging', testing: 'testing', refactoring: 'refactoring',
  designing: 'designing', researching: 'researching', reviewing: 'reviewing',
  documenting: 'documenting', planning: 'planning', implementing: 'implementing',
  integrating: 'implementing', deploying: 'deploying',
};

export function generateRewriteCandidateFromContext(context = {}, durationMins = null, styleIndex = 0) {
  const intentType = WORK_SUBTYPE_TO_INTENT[context.workSubtype] || 'implementing';

  const phrases = (context.windowTitlePhrases || []).filter(p => p && !isGenericSubject(p.phrase));
  let subject = phrases[0]?.phrase ? clean(phrases[0].phrase) : null;
  if (!subject && context.primarySiteTopic) subject = context.primarySiteTopic;
  if (!subject && context.linkedTaskTitle) subject = context.linkedTaskTitle;
  if (!subject && context.project?.name) subject = context.project.name;
  if (!subject) subject = (context.fallbackKeywords || [])[0] || 'this work';

  const contextPhrase = phrases[1]?.phrase ? clean(phrases[1].phrase) : null;
  const mins = durationMins ?? context.durationMins ?? 0;

  return renderStyle(
    intentType, subject, contextPhrase, null,
    context.project, context.client, mins, styleIndex,
  );
}

export { STYLE_KEYS, getStyleOrder };
