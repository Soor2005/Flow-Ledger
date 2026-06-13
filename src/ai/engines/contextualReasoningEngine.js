/**
 * Contextual Reasoning Engine — v2
 * Core intelligence orchestration layer.
 *
 * Combines signals from all sub-engines to reason about:
 * - What the user is building or accomplishing (feature/system level)
 * - Why they are working on it (intent and objective)
 * - How workflows evolve over multiple sessions (continuity)
 * - What stage of implementation they are in (phase detection)
 *
 * v2 improvements:
 * - Workblock-aware reasoning: integrates fusedWorkblock context
 * - Multi-session feature evolution tracking via semantic memory
 * - Implementation phase inference (explore → build → refine → ship)
 * - Richer intent building using ontology intent-feature phrases
 */

import { compressContext } from './contextCompressionEngine.js';
import { inferBehavior } from './behaviorInferenceEngine.js';
import { analyzeContinuity } from './sessionContinuityEngine.js';
import { updateAndQueryGraph } from './featureGraphEngine.js';
import { resolveWorkflowState } from './workflowStateEngine.js';
import { semanticMemory } from './semanticMemoryEngine.js';
import { getIntentFeaturePhrase } from './productivityOntologyEngine.js';

// ─── Reasoning Cache ──────────────────────────────────────────────────────────

const reasoningCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function getCachedReasoning(fingerprint) {
  const entry = reasoningCache.get(fingerprint);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    reasoningCache.delete(fingerprint);
    return null;
  }
  return entry.result;
}

function setCachedReasoning(fingerprint, result) {
  reasoningCache.set(fingerprint, { result, ts: Date.now() });
  if (reasoningCache.size > 20) {
    const firstKey = reasoningCache.keys().next().value;
    reasoningCache.delete(firstKey);
  }
}

// ─── Feature Evolution Tracking ───────────────────────────────────────────────
// Detects how features are evolving across sessions using semantic memory.

function detectFeatureEvolution(featureGraph) {
  if (!featureGraph?.activeCluster?.length) return null;

  const topFeatureId = featureGraph.activeCluster[0]?.featureId;
  if (!topFeatureId) return null;

  // Pull sessions that touched this feature from semantic memory
  const relatedSessions = semanticMemory.recallByFeature([topFeatureId], 10);
  if (relatedSessions.length < 2) return null;

  const titles = relatedSessions.map(r => r.session.title).filter(Boolean);
  const modes  = relatedSessions.map(r => r.session.workMode).filter(Boolean);

  // Detect if this feature has moved from research → build → refine
  const modeProgression = [...new Set(modes)];
  const hasProgressed = modeProgression.length >= 2;

  return {
    featureId: topFeatureId,
    sessionCount: relatedSessions.length,
    recentTitles: titles.slice(0, 3),
    modeProgression,
    hasProgressed,
    isEstablishedWork: relatedSessions.length >= 4,
  };
}

// ─── Intent Inference ─────────────────────────────────────────────────────────

function inferUserIntent(compressed, behaviorProfile, continuityProfile, featureGraph) {
  const { workMode, isDeepWork, isSustainedWork, isExploratory } = behaviorProfile;
  const { activeObjective, isContinuingWork, continuityConfidence } = continuityProfile || {};
  const { topFeature, activeSystem } = featureGraph || {};

  // Primary intent: what is the user trying to accomplish?
  let primaryIntent = null;
  let intentConfidence = 0;

  // Priority 1: intent-feature phrase from ontology (highest specificity)
  const topFeatureId = featureGraph?.activeCluster?.[0]?.featureId;
  const ontologyPhrase = topFeatureId
    ? getIntentFeaturePhrase(workMode?.replace('deep_', ''), topFeatureId) ||
      getIntentFeaturePhrase('implementing', topFeatureId)
    : null;

  if (ontologyPhrase && topFeature) {
    primaryIntent = ontologyPhrase;
    intentConfidence = Math.min((topFeature.activationScore || 0.5) * 0.8 + 0.3, 0.92);
  }
  // Priority 2: active continuity objective + feature graph alignment
  else if (activeObjective && topFeature && continuityConfidence >= 0.4) {
    primaryIntent = activeObjective.description;
    intentConfidence = Math.min(continuityConfidence + 0.2, 0.9);
  }
  // Priority 3: feature graph + system — construct from mode + feature
  else if (topFeature && activeSystem) {
    const modeVerb = getModeVerb(workMode);
    primaryIntent = `${modeVerb} the ${topFeature.label.toLowerCase()}`;
    intentConfidence = Math.min((topFeature.activationScore || 0.5) * 0.8 + 0.2, 0.75);
  }
  // Priority 4: title phrases
  else if (compressed.titlePhrases?.length) {
    const topPhrase = compressed.titlePhrases[0].phrase;
    primaryIntent = deriveIntentFromPhrase(topPhrase, workMode);
    intentConfidence = 0.55;
  }
  // Priority 5: fallback
  else {
    primaryIntent = getFallbackIntent(workMode, compressed.primaryCategory);
    intentConfidence = 0.35;
  }

  // Secondary intent: what's the immediate sub-task?
  const immediateTask = inferImmediateTask(compressed, behaviorProfile);

  return {
    primaryIntent,
    immediateTask,
    intentConfidence: Math.round(intentConfidence * 100) / 100,
    isContinuing: isContinuingWork || false,
    isNewWorkArea: !isContinuingWork && continuityConfidence < 0.2,
  };
}

function getModeVerb(workMode) {
  const verbs = {
    deep_implementation: 'implementing',
    debugging: 'fixing issues in',
    design_work: 'designing',
    research: 'researching',
    planning: 'planning',
    refactoring: 'refactoring',
    documentation: 'documenting',
    code_review: 'reviewing',
    testing: 'testing',
  };
  return verbs[workMode] || 'working on';
}

function getModeActionVerb(workMode) {
  const verbs = {
    deep_implementation: 'Implementing',
    debugging: 'Debugging',
    design_work: 'Designing',
    research: 'Researching',
    planning: 'Planning',
    refactoring: 'Refactoring',
    documenting: 'Documenting',
    documentation: 'Documenting',
    code_review: 'Reviewing',
    testing: 'Testing',
  };
  return verbs[workMode] || 'Building';
}

function deriveIntentFromPhrase(phrase, workMode) {
  // Strip leading verb from phrase if present
  const leadingVerbPattern = /^(building|implementing|designing|creating|developing|fixing|debugging|testing|writing|researching|refactoring|reviewing|planning|improving|adding|updating|working\s+on)\s+/i;
  const match = phrase.match(leadingVerbPattern);
  if (match) {
    const object = phrase.slice(match[0].length).trim();
    if (object.length > 4) return `${getModeVerb(workMode)} ${object}`;
  }
  return getModeVerb(workMode) + ' ' + phrase;
}

function getFallbackIntent(workMode, primaryCategory) {
  const categoryIntents = {
    development: 'building and improving the codebase',
    design: 'designing and refining UI',
    writing: 'writing and documenting',
    research: 'researching and exploring',
    planning: 'planning and organizing work',
  };
  return categoryIntents[primaryCategory] || getModeVerb(workMode) + ' the product';
}

function inferImmediateTask(compressed, behaviorProfile) {
  // Best title phrase = most likely immediate task
  const topPhrase = compressed.titlePhrases?.[0]?.phrase;
  if (!topPhrase) return null;

  // Clean verb prefix
  const clean = topPhrase.replace(/^(building|implementing|designing|creating|developing|fixing|debugging|testing|writing|researching)\s+/i, '').trim();
  return clean.length >= 5 ? clean : null;
}

// ─── Reasoning Evidence Assembly ──────────────────────────────────────────────

function assembleReasoningEvidence(compressed, behaviorProfile, continuityProfile, featureGraph) {
  const evidence = [];

  // Workspace context evidence — describe the work environment, not list apps
  if (compressed.apps?.length) {
    const primaryCategory = compressed.primaryCategory || 'development';
    const isAIWorkspace   = compressed.isAIWorkspace;
    const workspaceLabel  = isAIWorkspace ? 'AI-assisted workspace'
      : primaryCategory === 'design'   ? 'Design workspace'
      : primaryCategory === 'research' ? 'Research and analysis environment'
      : primaryCategory === 'planning' ? 'Planning and documentation environment'
      : 'Development environment';
    evidence.push({ type: 'workspace', signal: workspaceLabel, weight: 0.5 });
  }

  // Title phrase evidence (strongest signal)
  if (compressed.titlePhrases?.length) {
    const topPhrase = compressed.titlePhrases[0].phrase;
    evidence.push({ type: 'title', signal: `Window: "${topPhrase}"`, weight: 0.9 });
  }

  // Feature activation evidence
  if (featureGraph?.activeCluster?.length) {
    const features = featureGraph.activeCluster.slice(0, 2).map(f => f.label).join(' + ');
    evidence.push({ type: 'feature', signal: `Active: ${features}`, weight: 0.8 });
  }

  // Continuity evidence
  if (continuityProfile?.isContinuingWork) {
    evidence.push({ type: 'continuity', signal: `Continuing from ${continuityProfile.continuityConfidence >= 0.7 ? 'recent' : 'related'} sessions`, weight: 0.7 });
  }

  // Behavioral evidence
  if (behaviorProfile?.isDeepWork) {
    evidence.push({ type: 'behavior', signal: 'Deep focus work session', weight: 0.5 });
  }

  return evidence.sort((a, b) => b.weight - a.weight);
}

// ─── Purpose/Outcome Context Builders ────────────────────────────────────────
// These produce WHY and WHAT OUTCOME the user was targeting, used by
// narrativeSynthesisEngine to generate human-quality, outcome-driven descriptions.

function buildPurposeContext(intentResult, continuityProfile, featureGraph, compressed) {
  // If we have a continuing objective, purpose = continuing that objective
  if (continuityProfile?.isContinuingWork && continuityProfile?.activeObjective?.description) {
    return { type: 'continuation', description: continuityProfile.activeObjective.description };
  }

  // Purpose from the top active feature
  const topFeature = featureGraph?.topFeature;
  if (topFeature) {
    const purposeMap = {
      ai_engine: 'to improve contextual reasoning accuracy and intelligence quality',
      session_tracking: 'to improve session tracking accuracy and classification reliability',
      productivity_analytics: 'to enhance productivity insight generation and reporting accuracy',
      calendar_system: 'to improve calendar scheduling and event management quality',
      planning_system: 'to advance scheduling intelligence and planning capabilities',
      ui_components: 'to improve user experience quality and interaction clarity',
      data_persistence: 'to improve data reliability and storage layer performance',
      reports: 'to improve reporting accuracy and export workflow quality',
      notifications: 'to improve notification delivery and alert reliability',
    };
    const desc = purposeMap[topFeature.featureId];
    if (desc) return { type: 'feature_purpose', featureId: topFeature.featureId, description: desc };
  }

  // Purpose from primary intent type
  const intentType = intentResult?.primaryIntent?.includes('implementing') ? 'implementing'
    : intentResult?.primaryIntent?.includes('fix') ? 'debugging'
    : intentResult?.primaryIntent?.includes('review') ? 'reviewing'
    : 'implementing';

  return {
    type: 'intent_purpose',
    intentType,
    description: intentResult?.primaryIntent || null,
  };
}

function buildOutcomeContext(intentResult, continuityProfile, featureGraph) {
  const topFeature = featureGraph?.topFeature;
  if (!topFeature) return null;

  // Map feature + intent to a specific expected outcome
  const OUTCOME_MAP = {
    'implementing+ai_engine': 'stronger contextual reasoning with improved intelligence accuracy',
    'debugging+ai_engine': 'AI reasoning errors resolved and correct inference restored',
    'reviewing+ai_engine': 'AI intelligence implementation evaluated with improvements identified',
    'implementing+session_tracking': 'more accurate session tracking with improved activity classification',
    'debugging+session_tracking': 'session tracking data accuracy restored and bugs resolved',
    'implementing+productivity_analytics': 'richer productivity insights with improved data accuracy',
    'reviewing+productivity_analytics': 'analytics implementation reviewed with accuracy improvements identified',
    'implementing+calendar_system': 'enhanced calendar scheduling with improved event management',
    'debugging+calendar_system': 'calendar scheduling errors resolved and event handling restored',
    'implementing+ui_components': 'improved UI components with better interaction quality',
    'debugging+ui_components': 'UI rendering issues resolved and interaction behavior corrected',
  };

  const intentPrefix = intentResult?.primaryIntent?.includes('fix') ? 'debugging'
    : intentResult?.primaryIntent?.includes('review') ? 'reviewing'
    : 'implementing';

  const key = `${intentPrefix}+${topFeature.featureId}`;
  return OUTCOME_MAP[key] ? { description: OUTCOME_MAP[key], featureId: topFeature.featureId } : null;
}

// ─── Overall Reasoning Confidence ────────────────────────────────────────────

function computeOverallConfidence(compressed, behaviorProfile, intentResult, continuityProfile) {
  const weights = {
    signalStrength: compressed.signalStrength / 100 * 0.25,
    behaviorConfidence: (behaviorProfile?.inferenceConfidence || 0) * 0.25,
    intentConfidence: (intentResult?.intentConfidence || 0) * 0.30,
    continuityConfidence: (continuityProfile?.continuityConfidence || 0) * 0.20,
  };

  const total = Object.values(weights).reduce((sum, v) => sum + v, 0);
  return Math.round(Math.min(total, 0.95) * 100) / 100;
}

// ─── Main Reasoning Function ──────────────────────────────────────────────────

/**
 * Run the full contextual reasoning pipeline on raw auto-sessions.
 *
 * @param {Object} input - { autoSessions, project, client, existingTitle, timestamp }
 * @returns {Object} reasoningResult — full contextual intelligence output
 */
export async function reason(input = {}) {
  const {
    autoSessions = [],
    project = null,
    client = null,
    existingTitle = '',
    timestamp = null,
  } = input;

  // ── Step 1: Compress raw tracking data ──────────────────────────────────
  const compressed = compressContext(autoSessions);

  // ── Step 2: Infer behavioral profile ────────────────────────────────────
  const behaviorProfile = inferBehavior(compressed);

  // ── Step 3: Update feature graph and query active cluster ────────────────
  const featureGraph = updateAndQueryGraph(compressed.features || []);

  // ── Step 4: Analyze session continuity ──────────────────────────────────
  const continuityProfile = analyzeContinuity(
    compressed,
    behaviorProfile,
    existingTitle,
    timestamp,
  );

  // ── Step 5: Resolve workflow state ───────────────────────────────────────
  const workflowState = resolveWorkflowState(
    compressed,
    behaviorProfile,
    continuityProfile,
    featureGraph,
  );

  // ── Step 6: Infer user intent ────────────────────────────────────────────
  const intentResult = inferUserIntent(compressed, behaviorProfile, continuityProfile, featureGraph);

  // ── Step 7: Feature evolution tracking ──────────────────────────────────
  const featureEvolution = detectFeatureEvolution(featureGraph);

  // ── Step 8: Assemble reasoning evidence ─────────────────────────────────
  const evidence = assembleReasoningEvidence(compressed, behaviorProfile, continuityProfile, featureGraph);

  // ── Step 9: Compute overall confidence ──────────────────────────────────
  const overallConfidence = computeOverallConfidence(compressed, behaviorProfile, intentResult, continuityProfile);

  return {
    // Primary outputs for narrative synthesis
    primaryIntent: intentResult.primaryIntent,
    immediateTask: intentResult.immediateTask,
    intentConfidence: intentResult.intentConfidence,
    isContinuingWork: intentResult.isContinuing,

    // Context layers
    compressed,
    behaviorProfile,
    featureGraph,
    continuityProfile,
    workflowState,

    // Intelligence summary
    activeObjective: continuityProfile?.activeObjective,
    currentFeature: continuityProfile?.currentFeature,
    activeSystem: featureGraph?.activeSystem,
    activitySummary: workflowState?.activitySummary,
    featureEvolution,

    // Confidence & evidence
    overallConfidence,
    evidence,

    // Shortcuts for narrative synthesis
    workMode: behaviorProfile?.workMode?.primary || 'deep_implementation',
    productivityState: behaviorProfile?.productivityState || 'focused_work',
    isDeepWork: behaviorProfile?.isDeepWork || false,
    isSustainedWork: behaviorProfile?.isSustainedWork || false,
    primaryCategory: compressed.primaryCategory,
    primaryApp: compressed.primaryApp,
    topFeature: featureGraph?.topFeature,
    project,
    client,

    // Purpose/outcome inference — exposes WHY and WHAT OUTCOME for narrative engines
    // Derived from the highest-fidelity available signal (feature, objective, or intent type)
    purposeContext: buildPurposeContext(intentResult, continuityProfile, featureGraph, compressed),
    outcomeContext: buildOutcomeContext(intentResult, continuityProfile, featureGraph),
  };
}

/**
 * @deprecated Use `orchestrateSync()` from `reasoningOrchestrator.js` instead.
 *
 * This is the Generation 2 (9-step) synchronous reasoning path. It has been
 * superseded by the Generation 3 (12-stage) orchestrator which adds:
 *   - workflowOwnershipEngine (9-tier attribution model)
 *   - narrativeQAEngine (automated quality gate with retry)
 *   - per-call verb tracking (no cross-session repetition)
 *   - segmentation→compression wiring
 *   - project-isolated featureGraph queries
 *
 * Kept for backwards compatibility only. Do NOT call from new code.
 *
 * @param {Array}  autoSessions
 * @param {Object} project
 * @param {Object} client
 * @param {number} [sessionDurationMins] - actual session duration (not just active time)
 */
export function reasonSync(autoSessions = [], project = null, client = null, sessionDurationMins = null) {
  const compressed = compressContext(autoSessions);
  const behaviorProfile = inferBehavior(compressed);
  const featureGraph = updateAndQueryGraph(compressed.features || []);

  const intentResult = inferUserIntent(compressed, behaviorProfile, null, featureGraph);

  return {
    primaryIntent: intentResult.primaryIntent,
    immediateTask: intentResult.immediateTask,
    compressed,
    behaviorProfile,
    featureGraph,
    workMode: behaviorProfile?.workMode?.primary || 'deep_implementation',
    productivityState: behaviorProfile?.productivityState || 'focused_work',
    isDeepWork: behaviorProfile?.isDeepWork || false,
    primaryCategory: compressed.primaryCategory,
    primaryApp: compressed.primaryApp,
    topFeature: featureGraph?.topFeature,
    // Session-level duration (more accurate than compressed active time)
    sessionDurationMins: sessionDurationMins ?? compressed.totalActiveMins,
    project,
    client,
    overallConfidence: Math.round(
      (compressed.signalStrength / 100 * 0.4 + intentResult.intentConfidence * 0.6) * 100
    ) / 100,
  };
}

// getModeActionVerb is intentionally NOT exported.
// The canonical verb lookup is INTENT_TYPES[mode].verbs[0] via intentInferenceEngine.js.
// Any previous import of getModeActionVerb from this file was a dead reference —
// see project_narrative_refactor.md for the removal history.
