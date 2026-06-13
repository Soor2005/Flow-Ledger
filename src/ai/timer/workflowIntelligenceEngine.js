/**
 * Workflow Intelligence Engine
 * Transforms raw app/window/url signals into human-meaningful workflow descriptions.
 * No LLMs. No network. Pure local pattern reasoning.
 */

// ─── App → Base Category ──────────────────────────────────────────────────────
const APP_WORKFLOW_MAP = {
  // IDEs / Code editors → Development
  'visual studio code': 'development', 'vscode': 'development',
  'cursor': 'development', 'webstorm': 'development',
  'intellij': 'development', 'android studio': 'development',
  'xcode': 'development', 'sublime text': 'development',
  'vim': 'development', 'neovim': 'development', 'nvim': 'development',
  'github desktop': 'development', 'gitkraken': 'development',
  'sourcetree': 'development', 'tower': 'development',
  'postman': 'development', 'insomnia': 'development',
  'docker desktop': 'development', 'tableplus': 'development',
  'dbeaver': 'development',
  // Terminals
  'terminal': 'development', 'iterm': 'development', 'iterm2': 'development',
  'warp': 'development', 'windows terminal': 'development',
  'powershell': 'development', 'cmd': 'development', 'git bash': 'development',
  // Design
  'figma': 'design', 'sketch': 'design', 'adobe xd': 'design',
  'photoshop': 'design', 'illustrator': 'design',
  'affinity designer': 'design', 'affinity photo': 'design',
  'canva': 'design', 'framer': 'design', 'zeplin': 'design',
  'marvel': 'design', 'invision': 'design',
  'adobe premiere': 'design', 'final cut pro': 'design', 'davinci resolve': 'design',
  // Writing / Docs
  'notion': 'writing', 'obsidian': 'writing', 'bear': 'writing',
  'microsoft word': 'writing', 'word': 'writing',
  'google docs': 'writing', 'pages': 'writing',
  'scrivener': 'writing', 'ulysses': 'writing',
  'ia writer': 'writing', 'typora': 'writing', 'marktext': 'writing',
  // Meetings
  'zoom': 'meeting', 'microsoft teams': 'meeting', 'teams': 'meeting',
  'google meet': 'meeting', 'webex': 'meeting', 'whereby': 'meeting',
  'skype': 'meeting', 'around': 'meeting', 'loom': 'meeting',
  // Communication
  'slack': 'communication', 'discord': 'communication',
  'telegram': 'communication', 'whatsapp': 'communication',
  'signal': 'communication',
  // Email
  'gmail': 'email', 'outlook': 'email', 'microsoft outlook': 'email',
  'spark': 'email', 'airmail': 'email', 'thunderbird': 'email',
  'apple mail': 'email',
  // Planning
  'linear': 'planning', 'jira': 'planning', 'asana': 'planning',
  'trello': 'planning', 'clickup': 'planning', 'height': 'planning',
  'shortcut': 'planning', 'basecamp': 'planning', 'monday.com': 'planning',
  // Data
  'microsoft excel': 'data', 'excel': 'data',
  'google sheets': 'data', 'numbers': 'data',
  'tableau': 'data', 'power bi': 'data', 'airtable': 'data',
  'retool': 'data', 'metabase': 'data',
  // Browsers — enriched by URL/title
  'chrome': 'research', 'google chrome': 'research',
  'firefox': 'research', 'safari': 'research',
  'edge': 'research', 'brave': 'research', 'arc': 'research',
  // AI Tools
  'claude': 'ai_research', 'chatgpt': 'ai_research',
  'perplexity': 'research', 'gemini': 'ai_research',
};

// ─── URL Pattern → Workflow Context ──────────────────────────────────────────
const URL_WORKFLOW_PATTERNS = [
  { re: /github\.com\/[^/]+\/([^/?#]+)/,  type: 'development', label: 'GitHub', extractRepo: true },
  { re: /gitlab\.com\/[^/]+\/([^/?#]+)/,  type: 'development', label: 'GitLab', extractRepo: true },
  { re: /bitbucket\.org\/[^/]+\/([^/?#]+)/,type:'development', label: 'Bitbucket', extractRepo: true },
  { re: /stackoverflow\.com/,              type: 'research',    label: 'Stack Overflow' },
  { re: /docs\.(google|microsoft|apple)/,  type: 'writing',     label: 'Documentation' },
  { re: /figma\.com/,                      type: 'design',      label: 'Figma' },
  { re: /linear\.app/,                     type: 'planning',    label: 'Linear' },
  { re: /notion\.so/,                      type: 'writing',     label: 'Notion' },
  { re: /jira\.atlassian/,                 type: 'planning',    label: 'Jira' },
  { re: /claude\.ai/,                      type: 'ai_research', label: 'Claude AI' },
  { re: /chat\.openai\.com/,               type: 'ai_research', label: 'ChatGPT' },
  { re: /vercel\.com/,                     type: 'development', label: 'Vercel' },
  { re: /netlify\.com/,                    type: 'development', label: 'Netlify' },
  { re: /heroku\.com/,                     type: 'development', label: 'Heroku' },
  { re: /supabase\.com/,                   type: 'development', label: 'Supabase' },
  { re: /firebase\.google\.com/,           type: 'development', label: 'Firebase' },
  { re: /aws\.amazon\.com/,               type: 'development', label: 'AWS Console' },
  { re: /console\.cloud\.google\.com/,    type: 'development', label: 'GCP Console' },
  { re: /npmjs\.com/,                     type: 'development', label: 'npm' },
  { re: /developer\.mozilla\.org/,        type: 'research',    label: 'MDN Docs' },
  { re: /medium\.com/,                    type: 'research',    label: 'Medium' },
  { re: /youtube\.com\/watch/,            type: 'learning',    label: 'YouTube Learning' },
  { re: /udemy\.com/,                     type: 'learning',    label: 'Udemy' },
  { re: /coursera\.org/,                  type: 'learning',    label: 'Coursera' },
];

// ─── Window title keyword → Workflow Description Templates ───────────────────
const TITLE_WORKFLOW_PATTERNS = [
  // Feature development keywords
  { re: /\b(implement|implementing|implementation)\b/i, action: 'Implementing', domain: 'development' },
  { re: /\b(fix|fixing|bugfix|bug fix|patch|patching)\b/i, action: 'Debugging', domain: 'development' },
  { re: /\b(refactor|refactoring|cleanup|clean up)\b/i, action: 'Refactoring', domain: 'development' },
  { re: /\b(test|testing|spec|specs)\b/i, action: 'Writing Tests', domain: 'development' },
  { re: /\b(review|reviewing|pr review|code review)\b/i, action: 'Code Review', domain: 'development' },
  { re: /\b(build|building|deploy|deploying|release)\b/i, action: 'Building & Deploying', domain: 'development' },
  // Design keywords
  { re: /\b(design|designing|wireframe|mockup|prototype)\b/i, action: 'Designing', domain: 'design' },
  { re: /\b(ui|ux|component|layout|theme)\b/i, action: 'UI Design', domain: 'design' },
  { re: /\b(brand|logo|visual|graphic)\b/i, action: 'Visual Design', domain: 'design' },
  // Writing keywords
  { re: /\b(write|writing|draft|drafting|doc|docs|documentation)\b/i, action: 'Writing', domain: 'writing' },
  { re: /\b(report|proposal|brief|article|blog)\b/i, action: 'Writing Content', domain: 'writing' },
  { re: /\b(readme|changelog|spec)\b/i, action: 'Writing Documentation', domain: 'writing' },
  // Research keywords
  { re: /\b(research|researching|analyze|analysis|investigate)\b/i, action: 'Researching', domain: 'research' },
  { re: /\b(compare|evaluate|assess|review)\b/i, action: 'Evaluating', domain: 'research' },
  // Planning keywords
  { re: /\b(plan|planning|roadmap|sprint|backlog|milestone)\b/i, action: 'Planning', domain: 'planning' },
  { re: /\b(prioritize|prioritizing|organize|organizing)\b/i, action: 'Organizing', domain: 'planning' },
];

// ─── Project / Feature name extractor from window titles ─────────────────────
function extractProjectName(windowTitle = '', url = '') {
  // GitHub/GitLab repo extraction
  const repoMatch = url.match(/(?:github|gitlab|bitbucket)\.com\/[^/]+\/([^/?#]+)/);
  if (repoMatch) {
    const repo = repoMatch[1].replace(/[-_]/g, ' ').replace(/\.git$/, '');
    return titleCase(repo);
  }

  // VS Code / Cursor: "filename — project — editor"
  const vsMatch = windowTitle.match(/^(.+?)\s*[–—-]\s*(.+?)\s*[–—-]\s*(?:Visual Studio Code|Cursor|WebStorm|IntelliJ)/i);
  if (vsMatch) return titleCase(vsMatch[2].trim());

  // "project - branch" pattern
  const branchMatch = windowTitle.match(/^([^[({–—-]+?)\s*(?:[-–—]|\s+on\s+)\s*(?:main|master|develop|dev|feature\/[^\s]+)/i);
  if (branchMatch) return titleCase(branchMatch[1].trim());

  // Figma: "Component Name — Figma"
  const figmaMatch = windowTitle.match(/^(.+?)\s*[–—-]\s*Figma$/i);
  if (figmaMatch) return titleCase(figmaMatch[1].trim());

  // Notion: "Page Title - Notion"
  const notionMatch = windowTitle.match(/^(.+?)\s*[–—-]\s*Notion$/i);
  if (notionMatch) return titleCase(notionMatch[1].trim());

  // Linear: "Issue Title - Linear"
  const linearMatch = windowTitle.match(/^(.+?)\s*[–—-]\s*Linear$/i);
  if (linearMatch) return titleCase(linearMatch[1].trim());

  return null;
}

function titleCase(str) {
  if (!str) return str;
  const stop = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','with','is','as']);
  return str
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((w, i) => (i === 0 || !stop.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ')
    .slice(0, 60);
}

// ─── Dominant workflow from a stream of auto-sessions ────────────────────────
function scoreWorkflowType(autoSessions = []) {
  const counts = {};
  for (const s of autoSessions) {
    const app = (s.app_name || '').toLowerCase();
    const cat = APP_WORKFLOW_MAP[app] || s.ai_category || 'other';
    counts[cat] = (counts[cat] || 0) + (s.duration_seconds || 30);
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries;
}

// ─── Main workflow inference ──────────────────────────────────────────────────
export function inferWorkflow(heartbeat = {}, recentAutoSessions = [], projectContext = null) {
  const appName   = String(heartbeat.appName  || '').toLowerCase().trim();
  const winTitle  = String(heartbeat.title    || '').trim();
  const url       = String(heartbeat.url      || '').toLowerCase().trim();

  // 1. Get base category from app name
  const baseType = APP_WORKFLOW_MAP[appName] || 'other';

  // 2. Get URL context
  let urlContext = null;
  for (const pat of URL_WORKFLOW_PATTERNS) {
    if (pat.re.test(url)) {
      urlContext = pat;
      break;
    }
  }

  // 3. Extract project/feature name
  const projectName = extractProjectName(winTitle, url) || projectContext?.name;

  // 4. Get action from window title
  let detectedAction = null;
  let detectedDomain = baseType;
  for (const pat of TITLE_WORKFLOW_PATTERNS) {
    if (pat.re.test(winTitle)) {
      detectedAction = pat.action;
      detectedDomain = pat.domain;
      break;
    }
  }

  // 5. Determine effective workflow type
  const workflowType = urlContext?.type || detectedDomain || baseType;

  // 6. Build workflow label
  const label = buildWorkflowLabel({
    workflowType, appName, winTitle, url,
    urlContext, projectName, detectedAction,
    projectContext,
  });

  // 7. Score dominant type from recent sessions
  const recentScores = scoreWorkflowType(recentAutoSessions);
  const dominantType = recentScores[0]?.[0] || workflowType;

  // 8. Confidence scoring
  const confidence = computeConfidence({
    hasUrl: !!url, hasTitle: winTitle.length > 5,
    hasProject: !!projectName, hasAction: !!detectedAction,
    recentConsistency: recentScores.length > 0 && recentScores[0][1] > recentScores.slice(1).reduce((a,b)=>a+b[1],0),
  });

  return {
    label,
    type: workflowType,
    dominantType,
    projectName,
    action: detectedAction,
    urlContext: urlContext?.label || null,
    confidence,
    rawType: baseType,
  };
}

function buildWorkflowLabel({ workflowType, appName, winTitle, url, urlContext, projectName, detectedAction, projectContext }) {
  // GitHub repo with action
  const repoMatch = url.match(/(?:github|gitlab)\.com\/[^/]+\/([^/?#]+)/);
  if (repoMatch) {
    const repo = titleCase(repoMatch[1].replace(/[-_]/g, ' '));
    if (url.includes('/issues'))   return `Reviewing ${repo} Issues`;
    if (url.includes('/pulls'))    return `Reviewing ${repo} Pull Requests`;
    if (url.includes('/actions'))  return `${repo} CI / Actions`;
    if (url.includes('/commit'))   return `Committing to ${repo}`;
    if (url.includes('/blob') || url.includes('/tree')) return `Browsing ${repo} Codebase`;
    return `${repo} Development`;
  }

  // VS Code / Cursor with project
  if (/cursor|vscode|visual studio code/.test(appName)) {
    if (projectName) {
      return detectedAction ? `${detectedAction} ${projectName}` : `${projectName} Development`;
    }
    const fileMatch = winTitle.match(/^([^\s–—-]+\.[a-z]{1,5})/i);
    if (fileMatch) {
      const ext = fileMatch[1].split('.').pop().toLowerCase();
      const typeMap = { ts:'TypeScript',tsx:'React',js:'JavaScript',jsx:'React',py:'Python',rs:'Rust',go:'Go',css:'CSS',html:'HTML',json:'Config',md:'Documentation',sql:'Database' };
      const lang = typeMap[ext] || ext.toUpperCase();
      return `${lang} ${detectedAction || 'Development'}`;
    }
    return detectedAction || 'Software Development';
  }

  // Figma with context
  if (appName === 'figma' || url.includes('figma.com')) {
    return projectName ? `Designing ${projectName}` : 'UI / UX Design Work';
  }

  // Notion / Obsidian
  if (/notion|obsidian|bear|craft/.test(appName) || url.includes('notion.so')) {
    return projectName ? `Documenting ${projectName}` : 'Writing & Documentation';
  }

  // Meeting apps
  if (workflowType === 'meeting') return 'Video Meeting';

  // Slack / Communication
  if (workflowType === 'communication') {
    return projectName ? `Team Communication — ${projectName}` : 'Team Communication';
  }

  // AI tools
  if (workflowType === 'ai_research') {
    if (detectedAction) return `${detectedAction} with AI Assistance`;
    return projectName ? `AI-Assisted ${projectName} Work` : 'AI-Assisted Research';
  }

  // Planning tools
  if (workflowType === 'planning') {
    return projectName ? `Planning ${projectName}` : 'Project Planning';
  }

  // Data work
  if (workflowType === 'data') {
    return projectName ? `Data Analysis — ${projectName}` : 'Data & Analytics';
  }

  // Browser with meaningful title
  if (/chrome|safari|firefox|edge|brave|arc/.test(appName)) {
    if (urlContext?.label) {
      return projectName ? `${urlContext.label} — ${projectName}` : `Research via ${urlContext.label}`;
    }
    if (winTitle.length > 10) {
      const clean = winTitle.replace(/ [-–—] (Google Chrome|Firefox|Safari|Microsoft Edge|Brave|Arc)$/i, '').trim();
      if (clean.length > 5 && clean.length < 80) return clean.slice(0, 60);
    }
    return detectedAction ? `${detectedAction} Research` : 'Research & Reference';
  }

  // Generic with action
  if (detectedAction && projectName) return `${detectedAction} ${projectName}`;
  if (detectedAction) return detectedAction;
  if (projectName) return `${projectName} Work`;

  // Type-based fallbacks
  const TYPE_LABELS = {
    development:   'Software Development',
    design:        'Design Work',
    writing:       'Writing & Documentation',
    research:      'Research',
    planning:      'Project Planning',
    communication: 'Communication',
    email:         'Email & Correspondence',
    learning:      'Learning',
    data:          'Data Analysis',
    meeting:       'Video Meeting',
    ai_research:   'AI-Assisted Work',
  };
  return TYPE_LABELS[workflowType] || 'Focused Work';
}

function computeConfidence({ hasUrl, hasTitle, hasProject, hasAction, recentConsistency }) {
  let score = 0.40;
  if (hasUrl)              score += 0.20;
  if (hasTitle)            score += 0.15;
  if (hasProject)          score += 0.15;
  if (hasAction)           score += 0.05;
  if (recentConsistency)   score += 0.05;
  return Math.min(0.98, score);
}

// ─── Merge multiple sessions into a single workflow description ───────────────
export function mergeWorkflowFromSessions(autoSessions = [], manualSession = null) {
  if (!autoSessions.length && !manualSession) return null;

  const typeScores = scoreWorkflowType(autoSessions);
  const dominantType = typeScores[0]?.[0] || 'development';
  const secondType   = typeScores[1]?.[0] || null;

  // Extract project names from window titles / URLs
  const projectNames = new Set();
  for (const s of autoSessions) {
    const name = extractProjectName(s.window_title || '', s.url || '');
    if (name && name.length > 2) projectNames.add(name);
  }

  // Use manual session project if available
  if (manualSession?.project_name) projectNames.add(manualSession.project_name);

  const primaryProject = [...projectNames][0] || null;
  const totalSecs = autoSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const deepWorkSecs = autoSessions.filter(s => {
    const t = APP_WORKFLOW_MAP[(s.app_name||'').toLowerCase()] || '';
    return ['development','design','writing','data'].includes(t);
  }).reduce((a,s)=>a+(s.duration_seconds||0), 0);

  return {
    dominantType,
    secondType,
    primaryProject,
    deepWorkRatio: totalSecs > 0 ? deepWorkSecs / totalSecs : 0,
    uniqueApps: [...new Set(autoSessions.map(s => s.app_name).filter(Boolean))],
    appCount: new Set(autoSessions.map(s => s.app_name).filter(Boolean)).size,
    sessionCount: autoSessions.length,
    totalSecs,
  };
}

// ─── Detect workflow transition ───────────────────────────────────────────────
export function detectWorkflowTransition(previousWorkflow, currentWorkflow) {
  if (!previousWorkflow || !currentWorkflow) return null;
  if (previousWorkflow.type === currentWorkflow.type) return null;
  return {
    from: previousWorkflow.label,
    to:   currentWorkflow.label,
    fromType: previousWorkflow.type,
    toType:   currentWorkflow.type,
    isSignificant: previousWorkflow.type !== currentWorkflow.type,
  };
}
