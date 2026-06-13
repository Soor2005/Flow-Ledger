/**
 * Productivity Ontology Engine
 * v2 — expanded semantic knowledge graph.
 *
 * Defines productivity concepts, feature relationships, workflow archetypes,
 * implementation phases, and domain ontologies used across all reasoning engines.
 * No LLMs — pure structured semantics. Acts as the shared knowledge base.
 */

// ─── Shared Thresholds ───────────────────────────────────────────────────────
// AI tool dominance: fraction of active time spent in AI tools that triggers
// AI-dominant session classification (used by contextCompressionEngine and
// intentInferenceEngine — kept here to avoid magic-number drift).
export const AI_TOOL_DOMINANCE_THRESHOLD = 0.45;

// ─── Workflow Archetypes ──────────────────────────────────────────────────────

export const WORKFLOW_ARCHETYPES = {
  deep_implementation: {
    label: 'Deep Implementation',
    narrative: 'implementing and building',
    signals: {
      apps: ['vscode', 'cursor', 'webstorm', 'intellij', 'xcode', 'rider', 'android studio'],
      keywords: ['implement', 'build', 'create', 'feature', 'component', 'module', 'service', 'function', 'class', 'hook', 'engine'],
      minDurationMins: 45,
      maxContextSwitches: 12,
    },
    verbs: ['Implementing', 'Building', 'Engineering', 'Developing', 'Creating'],
    descVerbs: ['Implemented', 'Built', 'Developed', 'Engineered', 'Created'],
    relatedArchetypes: ['debugging', 'testing', 'refactoring'],
    cognitiveLoad: 'high',
  },

  debugging: {
    label: 'Debugging & Problem Solving',
    narrative: 'debugging and resolving issues',
    signals: {
      apps: ['vscode', 'cursor', 'chrome', 'firefox', 'arc'],
      keywords: ['debug', 'fix', 'bug', 'error', 'issue', 'crash', 'exception', 'broken', 'resolve', 'trace', 'console', 'stack'],
      maxContextSwitches: 30,
    },
    verbs: ['Debugging', 'Fixing', 'Diagnosing', 'Resolving', 'Troubleshooting'],
    descVerbs: ['Debugged', 'Fixed', 'Diagnosed', 'Resolved', 'Troubleshot'],
    relatedArchetypes: ['deep_implementation', 'research'],
    cognitiveLoad: 'very_high',
  },

  research: {
    label: 'Research & Exploration',
    narrative: 'researching and exploring',
    signals: {
      apps: ['chrome', 'firefox', 'safari', 'arc', 'brave'],
      domains: ['docs', 'stackoverflow', 'github', 'mdn', 'medium'],
      keywords: ['research', 'explore', 'learn', 'study', 'docs', 'documentation', 'how to', 'investigate', 'compare', 'evaluate'],
    },
    verbs: ['Analyzing', 'Evaluating', 'Exploring', 'Investigating', 'Studying'],
    descVerbs: ['Analyzed', 'Evaluated', 'Explored', 'Investigated', 'Studied'],
    relatedArchetypes: ['planning', 'deep_implementation'],
    cognitiveLoad: 'medium',
  },

  designing: {
    label: 'Design & UX Work',
    narrative: 'designing and crafting',
    signals: {
      apps: ['figma', 'sketch', 'adobe xd', 'framer', 'canva', 'affinity'],
      keywords: ['design', 'wireframe', 'mockup', 'prototype', 'layout', 'ui', 'ux', 'interaction', 'visual', 'typography', 'animation'],
    },
    verbs: ['Designing', 'Crafting', 'Prototyping', 'Wireframing', 'Refining'],
    descVerbs: ['Designed', 'Crafted', 'Prototyped', 'Created', 'Refined'],
    relatedArchetypes: ['deep_implementation', 'planning'],
    cognitiveLoad: 'high',
  },

  planning: {
    label: 'Planning & Architecture',
    narrative: 'planning and architecting',
    signals: {
      apps: ['notion', 'linear', 'jira', 'trello', 'obsidian', 'asana'],
      keywords: ['plan', 'roadmap', 'architecture', 'system design', 'schema', 'scope', 'sprint', 'backlog', 'strategy', 'structure', 'approach'],
    },
    verbs: ['Planning', 'Architecting', 'Scoping', 'Mapping Out', 'Designing'],
    descVerbs: ['Planned', 'Architected', 'Scoped', 'Mapped out', 'Structured'],
    relatedArchetypes: ['research', 'deep_implementation'],
    cognitiveLoad: 'medium',
  },

  refactoring: {
    label: 'Refactoring & Optimization',
    narrative: 'refactoring and improving',
    signals: {
      apps: ['vscode', 'cursor', 'webstorm'],
      keywords: ['refactor', 'clean', 'optimize', 'improve', 'restructure', 'simplify', 'rewrite', 'performance', 'cleanup', 'reorganize'],
    },
    verbs: ['Refactoring', 'Optimizing', 'Improving', 'Cleaning Up', 'Restructuring'],
    descVerbs: ['Refactored', 'Optimized', 'Improved', 'Cleaned up', 'Restructured'],
    relatedArchetypes: ['debugging', 'deep_implementation'],
    cognitiveLoad: 'high',
  },

  documenting: {
    label: 'Documentation',
    narrative: 'writing and documenting',
    signals: {
      apps: ['notion', 'obsidian', 'vscode', 'word', 'typora'],
      keywords: ['docs', 'documentation', 'readme', 'wiki', 'write', 'draft', 'spec', 'guide', 'tutorial', 'notes'],
    },
    verbs: ['Documenting', 'Writing', 'Drafting', 'Authoring', 'Composing'],
    descVerbs: ['Documented', 'Wrote', 'Drafted', 'Authored', 'Composed'],
    relatedArchetypes: ['planning', 'deep_implementation'],
    cognitiveLoad: 'medium',
  },

  reviewing: {
    label: 'Review & Audit',
    narrative: 'reviewing and evaluating',
    signals: {
      apps: ['github', 'gitlab', 'chrome'],
      keywords: ['review', 'pr', 'pull request', 'feedback', 'audit', 'inspect', 'evaluate', 'assess', 'code review'],
    },
    verbs: ['Reviewing', 'Auditing', 'Evaluating', 'Inspecting', 'Assessing'],
    descVerbs: ['Reviewed', 'Audited', 'Evaluated', 'Inspected'],
    relatedArchetypes: ['debugging', 'documenting'],
    cognitiveLoad: 'medium',
  },

  testing: {
    label: 'Testing & QA',
    narrative: 'testing and validating',
    signals: {
      apps: ['vscode', 'cursor', 'chrome'],
      keywords: ['test', 'spec', 'jest', 'vitest', 'cypress', 'playwright', 'unit test', 'e2e', 'qa', 'verify', 'assert', 'mock'],
    },
    verbs: ['Testing', 'Validating', 'Verifying', 'Writing Tests for', 'QA Testing'],
    descVerbs: ['Tested', 'Validated', 'Verified', 'Written tests for'],
    relatedArchetypes: ['debugging', 'deep_implementation'],
    cognitiveLoad: 'medium',
  },
};

// ─── Product Feature Ontology ─────────────────────────────────────────────────

export const FEATURE_ONTOLOGY = {
  calendar_system: {
    label: 'Calendar System',
    keywords: ['calendar', 'event', 'schedule', 'scheduling', 'drag', 'drop', 'time slot', 'date picker', 'week view', 'month view', 'day view'],
    relatedFeatures: ['event_management', 'notifications'],
    system: 'core',
  },
  event_management: {
    label: 'Event Management',
    keywords: ['event', 'create event', 'edit event', 'delete event', 'recurring', 'collision', 'overlap', 'rescheduling'],
    relatedFeatures: ['calendar_system', 'session_tracking'],
    system: 'core',
  },
  session_tracking: {
    label: 'Session Tracking',
    keywords: ['session', 'time tracking', 'auto track', 'auto session', 'window title', 'app tracking', 'focus session', 'activity'],
    relatedFeatures: ['productivity_analytics', 'event_management'],
    system: 'tracking',
  },
  productivity_analytics: {
    label: 'Productivity Analytics',
    keywords: ['analytics', 'productivity', 'focus score', 'deep work', 'burnout', 'insights', 'dashboard', 'metrics', 'context switching'],
    relatedFeatures: ['session_tracking', 'reports'],
    system: 'analytics',
  },
  ai_engine: {
    label: 'AI Intelligence Engine',
    keywords: ['ai', 'intelligence', 'context', 'reasoning', 'semantic', 'embedding', 'inference', 'engine', 'ontology', 'behavioral'],
    relatedFeatures: ['session_tracking', 'productivity_analytics'],
    system: 'ai',
  },
  ui_components: {
    label: 'UI Components & Interactions',
    keywords: ['component', 'ui', 'ux', 'hover', 'animation', 'modal', 'sidebar', 'panel', 'layout', 'design system', 'interaction', 'state'],
    relatedFeatures: ['calendar_system', 'productivity_analytics'],
    system: 'frontend',
  },
  data_persistence: {
    label: 'Data & Persistence Layer',
    keywords: ['database', 'schema', 'migration', 'storage', 'localstorage', 'supabase', 'postgres', 'query', 'api', 'endpoint'],
    relatedFeatures: ['session_tracking', 'reports'],
    system: 'backend',
  },
  reports: {
    label: 'Reports & Exports',
    keywords: ['report', 'export', 'summary', 'weekly', 'daily', 'invoice', 'billing', 'client report', 'time report'],
    relatedFeatures: ['productivity_analytics', 'data_persistence'],
    system: 'analytics',
  },
  notifications: {
    label: 'Notifications & Alerts',
    keywords: ['notification', 'reminder', 'alert', 'push', 'badge', 'toast', 'snackbar', 'popup'],
    relatedFeatures: ['calendar_system', 'session_tracking'],
    system: 'core',
  },
  planning_system: {
    label: 'Planning & Scheduling Intelligence',
    keywords: ['planning', 'smart schedule', 'optimization', 'recommendation', 'conflict detection', 'time blocking', 'deep work block'],
    relatedFeatures: ['calendar_system', 'ai_engine'],
    system: 'ai',
  },

  // ─── Project-Agnostic Categories ─────────────────────────────────────────
  // Activated by file extensions and app ecosystems when no project-specific
  // features match. Provide meaningful labels for non-FL projects.
  frontend_development: {
    label: 'Frontend Development',
    keywords: ['react', 'vue', 'angular', 'svelte', 'component', 'jsx', 'tsx', 'html', 'css', 'sass', 'tailwind', 'styled', 'responsive', 'layout', 'ui', 'ux', 'figma', 'design', 'prototype', 'wireframe', 'storybook', 'accessibility', 'a11y'],
    relatedFeatures: ['ui_components'],
    system: 'frontend',
    projectAgnostic: true,
  },
  backend_development: {
    label: 'Backend Development',
    keywords: ['api', 'endpoint', 'server', 'route', 'controller', 'service', 'middleware', 'auth', 'authentication', 'authorization', 'database', 'query', 'model', 'schema', 'migration', 'rest', 'graphql', 'grpc', 'microservice', 'webhook', 'cron', 'job', 'queue', 'cache'],
    relatedFeatures: ['data_persistence'],
    system: 'backend',
    projectAgnostic: true,
  },
  testing: {
    label: 'Testing & Quality Assurance',
    keywords: ['test', 'spec', 'jest', 'vitest', 'cypress', 'playwright', 'unit test', 'integration test', 'e2e', 'coverage', 'assertion', 'mock', 'stub', 'fixture', 'snapshot', 'regression', 'bug fix', 'debugging', 'breakpoint', 'qa'],
    relatedFeatures: ['data_persistence', 'ui_components'],
    system: 'testing',
    projectAgnostic: true,
  },
  documentation: {
    label: 'Documentation',
    keywords: ['docs', 'documentation', 'readme', 'changelog', 'wiki', 'confluence', 'notion', 'markdown', 'jsdoc', 'typedoc', 'swagger', 'openapi', 'comment', 'docstring', 'guide', 'tutorial', 'spec', 'rfc', 'proposal', 'adr'],
    relatedFeatures: ['reports'],
    system: 'docs',
    projectAgnostic: true,
  },
};

// ─── Semantic Term Groups (concept-level vocabulary) ─────────────────────────

export const SEMANTIC_TERM_GROUPS = {
  calendar:       ['calendar', 'event', 'schedule', 'appointment', 'booking', 'slot', 'block', 'drag', 'drop', 'date', 'week', 'month', 'timeblock', 'recurring', 'overlap'],
  ai_ml:          ['ai', 'intelligence', 'model', 'embedding', 'inference', 'semantic', 'nlp', 'vector', 'similarity', 'reasoning', 'contextual', 'ontology', 'behavioral', 'continuity'],
  frontend:       ['component', 'react', 'ui', 'ux', 'css', 'animation', 'layout', 'responsive', 'design', 'hook', 'state', 'render', 'interaction', 'modal', 'sidebar', 'panel'],
  backend:        ['api', 'server', 'database', 'schema', 'query', 'endpoint', 'auth', 'middleware', 'service', 'route', 'handler', 'supabase', 'postgres', 'migration', 'storage'],
  testing:        ['test', 'spec', 'unit', 'integration', 'e2e', 'cypress', 'jest', 'vitest', 'assertion', 'mock', 'stub', 'coverage', 'qa', 'playwright'],
  analytics:      ['data', 'analytics', 'metrics', 'dashboard', 'chart', 'report', 'visualization', 'statistics', 'insights', 'trend', 'burnout', 'focus score', 'deep work'],
  workflow:       ['flow', 'process', 'pipeline', 'automation', 'task', 'routine', 'system', 'architecture', 'pattern', 'structure', 'segmentation', 'fusion', 'orchestration'],
  productivity:   ['focus', 'deep work', 'concentration', 'burnout', 'session', 'tracking', 'productivity', 'efficiency', 'performance', 'context switch', 'attention'],
  implementation: ['implement', 'build', 'create', 'feature', 'module', 'class', 'function', 'engine', 'service', 'logic', 'algorithm', 'constructor', 'factory'],
  refactoring:    ['refactor', 'optimize', 'improve', 'restructure', 'simplify', 'clean', 'rewrite', 'performance', 'debt', 'maintenance'],
  planning:       ['plan', 'roadmap', 'architecture', 'scope', 'sprint', 'backlog', 'strategy', 'approach', 'design', 'diagram', 'spec'],
  debugging:      ['debug', 'fix', 'bug', 'error', 'issue', 'crash', 'exception', 'resolve', 'trace', 'investigate', 'breakpoint', 'console'],
};

// ─── Workflow Concept Relationships ──────────────────────────────────────────
// Higher-order semantic concepts: used by workblockFusionEngine and
// narrativeSynthesisEngine to reason about WHAT was accomplished.

export const WORKFLOW_CONCEPTS = {
  // Domain-level concepts
  productivity_intelligence: {
    label: 'Productivity Intelligence System',
    components: ['ai_engine', 'session_tracking', 'productivity_analytics'],
    narrative: 'AI-powered productivity intelligence and behavioral analysis',
  },
  calendar_intelligence: {
    label: 'Calendar Intelligence',
    components: ['calendar_system', 'planning_system', 'ai_engine'],
    narrative: 'intelligent calendar scheduling and AI-assisted planning',
  },
  dashboard_experience: {
    label: 'Dashboard & Analytics Experience',
    components: ['productivity_analytics', 'ui_components', 'reports'],
    narrative: 'productivity dashboard interactions and analytics visualization',
  },
  data_architecture: {
    label: 'Data Architecture',
    components: ['data_persistence', 'session_tracking', 'reports'],
    narrative: 'data persistence, storage architecture, and reporting pipelines',
  },
  notification_system: {
    label: 'Notification System',
    components: ['notifications', 'calendar_system', 'session_tracking'],
    narrative: 'notification delivery and alert management systems',
  },
  // Process-level concepts
  feature_development: {
    label: 'Feature Development',
    components: [],
    narrative: 'feature implementation and product engineering',
  },
  system_architecture: {
    label: 'System Architecture',
    components: [],
    narrative: 'system design and architectural planning',
  },
  quality_engineering: {
    label: 'Quality Engineering',
    components: [],
    narrative: 'testing, debugging, and code quality improvements',
  },
};

// ─── Implementation Stage Vocabulary ─────────────────────────────────────────
// Maps workflow stage signals to narrative descriptions.

export const IMPLEMENTATION_STAGE_VOCABULARY = {
  exploration:        { verb: 'Exploring',    noun: 'exploration',    past: 'Explored' },
  architecture:       { verb: 'Architecting', noun: 'architecture',   past: 'Architected' },
  initial_build:      { verb: 'Building',     noun: 'initial build',  past: 'Built' },
  active_development: { verb: 'Developing',   noun: 'development',    past: 'Developed' },
  refinement:         { verb: 'Refining',     noun: 'refinement',     past: 'Refined' },
  debugging:          { verb: 'Debugging',    noun: 'debugging',      past: 'Debugged' },
  review_and_ship:    { verb: 'Shipping',     noun: 'review & ship',  past: 'Shipped' },
};

// ─── Semantic Compound Phrase Builders ────────────────────────────────────────
// Intent + Feature → natural compound phrase for narrative synthesis.

export const INTENT_FEATURE_PHRASES = {
  'implementing+calendar_system':      'engineering calendar scheduling logic',
  'implementing+ai_engine':            'building AI intelligence and reasoning systems',
  'implementing+ui_components':        'engineering UI components and interaction patterns',
  'implementing+session_tracking':     'building session tracking and analysis features',
  'implementing+productivity_analytics': 'developing productivity analytics and insight generation',
  'implementing+planning_system':      'building smart scheduling and planning intelligence',
  'implementing+data_persistence':     'engineering data storage and persistence layer',
  'implementing+reports':              'building reporting and export systems',
  'implementing+notifications':        'engineering notification and alert delivery',

  'designing+ui_components':           'crafting UI components and visual design system',
  'designing+calendar_system':         'designing calendar UI and scheduling interactions',
  'designing+dashboard_experience':    'shaping dashboard layout and analytics visualization',

  'debugging+ai_engine':               'troubleshooting AI reasoning pipeline',
  'debugging+calendar_system':         'resolving calendar scheduling logic issues',
  'debugging+data_persistence':        'diagnosing data storage and query issues',
  'debugging+ui_components':           'fixing UI interaction and rendering bugs',

  'refactoring+ai_engine':             'restructuring AI intelligence architecture',
  'refactoring+session_tracking':      'improving session tracking and classification',
  'refactoring+calendar_system':       'optimizing calendar scheduling system',

  'researching+ai_engine':             'evaluating AI-assisted workflow architecture',
  'researching+calendar_system':       'exploring calendar scheduling approaches',
  'researching+planning_system':       'investigating smart scheduling solutions',

  'reviewing+ai_engine':               'evaluating AI intelligence implementation',
  'reviewing+ui_components':           'reviewing UI component implementations',
  'reviewing+data_persistence':        'auditing data architecture and schema design',
  'reviewing+session_tracking':        'evaluating session tracking implementation',
  'reviewing+productivity_analytics':  'reviewing productivity analytics implementation',
  'reviewing+calendar_system':         'evaluating calendar system and event handling',
  'reviewing+planning_system':         'reviewing scheduling intelligence implementation',
  'reviewing+notifications':           'reviewing notification system implementation',
  'reviewing+reports':                 'auditing reporting and export workflows',

  'documenting+ai_engine':             'documenting AI engine architecture and APIs',
  'documenting+calendar_system':       'writing calendar system documentation',
};

export function getIntentFeaturePhrase(intentType, featureId) {
  return INTENT_FEATURE_PHRASES[`${intentType}+${featureId}`] || null;
}

// ─── Productivity States ──────────────────────────────────────────────────────

export const PRODUCTIVITY_STATES = {
  peak_flow: {
    label: 'Peak Flow State',
    indicators: { minDurationMins: 90, maxContextSwitches: 5, minContinuityScore: 0.8 },
    adverb: 'deeply',
  },
  deep_focus: {
    label: 'Deep Focus',
    indicators: { minDurationMins: 60, maxContextSwitches: 12, minContinuityScore: 0.6 },
    adverb: 'steadily',
  },
  focused_work: {
    label: 'Focused Work',
    indicators: { minDurationMins: 30, maxContextSwitches: 20 },
    adverb: 'productively',
  },
  exploratory: {
    label: 'Exploratory Work',
    indicators: { minContextSwitches: 15, browserDominated: true },
    adverb: 'exploratorily',
  },
  fragmented: {
    label: 'Fragmented Session',
    indicators: { minContextSwitches: 30 },
    adverb: 'incrementally',
  },
};

// ─── Archetype Matching ───────────────────────────────────────────────────────

export function matchWorkflowArchetype(signals = {}) {
  const { apps = [], keywords = [], contextSwitches = 0, durationMins = 0 } = signals;
  const appSet = new Set(apps.map(a => String(a).toLowerCase()));
  const kwText = keywords.join(' ').toLowerCase();

  const scores = {};

  for (const [id, archetype] of Object.entries(WORKFLOW_ARCHETYPES)) {
    let score = 0;

    if (archetype.signals.apps) {
      for (const app of archetype.signals.apps) {
        if (appSet.has(app) || [...appSet].some(a => a.includes(app))) score += 20;
      }
    }

    if (archetype.signals.keywords) {
      for (const kw of archetype.signals.keywords) {
        if (kwText.includes(kw)) score += 10;
      }
    }

    if (archetype.signals.minDurationMins && durationMins >= archetype.signals.minDurationMins) {
      score += 15;
    }

    if (archetype.signals.maxContextSwitches !== undefined) {
      if (contextSwitches <= archetype.signals.maxContextSwitches) score += 5;
    }

    if (score > 0) scores[id] = score;
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  if (!sorted.length) return null;

  return {
    archetype: sorted[0][0],
    label: WORKFLOW_ARCHETYPES[sorted[0][0]].label,
    confidence: Math.min(sorted[0][1] / 60, 1),
    alternatives: sorted.slice(1, 3).map(([k]) => k),
  };
}

export function matchProductFeatures(keywords = [], titlePhrases = []) {
  const allText = [...keywords, ...titlePhrases].join(' ').toLowerCase();
  const matched = [];

  for (const [featureId, feature] of Object.entries(FEATURE_ONTOLOGY)) {
    const count = feature.keywords.filter(kw => allText.includes(kw)).length;
    if (count > 0) {
      matched.push({
        featureId,
        label: feature.label,
        system: feature.system,
        strength: count / feature.keywords.length,
        relatedFeatures: feature.relatedFeatures,
      });
    }
  }

  return matched.sort((a, b) => b.strength - a.strength);
}

export function getSemanticGroup(term) {
  const lower = String(term).toLowerCase();
  for (const [group, terms] of Object.entries(SEMANTIC_TERM_GROUPS)) {
    if (terms.some(t => lower.includes(t) || t.includes(lower))) return group;
  }
  return null;
}

export function detectProductivityState(contextSwitches = 0, durationMins = 0, continuityScore = 0, isBrowserDominated = false) {
  if (durationMins >= 90 && contextSwitches <= 5 && continuityScore >= 0.8) return 'peak_flow';
  if (durationMins >= 60 && contextSwitches <= 12 && continuityScore >= 0.6) return 'deep_focus';
  if (contextSwitches >= 30) return 'fragmented';
  if (contextSwitches >= 15 || isBrowserDominated) return 'exploratory';
  if (durationMins >= 30) return 'focused_work';
  return 'focused_work';
}

// ─── Workflow Dominance Ontology ──────────────────────────────────────────────
// Per-archetype weights used by workflowDominanceEngine for project-relevance
// scoring. Higher = more likely to be a genuine primary workflow; lower = more
// likely to be ambient, noise, or interruptive activity.

export const WORKFLOW_DOMINANCE_WEIGHTS = {
  deep_implementation: 1.00,  // Core productive work — always primary candidate
  debugging:           0.92,  // High-value focused work, strong primary signal
  refactoring:         0.88,  // Deliberate improvement — primary candidate
  design_work:         0.90,  // Focused creative work — primary candidate
  testing:             0.82,  // Intentional work — secondary to implementation
  planning:            0.78,  // Short planning sprints — can be primary
  documenting:         0.72,  // Writing work — valid primary, lower priority
  code_review:         0.70,  // Review sessions — secondary to implementation
  research:            0.55,  // Browsing/reading — often accompanies primary work
  communication:       0.35,  // Meetings/messaging — rarely the primary workflow
  learning:            0.45,  // Educational browsing — secondary/reference
  media_consumption:   0.05,  // YouTube/social — almost always noise
  utility:             0.10,  // System tools / file management — noise
};

/**
 * Get the dominance weight for a given workflow archetype.
 * Used by workflowDominanceEngine when computing project-relevance score.
 *
 * @param {string} archetypeId - e.g. 'deep_implementation', 'research'
 * @returns {number} weight 0–1
 */
export function getWorkflowDominanceWeight(archetypeId) {
  return WORKFLOW_DOMINANCE_WEIGHTS[archetypeId] ?? 0.50;
}

// ─── Noise App / URL Patterns ─────────────────────────────────────────────────
// Apps and URL patterns that are almost always noise or distraction.
// Used by workflowDominanceEngine for pre-filtering before dominance scoring.

export const NOISE_APP_PATTERNS = [
  /^(youtube|netflix|spotify|twitch|hulu|disney\+?|prime video|crunchyroll|tiktok)$/i,
  /^(twitter|x\.com|facebook|instagram|reddit|snapchat|pinterest|linkedin)$/i,
  /^(whatsapp|telegram|signal|discord|imessage|messages)$/i,
  /^(steam|epic games|origin|battle\.?net|roblox|minecraft)$/i,
  /^(snipping tool|calculator|clock|weather|news|widgets)$/i,
];

export const NOISE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be)/,
  /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//,
  /^https?:\/\/(www\.)?(reddit\.com)\//,
  /^https?:\/\/(www\.)?(facebook\.com|instagram\.com)\//,
  /^https?:\/\/(www\.)?(netflix\.com|twitch\.tv)\//,
];

/**
 * Returns true when an app name or URL matches known noise patterns.
 * Used by workflowDominanceEngine to pre-filter sessions before scoring.
 *
 * @param {string} appName
 * @param {string} [url]
 * @returns {boolean}
 */
export function isNoiseActivity(appName = '', url = '') {
  const appNorm = appName.trim();
  if (NOISE_APP_PATTERNS.some(re => re.test(appNorm))) return true;
  if (url && NOISE_URL_PATTERNS.some(re => re.test(url))) return true;
  return false;
}
