/**
 * Workflow Ownership Engine
 *
 * Single source of truth for narrative attribution.
 * Answers: "What was this person actually working on?"
 *
 * Every downstream engine — title generation, description synthesis,
 * productivity notes, session summaries — must consult this engine first.
 * Low-confidence signals (browser tabs, YouTube, short app visits) can
 * SUPPORT context but can never OWN the narrative subject.
 *
 * Attribution priority (highest → lowest):
 *   1. Project context    — explicit project assignment
 *   2. IDE files          — file names, folder names from IDE window titles
 *   3. Git activity       — commit messages, PR titles, branch names
 *   4. Session continuity — recurring objective from previous sessions
 *   5. Feature context    — active feature graph nodes
 *   6. AI conversations   — Claude/ChatGPT conversation topics
 *   7. Window titles      — app-specific meaningful titles
 *   8. Browser titles     — web page titles (lower confidence)
 *   9. URLs               — path component extraction only (lowest confidence)
 *
 * Contract:
 *   - The returned `subject` is guaranteed non-generic (or null)
 *   - The returned `confidence` is an honest 0-1 estimate
 *   - `attributionSource` names the winning signal tier
 *   - Low-signal sessions return confidence < 0.50 — callers must gate on this
 */

import { isGenericSubject, scoreSubjectSpecificity, filterGenericKeywords } from './genericKeywordFilter.js';

// ─── Signal Tier Weights ──────────────────────────────────────────────────────
// Each tier has a base confidence ceiling. Signals from lower tiers can never
// claim ownership unless all higher tiers produce no usable signal.

const TIER_CONFIDENCE = {
  project_context:    0.97,
  ide_file:           0.93,
  git_activity:       0.91,
  session_continuity: 0.87,
  feature_context:    0.82,
  ai_conversation:    0.90,  // High — AI conversation topics are precise
  window_title:       0.85,
  browser_title:      0.65,
  url_path:           0.50,
  fallback:           0.30,
};

// ─── Generics That Must Never Own a Subject ───────────────────────────────────

const HARD_BLOCK_SUBJECTS = new Set([
  'productivity', 'analytics', 'dashboard', 'system', 'module', 'feature',
  'project', 'development', 'implementation', 'work', 'coding', 'programming',
  'overview', 'session', 'activity', 'task', 'management', 'platform',
  'application', 'workspace', 'settings', 'configuration', 'interface',
  'component', 'service', 'utility', 'function', 'class', 'object',
  'flow ledger', 'flowledger',
]);

function isHardBlocked(subject = '') {
  const lower = subject.toLowerCase().trim();
  if (HARD_BLOCK_SUBJECTS.has(lower)) return true;
  // Single word generics
  const words = lower.split(/\s+/);
  if (words.length === 1 && isGenericSubject(lower)) return true;
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalizeFirst(s = '') {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function capitalizeWords(s = '') {
  return s.replace(/\b([a-z])/g, c => c.toUpperCase());
}

const CAMEL_RE = /([a-z])([A-Z])/g;
function camelToWords(s = '') {
  return s.replace(CAMEL_RE, '$1 $2');
}

const LEADING_VERB_RE = /^(building|implementing|designing|creating|developing|fixing|debugging|testing|writing|researching|refactoring|reviewing|planning|improving|adding|updating|configuring|setting\s+up|working\s+on|exploring|optimizing|crafting|prototyping|engineering|deploying|drafting|validating|resolving|investigating|integrating|migrating|analyzing|architecting|structuring|scoping)\s+/i;

function stripLeadingVerb(phrase = '') {
  return phrase.replace(LEADING_VERB_RE, '').trim();
}

// Strip common app suffix patterns ("— VS Code", "| GitHub", etc.)
const APP_SUFFIX_RE = /\s*[—–|·\-]\s*(visual studio code|vs code|cursor|webstorm|intellij|xcode|google chrome|safari|firefox|edge|arc|brave|notion|figma|slack|linear|github|claude|chatgpt|gemini)\s*$/i;

function cleanTitle(t = '') {
  return t.replace(APP_SUFFIX_RE, '').trim();
}

// Extract path components from a URL that carry semantic meaning
function extractURLSubject(url = '') {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;

    // GitHub: /owner/repo, /owner/repo/pull/123, /owner/repo/issues/456
    if (host === 'github.com') {
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const repo = parts[1].replace(/-/g, ' ').replace(/_/g, ' ');
        if (parts[2] === 'pull' && parts[3]) {
          return { subject: `${capitalizeWords(repo)} PR #${parts[3]}`, tier: 'url_path' };
        }
        if (parts[2] === 'issues' && parts[3]) {
          return { subject: `${capitalizeWords(repo)} issue #${parts[3]}`, tier: 'url_path' };
        }
        if (parts[2] === 'blob' || parts[2] === 'tree') {
          const filename = parts[parts.length - 1];
          const readable = camelToWords(filename.replace(/\.[a-z]+$/, '').replace(/[-_]/g, ' '));
          return { subject: capitalizeWords(readable), tier: 'url_path' };
        }
        return { subject: capitalizeWords(repo), tier: 'url_path' };
      }
    }

    // Known documentation domains
    const DOC_DOMAINS = {
      'developer.mozilla.org': 'MDN',
      'docs.anthropic.com': 'Anthropic Docs',
      'docs.github.com': 'GitHub Docs',
      'react.dev': 'React Docs',
      'nextjs.org': 'Next.js Docs',
      'tailwindcss.com': 'Tailwind Docs',
      'supabase.com': 'Supabase Docs',
    };
    if (DOC_DOMAINS[host]) {
      const docSection = path.split('/').filter(Boolean).slice(-2).join(' ');
      if (docSection.length >= 4) {
        const readable = docSection.replace(/[-_]/g, ' ');
        return { subject: `${DOC_DOMAINS[host]}: ${capitalizeWords(readable)}`, tier: 'url_path' };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Parse IDE window titles: "componentName.tsx — ProjectName — VS Code"
function parseIDETitle(title = '') {
  const cleaned = cleanTitle(title);
  const parts = cleaned.split(/\s*[—–\-]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const filename = parts[0];
  const projectName = parts[1];

  // Convert camelCase filename to readable: "workflowOwnershipEngine.js" → "Workflow Ownership Engine"
  const nameWithoutExt = filename.replace(/\.[a-zA-Z]+$/, '');
  const readable = capitalizeWords(camelToWords(nameWithoutExt.replace(/[-_]/g, ' ')));

  if (readable.length >= 4) {
    return {
      filename: readable,
      projectName: parts.length >= 2 ? projectName : null,
      source: 'ide_file',
    };
  }
  return null;
}

// ─── Tier 1: Project Context ──────────────────────────────────────────────────

function extractProjectContext(project) {
  if (!project?.name || project.name.trim().length < 2) return null;
  // Project name alone is not enough — we need it in combination with other signals
  // Return it as anchoring context, not as a standalone subject
  return {
    projectName: project.name,
    projectId: project.id,
    confidence: TIER_CONFIDENCE.project_context,
  };
}

// ─── Tier 2: IDE File Context ─────────────────────────────────────────────────

function extractIDESignals(sessions = []) {
  const IDE_APP_RE = /^(vscode|visual studio code|cursor|webstorm|intellij|xcode|pycharm|rider|sublime|atom|vim|nvim|neovim|emacs|android studio|rubymine)/i;
  const ideSignals = [];

  for (const s of sessions) {
    const app = (s.app_name || '').trim();
    const title = (s.window_title || '').trim();
    if (!IDE_APP_RE.test(app)) continue;
    const parsed = parseIDETitle(title);
    if (parsed?.filename && parsed.filename.length >= 4) {
      ideSignals.push({
        subject: parsed.filename,
        projectHint: parsed.projectName,
        duration: s.duration_seconds || 0,
        source: 'ide_file',
      });
    }
  }

  if (!ideSignals.length) return null;

  // Aggregate by subject — most time-weighted signal wins
  const aggregated = {};
  for (const sig of ideSignals) {
    const key = sig.subject.toLowerCase();
    if (!aggregated[key]) aggregated[key] = { ...sig, totalDuration: 0 };
    aggregated[key].totalDuration += sig.duration;
  }

  const sorted = Object.values(aggregated).sort((a, b) => b.totalDuration - a.totalDuration);
  const best = sorted[0];

  if (isGenericSubject(best.subject) || isHardBlocked(best.subject)) return null;

  return {
    subject: best.subject,
    projectHint: best.projectHint,
    confidence: TIER_CONFIDENCE.ide_file,
    source: 'ide_file',
    duration: best.totalDuration,
  };
}

// ─── Tier 6: AI Conversation Topics ──────────────────────────────────────────

function extractAITopics(compressed) {
  const topics = compressed?.aiConversationTopics || [];
  if (!topics.length) return null;

  const best = topics[0];
  if (!best?.topic || best.topic.length < 4) return null;

  const subject = stripLeadingVerb(best.topic);
  if (!subject || subject.length < 4) return null;
  if (isGenericSubject(subject) || isHardBlocked(subject)) return null;

  return {
    subject: capitalizeFirst(subject),
    confidence: TIER_CONFIDENCE.ai_conversation,
    source: 'ai_conversation',
    rawTopic: best.topic,
  };
}

// ─── Tier 7: Window Title Phrases ────────────────────────────────────────────

function extractWindowTitleSignal(compressed) {
  const phrases = compressed?.titlePhrases || [];
  const nonAI = phrases.filter(p => !p.isAITopic);

  for (const p of nonAI) {
    if (!p.phrase || p.phrase.length < 6) continue;
    const subject = stripLeadingVerb(cleanTitle(p.phrase));
    if (!subject || subject.length < 5) continue;
    if (isGenericSubject(subject) || isHardBlocked(subject)) continue;

    return {
      subject: capitalizeFirst(subject),
      confidence: TIER_CONFIDENCE.window_title,
      source: 'window_title',
    };
  }
  return null;
}

// ─── Tier 8: Browser Title / Domain Context ───────────────────────────────────

function extractBrowserSignal(compressed) {
  const domains = compressed?.domains || [];
  if (!domains.length) return null;

  // Check for known high-value development domains
  const HIGH_VALUE_DOMAINS = {
    'github.com': 'GitHub',
    'stackoverflow.com': 'Stack Overflow',
    'developer.mozilla.org': 'MDN Web Docs',
    'docs.anthropic.com': 'Anthropic Docs',
    'linear.app': 'Linear',
    'figma.com': 'Figma',
  };

  for (const d of domains) {
    const domain = d.domain || d;
    if (HIGH_VALUE_DOMAINS[domain]) {
      return {
        subject: HIGH_VALUE_DOMAINS[domain],
        confidence: TIER_CONFIDENCE.browser_title * 0.8,
        source: 'browser_domain',
      };
    }
  }
  return null;
}

// ─── Tier 9: URL Path Extraction ──────────────────────────────────────────────

function extractURLSignal(sessions = []) {
  const BROWSER_RE = /^(chrome|google chrome|firefox|safari|edge|microsoft edge|brave|arc|opera)/i;

  for (const s of sessions) {
    if (!BROWSER_RE.test(s.app_name || '')) continue;
    if (!s.url) continue;
    const extracted = extractURLSubject(s.url);
    if (extracted && !isGenericSubject(extracted.subject)) {
      return {
        subject: extracted.subject,
        confidence: TIER_CONFIDENCE.url_path,
        source: 'url_path',
        url: s.url,
      };
    }
  }
  return null;
}

// ─── Keyword Synthesis Subject ────────────────────────────────────────────────
// Last resort: synthesize a subject from non-generic keywords

function synthesizeFromKeywords(compressed, project) {
  const rawKeywords = compressed?.keywords || [];
  const category = compressed?.primaryCategory || 'development';

  const HARD_SKIP = new Set([
    'chrome', 'safari', 'firefox', 'edge', 'claude', 'chatgpt', 'gemini',
    'code', 'vscode', 'cursor', 'copilot', 'using', 'with', 'into',
  ]);

  const meaningful = filterGenericKeywords(
    rawKeywords.filter(k => !HARD_SKIP.has(k.toLowerCase()) && k.length >= 5),
    { strict: false }
  ).slice(0, 4);

  if (meaningful.length >= 2) {
    const compound = `${capitalizeWords(meaningful[0])} and ${capitalizeWords(meaningful[1])}`;
    if (!isGenericSubject(compound) && scoreSubjectSpecificity(compound) >= 0.3) {
      return {
        subject: compound,
        confidence: 0.55,
        source: 'keyword_synthesis',
      };
    }
  }

  if (meaningful.length === 1) {
    const suffix = {
      development: 'Implementation', design: 'Design',
      research: 'Research', planning: 'Architecture', writing: 'Documentation',
    }[category] || 'Development';
    const compound = `${capitalizeWords(meaningful[0])} ${suffix}`;
    if (!isGenericSubject(compound)) {
      return {
        subject: compound,
        confidence: 0.45,
        source: 'keyword_synthesis',
      };
    }
  }

  // Project-anchored fallback — use project name + category
  if (project?.name) {
    const catLabel = {
      development: 'Feature Implementation',
      design: 'Design Work',
      research: 'Technical Research',
      planning: 'Architecture Planning',
      writing: 'Documentation',
    }[category] || 'Development';
    return {
      subject: `${project.name} ${catLabel}`,
      confidence: 0.40,
      source: 'project_category',
    };
  }

  return null;
}

// ─── Duration-Calibrated Qualifier ────────────────────────────────────────────

export function buildDurationQualifier(durationMins, isDeepWork, workMode) {
  if (!durationMins || durationMins < 5) return null;
  const mins = Math.round(durationMins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const durStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

  if (mins >= 90 && isDeepWork) return { label: 'Extended deep focus', durStr, tier: 'extended' };
  if (mins >= 90) return { label: 'Extended session', durStr, tier: 'extended' };
  if (mins >= 45 && isDeepWork) return { label: 'Deep implementation', durStr, tier: 'deep' };
  if (mins >= 45) return { label: 'Focused session', durStr, tier: 'focused' };
  if (mins >= 15) return { label: 'Focused work', durStr, tier: 'standard' };
  return { label: 'Quick session', durStr, tier: 'quick' };
}

// ─── Tool Ecosystem Phrase ────────────────────────────────────────────────────
// Generates a "using X and Y" phrase that describes HOW tools contributed,
// not just what was open.

const AI_TOOLS = new Set(['claude', 'chatgpt', 'gemini', 'copilot', 'perplexity', 'poe', 'phind']);
const IDE_TOOLS = new Set(['vscode', 'visual studio code', 'cursor', 'webstorm', 'intellij', 'xcode', 'rider', 'pycharm']);
const DESIGN_TOOLS = new Set(['figma', 'sketch', 'adobe xd', 'framer', 'canva']);
const VERSION_CONTROL = new Set(['github', 'gitlab', 'gitpod', 'fork', 'tower', 'sourcetree', 'gitkraken']);

const TOOL_CONTRIBUTION_PHRASES = {
  'claude':        'AI-assisted reasoning',
  'chatgpt':       'AI assistance',
  'gemini':        'AI research assistance',
  'copilot':       'AI code completion',
  'cursor':        'AI-powered editing',
  'vscode':        'code editing',
  'visual studio code': 'code editing',
  'figma':         'design tooling',
  'github':        'version control',
  'terminal':      'build tooling',
  'notion':        'documentation',
  'linear':        'task management',
  'postman':       'API testing',
  'tableplus':     'database management',
  'dbeaver':       'database management',
};

export function buildToolEcosystemPhrase(apps = [], intentType = 'implementing') {
  if (!apps?.length) return null;

  const appNames = apps.map(a => (a.normalizedName || a.name || '').toLowerCase());

  const hasAI  = appNames.some(n => AI_TOOLS.has(n));
  const hasIDE = appNames.some(n => IDE_TOOLS.has(n));
  const hasDesign = appNames.some(n => DESIGN_TOOLS.has(n));
  const hasGit = appNames.some(n => VERSION_CONTROL.has(n));

  // Build ecosystem narrative based on tool combination
  if (hasAI && hasIDE) {
    const aiTool = appNames.find(n => AI_TOOLS.has(n));
    const ideTool = apps.find(a => IDE_TOOLS.has((a.normalizedName || a.name || '').toLowerCase()));
    const ideDisplay = ideTool?.name || 'VS Code';
    const aiDisplay = aiTool ? (aiTool.charAt(0).toUpperCase() + aiTool.slice(1)) : 'Claude';
    return `using ${aiDisplay} and ${ideDisplay}`;
  }

  if (hasAI && !hasIDE) {
    const aiTool = appNames.find(n => AI_TOOLS.has(n));
    const aiDisplay = aiTool ? (aiTool.charAt(0).toUpperCase() + aiTool.slice(1)) : 'Claude';
    return `using ${aiDisplay}`;
  }

  if (hasIDE && hasGit) {
    return 'with code editing and version control';
  }

  if (hasDesign && hasIDE) {
    return 'across design and implementation';
  }

  // Generic: list top 2 tools by time
  const topTools = apps
    .slice(0, 2)
    .map(a => {
      const n = (a.normalizedName || a.name || '').toLowerCase();
      return TOOL_CONTRIBUTION_PHRASES[n] || a.name;
    })
    .filter(Boolean);

  if (topTools.length >= 2) return `using ${topTools[0]} and ${topTools[1]}`;
  if (topTools.length === 1) return `using ${topTools[0]}`;
  return null;
}

// ─── Main Export: determineOwnership ─────────────────────────────────────────

/**
 * Determine what workflow the user was actually engaged in.
 *
 * @param {Array}  rawSessions  - Raw auto-tracked sessions
 * @param {Object} compressed   - Output of contextCompressionEngine
 * @param {Object} options
 * @param {Object} options.project         - { id, name }
 * @param {Object} options.client          - { id, name }
 * @param {Object} options.continuityProfile - from sessionContinuityEngine
 * @param {Object} options.featureGraph    - from featureGraphEngine
 * @param {Object} options.behaviorProfile - from behaviorInferenceEngine
 * @returns {WorkflowOwnership}
 */
export function determineOwnership(rawSessions = [], compressed = {}, options = {}) {
  const {
    project = null,
    client = null,
    continuityProfile = null,
    featureGraph = null,
    behaviorProfile = null,
  } = options;

  const durationMins = compressed.totalActiveMins || 0;
  const workMode     = behaviorProfile?.workMode?.primary || 'deep_implementation';
  const isDeepWork   = behaviorProfile?.isDeepWork || false;

  // ── Try each tier in priority order ──────────────────────────────────────

  // Tier 2: IDE files (most reliable technical signal)
  const ideSignal = extractIDESignals(rawSessions);

  // Tier 6: AI conversation topics (highly precise)
  const aiTopicSignal = extractAITopics(compressed);

  // Tier 7: Window title phrases
  const windowSignal = extractWindowTitleSignal(compressed);

  // Tier 8/9: Browser signals (support only)
  const browserSignal = extractBrowserSignal(compressed);
  const urlSignal     = extractURLSignal(rawSessions);

  // ── Continuity tier (carries forward previous objective) ───────────────
  let continuitySignal = null;
  if (continuityProfile?.isContinuingWork && continuityProfile?.activeObjective?.description) {
    const obj = continuityProfile.activeObjective.description;
    const subject = stripLeadingVerb(obj);
    if (subject && !isGenericSubject(subject) && !isHardBlocked(subject) && subject.length >= 5) {
      continuitySignal = {
        subject: capitalizeFirst(subject),
        confidence: TIER_CONFIDENCE.session_continuity * (continuityProfile.continuityConfidence || 0.6),
        source: 'session_continuity',
      };
    }
  }

  // ── Dominant workflow signal from compression ──────────────────────────
  let dominanceSignal = null;
  const domLabel = compressed.dominantWorkflowLabel;
  const domScore = compressed.dominanceScore || 0;
  if (domLabel && domLabel.length >= 6 && domScore >= 60) {
    const subject = stripLeadingVerb(domLabel);
    if (subject && !isGenericSubject(subject) && !isHardBlocked(subject)) {
      dominanceSignal = {
        subject: capitalizeFirst(subject),
        confidence: Math.min(domScore / 100 + 0.15, 0.88),
        source: 'workflow_dominance',
      };
    }
  }

  // ── Select the winning signal ─────────────────────────────────────────
  // Priority: aiTopic (most semantically precise) > ide > window > dominance > continuity > browser/url
  const candidates = [
    aiTopicSignal,
    ideSignal,
    windowSignal,
    dominanceSignal,
    continuitySignal,
    browserSignal,
    urlSignal,
  ].filter(Boolean);

  // Sort by confidence, then by tier priority
  const TIER_ORDER = ['ai_conversation', 'ide_file', 'window_title', 'workflow_dominance',
                      'session_continuity', 'browser_domain', 'url_path', 'keyword_synthesis', 'project_category'];
  candidates.sort((a, b) => {
    if (Math.abs(b.confidence - a.confidence) > 0.10) return b.confidence - a.confidence;
    return TIER_ORDER.indexOf(a.source) - TIER_ORDER.indexOf(b.source);
  });

  let winner = candidates[0] || null;

  // If winner has low confidence or no winner, try keyword synthesis
  if (!winner || winner.confidence < 0.45) {
    const synthSignal = synthesizeFromKeywords(compressed, project);
    if (synthSignal && (!winner || synthSignal.confidence > winner.confidence)) {
      winner = synthSignal;
    }
  }

  // Project context
  const projectCtx = extractProjectContext(project);

  // Build supporting activities list (non-owning signals)
  const supportingActivities = candidates
    .filter(c => c !== winner)
    .slice(0, 3)
    .map(c => ({ subject: c.subject, source: c.source, confidence: Math.round(c.confidence * 100) }));

  // Duration qualifier
  const durationQualifier = buildDurationQualifier(durationMins, isDeepWork, workMode);

  // Tool ecosystem phrase
  const toolPhrase = buildToolEcosystemPhrase(compressed.apps || [], workMode);

  // Determine intent (what type of work was being done)
  const intent = workMode
    .replace('deep_implementation', 'implementing')
    .replace('design_work', 'designing')
    .replace('code_review', 'reviewing');

  // Determine if attribution is project-anchored vs subject-only
  const isProjectAnchored = projectCtx !== null &&
    winner?.subject &&
    !winner.subject.toLowerCase().includes(project?.name?.toLowerCase() || '___never___');

  return {
    // Core attribution
    subject:            winner?.subject || null,
    confidence:         winner?.confidence || 0,
    attributionSource:  winner?.source || 'fallback',
    isHighConfidence:   (winner?.confidence || 0) >= 0.70,

    // Context
    project:            projectCtx,
    intent,
    workMode,
    isDeepWork,
    durationMins,

    // Modifiers
    toolPhrase,
    durationQualifier,
    isProjectAnchored,

    // Supporting signals
    supportingActivities,

    // Raw signals for debugging
    signals: {
      aiTopic:    aiTopicSignal,
      ide:        ideSignal,
      window:     windowSignal,
      dominance:  dominanceSignal,
      continuity: continuitySignal,
      browser:    browserSignal,
      url:        urlSignal,
    },
  };
}

/**
 * Quick check: is this ownership result strong enough to base a title on?
 */
export function isOwnershipReliable(ownership) {
  return ownership && ownership.confidence >= 0.60 && ownership.subject;
}

/**
 * Build a title-ready subject phrase from ownership context.
 * Optionally anchors with project name when subject is short.
 */
export function buildOwnershipSubject(ownership) {
  if (!ownership?.subject) return null;
  const { subject, project, isProjectAnchored } = ownership;

  // If subject is already specific and long, use it directly
  if (subject.split(/\s+/).length >= 3) return subject;

  // Short subject: anchor with project name if available and not already included
  if (isProjectAnchored && project?.projectName) {
    const projLower = project.projectName.toLowerCase();
    const subjLower = subject.toLowerCase();
    if (!subjLower.includes(projLower)) {
      return `${project.projectName} ${subject}`;
    }
  }

  return subject;
}
