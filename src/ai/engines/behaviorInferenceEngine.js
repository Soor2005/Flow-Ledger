/**
 * Behavioral Inference Engine
 * Multi-dimensional behavioral classification from activity patterns.
 * Infers work mode, energy state, cognitive load, and flow state
 * from compressed context signals — without any LLM dependency.
 */

import { WORKFLOW_ARCHETYPES, PRODUCTIVITY_STATES, matchWorkflowArchetype, detectProductivityState } from './productivityOntologyEngine.js';

// AI chat tool detector
const AI_CHAT_APPS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'copilot', 'cursor'];
function isAIChatApp(normalizedName) {
  return AI_CHAT_APPS.some(a => normalizedName.includes(a));
}

// Compute what fraction of total time was spent in AI chat tools
function aiChatFraction(apps, totalSecs) {
  if (!totalSecs) return 0;
  const aiSecs = apps
    .filter(a => isAIChatApp(a.normalizedName))
    .reduce((sum, a) => sum + a.totalSecs, 0);
  return aiSecs / totalSecs;
}

// ─── Work Mode Inference Rules ────────────────────────────────────────────────

const WORK_MODE_RULES = [
  {
    mode: 'deep_implementation',
    weight: 100,
    test: (c) => {
      const devApps = ['vscode', 'cursor', 'webstorm', 'intellij', 'xcode'];
      const hasDevApp = c.apps.some(a => devApps.some(d => a.normalizedName.includes(d)));
      return hasDevApp && c.temporalPatterns.continuityScore >= 0.5 && c.totalActiveMins >= 30;
    },
  },
  {
    // AI-assisted code review / architecture evaluation
    mode: 'code_review',
    weight: 92,
    test: (c) => {
      const fraction = aiChatFraction(c.apps, c.totalActiveSecs);
      const kwText = c.keywords.join(' ');
      const titleText = c.titlePhrases.map(p => p.phrase).join(' ').toLowerCase();
      const reviewSignals = ['review', 'audit', 'check', 'analyze', 'integrat', 'connect', 'wire', 'verify', 'inspect', 'evaluat'];
      const hasReviewSignal = reviewSignals.some(k => kwText.includes(k) || titleText.includes(k));
      return fraction >= 0.4 && hasReviewSignal;
    },
  },
  {
    // AI-assisted research: primary tool is claude/chatgpt with no IDE
    mode: 'research',
    weight: 88,
    test: (c) => {
      const fraction = aiChatFraction(c.apps, c.totalActiveSecs);
      const hasIDE = c.apps.some(a => ['vscode', 'cursor', 'xcode', 'webstorm'].some(d => a.normalizedName.includes(d)));
      return fraction >= 0.4 && !hasIDE;
    },
  },
  {
    mode: 'debugging',
    weight: 95,
    // Evidence requirement: a single ambiguous keyword (e.g. "issue", "fix") is not
    // enough to claim debugging happened — that word can appear in totally unrelated
    // text (calendar events, casual browsing). Require either 2+ distinct debugging
    // signals, or 1 signal corroborated by an actual dev/terminal tool being open.
    test: (c) => {
      const kwText = c.keywords.join(' ');
      const signals = ['debug', 'fix', 'bug', 'error', 'issue', 'crash', 'exception', 'broken'];
      const hits = signals.filter(k => new RegExp(`\\b${k}\\b`, 'i').test(kwText)).length;
      const devApps = ['vscode', 'cursor', 'webstorm', 'intellij', 'xcode', 'terminal', 'iterm'];
      const hasDevContext = c.apps.some(a => devApps.some(d => a.normalizedName.includes(d)));
      return hits >= 2 || (hits >= 1 && hasDevContext);
    },
  },
  {
    mode: 'design_work',
    weight: 90,
    test: (c) => {
      return c.apps.some(a => ['figma', 'sketch', 'adobe xd', 'framer'].some(d => a.normalizedName.includes(d)));
    },
  },
  {
    mode: 'research',
    weight: 85,
    test: (c) => {
      return c.isBrowserDominated && c.contextSwitches >= 10 && c.domains.length >= 2;
    },
  },
  {
    mode: 'planning',
    weight: 80,
    test: (c) => {
      const planApps = ['notion', 'linear', 'jira', 'trello', 'asana'];
      const hasPlanApp = c.apps.some(a => planApps.some(p => a.normalizedName.includes(p)));
      // Calendar/scheduling domains (Google Calendar, etc.) are direct planning
      // evidence — previously these were discarded entirely by domain suppression
      // upstream, leaving sessions like "Calendar + Chrome" with no real signal.
      const hasPlanDomain = (c.domains || []).some(d => d.category === 'planning');
      return hasPlanApp || hasPlanDomain;
    },
  },
  {
    mode: 'refactoring',
    weight: 78,
    test: (c) => {
      const kwText = c.keywords.join(' ');
      const signals = ['refactor', 'cleanup', 'restructure', 'simplify', 'optimize', 'clean'];
      const hits = signals.filter(k => new RegExp(`\\b${k}\\b`, 'i').test(kwText)).length;
      const devApps = ['vscode', 'cursor', 'webstorm', 'intellij', 'xcode'];
      const hasDevContext = c.apps.some(a => devApps.some(d => a.normalizedName.includes(d)));
      return hits >= 2 || (hits >= 1 && hasDevContext);
    },
  },
  {
    mode: 'documentation',
    weight: 75,
    test: (c) => {
      const kwText = c.keywords.join(' ');
      const docApps = ['notion', 'obsidian', 'typora'];
      const hasDocApp = c.apps.some(a => docApps.some(d => a.normalizedName.includes(d)));
      const hasDocKw = ['docs', 'readme', 'wiki', 'documentation', 'write', 'draft'].some(k => kwText.includes(k));
      return hasDocApp || hasDocKw;
    },
  },
  {
    mode: 'code_review',
    weight: 72,
    test: (c) => {
      const kwText = c.keywords.join(' ');
      const titleText = c.titlePhrases.map(p => p.phrase).join(' ').toLowerCase();
      return ['review', 'pull request', 'pr', 'feedback', 'audit'].some(k => kwText.includes(k) || titleText.includes(k));
    },
  },
  {
    mode: 'testing',
    weight: 70,
    test: (c) => {
      const kwText = c.keywords.join(' ');
      return ['test', 'spec', 'jest', 'vitest', 'cypress', 'playwright'].some(k => kwText.includes(k));
    },
  },
];

// ─── Energy Level Inference ───────────────────────────────────────────────────

function inferEnergyLevel(compressed) {
  const { totalActiveMins, temporalPatterns, contextSwitches } = compressed;

  // High energy: long sustained work, minimal interruptions
  if (totalActiveMins >= 90 && temporalPatterns.continuityScore >= 0.7 && contextSwitches < 10) {
    return 'high';
  }
  // Low energy: short fragmented sessions or very high switching
  if (totalActiveMins < 20 || contextSwitches > 40 || temporalPatterns.isFragmented) {
    return 'low';
  }
  return 'medium';
}

// ─── Cognitive Load Inference ─────────────────────────────────────────────────

function inferCognitiveLoad(compressed, workMode) {
  const highLoadModes = ['debugging', 'deep_implementation', 'design_work', 'refactoring'];
  const lowLoadModes = ['documentation', 'planning'];

  if (highLoadModes.includes(workMode)) return 'high';
  if (lowLoadModes.includes(workMode)) return 'low';

  // Infer from signal density: many technical terms = high cognitive load
  const techTerms = ['engine', 'algorithm', 'schema', 'api', 'async', 'context', 'state', 'component'];
  const techCount = techTerms.filter(t => compressed.keywords.join(' ').includes(t)).length;

  if (techCount >= 3) return 'high';
  if (techCount >= 1) return 'medium';
  return 'low';
}

// ─── Flow State Inference ─────────────────────────────────────────────────────

function inferFlowState(compressed) {
  const { totalActiveMins, temporalPatterns, contextSwitches, isBrowserDominated } = compressed;

  // Deep flow: 60+ min continuous, < 10 switches, not browser-dominated
  if (totalActiveMins >= 60 && temporalPatterns.continuityScore >= 0.7 && contextSwitches < 10 && !isBrowserDominated) {
    return { state: 'deep_flow', confidence: 0.85 };
  }
  // Light flow: 30+ min, moderate continuity
  if (totalActiveMins >= 30 && temporalPatterns.continuityScore >= 0.5 && contextSwitches < 20) {
    return { state: 'light_flow', confidence: 0.65 };
  }
  // Exploratory: browser-heavy, high switching but not fragmented
  if (isBrowserDominated && contextSwitches >= 10 && totalActiveMins >= 15) {
    return { state: 'exploratory', confidence: 0.70 };
  }
  // Fragmented: can't achieve flow
  if (contextSwitches >= 30 || temporalPatterns.isFragmented) {
    return { state: 'fragmented', confidence: 0.75 };
  }
  return { state: 'light_flow', confidence: 0.50 };
}

// ─── Work Pattern Classification ──────────────────────────────────────────────

function classifyWorkPattern(compressed) {
  const { apps, contextSwitches, totalActiveMins } = compressed;

  // Focused: primarily one or two apps
  if (apps.length <= 2 && contextSwitches < 10) return 'focused';

  // Collaborative: communication tools prominent
  const commApps = ['slack', 'discord', 'teams', 'zoom', 'gmail', 'outlook'];
  const hasCommApp = apps.some(a => commApps.some(c => a.normalizedName.includes(c)));
  if (hasCommApp && apps.length >= 2) return 'collaborative';

  // Multi-tool: engineering with multiple IDE/browser combinations
  const devApps = ['vscode', 'cursor', 'webstorm', 'chrome', 'firefox'];
  const devCount = apps.filter(a => devApps.some(d => a.normalizedName.includes(d))).length;
  if (devCount >= 2 && contextSwitches < 20) return 'multi_tool';

  // Exploratory: many different tools, high switching
  if (apps.length >= 3 && contextSwitches >= 15) return 'exploratory';

  return 'focused';
}

// ─── Work Mode Resolution ─────────────────────────────────────────────────────

function resolveWorkMode(compressed) {
  // First try rule-based detection
  const passed = [];
  for (const rule of WORK_MODE_RULES) {
    try {
      if (rule.test(compressed)) {
        passed.push({ mode: rule.mode, weight: rule.weight });
      }
    } catch {}
  }

  if (passed.length > 0) {
    passed.sort((a, b) => b.weight - a.weight);
    return {
      primary: passed[0].mode,
      secondary: passed[1]?.mode || null,
      confidence: Math.min(passed[0].weight / 100, 1),
    };
  }

  // Fallback: archetype matching from ontology
  const archetypeResult = matchWorkflowArchetype({
    apps: compressed.apps.map(a => a.normalizedName),
    keywords: compressed.keywords,
    contextSwitches: compressed.contextSwitches,
    durationMins: compressed.totalActiveMins,
  });

  if (archetypeResult) {
    return {
      primary: archetypeResult.archetype,
      secondary: archetypeResult.alternatives[0] || null,
      confidence: archetypeResult.confidence,
    };
  }

  // No rule matched and no archetype matched — there is no real evidence of any
  // specific work mode. Defaulting to 'deep_implementation' here would invent
  // "Implementing" work out of thin air. Fall back to category/domain signals
  // that are actually present, and only reach for implementation as a last resort
  // when there's genuine dev-tool evidence.
  const hasDevApp = compressed.apps.some(a =>
    ['vscode', 'cursor', 'webstorm', 'intellij', 'xcode'].some(d => a.normalizedName.includes(d)));
  let fallbackMode = 'research';
  if (compressed.primaryCategory === 'design') fallbackMode = 'design_work';
  else if (compressed.primaryCategory === 'planning') fallbackMode = 'planning';
  else if (hasDevApp) fallbackMode = 'deep_implementation';

  return {
    primary: fallbackMode,
    secondary: null,
    confidence: 0.30,
  };
}

// ─── Main Inference Function ──────────────────────────────────────────────────

/**
 * Infer a rich behavioral profile from compressed session context.
 *
 * @param {Object} compressed - output of contextCompressionEngine.compressContext()
 * @returns {Object} behaviorProfile
 */
export function inferBehavior(compressed) {
  if (compressed.isEmpty) {
    return {
      workMode: { primary: 'unknown', secondary: null, confidence: 0 },
      energyLevel: 'unknown',
      cognitiveLoad: 'unknown',
      flowState: { state: 'unknown', confidence: 0 },
      workPattern: 'unknown',
      productivityState: 'focused_work',
      isDeepWork: false,
      isSustainedWork: false,
      isExploratory: false,
      label: 'Unknown Session',
      inferenceConfidence: 0,
    };
  }

  const workMode = resolveWorkMode(compressed);
  const energyLevel = inferEnergyLevel(compressed);
  const cognitiveLoad = inferCognitiveLoad(compressed, workMode.primary);
  const flowState = inferFlowState(compressed);
  const workPattern = classifyWorkPattern(compressed);

  const productivityState = detectProductivityState(
    compressed.contextSwitches,
    compressed.totalActiveMins,
    compressed.temporalPatterns.continuityScore,
    compressed.isBrowserDominated,
  );

  // Deep work for AI workspace sessions: 30+ min of focused AI-tool work counts
  // (reading architecture, evaluating code, sustained AI-assisted review = deep cognitive work)
  const isAIWorkspace = compressed.isAIWorkspace || false;
  const isDeepWork = (
    ((productivityState === 'peak_flow' || productivityState === 'deep_focus') &&
    !compressed.isBrowserDominated &&
    compressed.totalActiveMins >= 45) ||
    (isAIWorkspace && compressed.totalActiveMins >= 30 && compressed.contextSwitches < 15)
  );

  const isSustainedWork = (
    compressed.temporalPatterns.maxContinuousBlockMins >= 45 &&
    compressed.temporalPatterns.continuityScore >= 0.5
  );

  const isExploratory = (
    compressed.isBrowserDominated ||
    workMode.primary === 'research' ||
    flowState.state === 'exploratory'
  );

  // Human-readable label for the behavior
  const label = buildBehaviorLabel(workMode.primary, productivityState, compressed);

  // Overall confidence: average of mode confidence + flow confidence
  const inferenceConfidence = Math.round(
    (workMode.confidence + flowState.confidence) / 2 * 100
  ) / 100;

  return {
    workMode,
    energyLevel,
    cognitiveLoad,
    flowState,
    workPattern,
    productivityState,
    isDeepWork,
    isSustainedWork,
    isExploratory,
    isAIWorkspace,
    aiWorkspaceFraction: compressed.aiWorkspaceFraction || 0,
    label,
    inferenceConfidence,
  };
}

// ─── Behavior Label Builder ───────────────────────────────────────────────────

const MODE_LABELS = {
  deep_implementation: 'deep implementation work',
  debugging: 'debugging and issue resolution',
  design_work: 'design and UX refinement',
  research: 'research and exploration',
  planning: 'planning and architecture',
  refactoring: 'refactoring and optimization',
  documentation: 'writing and documentation',
  code_review: 'code review and evaluation',
  testing: 'testing and validation',
  unknown: 'focused work',
};

function buildBehaviorLabel(workMode, productivityState, compressed) {
  const modeLabel = MODE_LABELS[workMode] || MODE_LABELS.unknown;

  const statePrefix = {
    peak_flow: 'Deep-focus',
    deep_focus: 'Focused',
    focused_work: 'Steady',
    exploratory: 'Exploratory',
    fragmented: 'Intermittent',
  }[productivityState] || 'Focused';

  return `${statePrefix} ${modeLabel}`;
}

/**
 * Get the best human-readable verb for the inferred work mode.
 */
export function getBehaviorVerb(behaviorProfile, position = 0) {
  const archetype = WORKFLOW_ARCHETYPES[behaviorProfile.workMode?.primary];
  if (archetype?.verbs) {
    return archetype.verbs[position % archetype.verbs.length];
  }

  const fallbackVerbs = {
    deep_implementation: ['Implementing', 'Building', 'Developing'],
    debugging: ['Debugging', 'Fixing', 'Troubleshooting'],
    design_work: ['Designing', 'Crafting', 'Prototyping'],
    research: ['Researching', 'Exploring', 'Investigating'],
    planning: ['Planning', 'Architecting', 'Scoping'],
    refactoring: ['Refactoring', 'Optimizing', 'Improving'],
    documentation: ['Documenting', 'Writing', 'Drafting'],
    code_review: ['Reviewing', 'Auditing', 'Evaluating'],
    testing: ['Testing', 'Validating', 'Verifying'],
  };

  const verbs = fallbackVerbs[behaviorProfile.workMode?.primary] || ['Working on'];
  return verbs[position % verbs.length];
}

/**
 * Summarize behavioral profile as a short human-readable phrase.
 */
export function summarizeBehavior(behaviorProfile) {
  const { workMode, productivityState, isDeepWork, totalActiveMins } = behaviorProfile;

  const modeLabel = MODE_LABELS[workMode?.primary] || 'focused work';
  const durLabel = totalActiveMins >= 60 ? `${Math.round((totalActiveMins || 0) / 60 * 10) / 10}h` : `${totalActiveMins || 0}m`;

  if (isDeepWork) return `${durLabel} of deep-focus ${modeLabel}`;
  if (productivityState === 'exploratory') return `${durLabel} of exploratory ${modeLabel}`;
  return `${durLabel} of ${modeLabel}`;
}
