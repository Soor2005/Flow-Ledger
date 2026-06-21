/**
 * Session Continuity Engine
 * Tracks previous sessions, detects repeated workflows, and infers
 * ongoing objectives across multiple work sessions.
 *
 * Instead of treating each session independently, this engine builds a
 * longitudinal understanding of what the user is working on over days/weeks.
 */

import { semanticMemory } from './semanticMemoryEngine.js';
import { FEATURE_ONTOLOGY } from './productivityOntologyEngine.js';
import { workflowManager } from '../core/WorkflowManager.js';

// ─── Storage ──────────────────────────────────────────────────────────────────

const CONTINUITY_KEY = 'fl_session_continuity_v1';
const MAX_HISTORY = 30;           // Sessions to analyze for continuity
const RECENCY_WINDOW_HOURS = 72; // Sessions within 3 days are "recent"

function loadContinuityData() {
  try {
    const raw = localStorage.getItem(CONTINUITY_KEY);
    return raw ? JSON.parse(raw) : { sessions: [], objectives: [] };
  } catch {
    return { sessions: [], objectives: [] };
  }
}

function saveContinuityData(data) {
  try {
    localStorage.setItem(CONTINUITY_KEY, JSON.stringify(data));
  } catch {}
}

// ─── Session Record Shape ─────────────────────────────────────────────────────

function buildSessionRecord(compressed, behaviorProfile, title, timestamp) {
  return {
    id: `sess_${timestamp || Date.now()}`,
    timestamp: timestamp || Date.now(),
    title: title || '',
    workMode: behaviorProfile?.workMode?.primary || 'unknown',
    productivityState: behaviorProfile?.productivityState || 'focused_work',
    features: compressed.features?.map(f => f.featureId) || [],
    keywords: compressed.keywords?.slice(0, 10) || [],
    titlePhrases: compressed.titlePhrases?.slice(0, 3).map(p => p.phrase) || [],
    apps: compressed.apps?.slice(0, 4).map(a => a.normalizedName) || [],
    primaryCategory: compressed.primaryCategory || 'development',
    durationMins: compressed.totalActiveMins || 0,
    contextSwitches: compressed.contextSwitches || 0,
    // Workflow dominance context — identifies the primary workflow this session belonged to
    dominantWorkflowLabel: compressed.dominantWorkflowLabel || null,
    dominanceScore: compressed.dominanceScore || 0,
    noisePct: compressed.noisePct || 0,
  };
}

// ─── Workflow Stage Detection ─────────────────────────────────────────────────

const WORKFLOW_STAGES = {
  exploration: {
    label: 'Exploration',
    signals: ['research', 'planning'],
    description: 'Investigating and planning approach',
  },
  initial_build: {
    label: 'Initial Build',
    signals: ['deep_implementation'],
    description: 'Building the initial feature structure',
  },
  active_development: {
    label: 'Active Development',
    signals: ['deep_implementation', 'debugging'],
    description: 'Actively developing and iterating',
  },
  refinement: {
    label: 'Refinement',
    signals: ['refactoring', 'testing', 'debugging'],
    description: 'Fixing, polishing, and improving quality',
  },
  documentation: {
    label: 'Documentation',
    signals: ['documenting'],
    description: 'Writing docs and finalizing',
  },
  review: {
    label: 'Review & Ship',
    signals: ['reviewing', 'testing'],
    description: 'Reviewing and preparing to ship',
  },
};

function detectWorkflowStage(recentModes) {
  const modeCounts = {};
  for (const mode of recentModes) {
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
  }

  for (const [stageId, stage] of Object.entries(WORKFLOW_STAGES)) {
    const stageSignalCount = stage.signals.filter(s => modeCounts[s] > 0).length;
    if (stageSignalCount >= Math.ceil(stage.signals.length * 0.5)) {
      return { stageId, ...stage };
    }
  }

  return { stageId: 'active_development', ...WORKFLOW_STAGES.active_development };
}

// ─── Feature Recurrence Detection ────────────────────────────────────────────

function detectRecurringFeatures(recentSessions) {
  const featureCounts = {};
  for (const s of recentSessions) {
    for (const f of s.features || []) {
      featureCounts[f] = (featureCounts[f] || 0) + 1;
    }
  }

  return Object.entries(featureCounts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([featureId, count]) => ({
      featureId,
      label: FEATURE_ONTOLOGY[featureId]?.label || featureId,
      occurrences: count,
      recencyScore: count / recentSessions.length,
    }));
}

// ─── Active Objective Inference ───────────────────────────────────────────────

function inferActiveObjective(recentSessions, recurringFeatures) {
  if (!recentSessions.length) return null;

  // Primary feature cluster drives the objective
  const topFeature = recurringFeatures[0];
  const topMode = getMostCommonMode(recentSessions);
  const recentTitles = recentSessions.slice(0, 5).map(s => s.title).filter(Boolean);

  // ── Dominant workflow signal — highest-fidelity identity ─────────────────
  // When multiple sessions share the same dominant workflow label (e.g. "Flow Ledger"),
  // that's stronger evidence of a continuing objective than feature co-occurrence alone.
  const dominantLabels = recentSessions
    .slice(0, 8)
    .map(s => s.dominantWorkflowLabel)
    .filter(Boolean);
  const labelCounts = {};
  for (const l of dominantLabels) labelCounts[l] = (labelCounts[l] || 0) + 1;
  const topDominantLabel = Object.entries(labelCounts).sort(([, a], [, b]) => b - a)[0];

  if (topDominantLabel && topDominantLabel[1] >= 2) {
    const modeLabel = getModeNarrative(topMode);
    // Only use it as the objective description if it's more specific than just the mode
    return {
      description: `${modeLabel} ${topDominantLabel[0]}`,
      primaryFeature: topFeature?.featureId || null,
      primaryMode: topMode,
      confidence: Math.min(topDominantLabel[1] / recentSessions.length + 0.3, 0.95),
      source: 'dominant_workflow',
    };
  }

  // Look for a common noun phrase across recent titles
  const commonSubject = extractCommonSubject(recentTitles);

  // Build objective description
  if (topFeature && topFeature.recencyScore >= 0.4) {
    const featureLabel = topFeature.label;
    const modeLabel = getModeNarrative(topMode);

    return {
      description: commonSubject
        ? `${modeLabel} ${commonSubject}`
        : `${modeLabel} ${featureLabel}`,
      primaryFeature: topFeature.featureId,
      primaryMode: topMode,
      confidence: Math.min(topFeature.recencyScore * 1.2, 1),
      source: 'feature_recurrence',
    };
  }

  // Fallback: infer from title patterns
  if (commonSubject) {
    return {
      description: `${getModeNarrative(topMode)} ${commonSubject}`,
      primaryFeature: null,
      primaryMode: topMode,
      confidence: 0.5,
      source: 'title_pattern',
    };
  }

  return null;
}

function getMostCommonMode(sessions) {
  const counts = {};
  for (const s of sessions) {
    const mode = s.workMode || 'unknown';
    counts[mode] = (counts[mode] || 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'deep_implementation';
}

function getModeNarrative(mode) {
  const narratives = {
    deep_implementation: 'implementing',
    debugging: 'fixing and debugging',
    design_work: 'designing',
    research: 'exploring',
    planning: 'planning',
    refactoring: 'refactoring',
    documentation: 'documenting',
    code_review: 'reviewing',
    testing: 'testing',
  };
  return narratives[mode] || 'working on';
}

function getModeVerbForHint(mode) {
  const verbMap = {
    deep_implementation: 'Implementation',
    debugging: 'Debugging',
    design_work: 'Design',
    research: 'Research',
    planning: 'Planning',
    refactoring: 'Refactoring',
    documentation: 'Documentation',
    code_review: 'Review',
    testing: 'Testing',
  };
  return verbMap[mode] || 'Implementation';
}

function extractCommonSubject(titles) {
  if (!titles.length) return null;

  // Extract significant words from titles (exclude verbs and function words)
  const FUNCTION_WORDS = new Set([
    'and', 'or', 'the', 'a', 'an', 'for', 'of', 'in', 'on', 'with',
    'implementing', 'building', 'fixing', 'debugging', 'designing',
    'creating', 'working', 'developing', 'refactoring', 'testing',
    'reviewing', 'documenting', 'researching', 'exploring', 'improving',
    'adding', 'updating', 'optimizing', 'crafting', 'prototyping',
  ]);

  const wordCounts = {};
  for (const title of titles) {
    const words = title.split(/\s+/).filter(w => w.length >= 4 && !FUNCTION_WORDS.has(w.toLowerCase()));
    for (const w of words) {
      const key = w.toLowerCase();
      wordCounts[key] = (wordCounts[key] || 0) + 1;
    }
  }

  // Find words that appear in multiple titles
  const recurring = Object.entries(wordCounts)
    .filter(([, count]) => count >= Math.ceil(titles.length * 0.4))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([w]) => w);

  if (!recurring.length) return null;

  // Capitalize and join as a subject phrase
  return recurring
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Implementation Narrative Builder ────────────────────────────────────────

function buildImplementationNarrative(sessions, objective, stage, recurringFeatures) {
  if (!sessions.length) return '';

  const featureLabels = recurringFeatures.slice(0, 3).map(f => f.label);
  const stageLabel = stage?.label || 'Active Development';
  const objectiveDesc = objective?.description || 'productivity system features';

  if (featureLabels.length >= 2) {
    return `Actively ${objectiveDesc}, with focus on ${featureLabels[0].toLowerCase()} and ${featureLabels[1].toLowerCase()}. Currently in ${stageLabel.toLowerCase()} phase.`;
  }

  if (featureLabels.length === 1) {
    return `Actively ${objectiveDesc}. Working through ${stageLabel.toLowerCase()} of the ${featureLabels[0].toLowerCase()}.`;
  }

  return `Actively ${objectiveDesc}. Currently in the ${stageLabel.toLowerCase()} phase.`;
}

// ─── Main Engine Function ─────────────────────────────────────────────────────

/**
 * Analyze session continuity and infer ongoing objectives.
 *
 * @param {Object} currentCompressed - output of contextCompressionEngine
 * @param {Object} currentBehavior - output of behaviorInferenceEngine
 * @param {string} currentTitle - generated or user-provided title
 * @param {number} [timestamp] - session timestamp (default: now)
 * @returns {Object} continuityProfile
 */
export function analyzeContinuity(currentCompressed, currentBehavior, currentTitle = '', timestamp = null) {
  const data = loadContinuityData();

  // Build and store current session record
  const currentRecord = buildSessionRecord(currentCompressed, currentBehavior, currentTitle, timestamp);

  // Enrich with WorkflowManager historical continuity (Phase 1)
  const wfContext = workflowManager.getWorkflowContextForAI();
  const wfHistory = workflowManager.getWorkflowHistory();
  if (wfContext?.name) {
    currentRecord.dominantWorkflowLabel = currentRecord.dominantWorkflowLabel || wfContext.name;
    currentRecord.workflowId = wfContext.id;
    currentRecord.workflowLocked = wfContext.locked;
    currentRecord.workflowConfidence = wfContext.confidence;
  }
  if (wfHistory.length) {
    currentRecord.priorWorkflowCount = wfHistory.length;
  }

  // Store in semantic memory
  semanticMemory.remember(currentRecord);

  // Get recent sessions (last 72 hours)
  const cutoff = Date.now() - RECENCY_WINDOW_HOURS * 60 * 60 * 1000;
  const recentSessions = data.sessions
    .filter(s => s.timestamp >= cutoff)
    .slice(0, MAX_HISTORY);

  // Find semantically similar past sessions
  const similarSessions = semanticMemory.findSimilar(currentRecord, 8, 0.30);

  // Also recall sessions that share the same dominant workflow label for richer
  // continuity context (e.g. all past sessions tagged as "Flow Ledger" work).
  const workflowRecall = currentRecord.dominantWorkflowLabel
    ? semanticMemory.recallByDominantWorkflow(currentRecord.dominantWorkflowLabel, 6)
    : [];

  // Detect recurring feature areas
  const allRelevantSessions = [currentRecord, ...recentSessions];
  const recurringFeatures = detectRecurringFeatures(allRelevantSessions);

  // Detect workflow stage from recent work modes
  const recentModes = allRelevantSessions.slice(0, 10).map(s => s.workMode).filter(Boolean);
  const workflowStage = detectWorkflowStage(recentModes);

  // Infer active objective
  const activeObjective = inferActiveObjective(allRelevantSessions, recurringFeatures);

  // Current feature being worked on (highest-strength feature from current session)
  const currentFeature = currentCompressed.features?.[0]
    ? { featureId: currentCompressed.features[0].featureId, label: currentCompressed.features[0].label }
    : null;

  // Continuity confidence: how much does this session continue from recent work?
  const semanticContinuityScore = semanticMemory.getContinuityScore(currentRecord);
  const featureContinuity = recurringFeatures.length > 0 ? recurringFeatures[0].recencyScore : 0;
  // Workflow identity continuity: if we found past sessions with the same dominant
  // workflow label, that's a strong signal this is genuinely continuing work.
  const workflowIdentityContinuity = workflowRecall.length >= 2 ? 0.75
    : workflowRecall.length === 1 ? 0.50 : 0;
  const continuityConfidence = Math.round(
    Math.min(
      semanticContinuityScore * 0.45 +
      featureContinuity       * 0.30 +
      workflowIdentityContinuity * 0.25,
      1,
    ) * 100,
  ) / 100;

  // Build implementation narrative
  const implementationNarrative = buildImplementationNarrative(
    allRelevantSessions, activeObjective, workflowStage, recurringFeatures,
  );

  // Recurring context label (for UI display)
  const recurringContext = recurringFeatures.length >= 2
    ? `${recurringFeatures[0].label} & ${recurringFeatures[1].label}`
    : recurringFeatures[0]?.label || null;

  // ── Continuation title hint — used by title generators when continuing work ─
  // Produces "Continuing AI Intelligence Implementation" instead of a fresh title
  // when the session strongly continues from recent sessions.
  const isContinuingWork = continuityConfidence >= 0.45;
  let continuationTitleHint = null;
  if (isContinuingWork && activeObjective?.description) {
    const desc = activeObjective.description;
    // Strip leading mode verb to get the clean subject
    const subjectWords = desc
      .replace(/^(implementing|fixing|debugging|designing|refactoring|reviewing|testing|planning|exploring|working\s+on)\s+/i, '')
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Produce natural, human-sounding continuation hints instead of "Continuing X Implementation"
    const mode = currentBehavior?.workMode?.primary || 'deep_implementation';
    const NATURAL_PREFIXES = {
      deep_implementation: ['Further work on', 'Additional improvements to', 'Continued work on'],
      debugging:           ['More debugging on', 'Further investigation of', 'Continued debugging of'],
      design_work:         ['More design work on', 'Further refinement of', 'Continued design for'],
      research:            ['Further research on', 'Additional exploration of', 'More investigation into'],
      refactoring:         ['More refactoring of', 'Additional cleanup of', 'Continued refactoring of'],
      code_review:         ['Further review of', 'Additional review of', 'More review of'],
      testing:             ['More testing for', 'Additional testing of', 'Continued testing of'],
      planning:            ['More planning for', 'Additional scoping of', 'Continued planning of'],
    };
    const prefixes = NATURAL_PREFIXES[mode] || ['Further work on', 'Continued work on', 'Additional work on'];
    // Rotate prefix based on continuity confidence to add variety over repeated sessions
    const idx = Math.round(continuityConfidence * 10) % prefixes.length;
    continuationTitleHint = `${prefixes[idx]} ${subjectWords}`;
  }

  // Save updated session list
  data.sessions = [currentRecord, ...recentSessions].slice(0, MAX_HISTORY);
  saveContinuityData(data);

  return {
    activeObjective,
    workflowStage,
    currentFeature,
    recurringContext,
    continuationTitleHint,
    recurringFeatures: recurringFeatures.slice(0, 4),
    similarSessions: similarSessions.slice(0, 4).map(r => ({
      title: r.session.title,
      similarity: Math.round(r.similarity * 100) / 100,
      timestamp: r.session.timestamp,
    })),
    // Sessions sharing the same dominant workflow identity
    workflowRecallCount: workflowRecall.length,
    dominantWorkflowLabel: currentRecord.dominantWorkflowLabel || null,
    continuityConfidence,
    implementationNarrative,
    isNewWorkArea: continuityConfidence < 0.2,
    isContinuingWork,
  };
}

/**
 * Retrieve the continuity profile from storage without updating it.
 * Used for quick reads without side effects.
 */
export function getLastContinuityState() {
  const data = loadContinuityData();
  const recent = data.sessions.slice(0, 10);
  const recurringFeatures = detectRecurringFeatures(recent);
  const recentModes = recent.map(s => s.workMode).filter(Boolean);
  const stage = detectWorkflowStage(recentModes);

  return {
    recentSessionCount: recent.length,
    recurringFeatures,
    workflowStage: stage,
    topWorkModes: recentModes.slice(0, 5),
  };
}
