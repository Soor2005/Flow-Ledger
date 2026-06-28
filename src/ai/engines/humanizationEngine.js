/**
 * Humanization Engine
 * Stage 6 of the contextual intelligence pipeline.
 *
 * Converts technical tracking signals into natural, workflow-aware language.
 * This is the difference between "Using cmd.exe and chrome.exe" and
 * "Investigating API behavior and researching implementation patterns."
 *
 * No LLMs. Uses structured vocabulary, contextual phrase templates,
 * semantic mapping, and dynamic sentence variation.
 */

import { INTENT_TYPES, getIntentVerb, inferDomain, inferCapability } from './intentInferenceEngine.js';
import { getMeaningfulTools, getTopPhrases } from './signalRankingEngine.js';
import { FEATURE_ONTOLOGY } from './productivityOntologyEngine.js';
import { isGenericSubject, filterGenericKeywords, checkTitleRejectPatterns } from './genericKeywordFilter.js';
import { isTitleAcceptable, checkNarrativeQuality } from './narrativeQualityEngine.js';
import { inferAction } from './actionInferenceEngine.js';
import { buildToolEcosystemPhrase } from './workflowOwnershipEngine.js';

// Set of feature ontology label strings — used to prevent them from leaking
// into activity phrases (they describe Flow Ledger features, not user work).
const FEATURE_LABEL_SET = new Set(
  Object.values(FEATURE_ONTOLOGY).map(f => f.label.toLowerCase())
);

// ─── Technical → Human Vocabulary ────────────────────────────────────────────

const TECH_TO_HUMAN = {
  // File/Component patterns
  'calendar.tsx':           'calendar rendering system',
  'calendar':               'calendar scheduling system',
  'event.tsx':              'event management component',
  'scheduler':              'scheduling logic',
  'drag':                   'drag-and-drop interactions',
  'drop':                   'drop interaction behavior',
  'dragdrop':               'drag-and-drop system',
  'collision':              'event collision detection',
  'rendering':              'rendering performance',
  'sidebar':                'sidebar navigation system',
  'dashboard':              'reporting interface',
  'analytics':              'analytics and reporting',
  'session':                'session analysis',
  'tracking':               'activity tracking system',
  'continuity':             'workflow continuity',
  'reasoning':              'contextual reasoning',
  'semantic':               'semantic intelligence',
  'embedding':              'semantic embedding',
  'ontology':               'productivity ontology',
  'inference':              'behavioral inference',
  'narrative':              'narrative synthesis',
  'pipeline':               'processing pipeline',
  'auth':                   'authentication system',
  'authentication':         'authentication and authorization',
  'notification':           'notification system',
  'report':                 'reporting and export',
  'migration':              'database migration',
  'schema':                 'data schema',
  'api':                    'API layer',
  'endpoint':               'API endpoints',
  'middleware':              'middleware layer',
  'component':              'UI components',
  'animation':              'UI animations',
  'interaction':            'interaction patterns',
  'responsive':             'responsive design',
  'performance':            'performance optimization',
  'optimization':           'code optimization',
  'refactor':               'code refactoring',
};

// ─── Workflow Context Phrases ─────────────────────────────────────────────────
// Context-aware phrases for describing what was happening during a session

// All values are noun phrases (no leading gerunds).
// The verb comes from pastVerb/presentVerb in the builder functions.
const WORKFLOW_CONTEXT_PHRASES = {
  implementing: {
    calendar_system:          'scheduling and calendar event workflows',
    ai_engine:                'AI intelligence and contextual reasoning systems',
    ui_components:            'UI components and interaction patterns',
    productivity_analytics:   'productivity analytics and insight systems',
    session_tracking:         'session tracking and time intelligence',
    data_persistence:         'data layer and persistence logic',
    planning_system:          'planning and scheduling intelligence',
    notifications:            'notification and alerting systems',
    reports:                  'reporting and export functionality',
    _default:                 'feature logic and system architecture',
  },
  debugging: {
    calendar_system:          'calendar rendering and scheduling behavior',
    ai_engine:                'AI reasoning and context inference issues',
    ui_components:            'UI interaction states and component behavior',
    productivity_analytics:   'analytics data processing',
    session_tracking:         'session detection and tracking logic',
    _default:                 'system behavior and issue resolution',
  },
  researching: {
    ai_engine:                'AI architecture and intelligence patterns',
    ui_components:            'UI patterns and interaction design',
    calendar_system:          'scheduling algorithms and calendar solutions',
    _default:                 'solutions and implementation patterns',
  },
  designing: {
    ui_components:            'UI components and interaction flows',
    calendar_system:          'scheduling interface and calendar UX',
    _default:                 'system architecture and user experience',
  },
  planning: {
    ai_engine:                'AI intelligence architecture and system design',
    calendar_system:          'scheduling system architecture and workflows',
    _default:                 'feature architecture and development approach',
  },
  refactoring: {
    ai_engine:                'AI reasoning pipeline and performance',
    ui_components:            'component architecture and design system',
    session_tracking:         'session tracking and time intelligence',
    _default:                 'system architecture and code quality',
  },
  reviewing: {
    ai_engine:                'AI intelligence architecture and integration patterns',
    calendar_system:          'calendar scheduling logic and event flow',
    session_tracking:         'session tracking accuracy and classification',
    ui_components:            'UI component architecture and interaction design',
    data_persistence:         'data schema and persistence layer',
    planning_system:          'scheduling intelligence and planning systems',
    productivity_analytics:   'analytics pipeline and insight generation',
    _default:                 'system architecture and implementation quality',
  },
  documenting: {
    ai_engine:                'AI intelligence architecture and system design',
    _default:                 'technical documentation and system specifications',
  },
  testing: {
    ai_engine:                'AI engine behavior and reasoning accuracy',
    _default:                 'system behavior and test coverage',
  },
  analyzing: {
    ai_engine:                'AI intelligence pipeline and reasoning quality',
    productivity_analytics:   'productivity patterns and behavioral insights',
    session_tracking:         'session detection and classification accuracy',
    calendar_system:          'scheduling patterns and calendar behavior',
    _default:                 'system architecture and behavioral patterns',
  },
  collaborating: {
    _default:                 'implementation approach and team alignment',
  },
};

// ─── App → Context Phrase Map ─────────────────────────────────────────────────
// When app is the primary signal (no rich window title), generate a phrase.
// AI tools (Claude/ChatGPT) have special handling: when they're the dominant
// workspace, their phrase describes the type of work done IN them.

// All values are noun phrases — the verb comes from pastVerb/presentVerb.
const APP_CONTEXT_PHRASES = {
  'VS Code':   {
    implementing: 'system code and feature logic',
    debugging:    'system issues and bug resolution',
    refactoring:  'code structure and architecture improvements',
    _default:     'engineering features and system logic',
  },
  'Cursor':    {
    implementing: 'AI-assisted features and system development',
    _default:     'AI-assisted engineering and feature implementation',
  },
  'Claude':    {
    researching:  'solutions and architecture approaches',
    reviewing:    'system architecture and integration patterns',
    implementing: 'implementation workflows and design validation',
    analyzing:    'system behavior and architecture patterns',
    planning:     'system architecture and feature design',
    documenting:  'system design and technical specifications',
    code_review:  'system integrations and architecture quality',
    debugging:    'system issues and troubleshooting behavior',
    refactoring:  'refactoring approaches and architecture improvements',
    _default:     'architecture and technical approaches',
  },
  'ChatGPT':   {
    researching:  'solutions and technical patterns',
    reviewing:    'implementation approaches and system design',
    code_review:  'code patterns and architecture decisions',
    analyzing:    'technical approaches and system behavior',
    _default:     'solutions and technical approaches',
  },
  'Figma':     {
    designing:    'UI components and visual design system',
    _default:     'interfaces and interaction patterns',
  },
  'Notion':    {
    planning:     'development planning and task organization',
    documenting:  'documentation and specifications',
    _default:     'planning and workflow documentation',
  },
  'Linear':    {
    planning:     'project tasks and development workflow',
    reviewing:    'project state and task priorities',
    _default:     'project tasks and workflow management',
  },
  'Terminal':  {
    deploying:    'deployment scripts and system commands',
    debugging:    'system behavior through CLI investigation',
    _default:     'system and build processes',
  },
};

// AI tool apps — when these dominate a session, don't list them in "using X" clause
const AI_WORKSPACE_APPS = new Set(['claude', 'chatgpt', 'gemini', 'copilot', 'perplexity', 'poe', 'phind']);

// ─── Sentence Structure Variants ──────────────────────────────────────────────
// Multiple structures prevent robotic repetition

const SENTENCE_STRUCTURES = [
  // Structure 0: [Verb+ing] [activity phrase]
  (verb, activity, context) =>
    `${verb} ${activity}${context ? `, ${context}` : ''}.`,

  // Structure 1: [Activity phrase] and [secondary activity]
  (verb, activity, context) =>
    context
      ? `${verb} ${activity} and ${context}.`
      : `${verb} ${activity}.`,

  // Structure 2: [Past verb] [activity] with [context]
  (verb, activity, context) =>
    context
      ? `${verb} ${activity}, with particular focus on ${context}.`
      : `${verb} ${activity}.`,

  // Structure 3: Refined/focused variant
  (verb, activity, context) =>
    `${verb} and refining ${activity}${context ? ` — specifically ${context}` : ''}.`,

  // Structure 4: Multi-part "covering"
  (verb, activity, context) =>
    context
      ? `${verb} ${activity}, covering ${context}.`
      : `${verb} ${activity}.`,
];

// ─── Activity Phrase Builder ──────────────────────────────────────────────────

function humanizeTechTerm(term = '') {
  const lower = term.toLowerCase().trim();
  // Direct match
  if (TECH_TO_HUMAN[lower]) return TECH_TO_HUMAN[lower];
  // Partial match
  for (const [key, val] of Object.entries(TECH_TO_HUMAN)) {
    if (lower.includes(key)) return val;
  }
  return term;
}

// Exact-match only variant — used for window title phrases so partial-keyword
// matching doesn't corrupt human-readable titles like "Rize Activity Tracking"
// into Flow-Ledger-specific terms like "activity tracking system".
function humanizeTechTermDirect(term = '') {
  const lower = term.toLowerCase().trim();
  return TECH_TO_HUMAN[lower] || term;
}

// App names that are too generic to use as standalone activity phrases.
const VAGUE_APP_RE = /^(claude|chatgpt|gemini|copilot|perplexity|poe|phind|codex|new chat|assistant|ai assistant)$/i;

// Convert "eventWritingEngine.js — Flow Ledger" → "Event Writing Engine in Flow Ledger"
// Returns null when the phrase does not match an IDE-title pattern.
function parseIDETitlePhrase(phrase) {
  const IDE_RE = /^(.+?)\.([a-z]{1,5})\s*[—–\-]\s*(.+)$/i;
  const m = phrase.match(IDE_RE);
  if (!m) return null;
  const [, baseName, , rest] = m;
  const readable = baseName
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()); // capitalizeWords
  return `${readable} in ${rest}`;
}

function buildActivityPhrase(intentType, featureId, topPhrases) {
  // Priority 1: actual window title / domain / IDE content.
  // CRITICAL: filter out:
  //   (a) feature ontology labels (Flow Ledger system names)
  //   (b) bare app names
  //   (c) ALL-GENERIC subjects — "productivity", "dashboard", "analytics", etc.
  //       These inflate to become the primary subject via frequency bias.
  const workPhrases = topPhrases.filter(p =>
    p &&
    p.length >= 5 &&
    !FEATURE_LABEL_SET.has(p.toLowerCase()) &&
    !VAGUE_APP_RE.test(p.trim()) &&
    !isGenericSubject(p)
  );

  if (workPhrases.length > 0) {
    // For IDE-style "file.ext — Project" titles, convert to a readable phrase.
    const toReadable = (p) => parseIDETitlePhrase(p) || humanizeTechTermDirect(p);
    const first  = toReadable(workPhrases[0]);
    const second = workPhrases[1] ? toReadable(workPhrases[1]) : null;

    // Only combine two phrases when the result stays concise and genuinely distinct.
    // Reject if either phrase already contains "and" — that would create a chain.
    // Reject if combined length > 55 chars — too long for a clean title subject.
    const canCombine = second &&
      second.toLowerCase() !== first.toLowerCase() &&
      !first.includes(' and ') &&
      !second.includes(' and ') &&
      !first.toLowerCase().includes(second.split(' ')[0].toLowerCase()) &&
      (first + ' and ' + second).length <= 55;

    if (canCombine) {
      return `${first} and ${second}`;
    }
    return first;
  }

  // Priority 2: feature graph + intent combo (Flow Ledger-specific fallback).
  const intentPhrases = WORKFLOW_CONTEXT_PHRASES[intentType];
  if (intentPhrases?.[featureId]) return intentPhrases[featureId];

  return intentPhrases?._default || 'feature development and implementation';
}

function buildContextPhrase(intentType, secondaryFeatureId, secondaryPhrases) {
  // Priority 1: actual window title content (same logic as buildActivityPhrase).
  // Also guard against generic subjects here to prevent duplicate context phrases.
  const workPhrases = secondaryPhrases.filter(p =>
    p &&
    p.length >= 5 &&
    !FEATURE_LABEL_SET.has(p.toLowerCase()) &&
    !VAGUE_APP_RE.test(p.trim()) &&
    !isGenericSubject(p)
  );

  if (workPhrases.length > 0) {
    return humanizeTechTermDirect(workPhrases[0]);
  }

  // Priority 2: feature graph + intent combo.
  const intentPhrases = WORKFLOW_CONTEXT_PHRASES[intentType];
  if (intentPhrases?.[secondaryFeatureId]) return intentPhrases[secondaryFeatureId];

  return null;
}

// ─── Purpose Phrase Builder ───────────────────────────────────────────────────
// Replaces the old tool clause ("using X and Y") with an intent-driven purpose
// statement that explains WHY the work was done, not WHICH tools were open.

function buildPurposePhrase(intentType, activityPhrase, project) {
  const intentDef = INTENT_TYPES[intentType] || INTENT_TYPES.implementing;
  if (!intentDef.purpose) return null;

  const projectName = project?.name || null;
  const purpose = intentDef.purpose(activityPhrase, projectName);
  if (!purpose || purpose.length < 10) return null;
  return purpose;
}

// buildToolPhrase: generates "using Claude and VS Code" style context phrases
// describing HOW tools contributed rather than just listing them.
function buildToolPhrase(tools = [], intentType = 'implementing') {
  return buildToolEcosystemPhrase(tools, intentType);
}

// ─── Duration Qualifier ───────────────────────────────────────────────────────

function buildDurationPhrase(durationMins, isDeepWork, productivityState) {
  if (!durationMins || durationMins < 10) return null;

  const mins = Math.round(durationMins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

  if (isDeepWork && mins >= 60) return `${hours} of deep focus`;
  if (productivityState === 'exploratory') return `${hours} exploratory session`;
  if (mins >= 45) return `${hours} session`;
  return null;
}

// ─── Verb Synonym Rotation ─────────────────────────────────────────────────────
// inferAction() (the high-confidence action-inference override below) is fully
// deterministic — it always returns the same verb for the same activity data,
// which bypassed the variantIndex-based selection in pickHumanVerb() and made
// "Rewrite with AI" produce identical output whenever that override fired
// (the common case for sessions with clear window-title signals). Rotating the
// FINAL chosen verb through a synonym set — after any override — guarantees a
// rewrite always changes the wording, regardless of which path picked it.
const VERB_SYNONYM_PAIRS = {
  implementing: [['Implementing', 'Implemented'], ['Building', 'Built'], ['Developing', 'Developed'], ['Engineering', 'Engineered'], ['Creating', 'Created']],
  debugging:    [['Debugging', 'Debugged'], ['Fixing', 'Fixed'], ['Troubleshooting', 'Troubleshot'], ['Resolving', 'Resolved'], ['Investigating', 'Investigated']],
  reviewing:    [['Reviewing', 'Reviewed'], ['Auditing', 'Audited'], ['Evaluating', 'Evaluated'], ['Assessing', 'Assessed'], ['Inspecting', 'Inspected']],
  refactoring:  [['Refactoring', 'Refactored'], ['Improving', 'Improved'], ['Restructuring', 'Restructured'], ['Optimizing', 'Optimized'], ['Cleaning Up', 'Cleaned up']],
  testing:      [['Testing', 'Tested'], ['Validating', 'Validated'], ['Verifying', 'Verified'], ['QA Testing', 'QA tested']],
  designing:    [['Designing', 'Designed'], ['Crafting', 'Crafted'], ['Prototyping', 'Prototyped'], ['Refining', 'Refined']],
  analyzing:    [['Analyzing', 'Analyzed'], ['Examining', 'Examined'], ['Investigating', 'Investigated'], ['Studying', 'Studied']],
  planning:     [['Planning', 'Planned'], ['Scoping', 'Scoped'], ['Organizing', 'Organized'], ['Strategizing', 'Strategized']],
  documenting:  [['Documenting', 'Documented'], ['Writing', 'Wrote'], ['Drafting', 'Drafted'], ['Composing', 'Composed']],
  researching:  [['Researching', 'Researched'], ['Exploring', 'Explored'], ['Studying', 'Studied'], ['Investigating', 'Investigated']],
  deploying:    [['Deploying', 'Deployed'], ['Shipping', 'Shipped'], ['Releasing', 'Released'], ['Publishing', 'Published']],
  integrating:  [['Integrating', 'Integrated'], ['Connecting', 'Connected'], ['Configuring', 'Configured'], ['Wiring Up', 'Wired up']],
};

export function rotateVerbPair(presentVerb, pastVerb, variantIndex = 0) {
  const key = (presentVerb || '').toLowerCase().trim();
  const variants = VERB_SYNONYM_PAIRS[key];
  if (!variants || !variants.length) return [presentVerb, pastVerb];
  return variants[variantIndex % variants.length];
}

// ─── Verb Selector (per-call, no module-level state) ─────────────────────────
// usedVerbs must be passed in by the caller — do not use module-level mutable state.

function pickHumanVerb(intentType, position = 0, usedVerbs = []) {
  const def = INTENT_TYPES[intentType] || INTENT_TYPES.implementing;
  const verbs = def.verbs;

  for (let i = position; i < verbs.length + position; i++) {
    const verb = verbs[i % verbs.length];
    if (!usedVerbs.slice(-4).includes(verb)) {
      return verb;
    }
  }
  return verbs[position % verbs.length];
}

// ─── Main Humanization Function ───────────────────────────────────────────────

/**
 * Humanize the full reasoning + intent result into natural language output.
 *
 * @param {Object} intent   - from intentInferenceEngine
 * @param {Object} ranking  - from signalRankingEngine
 * @param {Object} reasoning - from contextualReasoningEngine
 * @param {Object} [options]
 * @param {number} [options.variantIndex] - rotates verb choice and sentence
 *   structure so repeated "Rewrite with AI" calls on the same underlying
 *   activity data produce genuinely different phrasing instead of the same
 *   deterministic output every time.
 * @returns {Object} humanizedOutput
 */
export function humanize(intent, ranking, reasoning, options = {}) {
  const variantIndex = options.variantIndex || 0;
  const {
    type: intentType, objective, topPhrases, isContinuing,
    verbs, pastVerbs, isAIDominant,
  } = intent;

  const {
    featureGraph, behaviorProfile, sessionDurationMins,
    workMode, primaryCategory, project, compressed,
  } = reasoning;

  const topFeature  = featureGraph?.activeCluster?.[0];
  const secondFeat  = featureGraph?.activeCluster?.[1];
  const phrases     = topPhrases.length ? topPhrases : getTopPhrases(ranking);

  // Tools clause: always list all meaningful apps so the description names the
  // actual tools used (VS Code, Figma, Claude, ChatGPT, Codex, etc.).
  // We no longer suppress AI tools — the user explicitly chose these tools and
  // the description should reflect that.
  const rawTools = getMeaningfulTools(ranking);
  const tools = rawTools;

  // ── Build the activity phrase ──────────────────────────────────────────────
  // Always try window title phrases first via buildActivityPhrase (it now
  // filters feature labels and app names). Only fall through to AI-tool app
  // context phrases when there are genuinely no meaningful window titles.
  let activityPhrase = buildActivityPhrase(intentType, topFeature?.featureId, phrases);

  // When AI tools dominate and no real window-title phrase was found, describe
  // what was done INSIDE the primary AI tool instead of leaving a bare app name.
  if (isAIDominant && (!activityPhrase || activityPhrase === 'feature development and implementation')) {
    const primaryAIApp = (compressed?.apps || [])
      .filter(a => AI_WORKSPACE_APPS.has((a.normalizedName || a.name || '').toLowerCase()))
      .sort((a, b) => (b.totalSecs || 0) - (a.totalSecs || 0))[0];
    const aiAppName = primaryAIApp?.name || 'Claude';
    const aiPhrases = APP_CONTEXT_PHRASES[aiAppName] || APP_CONTEXT_PHRASES['Claude'];
    activityPhrase = aiPhrases[intentType] || aiPhrases._default;
  }

  // ── Build the context phrase ───────────────────────────────────────────────
  const contextPhrase = buildContextPhrase(
    intentType,
    secondFeat?.featureId,
    phrases.slice(1),
  );

  // ── Verb selection ──────────────────────────────────────────────────────────
  // variantIndex offsets the verb pick so a rewrite never repeats the same verb
  // as the previous one for identical underlying activity data.
  const sessionUsedVerbs = reasoning._usedVerbs || [];
  const presentVerb  = pickHumanVerb(intentType, variantIndex, sessionUsedVerbs);
  const pastVerb     = (pastVerbs || ['Worked on'])[variantIndex % (pastVerbs?.length || 1)] || 'Worked on';

  // ── Tool phrase ─────────────────────────────────────────────────────────────
  const toolPhrase = buildToolPhrase(tools, intentType);

  // ── Duration qualifier ──────────────────────────────────────────────────────
  const durationPhrase = buildDurationPhrase(
    sessionDurationMins || reasoning.compressed?.totalActiveMins,
    behaviorProfile?.isDeepWork,
    behaviorProfile?.productivityState,
  );

  // ── Action Inference override ──────────────────────────────────────────────
  // Call inferAction to detect a high-confidence "Action + Specific Subject"
  // pair BEFORE building the title from generic phrase aggregation.
  // This turns "Inspecting Productivity" → "Reviewing AI Implementation".
  const actionInferred = inferAction(
    compressed || {},
    behaviorProfile || {},
    { project }
  );
  let finalVerb = presentVerb;
  let finalActivity = activityPhrase;
  let chosenPastVerb = pastVerb;

  // High-confidence action inference override — replaces the humanization pipeline
  // output when a better, more specific title can be inferred directly from signals.
  //
  // Guards (all must pass):
  //   1. hasSubject + confidence >= 0.80
  //   2. Source is not a low-quality fallback (work_mode_fallback, primary_app)
  //   3. Source is not 'ide_filename' — file-derived subjects are internal jargon
  //      ("Workflow Dominance Engine") that users don't recognize on their calendar
  //   4. Subject is not a generic word/phrase (prevents "Building System" overrides)
  //   5. isTitleAcceptable — passes the hard-blocked-pattern QA check
  if (actionInferred.hasSubject && actionInferred.confidence >= 0.80 &&
      !['work_mode_fallback', 'primary_app', 'ide_filename'].includes(actionInferred.source) &&
      !isGenericSubject(actionInferred.subject)) {
    const candidateTitle = `${actionInferred.verb} ${actionInferred.subject}`;
    if (isTitleAcceptable(candidateTitle)) {
      finalVerb     = actionInferred.verb;
      finalActivity = actionInferred.subject;
      chosenPastVerb = actionInferred.pastVerb;
    }
  }

  // Rotate to a synonymous verb pair keyed on variantIndex. This runs AFTER the
  // action-inference override above so a rewrite still changes wording even
  // when that deterministic override fires (see VERB_SYNONYM_PAIRS comment).
  const rotatedVerbPair = rotateVerbPair(finalVerb, chosenPastVerb, variantIndex);
  finalVerb = rotatedVerbPair[0];
  chosenPastVerb = rotatedVerbPair[1];

  // ── Title: [Verb] [activity] ────────────────────────────────────────────────
  const title = buildTitle(finalVerb, finalActivity, project);

  // ── Description: rich sentence ──────────────────────────────────────────────
  const description = buildDescription(
    chosenPastVerb,
    finalActivity,
    contextPhrase,
    toolPhrase,
    durationPhrase,
    intent,
    project,
    variantIndex,
  );

  // ── Productivity note ───────────────────────────────────────────────────────
  const productivityNote = buildProductivityNote(
    intent, reasoning, durationPhrase,
  );

  // ── Quality score ───────────────────────────────────────────────────────────
  const qualityScore = computeQuality(title, description, intent);

  return {
    title,
    description,
    productivityNote,
    activityPhrase: finalActivity,
    contextPhrase,
    toolPhrase,
    qualityScore,
    intentType,
    presentVerb: finalVerb,
    pastVerb,
    actionSource: actionInferred.source,
    // Expose the raw inferAction result so callers on the orchestrator path can
    // pass it to generateTitle() as precomputedInference, avoiding the double
    // inferAction() call (R-04 fix).
    actionInferred,
  };
}

// ─── Title Builder ────────────────────────────────────────────────────────────

const LEADING_GERUND_RE = /^[A-Za-z]+ing\s+/;

function buildTitle(verb, activity, project) {
  // Strip a leading gerund from activity to prevent "Reviewing reviewing..." patterns.
  const cleanActivity = activity.replace(LEADING_GERUND_RE, '');

  let title;
  if (project?.name && !cleanActivity.toLowerCase().includes(project.name.toLowerCase())) {
    const wordCount = cleanActivity.split(/\s+/).length;
    const hasProperNouns = (cleanActivity.match(/[A-Z][a-z]/g) || []).length >= 2;
    const isShortGeneric = wordCount <= 3 && !hasProperNouns;
    title = isShortGeneric
      ? `${verb} ${project.name} ${cleanActivity}`
      : `${verb} ${cleanActivity}`;
  } else {
    title = `${verb} ${cleanActivity}`;
  }

  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 68) title = title.slice(0, 65).trim() + '…';

  // ── Quality guard ──────────────────────────────────────────────────────────
  // If the generated title has an all-generic subject, escalate to the
  // feature-context fallback rather than returning a meaningless title.
  const { rejected, reason } = checkTitleRejectPatterns(title);
  if (rejected) {
    // Escalation: use the feature-context fallback from intentType if we have one
    // (caller will receive null and should fall through to narrativeSynthesisEngine)
    return null;
  }

  return title;
}

// ─── Description Builder ──────────────────────────────────────────────────────

function buildDescription(pastVerb, activity, context, _tools, duration, intent, project, variantIndex = 0) {
  // Strip leading gerunds to prevent double-verb patterns like "Reviewed reviewing..."
  const cleanActivity = activity.replace(LEADING_GERUND_RE, '');
  const cleanContext  = context ? context.replace(LEADING_GERUND_RE, '') : null;

  // Main clause: what was done.
  // IMPORTANT: Only append context when the activity doesn't already contain " and "
  // — if it does, appending another "and X" creates audit-report chaining ("X and Y and Z").
  // variantIndex rotates through SENTENCE_STRUCTURES so repeated rewrites of the
  // same activity data read differently instead of producing identical text.
  const activityHasConjunction = cleanActivity.includes(' and ');
  let mainClause;
  if (cleanContext && !activityHasConjunction) {
    const structure = SENTENCE_STRUCTURES[variantIndex % SENTENCE_STRUCTURES.length];
    mainClause = structure(pastVerb, cleanActivity, cleanContext).replace(/\.$/, '');
  } else {
    mainClause = `${pastVerb} ${cleanActivity}`;
  }

  // Purpose clause: WHY it was done — replaces the old "using [tools]" clause
  const intentType   = intent?.type || 'implementing';
  // Pass the primary subject only (before any "and") to the purpose function
  // so domain matching works on a specific noun, not a compound chain.
  const primarySubject = cleanActivity.split(' and ')[0].trim();
  const purposePhrase = buildPurposePhrase(intentType, primarySubject, project);

  // Assemble: main clause + purpose + duration (no tool list)
  let sentence = purposePhrase
    ? `${mainClause} ${purposePhrase}.`
    : `${mainClause}.`;

  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);

  const note = duration ? ` ${capitalizeFirst(duration)}.` : '';
  return (sentence + note).trim();
}

function capitalizeFirst(str = '') {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ─── Productivity Note Builder ────────────────────────────────────────────────

function buildProductivityNote(intent, reasoning, durationPhrase) {
  const { behaviorProfile, compressed } = reasoning;
  const { isDeepWork, isSustainedWork, productivityState } = behaviorProfile || {};
  const durationMins = reasoning.sessionDurationMins || compressed?.totalActiveMins || 0;
  const contextSwitches = compressed?.contextSwitches || 0;
  const dur = Math.round(durationMins);

  const actLabel = WORKFLOW_CONTEXT_PHRASES[intent.type]?._default || 'focused work';

  if (isDeepWork && dur >= 90) {
    return `${dur}-min deep focus session of ${actLabel} with minimal context switching.`;
  }
  if (isDeepWork && dur >= 60) {
    return `Sustained ${dur}-min ${actLabel} session with strong focus.`;
  }
  if (productivityState === 'exploratory') {
    return `${dur}-min exploratory session — ${actLabel}.`;
  }
  if (isSustainedWork) {
    return `Productive ${dur}-min session of ${actLabel}.`;
  }
  if (contextSwitches > 25) {
    return `${dur}-min fragmented session — ${contextSwitches} context switches reduced sustained focus.`;
  }
  return `${dur}-min ${actLabel} session.`;
}

// ─── Quality Score ────────────────────────────────────────────────────────────

function computeQuality(title, description, intent) {
  if (!title) return 0;
  // Delegate entirely to narrativeQualityEngine — eliminates the inline duplicate
  const report = checkNarrativeQuality(title, description || '');
  return report.compositeScore;
}

/**
 * Quick humanization for a single text string (window title, app name, etc.).
 * Used for spot normalization without full pipeline.
 */
export function humanizeTerm(term = '') {
  return humanizeTechTerm(term);
}

/**
 * Generate a workflow description from just a work mode and feature.
 * Lightweight fallback when full pipeline isn't available.
 */
export function quickWorkflowPhrase(workMode, featureId) {
  const phrases = WORKFLOW_CONTEXT_PHRASES[workMode] || WORKFLOW_CONTEXT_PHRASES.implementing;
  return phrases[featureId] || phrases._default || 'feature development';
}
