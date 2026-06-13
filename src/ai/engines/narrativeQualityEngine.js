/**
 * Narrative Quality Engine
 *
 * Final validation gate before title/description output is returned to the user.
 * Ensures all generated narratives meet minimum specificity and coherence
 * standards — auto-rejecting generic, repetitive, or context-free outputs.
 *
 * Quality dimensions (0–1 each):
 *   1. Subject Specificity    — does the subject describe REAL work?
 *   2. Action Clarity         — is the action verb meaningful?
 *   3. Repetition Avoidance  — no repeated words/phrases
 *   4. Workflow Relevance     — describes actual work, not app metadata
 *   5. Description Completeness — answers what + why, not just parrots the title
 *   6. Project Awareness      — contextually appropriate project references
 *
 * Composite quality score >= QUALITY_PASS_THRESHOLD → accepted.
 * Below threshold → rejected (caller should regenerate).
 */

import {
  isGenericSubject,
  detectRepetition,
  checkTitleRejectPatterns,
  scoreSubjectSpecificity,
  ABSOLUTE_GENERICS,
} from './genericKeywordFilter.js';

// ─── Thresholds ────────────────────────────────────────────────────────────────

export const QUALITY_PASS_THRESHOLD = 0.55;   // Min score to accept output
export const QUALITY_WARN_THRESHOLD = 0.40;   // Below this → strongly prefer regeneration

// ─── Known Low-Quality Title Patterns ─────────────────────────────────────────
// Beyond the auto-reject list in genericKeywordFilter, these are the
// narrative-level quality guards.

const TITLE_QUALITY_CHECKS = [
  {
    test: (t) => t.length < 10,
    penalty: 1.0,
    reason: 'Title is too short to be meaningful',
  },
  {
    test: (t) => t.length > 72,
    penalty: 0.15,
    reason: 'Title is too long (> 72 chars)',
  },
  {
    test: (t) => /^(working|using|open|auto|general|session|focus|task)\b/i.test(t),
    penalty: 0.8,
    reason: 'Title starts with a vague work verb',
  },
  {
    test: (t) => /^(auto\s*:)/i.test(t),
    penalty: 1.0,
    reason: 'Title has "Auto:" prefix',
  },
  {
    test: (t) => detectRepetition(t).hasRepetition,
    penalty: 0.7,
    reason: 'Title contains repeated words',
  },
  {
    test: (t) => checkTitleRejectPatterns(t).rejected,
    penalty: 0.9,
    reason: (t) => checkTitleRejectPatterns(t).reason || 'Matches auto-reject pattern',
  },
];

// ─── Description Quality Checks ───────────────────────────────────────────────

const DESC_QUALITY_CHECKS = [
  {
    test: (d) => d.length < 30,
    penalty: 0.7,
    reason: 'Description is too short',
  },
  {
    test: (d, title) => {
      // Check if description just repeats the title words
      const titleWords = (title || '').toLowerCase().split(/\s+/).filter(w => w.length >= 5);
      const descWords = d.toLowerCase().split(/\s+/);
      if (!titleWords.length) return false;
      const overlapCount = titleWords.filter(w => descWords.includes(w)).length;
      return overlapCount >= titleWords.length * 0.8 && d.length < 120;
    },
    penalty: 0.6,
    reason: 'Description mostly repeats title words',
  },
  {
    test: (d) => {
      // Detect consecutive repetition: "productivity and productivity"
      const { hasRepetition } = detectRepetition(d);
      return hasRepetition;
    },
    penalty: 0.75,
    reason: 'Description contains repeated words',
  },
  {
    test: (d) => /\b(productivity|dashboard|analytics|application|system|module|feature)\s+\1/i.test(d),
    penalty: 0.9,
    reason: 'Description contains back-to-back identical generic nouns',
  },
  {
    // Chained conjunction in descriptions — "X and Y and Z and W" = audit-report style
    test: (d) => (d.match(/ and /gi) || []).length >= 3,
    penalty: 0.70,
    reason: 'Description has chained conjunctions (audit-report style — condense concepts)',
  },
  {
    // Bureaucratic "ensure X consistency and correctness" pattern
    test: (d) => /\b(ensure|ensuring|ensures)\s+\w[\w\s]{0,30}(consistency|correctness|quality)\b/i.test(d),
    penalty: 0.65,
    reason: 'Description uses bureaucratic audit language ("ensure X consistency/correctness")',
  },
  {
    // "X and productivity insights" — "productivity" should never appear as a phrase subject
    test: (d) => /\b(productivity\s+(insights?|analytics?|metrics?|data|dashboard))\s+(consistency|correctness|quality|accuracy)/i.test(d),
    penalty: 0.85,
    reason: 'Description has generic "productivity X quality" pattern — use a specific outcome instead',
  },
  {
    test: (d) => /^(Worked on|Worked on Auto:|Auto:|Researched Auto:)/i.test(d.trim()),
    penalty: 0.85,
    reason: 'Description has legacy auto-generated prefix',
  },
  {
    test: (d) => /Duration:\s*\d+\s*min/i.test(d),
    penalty: 0.6,
    reason: 'Description has legacy duration annotation',
  },
  {
    test: (d) => {
      // Check if ALL meaningful words are generic
      const words = d.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 5);
      if (words.length < 4) return false;
      const genericCount = words.filter(w => ABSOLUTE_GENERICS.has(w)).length;
      return genericCount / words.length > 0.65;
    },
    penalty: 0.7,
    reason: 'Description is dominated by generic application terminology',
  },
];

// ─── Title Scoring ─────────────────────────────────────────────────────────────

/**
 * Score a title on multiple quality dimensions.
 * Returns { score: 0-1, penalties: string[], passed: boolean }
 */
export function scoreTitle(title = '', project = null) {
  if (!title) return { score: 0, penalties: ['No title provided'], passed: false };

  const penalties = [];
  let totalPenalty = 0;

  for (const check of TITLE_QUALITY_CHECKS) {
    if (check.test(title)) {
      const penalty = check.penalty;
      const reason = typeof check.reason === 'function' ? check.reason(title) : check.reason;
      penalties.push(reason);
      totalPenalty = Math.min(totalPenalty + penalty, 1.0); // additive, capped at 1.0
    }
  }

  // Bonus: subject specificity
  const withoutVerb = title
    .replace(/^[A-Za-z]+ing\s+/i, '')
    .replace(/^[A-Za-z]+ed\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
  const specificity = scoreSubjectSpecificity(withoutVerb);

  // Base score from specificity, reduced by penalties
  const baseScore = 0.40 + specificity * 0.60;
  const score = Math.max(0, Math.min(1, baseScore * (1 - totalPenalty)));

  return {
    score: Math.round(score * 100) / 100,
    specificity,
    penalties,
    passed: score >= QUALITY_PASS_THRESHOLD,
  };
}

// ─── Description Scoring ───────────────────────────────────────────────────────

/**
 * Score a description on multiple quality dimensions.
 * Returns { score: 0-1, penalties: string[], passed: boolean }
 */
export function scoreDescription(description = '', title = '') {
  if (!description) return { score: 0, penalties: ['No description provided'], passed: false };

  const penalties = [];
  let totalPenalty = 0;

  for (const check of DESC_QUALITY_CHECKS) {
    if (check.test(description, title)) {
      penalties.push(check.reason);
      totalPenalty = Math.min(totalPenalty + check.penalty, 1.0); // additive, capped at 1.0
    }
  }

  // Length bonus
  const lengthScore = Math.min(description.length / 150, 1) * 0.25;

  // Specificity bonus: count non-generic content words
  const words = description.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 5);
  const genericCount = words.filter(w => ABSOLUTE_GENERICS.has(w)).length;
  const specificityRatio = words.length > 0 ? 1 - (genericCount / words.length) : 0.5;
  const specificityScore = specificityRatio * 0.40;

  // Base score
  const baseScore = 0.35 + lengthScore + specificityScore;
  const score = Math.max(0, Math.min(1, baseScore * (1 - totalPenalty)));

  return {
    score: Math.round(score * 100) / 100,
    penalties,
    passed: score >= QUALITY_PASS_THRESHOLD,
  };
}

// ─── Composite Quality Check ───────────────────────────────────────────────────

/**
 * Run a full quality check on a title + description pair.
 * Returns a comprehensive quality report.
 *
 * @param {string} title
 * @param {string} description
 * @param {Object} [context] - { project, workMode, action }
 * @returns {QualityReport}
 */
export function checkNarrativeQuality(title = '', description = '', context = {}) {
  const titleResult = scoreTitle(title, context.project);
  const descResult  = scoreDescription(description, title);

  // Composite score: title carries more weight
  const composite = (titleResult.score * 0.65 + descResult.score * 0.35);
  const compositeScore = Math.round(composite * 100) / 100;

  const allPenalties = [
    ...titleResult.penalties.map(p => `[title] ${p}`),
    ...descResult.penalties.map(p => `[desc] ${p}`),
  ];

  const passed = compositeScore >= QUALITY_PASS_THRESHOLD;
  const warn   = compositeScore < QUALITY_WARN_THRESHOLD;

  return {
    compositeScore,
    titleScore:    titleResult.score,
    descScore:     descResult.score,
    passed,
    warn,
    needsRegeneration: !passed,
    penalties: allPenalties,
    // Specific failure modes for targeted regeneration
    titleFailed: !titleResult.passed,
    descFailed:  !descResult.passed,
  };
}

/**
 * Quick title-only validation — used by title generators for fast-path
 * rejection before even building a description.
 *
 * @param {string} title
 * @returns {boolean} true if title is acceptable
 */
export function isTitleAcceptable(title = '') {
  if (!title || title.length < 8) return false;
  const { rejected } = checkTitleRejectPatterns(title);
  if (rejected) return false;
  const { score } = scoreTitle(title);
  return score >= QUALITY_PASS_THRESHOLD;
}

/**
 * Extract the "subject" from a title (strip the leading action verb).
 * Used for checking if the subject is specific enough.
 */
export function extractTitleSubject(title = '') {
  return title
    .replace(/^[A-Za-z]+ing\s+/i, '')    // "Reviewing X" → "X"
    .replace(/^[A-Za-z]+ed\s+/i, '')     // "Reviewed X" → "X"
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

/**
 * Generate a quality-aware summary string for debugging/logging.
 * Not used in production rendering — for dev diagnostics.
 */
export function describeQuality(report) {
  if (report.passed) {
    return `✓ Quality passed (${Math.round(report.compositeScore * 100)}%)`;
  }
  const issues = report.penalties.slice(0, 2).join('; ');
  return `✗ Quality failed (${Math.round(report.compositeScore * 100)}%): ${issues}`;
}
