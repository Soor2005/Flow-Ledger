/**
 * Workblock Fusion Engine
 * Pipeline stage: after contextual reasoning, before narrative synthesis.
 *
 * This is the semantic convergence layer — it fuses multiple workflow segments
 * and fragmented telemetry signals into a unified understanding of what the
 * user accomplished. Inspired by Rize.io's workblock fusion architecture.
 *
 * The fundamental insight:
 *   Telemetry fragments (Figma + Chrome + VS Code + Claude + GitHub)
 *   are not isolated events — they are facets of ONE workflow.
 *
 * Fusion output provides:
 *   - primaryObjective     what was being accomplished end-to-end
 *   - toolEcosystem        the semantic meaning of the app combination
 *   - workflowNarrative    how the tools relate within this workflow
 *   - implementationPhase  where in the build cycle (explore/build/refine/ship)
 *   - semanticClusters     groups of related activities within the session
 *   - fusedSubject         best compound phrase for narrative synthesis
 *
 * No LLMs. Pure structured semantic reasoning over ranked signals.
 */

// ─── App Ecosystem Semantic Meanings ─────────────────────────────────────────
// When these app combinations appear together, they have a known workflow meaning.

const ECOSYSTEM_NARRATIVES = {
  // Coding + AI
  'coding+ai_tools':         'building with AI-assisted development workflows',
  'ai_tools+coding':         'implementing features with AI reasoning support',

  // Coding + Design
  'coding+design':           'designing and implementing UI components',
  'design+coding':           'translating design into functional code',

  // Coding + Research
  'coding+browser':          'implementing with research and documentation reference',
  'browser+coding':          'researching and applying technical solutions',

  // Design + Research
  'design+browser':          'designing with reference and inspiration research',
  'browser+design':          'exploring design patterns and implementing visuals',

  // Full Stack (coding + terminal + browser)
  'coding+terminal+browser': 'full-stack development with live testing and iteration',
  'coding+terminal':         'developing and running build processes',

  // Code Review
  'git+coding':              'reviewing, committing, and iterating on implementation',
  'git+browser':             'reviewing pull requests and managing code collaboration',

  // AI Research
  'ai_tools+browser':        'evaluating AI-assisted approaches and technical research',
  'browser+ai_tools':        'researching and exploring with AI assistance',

  // Planning
  'notes+project_mgmt':      'planning, organizing, and structuring work',
  'project_mgmt+notes':      'mapping out tasks and architectural decisions',

  // Deep Research
  'browser+notes':           'researching and synthesizing technical knowledge',
  'notes+browser':           'exploring and documenting findings',

  // AI + Notes
  'ai_tools+notes':          'evaluating and documenting AI-assisted workflows',
  'notes+ai_tools':          'synthesizing insights with AI assistance',
};

function lookupEcosystemNarrative(ecosystems = []) {
  const key = ecosystems.slice(0, 3).join('+');
  if (ECOSYSTEM_NARRATIVES[key]) return ECOSYSTEM_NARRATIVES[key];

  // Try pairs
  for (let i = 0; i < Math.min(ecosystems.length, 3); i++) {
    for (let j = i + 1; j < Math.min(ecosystems.length, 3); j++) {
      const pair = `${ecosystems[i]}+${ecosystems[j]}`;
      if (ECOSYSTEM_NARRATIVES[pair]) return ECOSYSTEM_NARRATIVES[pair];
    }
  }
  return null;
}

// ─── Feature Pair → Semantic Compound Description ────────────────────────────
// When two features are active together, their combination has a richer meaning.

const FEATURE_COMPOUND_MAP = {
  'calendar_system+ui_components':        'calendar scheduling interactions and visual design',
  'calendar_system+event_management':     'calendar event lifecycle and scheduling logic',
  'calendar_system+planning_system':      'smart scheduling and AI-powered calendar planning',
  'calendar_system+ai_engine':            'AI-enhanced calendar intelligence and scheduling',
  'ai_engine+session_tracking':           'AI intelligence for session analysis and classification',
  'ai_engine+productivity_analytics':     'AI-driven productivity insights and behavioral analysis',
  'ai_engine+planning_system':            'contextual AI scheduling and planning intelligence',
  'ai_engine+ui_components':              'AI-contextual interface interactions and intelligent UI',
  'productivity_analytics+reports':        'productivity metrics, analytics, and reporting systems',
  'productivity_analytics+session_tracking': 'session-based productivity analytics and focus insights',
  'ui_components+productivity_analytics': 'productivity dashboard UI and analytics visualization',
  'session_tracking+data_persistence':    'session tracking and data storage architecture',
  'event_management+notifications':       'event scheduling and notification delivery',
  'planning_system+ui_components':        'scheduling UI and planning interface interactions',
  'data_persistence+reports':             'data architecture and reporting pipelines',
};

function lookupFeatureCompound(featureIds = []) {
  const sorted = [...featureIds].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const key = `${sorted[i]}+${sorted[j]}`;
      if (FEATURE_COMPOUND_MAP[key]) return FEATURE_COMPOUND_MAP[key];
    }
  }
  return null;
}

// ─── Implementation Phase Detection ──────────────────────────────────────────
// Detect where in the development lifecycle this workblock sits.

const PHASE_SIGNALS = {
  exploration: {
    label: 'Exploration',
    keywords: ['research', 'explore', 'compare', 'evaluate', 'understand', 'learn', 'investigate', 'consider', 'approach', 'options'],
    modes: ['research', 'planning'],
    verb: 'exploring',
  },
  architecture: {
    label: 'Architecture & Planning',
    keywords: ['architecture', 'design', 'schema', 'plan', 'structure', 'approach', 'system', 'pattern', 'model', 'diagram'],
    modes: ['planning'],
    verb: 'architecting',
  },
  initial_build: {
    label: 'Initial Build',
    keywords: ['implement', 'create', 'build', 'scaffold', 'setup', 'init', 'start', 'bootstrap', 'wire up'],
    modes: ['deep_implementation'],
    verb: 'building',
  },
  active_development: {
    label: 'Active Development',
    keywords: ['feature', 'component', 'hook', 'engine', 'module', 'service', 'function', 'logic', 'system'],
    modes: ['deep_implementation', 'designing'],
    verb: 'developing',
  },
  refinement: {
    label: 'Refinement',
    keywords: ['improve', 'refactor', 'optimize', 'fix', 'polish', 'clean', 'enhance', 'tune', 'adjust', 'tweak'],
    modes: ['refactoring', 'debugging'],
    verb: 'refining',
  },
  debugging: {
    label: 'Debugging',
    keywords: ['debug', 'error', 'bug', 'fix', 'issue', 'broken', 'crash', 'exception', 'resolve', 'trace'],
    modes: ['debugging'],
    verb: 'debugging',
  },
  review_and_ship: {
    label: 'Review & Ship',
    keywords: ['review', 'deploy', 'release', 'ship', 'pr', 'merge', 'publish', 'test', 'verify', 'validate'],
    modes: ['reviewing', 'testing', 'deploying'],
    verb: 'shipping',
  },
};

function detectImplementationPhase(keywords = [], workMode = '', intentType = '') {
  const allText = [...keywords, workMode, intentType].join(' ').toLowerCase();
  const scores = {};

  for (const [phaseId, phase] of Object.entries(PHASE_SIGNALS)) {
    let score = 0;
    score += phase.keywords.filter(kw => allText.includes(kw)).length * 10;
    if (phase.modes.includes(workMode)) score += 25;
    if (phase.modes.includes(intentType)) score += 15;
    if (score > 0) scores[phaseId] = score;
  }

  const top = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  const phaseId = top?.[0] || 'active_development';

  return {
    phaseId,
    ...PHASE_SIGNALS[phaseId],
    confidence: top ? Math.min(top[1] / 50, 0.95) : 0.35,
  };
}

// ─── Semantic Cluster Builder ─────────────────────────────────────────────────
// Groups activities within the workblock by semantic similarity.

const ACTIVITY_ARCHETYPES = {
  ui_work:     { label: 'UI & Interaction Design',  keywords: ['component', 'layout', 'animation', 'hover', 'modal', 'sidebar', 'panel', 'ui', 'ux', 'style', 'design', 'figma', 'wireframe'] },
  logic_work:  { label: 'Logic & Business Rules',   keywords: ['logic', 'engine', 'service', 'algorithm', 'function', 'handler', 'middleware', 'api', 'schema', 'query', 'pipeline'] },
  ai_work:     { label: 'AI & Intelligence Systems',keywords: ['ai', 'semantic', 'inference', 'reasoning', 'ontology', 'embedding', 'context', 'intelligence', 'nlp', 'model'] },
  data_work:   { label: 'Data & Persistence',       keywords: ['database', 'storage', 'schema', 'migration', 'query', 'supabase', 'postgres', 'localstorage', 'api', 'fetch'] },
  test_work:   { label: 'Testing & Validation',     keywords: ['test', 'spec', 'jest', 'vitest', 'cypress', 'assertion', 'mock', 'coverage', 'qa', 'validate', 'verify'] },
  research:    { label: 'Research & Evaluation',    keywords: ['research', 'explore', 'docs', 'documentation', 'stackoverflow', 'mdn', 'github', 'learn', 'evaluate', 'compare'] },
  planning:    { label: 'Planning & Architecture',  keywords: ['plan', 'architecture', 'design', 'roadmap', 'schema', 'structure', 'approach', 'scope', 'sprint', 'backlog'] },
};

function buildSemanticClusters(keywords = [], topPhrases = []) {
  const allText = [...keywords, ...topPhrases.map(p => p.phrase || p)].join(' ').toLowerCase();
  const active = [];

  for (const [id, archetype] of Object.entries(ACTIVITY_ARCHETYPES)) {
    const matches = archetype.keywords.filter(kw => allText.includes(kw)).length;
    if (matches >= 2) {
      active.push({ id, label: archetype.label, strength: Math.min(matches / archetype.keywords.length, 1) });
    }
  }

  return active.sort((a, b) => b.strength - a.strength);
}

// ─── Primary Objective Builder ────────────────────────────────────────────────

function buildPrimaryObjective({
  featureCompound, ecosystemNarrative, topPhrases, workflowType, intentType,
  topFeature, workMode, segments,
}) {
  // Priority 1: Feature compound (two features = specific objective)
  if (featureCompound) return featureCompound;

  // Priority 2: Top window title phrase cleaned up
  const topPhrase = (topPhrases[0]?.phrase || topPhrases[0] || '');
  const cleanedPhrase = topPhrase
    .replace(/\s*[-—|·•]\s*(VS Code|Visual Studio Code|Cursor|Chrome|Firefox|Figma|Claude|Arc|Edge|GitHub)\s*$/i, '')
    .replace(/^(building|implementing|designing|creating|developing|fixing|debugging|testing|researching)\s+/i, '')
    .trim();

  if (cleanedPhrase.length >= 8 && cleanedPhrase.length <= 80) {
    return cleanedPhrase.toLowerCase();
  }

  // Priority 3: Top feature label
  if (topFeature?.label) return topFeature.label.toLowerCase();

  // Priority 4: Ecosystem narrative
  if (ecosystemNarrative) return ecosystemNarrative;

  // Priority 5: Workflow type narrative
  return workflowType?.narrative || 'focused product development';
}

// ─── Fused Subject Phrase Builder ─────────────────────────────────────────────
// The "subject" that will be used inside the narrative synthesis title.

function buildFusedSubject({
  topPhrases, featureCompound, semanticClusters, implementationPhase, topFeature, project,
}) {
  // Best phrase from top window titles
  const bestPhrase = topPhrases
    .map(p => (p.phrase || p)
      .replace(/\s*[-—|·•]\s*(VS Code|Visual Studio Code|Cursor|Chrome|Firefox|Figma|Claude|Arc|GitHub|Notion|Linear)\s*$/i, '')
      .trim()
    )
    .find(p => p.length >= 8 && p.length <= 75);

  if (bestPhrase) return bestPhrase;

  // Feature compound description
  if (featureCompound) return featureCompound;

  // Top semantic cluster
  if (semanticClusters[0]) return semanticClusters[0].label.toLowerCase();

  // Feature + project
  if (topFeature?.label && project?.name) return `${project.name} ${topFeature.label.toLowerCase()}`;
  if (topFeature?.label) return topFeature.label.toLowerCase();

  return null;
}

// ─── Workflow Narrative Builder ───────────────────────────────────────────────

function buildWorkflowNarrative({ ecosystemNarrative, workflowType, implementationPhase, semanticClusters }) {
  if (ecosystemNarrative) return ecosystemNarrative;

  const clusterLabels = semanticClusters.slice(0, 2).map(c => c.label.toLowerCase());
  if (clusterLabels.length >= 2) {
    return `${clusterLabels[0]} and ${clusterLabels[1]}`;
  }
  if (clusterLabels.length === 1) return clusterLabels[0];

  return workflowType?.narrative || 'focused development work';
}

// ─── Fusion Confidence ────────────────────────────────────────────────────────

function computeFusionConfidence({
  featureCompound, ecosystemNarrative, semanticClusters, implementationPhase,
  topPhrases, segmentCount,
}) {
  let score = 0.30;
  if (featureCompound)              score += 0.20;
  if (ecosystemNarrative)           score += 0.12;
  if (semanticClusters.length >= 2) score += 0.12;
  if (implementationPhase.confidence >= 0.5) score += 0.10;
  if (topPhrases.length >= 2)       score += 0.08;
  if (segmentCount >= 2)            score += 0.06;
  return Math.min(Math.round(score * 100) / 100, 0.95);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fuse workflow segments and contextual reasoning into a unified semantic workblock.
 *
 * @param {Array}  segments  - from workflowSegmentationEngine.segmentWorkflow()
 * @param {Object} reasoning - from reasoningOrchestrator pipeline (compressed, featureGraph, etc.)
 * @returns {Object} fusedWorkblock
 */
export function fuseWorkblock(segments = [], reasoning = {}) {
  const {
    compressed = {},
    featureGraph = {},
    intentResult = {},
    behaviorProfile = {},
    project = null,
  } = reasoning;

  // Collect all phrases + keywords across segments and compressed context
  const allPhrases = [
    ...(compressed.titlePhrases || []),
    ...segments.flatMap(s => s.topPhrases),
  ].reduce((acc, p) => {
    if (!acc.some(x => (x.phrase || x) === (p.phrase || p))) acc.push(p);
    return acc;
  }, []).slice(0, 10);

  const allKeywords = [
    ...(compressed.keywords || []),
    ...segments.flatMap(s => s.keywords),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 30);

  const allEcosystems = [...new Set(segments.flatMap(s => s.ecosystems))];

  // Feature compound description
  const featureIds = (featureGraph?.activeCluster || []).map(f => f.featureId);
  const featureCompound = lookupFeatureCompound(featureIds);

  // Ecosystem narrative
  const ecosystemNarrative = lookupEcosystemNarrative(allEcosystems);

  // Implementation phase
  const implementationPhase = detectImplementationPhase(
    allKeywords,
    behaviorProfile?.workMode?.primary || '',
    intentResult?.type || '',
  );

  // Semantic clusters
  const semanticClusters = buildSemanticClusters(allKeywords, allPhrases);

  // Workflow type (from dominant segment)
  const dominantSegment = segments.reduce(
    (best, s) => (s.durationMins > (best?.durationMins || 0) ? s : best),
    null,
  );
  const workflowType = dominantSegment?.workflowType || { id: 'focused_work', label: 'Focused Work', narrative: 'working' };

  // Top feature from feature graph
  const topFeature = featureGraph?.topFeature || null;

  // Primary objective
  const primaryObjective = buildPrimaryObjective({
    featureCompound,
    ecosystemNarrative,
    topPhrases: allPhrases,
    workflowType,
    intentType: intentResult?.type,
    topFeature,
    workMode: behaviorProfile?.workMode?.primary,
    segments,
  });

  // Fused subject (for title synthesis)
  const fusedSubject = buildFusedSubject({
    topPhrases: allPhrases,
    featureCompound,
    semanticClusters,
    implementationPhase,
    topFeature,
    project,
  });

  // Workflow narrative
  const workflowNarrative = buildWorkflowNarrative({
    ecosystemNarrative,
    workflowType,
    implementationPhase,
    semanticClusters,
  });

  const fusionConfidence = computeFusionConfidence({
    featureCompound,
    ecosystemNarrative,
    semanticClusters,
    implementationPhase,
    topPhrases: allPhrases,
    segmentCount: segments.length,
  });

  return {
    // Core semantic outputs
    primaryObjective,
    fusedSubject,
    workflowNarrative,
    workflowType,

    // Phase and clustering
    implementationPhase,
    semanticClusters,

    // Ecosystem reasoning
    toolEcosystem: allEcosystems,
    ecosystemNarrative,

    // Feature context
    featureCompound,
    topFeature,
    featureIds,

    // Signals
    topPhrases:  allPhrases.slice(0, 6),
    allKeywords: allKeywords.slice(0, 20),

    // Metadata
    segmentCount: segments.length,
    fusionConfidence,
    hasFeatureContext:    !!featureCompound,
    hasEcosystemContext:  !!ecosystemNarrative,
    hasClusterContext:    semanticClusters.length >= 2,
  };
}

/**
 * Quick synchronous fusion for real-time contexts (no segments needed).
 * Uses only compressed context + reasoning result.
 *
 * @param {Object} compressed  - contextCompressionEngine output
 * @param {Object} reasoning   - partial reasoning state
 * @returns {Object} lightweight fusedWorkblock
 */
export function fuseWorkblockSync(compressed = {}, reasoning = {}) {
  return fuseWorkblock([], { compressed, ...reasoning });
}

/**
 * Extract the best single compound phrase from a fused workblock.
 * Used as the subject input to narrativeSynthesisEngine.
 */
export function getFusedPhrase(workblock) {
  if (workblock?.fusedSubject) return workblock.fusedSubject;
  if (workblock?.featureCompound) return workblock.featureCompound;
  if (workblock?.primaryObjective) return workblock.primaryObjective;
  return null;
}
