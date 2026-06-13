/**
 * Intent Inference Engine
 * Stage 5 of the contextual intelligence pipeline.
 *
 * Infers WHY the user is working — not just WHAT apps are open.
 * Converts behavioral + contextual signals into a clear implementation intent
 * that downstream engines use to generate human-quality narratives.
 *
 * No LLMs. Pure structured reasoning over ranked signals and workflow state.
 */

import { AI_TOOL_DOMINANCE_THRESHOLD } from './productivityOntologyEngine.js';

// ─── Intent Type Definitions ──────────────────────────────────────────────────

// ─── Domain-Specific Purpose Lookup ──────────────────────────────────────────
// Returns a natural, outcome-focused purpose clause based on intent + domain.
//
// Each entry maps a regex pattern to an ARRAY of 2-3 purpose variants rather than
// a single fixed string. This prevents every description from ending with the exact
// same clause (NQ-05). Variant selection is deterministic: `seed % variants.length`
// where seed is derived from the subject string, so the same session always gets
// the same variant but different subjects produce different phrasings.

const DOMAIN_PURPOSE_MAP = {
  implementing: [
    [/ai|intelligence|reasoning|inference|semantic|nlp/, [
      'to strengthen contextual reasoning capabilities and intelligence accuracy',
      'to deepen AI signal quality and improve inference reliability',
      'to extend intelligence coverage and sharpen contextual accuracy',
    ]],
    [/analytics|insight|productiv|metric|report/, [
      'to improve data accuracy and deliver richer productivity insights',
      'to surface clearer productivity signals and sharpen reporting quality',
      'to expand analytics coverage and improve insight fidelity',
    ]],
    [/session|tracking|activity|time(?!r)/, [
      'to enhance session intelligence and activity tracking reliability',
      'to improve tracking accuracy and reduce signal noise',
      'to extend tracking coverage and sharpen session attribution',
    ]],
    [/calendar|sched|event|booking/, [
      'to improve scheduling capabilities and event management quality',
      'to extend calendar intelligence and reduce scheduling friction',
      'to sharpen event reliability and scheduling accuracy',
    ]],
    [/workflow|pipeline|process|automation/, [
      'to advance workflow automation and classification accuracy',
      'to improve pipeline reliability and reduce processing errors',
      'to extend workflow coverage and sharpen classification precision',
    ]],
    [/ui|design|ux|interface|layout|visual|component/, [
      'to improve user experience quality and interface consistency',
      'to sharpen interaction patterns and reduce UI friction',
      'to extend component coverage and improve design consistency',
    ]],
    [/performance|optim|speed|latency|cache/, [
      'to improve application speed and resource efficiency',
      'to reduce latency and eliminate performance bottlenecks',
      'to extend performance improvements and optimize resource usage',
    ]],
    [/auth|login|security|permission|role/, [
      'to strengthen security controls and access management reliability',
      'to harden authentication flows and reduce permission surface area',
      'to extend security coverage and improve access control precision',
    ]],
    [/data|database|storage|persist|schema/, [
      'to improve data integrity and storage layer reliability',
      'to strengthen persistence layer correctness and reduce data errors',
      'to extend storage coverage and improve schema consistency',
    ]],
    [/notification|alert|message|push/, [
      'to improve alert delivery and notification reliability',
      'to reduce notification noise and sharpen alert targeting',
    ]],
    [/test|spec|validation|coverage/, [
      'to expand test coverage and prevent regressions',
      'to harden validation coverage and catch edge case failures',
    ]],
  ],
  debugging: [
    [/ai|intelligence|reasoning|inference|semantic/, [
      'to resolve AI reasoning errors and restore correct inference behavior',
      'to diagnose intelligence failures and eliminate incorrect signal classification',
    ]],
    [/analytics|insight|productiv|metric|report/, [
      'to fix data accuracy issues and restore correct productivity calculations',
      'to eliminate reporting errors and restore metric reliability',
    ]],
    [/session|tracking|activity|time(?!r)/, [
      'to resolve session tracking errors and restore activity data accuracy',
      'to diagnose tracking failures and eliminate data loss scenarios',
    ]],
    [/calendar|sched|event|booking/, [
      'to fix scheduling errors and restore reliable event management',
      'to diagnose calendar failures and restore scheduling correctness',
    ]],
    [/workflow|pipeline|process|automation/, [
      'to resolve workflow classification bugs and restore processing accuracy',
      'to diagnose pipeline failures and eliminate processing errors',
    ]],
    [/ui|design|ux|interface|layout|visual|component/, [
      'to fix UI rendering issues and restore correct interaction behavior',
      'to diagnose interface failures and eliminate interaction regressions',
    ]],
    [/performance|optim|speed|latency|cache/, [
      'to eliminate performance bottlenecks and improve response times',
      'to diagnose slow paths and restore expected performance levels',
    ]],
    [/auth|login|security|permission|role/, [
      'to resolve authentication failures and restore access control reliability',
      'to diagnose security issues and eliminate permission errors',
    ]],
    [/data|database|storage|persist|schema/, [
      'to fix data persistence errors and restore storage integrity',
      'to diagnose storage failures and eliminate data corruption paths',
    ]],
  ],
  reviewing: [
    [/ai|intelligence|reasoning|inference|semantic/, [
      'to evaluate AI intelligence implementation and identify optimization opportunities',
      'to assess inference quality and surface improvement opportunities',
    ]],
    [/analytics|insight|productiv|metric|report/, [
      'to verify data accuracy and identify opportunities to improve reporting quality',
      'to assess analytics correctness and surface insight improvements',
    ]],
    [/session|tracking|activity|time(?!r)/, [
      'to validate session tracking correctness and improve data reliability',
      'to audit tracking accuracy and identify attribution gaps',
    ]],
    [/calendar|sched|event|booking/, [
      'to verify event management reliability and scheduling accuracy',
      'to assess scheduling quality and identify edge case handling gaps',
    ]],
    [/workflow|pipeline|process|automation/, [
      'to strengthen workflow classification accuracy and processing reliability',
      'to audit pipeline correctness and identify classification gaps',
    ]],
    [/ui|design|ux|interface|layout|visual|component/, [
      'to refine interface quality and interaction consistency',
      'to assess UX patterns and identify usability improvements',
    ]],
    [/performance|optim|speed|latency|cache/, [
      'to identify performance bottlenecks and optimization opportunities',
      'to audit response times and surface latency improvement areas',
    ]],
    [/auth|login|security|permission|role/, [
      'to validate security controls and access management correctness',
      'to audit permission logic and identify security coverage gaps',
    ]],
    [/data|database|storage|persist|schema/, [
      'to verify data integrity and storage layer reliability',
      'to audit storage correctness and identify data consistency issues',
    ]],
    [/test|spec|validation|coverage/, [
      'to validate test coverage and ensure regression prevention',
      'to assess test quality and identify coverage gaps',
    ]],
  ],
  refactoring: [
    [/ai|intelligence|reasoning|inference|semantic/, [
      'to simplify AI reasoning complexity and improve long-term maintainability',
      'to reduce inference complexity and improve code clarity',
    ]],
    [/analytics|insight|productiv|metric|report/, [
      'to clean up analytics code and improve insight generation clarity',
      'to reduce reporting complexity and improve code maintainability',
    ]],
    [/session|tracking|activity|time(?!r)/, [
      'to simplify session tracking logic and reduce technical debt',
      'to improve tracking code structure and reduce maintenance overhead',
    ]],
    [/workflow|pipeline|process|automation/, [
      'to simplify workflow processing and improve code maintainability',
      'to reduce pipeline complexity and improve long-term clarity',
    ]],
    [/ui|design|ux|interface|layout|visual|component/, [
      'to improve component architecture and UI code maintainability',
      'to reduce interface complexity and improve design system consistency',
    ]],
    [/performance|optim|speed|latency|cache/, [
      'to eliminate inefficiencies and improve overall system responsiveness',
      'to simplify performance-critical paths and improve resource usage',
    ]],
    [/data|database|storage|persist|schema/, [
      'to simplify data access patterns and improve storage layer clarity',
      'to reduce persistence complexity and improve query maintainability',
    ]],
  ],
  testing: [
    [/ai|intelligence|reasoning|inference|semantic/, [
      'to validate AI reasoning accuracy and prevent intelligence regressions',
      'to verify inference correctness and harden edge case handling',
    ]],
    [/analytics|insight|productiv|metric|report/, [
      'to verify data accuracy and prevent calculation regressions',
      'to validate reporting correctness and harden metric edge cases',
    ]],
    [/session|tracking|activity|time(?!r)/, [
      'to validate session tracking correctness and prevent data loss scenarios',
      'to verify tracking reliability and harden attribution edge cases',
    ]],
    [/workflow|pipeline|process|automation/, [
      'to verify workflow classification reliability and edge case handling',
      'to validate pipeline correctness and prevent processing regressions',
    ]],
    [/ui|design|ux|interface|layout|visual|component/, [
      'to validate UI behavior and prevent interaction regressions',
      'to verify component correctness and harden accessibility edge cases',
    ]],
    [/auth|login|security|permission|role/, [
      'to verify security controls and access management edge cases',
      'to validate authentication flows and prevent permission regressions',
    ]],
  ],
  designing: [
    [/ui|design|ux|interface|layout|visual|component/, [
      'to define clear visual hierarchy and improve interaction quality',
      'to establish cohesive interaction patterns and reduce design friction',
    ]],
    [/calendar|sched|event|booking/, [
      'to improve scheduling UI clarity and user interaction flow',
      'to define calendar interaction patterns and reduce scheduling friction',
    ]],
    [/analytics|insight|productiv|metric|report/, [
      'to make productivity data more accessible and actionable at a glance',
      'to improve data visualization clarity and reduce cognitive load',
    ]],
  ],
  researching: [
    [/.*/, [
      'to evaluate options and identify the most effective implementation approach',
      'to understand available approaches and inform technical decision-making',
      'to explore the solution space and identify the best path forward',
    ]],
  ],
  planning: [
    [/.*/, [
      'to establish a clear implementation strategy and technical roadmap',
      'to define the approach and sequence work for the next phase',
      'to map out dependencies and identify the critical implementation path',
    ]],
  ],
  documenting: [
    [/.*/, [
      'to create clear, maintainable documentation for future reference',
      'to document technical decisions and reduce future onboarding friction',
      'to capture implementation context and establish a knowledge baseline',
    ]],
  ],
  analyzing: [
    [/analytics|insight|productiv|metric|report/, [
      'to surface actionable insights and inform development priorities',
      'to identify usage patterns and derive data-driven improvement targets',
    ]],
    [/performance|optim|speed|latency|cache/, [
      'to identify performance patterns and pinpoint optimization targets',
      'to quantify performance characteristics and identify improvement opportunities',
    ]],
    [/.*/, [
      'to derive actionable insights from available data and usage patterns',
      'to identify patterns and translate findings into actionable next steps',
    ]],
  ],
};

// Deterministic variant selection: same subject → same variant every time,
// but different subjects → different variants (breaks monotony without randomness).
function pickPurposeVariant(variants, subject = '') {
  if (!variants || !variants.length) return null;
  if (variants.length === 1) return variants[0];
  const seed = subject.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return variants[seed % variants.length];
}

function getPurposeForDomain(intentType, subject) {
  const rules = DOMAIN_PURPOSE_MAP[intentType];
  if (!rules || !subject) return null;
  const s = subject.toLowerCase();
  for (const [pattern, variants] of rules) {
    if (pattern.test(s)) return pickPurposeVariant(variants, subject);
  }
  return null;
}

export const INTENT_TYPES = {
  implementing: {
    label: 'Implementing',
    verbs:     ['Implementing', 'Building', 'Developing', 'Engineering', 'Creating', 'Constructing'],
    pastVerbs: ['Implemented', 'Built', 'Developed', 'Engineered'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('implementing', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to extend ${project}'s core capabilities with new functionality`
        : `to build and integrate the new functionality`;
    },
  },
  debugging: {
    label: 'Debugging',
    verbs:     ['Debugging', 'Fixing', 'Resolving', 'Troubleshooting', 'Diagnosing', 'Investigating'],
    pastVerbs: ['Debugged', 'Fixed', 'Resolved', 'Investigated'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('debugging', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to restore correct behavior and prevent further issues in ${project}`
        : `to diagnose the root cause and restore correct behavior`;
    },
  },
  researching: {
    label: 'Researching',
    verbs:     ['Analyzing', 'Exploring', 'Investigating', 'Studying', 'Evaluating'],
    pastVerbs: ['Analyzed', 'Explored', 'Evaluated', 'Investigated'],
    purpose: (subject, project) =>
      project
        ? `to evaluate options and inform ${project}'s development direction`
        : `to evaluate options and identify the best implementation approach`,
  },
  designing: {
    label: 'Designing',
    verbs:     ['Designing', 'Crafting', 'Refining', 'Prototyping', 'Wireframing', 'Shaping'],
    pastVerbs: ['Designed', 'Crafted', 'Refined', 'Prototyped'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('designing', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to establish clear UX patterns and visual direction for ${project}`
        : `to establish the visual language and interaction design`;
    },
  },
  planning: {
    label: 'Planning',
    verbs:     ['Planning', 'Architecting', 'Scoping', 'Mapping out', 'Structuring', 'Organizing'],
    pastVerbs: ['Planned', 'Architected', 'Scoped', 'Mapped out'],
    purpose: (subject, project) =>
      project
        ? `to define the architecture and implementation approach for ${project}`
        : `to establish a clear implementation strategy and technical roadmap`,
  },
  refactoring: {
    label: 'Refactoring',
    verbs:     ['Refactoring', 'Improving', 'Restructuring', 'Optimizing', 'Cleaning up', 'Simplifying'],
    pastVerbs: ['Refactored', 'Improved', 'Optimized', 'Restructured'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('refactoring', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to reduce complexity and improve ${project}'s long-term maintainability`
        : `to reduce complexity, improve readability, and eliminate technical debt`;
    },
  },
  reviewing: {
    label: 'Reviewing',
    verbs:     ['Reviewing', 'Auditing', 'Evaluating', 'Inspecting', 'Assessing', 'Analyzing'],
    pastVerbs: ['Reviewed', 'Audited', 'Evaluated', 'Inspected'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('reviewing', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to evaluate implementation quality and identify improvements in ${project}`
        : `to assess implementation quality and identify improvement opportunities`;
    },
  },
  documenting: {
    label: 'Documenting',
    verbs:     ['Documenting', 'Writing', 'Drafting', 'Authoring', 'Composing'],
    pastVerbs: ['Documented', 'Wrote', 'Drafted', 'Authored'],
    purpose: (subject, project) =>
      project
        ? `to create clear, maintainable documentation for ${project}'s systems`
        : `to document technical decisions and create a reference for future development`,
  },
  testing: {
    label: 'Testing',
    verbs:     ['Testing', 'Validating', 'Verifying', 'Writing tests for', 'QA-testing'],
    pastVerbs: ['Tested', 'Validated', 'Verified'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('testing', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to validate behavior and ensure reliability of ${project}'s core functionality`
        : `to validate correctness and prevent regressions in the system`;
    },
  },
  deploying: {
    label: 'Deploying',
    verbs:     ['Deploying', 'Releasing', 'Shipping', 'Publishing', 'Launching'],
    pastVerbs: ['Deployed', 'Released', 'Shipped', 'Published'],
    purpose: (subject, project) =>
      project
        ? `to deliver ${subject || 'updates'} to production for ${project}`
        : `to release the latest changes to the production environment`,
  },
  analyzing: {
    label: 'Analyzing',
    verbs:     ['Analyzing', 'Investigating', 'Auditing', 'Reviewing', 'Examining'],
    pastVerbs: ['Analyzed', 'Investigated', 'Reviewed', 'Examined'],
    purpose: (subject, project) => {
      const domainPurpose = getPurposeForDomain('analyzing', subject);
      if (domainPurpose) return domainPurpose;
      return project
        ? `to surface insights that inform ${project}'s direction`
        : `to derive actionable insights from the available data and patterns`;
    },
  },
  collaborating: {
    label: 'Collaborating',
    verbs:     ['Collaborating on', 'Discussing', 'Reviewing', 'Aligning on'],
    pastVerbs: ['Collaborated on', 'Discussed', 'Reviewed'],
    purpose: (subject, project) =>
      `to align on approach and make progress on ${subject || (project ? `${project} direction` : 'the work')}`,
  },
};

// ─── Semantic Domain Inference ────────────────────────────────────────────────
// Infer what domain a subject phrase belongs to — used for purpose clauses.

export function inferDomain(subject, fallback = 'capabilities') {
  if (!subject) return fallback;
  const s = subject.toLowerCase();
  if (/calendar|sched|event|booking/.test(s))           return 'scheduling and calendar management';
  if (/ai|intelligence|reasoning|inference|semantic|nlp/.test(s)) return 'AI intelligence and reasoning';
  if (/session|tracking|activity|time/.test(s))         return 'session tracking and activity intelligence';
  if (/analytics|insight|productiv|metric|report/.test(s)) return 'analytics and productivity insights';
  if (/burnout|fatigue|wellness|recovery/.test(s))       return 'health and burnout detection';
  if (/ui|design|ux|interface|layout|visual|component/.test(s)) return 'UI and design system';
  if (/data|database|storage|persist|schema/.test(s))   return 'data layer and storage';
  if (/api|endpoint|backend|server|route/.test(s))       return 'API and backend services';
  if (/auth|login|security|permission|role/.test(s))     return 'authentication and access control';
  if (/performance|optim|speed|latency|cache/.test(s))   return 'performance and optimization';
  if (/test|spec|validation|coverage/.test(s))           return 'test coverage and reliability';
  if (/doc|readme|wiki|guide|spec/.test(s))             return 'documentation and technical writing';
  if (/workflow|pipeline|process|automation/.test(s))    return 'workflow automation and processes';
  if (/notification|alert|message|push/.test(s))        return 'notification and alerting systems';
  return fallback;
}

export function inferCapability(subject) {
  if (!subject) return 'new functionality';
  const s = subject.toLowerCase();
  // Return a concise capability description
  if (s.length <= 40 && /[a-z]/.test(s)) return s;
  return 'the new functionality';
}

// ─── Intent Detection Rules ───────────────────────────────────────────────────
// Ordered by specificity — first match wins for high-confidence signals

const INTENT_RULES = [
  {
    type: 'debugging',
    weight: 95,
    keywordSignals: ['debug', 'fix', 'bug', 'error', 'issue', 'crash', 'exception', 'broken', 'resolve', 'trace', 'stack trace', 'console error', 'breakpoint'],
    appSignals: [],
  },
  {
    type: 'testing',
    weight: 90,
    keywordSignals: ['test', 'spec', 'jest', 'vitest', 'cypress', 'playwright', 'unit test', 'e2e', 'assertion', 'mock', 'stub', 'coverage', 'qa'],
    appSignals: [],
  },
  {
    type: 'designing',
    weight: 88,
    keywordSignals: ['design', 'wireframe', 'mockup', 'prototype', 'layout', 'ui', 'ux', 'figma', 'interaction', 'animation', 'visual', 'typography', 'spacing'],
    appSignals: ['figma', 'sketch', 'adobe xd', 'framer', 'canva', 'affinity'],
  },
  {
    type: 'deploying',
    weight: 85,
    // "pipeline" removed — it's architecture/AI terminology, not deployment
    keywordSignals: ['deploy', 'release', 'ship', 'publish', 'production', 'staging', 'ci', 'cd', 'github actions', 'vercel', 'railway', 'merge to main', 'release branch'],
    appSignals: [],
  },
  {
    type: 'refactoring',
    weight: 82,
    keywordSignals: ['refactor', 'cleanup', 'clean up', 'restructure', 'simplify', 'optimize', 'rewrite', 'improve', 'performance', 'technical debt'],
    appSignals: [],
  },
  {
    type: 'planning',
    weight: 78,
    keywordSignals: ['plan', 'roadmap', 'architecture', 'system design', 'schema', 'scope', 'sprint', 'backlog', 'strategy', 'approach', 'structure'],
    appSignals: ['notion', 'linear', 'jira', 'trello', 'asana'],
  },
  {
    type: 'documenting',
    weight: 75,
    keywordSignals: ['docs', 'documentation', 'readme', 'wiki', 'write', 'draft', 'spec', 'guide', 'tutorial', 'notes', 'changelog'],
    appSignals: ['notion', 'obsidian', 'typora'],
  },
  {
    type: 'reviewing',
    weight: 72,
    keywordSignals: ['review', 'pull request', 'pr', 'feedback', 'audit', 'inspect', 'evaluate', 'code review', 'approve', 'comment'],
    appSignals: ['github', 'gitlab'],
  },
  {
    type: 'researching',
    weight: 68,
    keywordSignals: ['research', 'explore', 'learn', 'study', 'investigate', 'compare', 'evaluate', 'how to', 'documentation', 'stackoverflow', 'mdn'],
    appSignals: ['chrome', 'firefox', 'safari', 'arc', 'brave'],
  },
  {
    type: 'implementing',
    weight: 60,
    keywordSignals: ['implement', 'build', 'create', 'feature', 'component', 'module', 'service', 'function', 'class', 'hook', 'engine', 'system'],
    appSignals: ['vscode', 'cursor', 'webstorm', 'intellij', 'xcode'],
  },
];

// ─── Objective Phrase Builders ────────────────────────────────────────────────
// Map feature/context combos to natural objective descriptions

const FEATURE_OBJECTIVE_PHRASES = {
  calendar_system:      'calendar scheduling and event management',
  event_management:     'event lifecycle and scheduling behavior',
  session_tracking:     'session tracking and time intelligence',
  productivity_analytics: 'productivity analytics and focus insights',
  ai_engine:            'AI intelligence and contextual reasoning',
  ui_components:        'UI component interactions and design system',
  data_persistence:     'data persistence and storage layer',
  reports:              'reporting and export workflows',
  notifications:        'notification and alert system',
  planning_system:      'planning and scheduling intelligence',
};

const SYSTEM_OBJECTIVE_PHRASES = {
  core:      'core product functionality',
  frontend:  'frontend interactions and UI',
  backend:   'backend services and API layer',
  analytics: 'analytics and reporting systems',
  ai:        'AI intelligence and reasoning',
  tracking:  'activity tracking and session intelligence',
};

// ─── AI Tool Dominance Detection ─────────────────────────────────────────────
// When Claude/ChatGPT dominate a session (>50% time), the user is working
// WITH those tools — they are the workspace, not the subject being deployed.
// In this context, intent can only be researching, reviewing, or implementing.

const AI_TOOL_RE = /^(claude|chatgpt|gemini|copilot|perplexity|poe|phind)/i;
const AI_ONLY_INTENTS = new Set(['researching', 'reviewing', 'implementing', 'analyzing', 'planning', 'documenting']);

function detectAIToolDominance(compressed) {
  if (!compressed?.apps?.length) return false;
  const total = compressed.totalActiveSecs || 1;
  const aiSecs = compressed.apps
    .filter(a => AI_TOOL_RE.test(a.normalizedName || a.name))
    .reduce((s, a) => s + (a.totalSecs || 0), 0);
  return aiSecs / total >= AI_TOOL_DOMINANCE_THRESHOLD;
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

function detectIntentType(keywords, appNames, workMode, compressed) {
  const allText = [...keywords, ...appNames].join(' ').toLowerCase();
  const isAIDominant = detectAIToolDominance(compressed);

  const scores = {};
  for (const rule of INTENT_RULES) {
    // In AI-dominant sessions, only allow research/review/implement/analyze intents
    if (isAIDominant && !AI_ONLY_INTENTS.has(rule.type)) continue;

    let score = 0;

    // Keyword match
    const kwMatches = rule.keywordSignals.filter(kw => allText.includes(kw)).length;
    score += kwMatches * 20;

    // App match
    const appMatches = rule.appSignals.filter(app => appNames.some(a => a.toLowerCase().includes(app))).length;
    score += appMatches * 15;

    // Boost if matches the behavior engine's work mode
    if (rule.type === workMode || workMode?.includes(rule.type)) {
      score += 25;
    }

    if (score > 0) scores[rule.type] = score;
  }

  // 'implementing' is the broadest/lowest-confidence rule — require it to
  // score meaningfully higher than the minimum (2 keyword matches OR an IDE app
  // match) before treating it as the primary intent. This prevents it from
  // winning on a single vague keyword like "feature" or "module".
  if (scores['implementing'] !== undefined) {
    const hasIDEApp = appNames.some(a => /vscode|cursor|webstorm|intellij|xcode/i.test(a));
    const hasMinKeywords = scores['implementing'] >= 40; // 2 keyword matches
    if (!hasIDEApp && !hasMinKeywords) {
      delete scores['implementing'];
    }
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  if (!sorted.length) {
    // Default for AI-dominant sessions: researching
    const defaultType = isAIDominant ? 'researching' : 'implementing';
    return { type: defaultType, confidence: 0.40 };
  }

  const topScore = sorted[0][1];
  return {
    type: sorted[0][0],
    confidence: Math.min(topScore / 80, 1),
    alternatives: sorted.slice(1, 3).map(([t]) => t),
    isAIDominant,
  };
}

// ─── Objective Builder ────────────────────────────────────────────────────────

function buildObjective(intentType, topFeatures, activeSystem, continuityProfile, topPhrases) {
  const featureObj = topFeatures
    .map(f => FEATURE_OBJECTIVE_PHRASES[f.featureId])
    .filter(Boolean)[0];

  const systemObj = activeSystem?.system
    ? SYSTEM_OBJECTIVE_PHRASES[activeSystem.system]
    : null;

  // Use continuity active objective if available
  if (continuityProfile?.activeObjective?.description) {
    return continuityProfile.activeObjective.description;
  }

  // Construct from features
  if (featureObj) return featureObj;
  if (systemObj) return systemObj;

  // Derive from top phrases
  if (topPhrases.length > 0) {
    const phrase = topPhrases[0]
      .replace(/^(building|implementing|designing|creating|developing|fixing|debugging|testing|working on)\s+/i, '')
      .trim();
    if (phrase.length >= 5) return phrase.toLowerCase();
  }

  return null;
}

// ─── Narrative Hint Builder ───────────────────────────────────────────────────

function buildNarrativeHint(intentType, objective, continuityProfile, topPhrases) {
  const intentDef = INTENT_TYPES[intentType] || INTENT_TYPES.implementing;
  const verb = intentDef.verbs[0];

  if (!objective) {
    return topPhrases.length > 0
      ? `${verb} ${topPhrases[0]}`
      : `${verb} feature development`;
  }

  return `${verb} ${objective}`;
}

// ─── Compound Intent Detection ────────────────────────────────────────────────
// Some sessions have compound intent (e.g., "debugging while implementing")

function detectCompoundIntent(primaryType, keywords, appNames) {
  const text = [...keywords, ...appNames].join(' ').toLowerCase();

  // Research + implementation combo
  if (primaryType === 'implementing' && (text.includes('docs') || text.includes('stackoverflow') || text.includes('mdn'))) {
    return 'research-guided implementation';
  }

  // Debug + refactor combo
  if (primaryType === 'debugging' && (text.includes('refactor') || text.includes('cleanup') || text.includes('improve'))) {
    return 'bug-driven refactoring';
  }

  // Design + implement combo
  if (primaryType === 'designing' && (text.includes('implement') || text.includes('build') || text.includes('component'))) {
    return 'design-to-implementation';
  }

  // Plan + research combo
  if (primaryType === 'planning' && (text.includes('research') || text.includes('explore') || text.includes('evaluate'))) {
    return 'research-informed planning';
  }

  return null;
}

// ─── Main Intent Inference Function ──────────────────────────────────────────

/**
 * Infer the user's implementation intent from all available reasoning signals.
 *
 * @param {Object} reasoning - from contextualReasoningEngine
 * @param {Object} ranking   - from signalRankingEngine
 * @returns {Object} intentResult
 */
export function inferIntent(reasoning, ranking) {
  const {
    compressed, behaviorProfile, continuityProfile,
    featureGraph, workMode, primaryCategory,
  } = reasoning;

  const keywords  = compressed?.keywords || [];
  const appNames  = (compressed?.apps || []).map(a => a.name);
  const topPhrases = (ranking?.contextSignals || []).map(s => s.text);

  // 1. Detect primary intent type (passes compressed for AI dominance check)
  const { type: intentType, confidence: intentConf, alternatives, isAIDominant } = detectIntentType(
    keywords, appNames, workMode, compressed,
  );

  // 2. Build objective description
  const topFeatures = featureGraph?.activeCluster || [];
  const objective = buildObjective(
    intentType,
    topFeatures,
    featureGraph?.activeSystem,
    continuityProfile,
    topPhrases,
  );

  // 3. Detect compound intent
  const compoundIntent = detectCompoundIntent(intentType, keywords, appNames);

  // 4. Build narrative hint for humanization layer
  const narrativeHint = buildNarrativeHint(intentType, objective, continuityProfile, topPhrases);

  // 5. Get verb sets for this intent
  const intentDef = INTENT_TYPES[intentType] || INTENT_TYPES.implementing;

  // 6. Overall intent confidence
  const confidence = Math.min(
    intentConf * 0.6 +
    (objective ? 0.25 : 0) +
    (continuityProfile?.isContinuingWork ? 0.15 : 0),
    0.95,
  );

  return {
    type: intentType,
    label: intentDef.label,
    confidence: Math.round(confidence * 100) / 100,

    objective,                        // "calendar scheduling and event management"
    compoundIntent,                   // "research-guided implementation" or null
    narrativeHint,                    // "Implementing calendar scheduling and event management"

    verbs: intentDef.verbs,           // ["Implementing", "Building", ...]
    pastVerbs: intentDef.pastVerbs,   // ["Implemented", "Built", ...]

    alternatives,                     // Secondary intent types

    // Context for humanization
    topPhrases,
    isDeepIntent: intentConf >= 0.65,
    hasObjective: !!objective,
    isContinuing: continuityProfile?.isContinuingWork || false,
    isAIDominant: isAIDominant || false,
  };
}

/**
 * Get the most appropriate verb for a given intent type and position.
 * Position 0 = primary verb, 1 = alternate, etc.
 */
export function getIntentVerb(intentType, position = 0, past = false) {
  const def = INTENT_TYPES[intentType] || INTENT_TYPES.implementing;
  const verbs = past ? def.pastVerbs : def.verbs;
  return verbs[position % verbs.length] || verbs[0];
}
