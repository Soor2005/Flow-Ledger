/**
 * Generic Keyword Filter
 *
 * Detects and suppresses generic application-layer terms that pollute
 * AI-generated titles and descriptions with meaningless content.
 *
 * ROOT CAUSE: Window titles and UI route names expose terms like "Productivity",
 * "Dashboard", "Analytics", "System" — these score high by frequency but carry
 * zero workflow-level meaning as standalone subjects.
 *
 * Rule:
 *   "Productivity" alone → REJECT (app category label)
 *   "Dashboard" alone   → REJECT (UI route name)
 *   "AI Intelligence Systems" → ALLOW (compound with specific technical context)
 *   "Workflow Dominance Engine" → ALLOW (all words are specific to the work)
 */

// ─── Tier 1: Absolute Generics ─────────────────────────────────────────────────
// These words NEVER produce a meaningful standalone subject.
// They describe app categories, UI routes, or platform metadata.

export const ABSOLUTE_GENERICS = new Set([
  // App / product category labels
  'productivity', 'dashboard', 'analytics', 'application', 'app',
  'platform', 'workspace', 'management', 'portal', 'hub', 'suite',
  'software', 'product', 'solution', 'service', 'tool',
  // UI route / page names
  'page', 'home', 'main', 'index', 'view', 'screen', 'route', 'section',
  'overview', 'summary', 'detail', 'details', 'landing', 'splash',
  // Generic UI components (standalone)
  'interface', 'widget', 'toolbar', 'header', 'footer', 'nav', 'navigation',
  'popup', 'overlay', 'drawer', 'dropdown', 'tooltip',
  'button', 'field', 'input', 'select', 'checkbox', 'toggle', 'control',
  'row', 'column', 'cell',
  // Generic system nouns (standalone)
  'module', 'feature', 'system', 'utility',
  'function', 'method', 'class', 'object', 'entity', 'element',
  'item', 'entry', 'record',
  // Generic data / content terms
  'data', 'information', 'content', 'metadata',
  'settings', 'preferences', 'configuration', 'options', 'admin',
  'resource', 'asset', 'value', 'property',
  // Generic work nouns
  'work', 'task', 'session', 'activity', 'operation', 'process',
  'project', 'document', 'file', 'folder',
  // Generic development/coding terms (standalone, not in compounds)
  'development', 'implementation', 'coding', 'programming',
  // Generic output / reporting terms
  'report', 'output', 'result', 'response', 'log',
  // Vague abstract nouns
  'thing', 'stuff', 'something', 'anything', 'everything',
  // Common tracker app UI terms
  'tracker', 'monitor', 'journal', 'feed', 'stream', 'ledger',
  // Generic change terms
  'update', 'upgrade', 'change', 'revision', 'version', 'release',
  // Flow Ledger-specific route names
  'flow', 'timetrack', 'timelog',
]);

// ─── Tier 2: Compound-Safe Generics ────────────────────────────────────────────
// These are meaningful ONLY inside compound subjects, never standalone.
// "AI Intelligence Engine" → OK.  "Intelligence" alone → TOO GENERIC.

export const COMPOUND_SAFE_GENERICS = new Set([
  'intelligence', 'engine', 'pipeline', 'architecture', 'framework',
  'workflow', 'context', 'reasoning', 'inference', 'semantic',
  'behavioral', 'continuity', 'narrative', 'classification',
  'optimization', 'performance', 'processing', 'detection', 'analysis',
  'generation', 'synthesis', 'integration', 'automation', 'orchestration',
  'validation', 'extraction', 'compression', 'aggregation', 'evaluation',
  'ranking', 'scoring', 'weighting', 'filtering', 'clustering',
]);

// ─── Specific Technical Anchors ─────────────────────────────────────────────────
// Words that always add specificity regardless of surrounding context.
// Their presence guarantees the compound subject is specific enough.

const SPECIFIC_ANCHORS = new Set([
  // AI / ML specific
  'ai', 'llm', 'nlp', 'tfidf', 'cosine', 'embedding', 'neural', 'transformer',
  'tokenizer', 'classifier', 'ranker', 'scorer', 'ontology', 'taxonomy',
  // Concrete engineering topics
  'algorithm', 'heuristic', 'schema', 'migration', 'transaction',
  'websocket', 'ipc', 'oauth', 'jwt', 'webhook', 'graphql', 'restapi',
  // Domain-specific work subjects (Flow Ledger context)
  'burnout', 'deepwork', 'autosession', 'telemetry', 'attribution',
  'dominance', 'segmentation', 'fusion', 'vocabulary', 'corpus',
  'continuity', 'orchestration', 'contextual', 'behavioral',
  // Concrete named system components
  'renderer', 'parser', 'serializer', 'scheduler', 'dispatcher',
  'indexer', 'tokenizer', 'compressor', 'sanitizer',
]);

// ─── Auto-Reject Title Patterns ─────────────────────────────────────────────────
// Titles matching these patterns are automatically rejected.

export const AUTO_REJECT_TITLE_PATTERNS = [
  // Verb + single absolute generic (the core bug pattern)
  /^(implementing|building|reviewing|inspecting|analyzing|evaluating|testing|improving|updating|developing|exploring|investigating|researching|creating|designing|debugging|fixing|refactoring|optimizing|auditing|assessing|examining)\s+(the\s+)?(productivity|dashboard|analytics|application|app|system|module|feature|interface|component|platform|workspace|overview|summary|page|view|screen|section|management|tool|service|utility|data|content|settings|configuration)s?$/i,
  // Verb + "Flow Ledger" (project name alone adds no specificity)
  /^(implementing|building|reviewing|inspecting|analyzing|evaluating|testing|improving|developing|exploring|investigating|researching|debugging|fixing|refactoring|auditing|assessing|examining)\s+flow\s+ledger$/i,
  // Verb + two-word generic compound ("System Dashboard", "Application Module")
  /^(implementing|building|reviewing|inspecting|evaluating|testing|improving|developing|exploring)\s+(the\s+)?(productivity|application|system)\s+(dashboard|analytics|module|feature|interface|platform|overview|summary|management)s?$/i,
  // Verb + "productivity X" or "X productivity" double-word patterns
  /^(implementing|building|reviewing|inspecting|analyzing|evaluating|testing|improving|developing|exploring)\s+(productivity\s+\w+|\w+\s+productivity)$/i,
  // Repeated word in title
  /\b(\w{4,})\s+\1\b/i,
  // Bare route/path fragments
  /\/[a-z]+\/[a-z]+/,
  // "App X" patterns (Flow Ledger app nav labels)
  /\bapp\s+(functions?|features?|tasks?|items?|sections?)\b/i,
];

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * True when the word is an absolute generic that should never be a solo subject.
 */
export function isGenericWord(word = '') {
  return ABSOLUTE_GENERICS.has(word.toLowerCase().trim());
}

/**
 * True when the subject has NO specific content — all its words are generic.
 *
 * Examples:
 *   isGenericSubject("Productivity")             → true
 *   isGenericSubject("System Dashboard")          → true
 *   isGenericSubject("Application Module")        → true
 *   isGenericSubject("AI Intelligence")           → false  (AI is a SPECIFIC_ANCHOR)
 *   isGenericSubject("Workflow Classification")   → false  (classification is compound-safe + workflow)
 *   isGenericSubject("Burnout Detection")         → false  (burnout is SPECIFIC_ANCHOR)
 *   isGenericSubject("Contextual Reasoning Engine") → false (contextual + reasoning)
 */
export function isGenericSubject(subject = '') {
  if (!subject || subject.length < 2) return true;

  const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'for', 'to', 'at', 'on', 'with', 'by']);

  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  if (!words.length) return true;

  // A SPECIFIC_ANCHOR anywhere → not generic
  if (words.some(w => SPECIFIC_ANCHORS.has(w))) return false;

  // If every meaningful word is absolute-generic or compound-safe → generic
  const allGenericOrCompound = words.every(
    w => ABSOLUTE_GENERICS.has(w) || COMPOUND_SAFE_GENERICS.has(w),
  );

  if (allGenericOrCompound) return true;

  // Special rule: if the primary word is an absolute generic and the subject
  // is short (≤ 2 meaningful words), it's still too generic unless the second
  // word is a SPECIFIC_ANCHOR.
  if (words.length <= 2 && ABSOLUTE_GENERICS.has(words[0])) {
    if (words.length === 2 && SPECIFIC_ANCHORS.has(words[1])) return false; // specific anchor → allow
    return true; // first word absolute generic, no specific anchor → always generic
  }

  return false;
}

/**
 * Score how specific a subject is. Returns 0 (pure generic) → 1.0 (highly specific).
 * Used for ranking candidate subjects before title generation.
 */
export function scoreSubjectSpecificity(subject = '') {
  if (!subject || subject.length < 2) return 0;

  const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'for', 'to', 'at', 'on', 'with', 'by']);
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  if (!words.length) return 0;
  if (isGenericSubject(subject)) return 0;

  const absoluteGenericCount = words.filter(w => ABSOLUTE_GENERICS.has(w)).length;
  const compoundSafeCount    = words.filter(w => COMPOUND_SAFE_GENERICS.has(w)).length;
  const specificAnchorCount  = words.filter(w => SPECIFIC_ANCHORS.has(w)).length;
  const contentWordCount     = words.length - absoluteGenericCount - compoundSafeCount - specificAnchorCount;

  let score = 0;
  score += specificAnchorCount  * 0.40;
  score += contentWordCount     * 0.25;
  score += compoundSafeCount    * 0.12;
  if (words.length >= 3) score += 0.15;
  else if (words.length >= 2) score += 0.08;
  // Penalize if first word is an absolute generic
  if (ABSOLUTE_GENERICS.has(words[0])) score -= 0.20;

  return Math.max(0, Math.min(1, score));
}

/**
 * Remove generic keywords from an array, keeping only meaningful words.
 *
 * @param {string[]} keywords
 * @param {{ strict?: boolean }} options
 *   strict: also removes compound-safe generics (default: false)
 * @returns {string[]}
 */
export function filterGenericKeywords(keywords = [], { strict = false } = {}) {
  return keywords.filter(kw => {
    const lower = kw.toLowerCase().trim();
    if (ABSOLUTE_GENERICS.has(lower)) return false;
    if (strict && COMPOUND_SAFE_GENERICS.has(lower)) return false;
    return true;
  });
}

/**
 * Sort an array of phrases (strings or { phrase } objects) by specificity,
 * most specific first. All-generic phrases are pushed to the end.
 */
export function rankPhrasesBySpecificity(phrases = []) {
  return [...phrases].sort((a, b) => {
    const textA = typeof a === 'string' ? a : (a.phrase || '');
    const textB = typeof b === 'string' ? b : (b.phrase || '');
    return scoreSubjectSpecificity(textB) - scoreSubjectSpecificity(textA);
  });
}

/**
 * Check a generated title against all auto-reject patterns.
 * Returns { rejected: boolean, reason: string | null }
 */
export function checkTitleRejectPatterns(title = '') {
  const trimmed = title.trim();

  for (const re of AUTO_REJECT_TITLE_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        rejected: true,
        reason: `Auto-reject pattern matched: ${re.source.slice(0, 80)}`,
      };
    }
  }

  // Check subject specificity: strip leading action verb and test the remainder
  const withoutVerb = trimmed
    .replace(/^[A-Za-z]+ing\s+/i, '')   // "Reviewing X" → "X"
    .replace(/^[A-Za-z]+ed\s+/i, '')    // "Reviewed X" → "X"
    .replace(/^(the|a|an)\s+/i, '')
    .trim();

  if (withoutVerb && isGenericSubject(withoutVerb)) {
    return {
      rejected: true,
      reason: `Subject "${withoutVerb}" is all-generic (no specific workflow content)`,
    };
  }

  return { rejected: false, reason: null };
}

/**
 * Detect word repetition in a string.
 * Returns { hasRepetition: boolean, repeated: string[] }
 */
export function detectRepetition(text = '') {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
  const seen = new Set();
  const repeated = [];
  for (const w of words) {
    if (seen.has(w)) repeated.push(w);
    seen.add(w);
  }
  return { hasRepetition: repeated.length > 0, repeated };
}

/**
 * Quick utility: given a list of title phrase candidates, return the most
 * specific one that is NOT all-generic, or null if none qualify.
 *
 * @param {string[]} candidates
 * @returns {string | null}
 */
export function pickBestSubject(candidates = []) {
  const ranked = rankPhrasesBySpecificity(candidates.filter(c => c && c.length >= 4));
  for (const c of ranked) {
    const text = typeof c === 'string' ? c : (c.phrase || '');
    if (!isGenericSubject(text)) return text;
  }
  return null;
}

// ─── Dirty Content Detection ──────────────────────────────────────────────────
// Catches raw/malformed URLs, system paths, and executables so they never leak
// into a generated title or description subject. Matches `https?:` followed by
// 0-2 slashes (not just well-formed "://") so truncated/malformed URL fragments
// like "https:/" (single slash) are caught too — these slip past stricter
// "https://" regexes elsewhere and have been observed producing titles like
// "Google Calendar - https:/ and chrome".

const DIRTY_CONTENT_RE = /\bhttps?:\/{0,2}\S*|[A-Z]:\\(Windows|Program Files|ProgramData|Users)|\/(usr|System|bin|etc|Applications|Library)\/|\.exe(\s|$)|\.dll(\s|$)|system32/i;

export function containsDirtyContent(text = '') {
  return DIRTY_CONTENT_RE.test(text);
}
