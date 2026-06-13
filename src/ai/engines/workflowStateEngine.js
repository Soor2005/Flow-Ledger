/**
 * Workflow State Engine
 * Understands the higher-level state of the user's work:
 * not just "what app" but "what phase of the product lifecycle" they're in.
 *
 * Infers: implementing, debugging, planning, refining, shipping, etc.
 * Also infers more nuanced states: "fixing rendering issues", "refining UX",
 * "building feature infrastructure", "analyzing performance".
 */

import { WORKFLOW_ARCHETYPES } from './productivityOntologyEngine.js';

// ─── Compound Workflow States ─────────────────────────────────────────────────
// More specific than archetypes — these combine archetype + feature context

const COMPOUND_STATES = {
  building_feature: {
    label: 'Building feature infrastructure',
    requires: { mode: ['deep_implementation'], features: ['session_tracking', 'calendar_system', 'event_management', 'ai_engine', 'planning_system'] },
    verbPhrase: 'building and implementing',
  },
  fixing_rendering: {
    label: 'Fixing UI rendering issues',
    requires: { mode: ['debugging'], features: ['ui_components', 'calendar_system'] },
    verbPhrase: 'debugging and fixing',
  },
  refining_ux: {
    label: 'Refining UX interaction states',
    requires: { mode: ['designing', 'refactoring'], features: ['ui_components'] },
    verbPhrase: 'refining and improving',
  },
  improving_intelligence: {
    label: 'Improving AI intelligence',
    requires: { mode: ['deep_implementation', 'refactoring', 'research'], features: ['ai_engine'] },
    verbPhrase: 'developing and refining',
  },
  analyzing_productivity: {
    label: 'Building productivity analytics',
    requires: { mode: ['deep_implementation', 'research'], features: ['productivity_analytics', 'reports'] },
    verbPhrase: 'analyzing and building',
  },
  optimizing_data_layer: {
    label: 'Optimizing data persistence',
    requires: { mode: ['deep_implementation', 'refactoring', 'debugging'], features: ['data_persistence'] },
    verbPhrase: 'optimizing and refactoring',
  },
  writing_tests: {
    label: 'Writing and running tests',
    requires: { mode: ['testing'] },
    verbPhrase: 'testing and validating',
  },
  planning_architecture: {
    label: 'Planning system architecture',
    requires: { mode: ['planning', 'research'] },
    verbPhrase: 'planning and architecting',
  },
  documenting_system: {
    label: 'Documenting the system',
    requires: { mode: ['documenting'] },
    verbPhrase: 'writing and documenting',
  },
  reviewing_architecture: {
    label: 'Reviewing system architecture',
    requires: { mode: ['code_review', 'research', 'analyzing'], features: ['ai_engine', 'calendar_system', 'session_tracking', 'data_persistence'] },
    verbPhrase: 'reviewing and evaluating',
  },
  evaluating_integrations: {
    label: 'Evaluating system integrations',
    requires: { mode: ['code_review', 'research'] },
    verbPhrase: 'evaluating and analyzing',
  },
  ai_assisted_investigation: {
    label: 'AI-assisted architecture investigation',
    requires: { mode: ['research', 'analyzing'] },
    verbPhrase: 'investigating and analyzing',
  },
  improving_ai_systems: {
    label: 'Improving AI intelligence systems',
    requires: { mode: ['deep_implementation', 'refactoring', 'research', 'code_review'], features: ['ai_engine'] },
    verbPhrase: 'developing and improving',
  },
};

// ─── State Resolution ─────────────────────────────────────────────────────────

function resolveCompoundState(workMode, activeFeatureIds) {
  const featureSet = new Set(activeFeatureIds);

  for (const [stateId, state] of Object.entries(COMPOUND_STATES)) {
    const modeMatch = state.requires.mode.includes(workMode);
    const featureMatch = !state.requires.features ||
      state.requires.features.some(f => featureSet.has(f));

    if (modeMatch && featureMatch) {
      return { stateId, ...state };
    }
  }

  return null;
}

// ─── Implementation Phase Inference ──────────────────────────────────────────
// Infers where in the feature lifecycle the user is

function inferImplementationPhase(recentModes, sessionCount) {
  const modeFreq = {};
  for (const m of recentModes) modeFreq[m] = (modeFreq[m] || 0) + 1;

  const total = recentModes.length || 1;
  const implementRatio = (modeFreq.deep_implementation || 0) / total;
  const debugRatio = (modeFreq.debugging || 0) / total;
  const refactorRatio = (modeFreq.refactoring || 0) / total;
  const testRatio = (modeFreq.testing || 0) / total;
  const planRatio = (modeFreq.planning || 0) / total;

  // Heavy planning with little implementation → early phase
  if (planRatio >= 0.5) {
    return { phase: 'initial', label: 'Initial planning', confidence: 0.80 };
  }

  // Heavy implementation, few bugs → building
  if (implementRatio >= 0.5 && debugRatio < 0.2) {
    return { phase: 'building', label: 'Actively building', confidence: 0.82 };
  }

  // Mix of implementation + debugging → iterating
  if (implementRatio >= 0.3 && debugRatio >= 0.2) {
    return { phase: 'iterating', label: 'Iterating and fixing', confidence: 0.78 };
  }

  // Heavy debugging → stabilizing
  if (debugRatio >= 0.4) {
    return { phase: 'stabilizing', label: 'Stabilizing and fixing', confidence: 0.75 };
  }

  // Heavy refactoring → polishing
  if (refactorRatio >= 0.3) {
    return { phase: 'polishing', label: 'Polishing and refining', confidence: 0.72 };
  }

  // Testing or docs → wrapping up
  if (testRatio >= 0.3) {
    return { phase: 'finishing', label: 'Testing and finishing', confidence: 0.70 };
  }

  return { phase: 'iterating', label: 'Iterating', confidence: 0.50 };
}

// ─── Context Richness Assessment ──────────────────────────────────────────────

function assessContextRichness(compressed, continuityProfile) {
  const scores = {
    signalStrength: compressed.signalStrength / 100,
    hasFeatures: compressed.features?.length > 0 ? 0.8 : 0,
    hasTitlePhrases: compressed.titlePhrases?.length > 0 ? 0.9 : 0,
    isContinuing: continuityProfile?.isContinuingWork ? 0.7 : 0.3,
  };

  const weights = { signalStrength: 0.3, hasFeatures: 0.25, hasTitlePhrases: 0.3, isContinuing: 0.15 };
  const richness = Object.entries(scores).reduce((sum, [k, v]) => sum + v * weights[k], 0);

  return Math.round(richness * 100) / 100;
}

// ─── Workflow Activity Summary ────────────────────────────────────────────────

function buildActivitySummary(workMode, compoundState, implementationPhase, featureGraph) {
  const modeLabel  = WORKFLOW_ARCHETYPES[workMode]?.narrative || `${workMode} work`;
  const topFeature = featureGraph?.topFeature?.label;
  const phaseLabel = implementationPhase?.label || 'iterating';

  // Compound state gives the most specific label
  if (compoundState) return compoundState.label;

  // Build a workflow-first description: "phase on feature" — never just the feature name
  if (topFeature) {
    // Use mode-specific preposition for better narrative
    const verb = WORKFLOW_ARCHETYPES[workMode]?.narrative?.split(' ')[0] || 'iterating on';
    return `${verb} ${topFeature.toLowerCase()}`;
  }

  // Pure mode label as fallback — "implementing and building", not just the mode key
  return modeLabel;
}

// ─── Main Workflow State Resolver ─────────────────────────────────────────────

/**
 * Resolve the complete workflow state from all available intelligence.
 *
 * @param {Object} compressed - context compression output
 * @param {Object} behaviorProfile - behavioral inference output
 * @param {Object} continuityProfile - session continuity output
 * @param {Object} featureGraph - feature graph output
 * @returns {Object} workflowState
 */
export function resolveWorkflowState(compressed, behaviorProfile, continuityProfile, featureGraph) {
  const workMode = behaviorProfile?.workMode?.primary || 'deep_implementation';
  const activeFeatureIds = compressed.features?.map(f => f.featureId) || [];

  // Try compound state first (most specific)
  const compoundState = resolveCompoundState(workMode, activeFeatureIds);

  // Infer phase from continuity data
  const recentModes = [workMode, ...(continuityProfile?.workflowStage?.signals || [])];
  const implementationPhase = inferImplementationPhase(recentModes, 5);

  // Context richness
  const contextRichness = assessContextRichness(compressed, continuityProfile);

  // Build activity summary
  const baseActivitySummary = buildActivitySummary(workMode, compoundState, implementationPhase, featureGraph);

  // ── Dominance-aware activity summary ─────────────────────────────────────
  // When the dominance engine has identified a strong primary workflow, use its
  // label to ground the activity summary rather than inferring from mode alone.
  const dominantWorkflowLabel = compressed.dominantWorkflowLabel || null;
  const dominanceScore        = compressed.dominanceScore || 0;
  const activitySummary = (dominantWorkflowLabel && dominanceScore >= 0.50 && !compoundState)
    ? dominantWorkflowLabel
    : baseActivitySummary;

  // Workflow stage from continuity (or default)
  const workflowStage = continuityProfile?.workflowStage || {
    stageId: 'active_development',
    label: 'Active Development',
  };

  // Work type for rich categorization
  const workType = resolveWorkType(workMode, compressed, featureGraph, behaviorProfile);

  return {
    workMode,
    compoundState,
    implementationPhase,
    workflowStage,
    activitySummary,
    workType,
    contextRichness,
    dominantWorkflowLabel,
    dominanceScore,
    isHighConfidence: contextRichness >= 0.6 && (behaviorProfile?.inferenceConfidence || 0) >= 0.5,
  };
}

// ─── Work Type Resolution ─────────────────────────────────────────────────────

function resolveWorkType(workMode, compressed, featureGraph, behaviorProfile) {
  const system = featureGraph?.activeSystem?.system;
  const activeFeature = featureGraph?.topFeature?.label;

  // Rich labels that combine mode + system context
  if (workMode === 'deep_implementation' && system === 'ai') {
    return { label: 'AI Engine Development', short: 'AI Development' };
  }
  if (workMode === 'deep_implementation' && system === 'frontend') {
    return { label: 'Frontend Implementation', short: 'Frontend Dev' };
  }
  if (workMode === 'deep_implementation' && system === 'backend') {
    return { label: 'Backend Development', short: 'Backend Dev' };
  }
  if (workMode === 'debugging' && activeFeature) {
    return { label: `Debugging ${activeFeature}`, short: 'Debugging' };
  }
  if (workMode === 'design_work') {
    return { label: 'UI/UX Design Work', short: 'Design' };
  }
  if (workMode === 'research') {
    const isAIWorkspace = behaviorProfile?.isAIWorkspace;
    if (isAIWorkspace) return { label: 'AI-Assisted Research & Analysis', short: 'AI Research' };
    return { label: 'Research & Exploration', short: 'Research' };
  }
  if (workMode === 'code_review') {
    const isAIWorkspace = behaviorProfile?.isAIWorkspace;
    if (isAIWorkspace) return { label: 'AI-Assisted Architecture Review', short: 'AI Review' };
    return { label: 'Code Review & Audit', short: 'Review' };
  }
  if (workMode === 'refactoring') {
    return { label: 'Refactoring & Optimization', short: 'Refactoring' };
  }
  if (workMode === 'planning') {
    return { label: 'Planning & Architecture', short: 'Planning' };
  }
  if (workMode === 'testing') {
    return { label: 'Testing & QA', short: 'Testing' };
  }
  if (workMode === 'documenting') {
    return { label: 'Writing & Documentation', short: 'Documentation' };
  }

  const archetype = WORKFLOW_ARCHETYPES[workMode];
  return {
    label: archetype?.label || 'Development Work',
    short: archetype?.label?.split(' ')[0] || 'Development',
  };
}

/**
 * Quick work type label from minimal inputs (for fast title generation).
 */
export function quickWorkTypeLabel(workMode, primaryCategory) {
  const categoryMap = {
    development: 'Development',
    design: 'Design',
    writing: 'Documentation',
    research: 'Research',
    planning: 'Planning',
    meeting: 'Meeting',
  };
  return WORKFLOW_ARCHETYPES[workMode]?.label || categoryMap[primaryCategory] || 'Work';
}
