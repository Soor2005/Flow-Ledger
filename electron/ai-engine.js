'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW LEDGER AI ENGINE  v1.0
// Behavioral Productivity Intelligence System
// Pure Node.js — no external ML dependencies required
// ═══════════════════════════════════════════════════════════════════════════════

const { summarizeWindowTitles, humanizePhrase } = require('./windowTitleAnalyzer');

// ── CATEGORY DEFINITIONS ──────────────────────────────────────────────────────

const CATEGORIES = {
  DEVELOPMENT:   { key: 'development',   label: 'Development',   sessionType: 'deep_work',     color: '#6366F1', deepWork: true  },
  DESIGN:        { key: 'design',        label: 'Design',        sessionType: 'deep_work',     color: '#F43F8C', deepWork: true  },
  WRITING:       { key: 'writing',       label: 'Writing',       sessionType: 'deep_work',     color: '#34D399', deepWork: true  },
  RESEARCH:      { key: 'research',      label: 'Research',      sessionType: 'shallow_work',  color: '#60A5FA', deepWork: false },
  COMMUNICATION: { key: 'communication', label: 'Communication', sessionType: 'shallow_work',  color: '#A78BFA', deepWork: false },
  MEETING:       { key: 'meeting',       label: 'Meeting',       sessionType: 'meeting',       color: '#F87171', deepWork: false },
  PLANNING:      { key: 'planning',      label: 'Planning',      sessionType: 'shallow_work',  color: '#FBBF24', deepWork: false },
  LEARNING:      { key: 'learning',      label: 'Learning',      sessionType: 'shallow_work',  color: '#2DD4BF', deepWork: false },
  ADMIN:         { key: 'admin',         label: 'Admin',         sessionType: 'shallow_work',  color: '#94A3B8', deepWork: false },
  DISTRACTION:   { key: 'distraction',   label: 'Distraction',   sessionType: 'distraction',   color: '#FB923C', deepWork: false },
  BREAK:         { key: 'break',         label: 'Break',         sessionType: 'break',         color: '#E2E8F0', deepWork: false },
  FOCUS:         { key: 'focus',         label: 'Focus',         sessionType: 'deep_work',     color: '#8B5CF6', deepWork: true  },
};

// ── COMPREHENSIVE PATTERN LIBRARY ─────────────────────────────────────────────
// Each category has: appNames, urlPatterns, titleKeywords, appKeywords
// Weights: 1.0 = strong signal, 0.5 = weak signal

const PATTERNS = [
  {
    ...CATEGORIES.DEVELOPMENT,
    appNames: ['vscode', 'visual studio code', 'visual studio', 'intellij', 'webstorm', 'pycharm',
      'phpstorm', 'rubymine', 'clion', 'goland', 'rider', 'datagrip', 'appcode', 'xcode',
      'android studio', 'sublime text', 'atom', 'vim', 'neovim', 'emacs', 'nano', 'helix',
      'terminal', 'iterm2', 'iterm', 'hyper', 'warp', 'kitty', 'alacritty', 'wezterm', 'ghostty',
      'postman', 'insomnia', 'httpie', 'paw', 'hoppscotch',
      'docker', 'docker desktop', 'rancher desktop', 'sourcetree', 'github desktop',
      'gitkraken', 'fork', 'tower', 'tableplus', 'sequel pro', 'dbeaver', 'pgadmin',
      'redis insight', 'mongodb compass', 'robo 3t', 'charles', 'proxyman', 'wireshark',
      'react native debugger', 'expo go', 'simulator', 'android emulator'],
    urlPatterns: [
      /github\.com/, /gitlab\.com/, /bitbucket\.org/, /codeberg\.org/,
      /localhost(:\d+)?/, /127\.0\.0\.1/, /0\.0\.0\.0/,
      /stackoverflow\.com/, /superuser\.com/, /serverfault\.com/,
      /developer\.mozilla\.org/, /npmjs\.com/, /pypi\.org/, /crates\.io/,
      /pkg\.go\.dev/, /rubygems\.org/, /packagist\.org/,
      /docs\.[a-z]+\.(io|com|dev|org)/, /devdocs\.io/, /[a-z]+\.dev\/docs/,
      /codepen\.io/, /jsfiddle\.net/, /codesandbox\.io/, /replit\.com/, /glitch\.com/,
      /vercel\.app/, /netlify\.app/, /fly\.dev/, /railway\.app/, /render\.com/,
      /console\.aws\.amazon\.com/, /console\.cloud\.google\.com/, /portal\.azure\.com/,
      /digitalocean\.com\/docs/, /heroku\.com\/deploy/,
    ],
    titleKeywords: ['terminal', 'bash', 'zsh', 'fish', 'powershell', 'cmd', 'git', 'npm', 'yarn', 'pnpm',
      'node', 'python', 'ruby', 'java', 'golang', 'rust', 'typescript', 'javascript',
      'react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'django', 'rails', 'flask',
      'fastapi', 'express', 'nestjs', 'laravel', 'spring', 'dotnet', 'graphql', 'rest api',
      'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'ci/cd', 'pipeline',
      'webpack', 'vite', 'rollup', 'esbuild', 'lint', 'eslint', 'prettier',
      'unit test', 'integration test', 'jest', 'vitest', 'pytest', 'rspec',
      'schema', 'migration', 'query', 'index', 'deploy', 'build', 'compile',
      'debug', 'breakpoint', 'stack trace', 'error', 'exception', 'logs',
      'pull request', 'code review', 'merge', 'branch', 'commit', 'diff', 'rebase'],
    appKeywords: ['code', 'dev', 'terminal', 'git', 'node', 'python', 'ruby', 'build'],
    weights: { appName: 1.0, urlPattern: 0.9, titleKeyword: 0.7, appKeyword: 0.8 },
  },
  {
    ...CATEGORIES.DESIGN,
    appNames: ['figma', 'sketch', 'adobe xd', 'adobe illustrator', 'illustrator', 'adobe photoshop',
      'photoshop', 'adobe indesign', 'indesign', 'adobe after effects', 'after effects',
      'adobe premiere', 'premiere pro', 'adobe lightroom', 'lightroom',
      'affinity designer', 'affinity photo', 'affinity publisher',
      'canva', 'framer', 'principle', 'zeplin', 'invision', 'marvel', 'origami',
      'flinto', 'pixelmator', 'procreate', 'blender', 'cinema 4d', 'maya', 'sketchup',
      'spline', 'rive', 'protopie', 'axure', 'balsamiq', 'whimsical', 'miro', 'figjam'],
    urlPatterns: [
      /figma\.com/, /sketch\.cloud/, /dribbble\.com/, /behance\.net/,
      /unsplash\.com/, /pexels\.com/, /freepik\.com/, /shutterstock\.com/,
      /adobe\.com/, /fonts\.google\.com/, /googlefonts\.com/,
      /coolors\.co/, /color\.adobe\.com/, /colorhunt\.co/, /paletton\.com/,
      /awwwards\.com/, /land-book\.com/, /lapa\.ninja/, /httpster\.net/,
      /mobbin\.com/, /pttrns\.com/, /muzli\.design/, /refero\.design/,
      /iconscout\.com/, /flaticon\.com/, /noun-project\.com/,
      /spline\.design/, /rive\.app/,
    ],
    titleKeywords: ['design', 'wireframe', 'prototype', 'mockup', 'ui', 'ux', 'user interface',
      'user experience', 'component', 'layout', 'grid', 'color palette', 'typography',
      'figma', 'sketch', 'illustration', 'vector', 'animation', 'motion',
      'brand', 'logo', 'icon', 'style guide', 'design system', 'frame', 'artboard',
      'layer', 'mask', 'path', 'anchor', 'gradient', 'export', 'handoff',
      'responsive', 'mobile', 'desktop', 'tablet', 'breakpoint'],
    appKeywords: ['design', 'figma', 'sketch', 'ui', 'ux', 'graphic', 'art', 'creative'],
    weights: { appName: 1.0, urlPattern: 0.9, titleKeyword: 0.75, appKeyword: 0.8 },
  },
  {
    ...CATEGORIES.WRITING,
    appNames: ['microsoft word', 'word', 'notion', 'obsidian', 'bear', 'ulysses', 'scrivener',
      'grammarly', 'hemingway editor', 'ia writer', 'typora', 'roam research', 'logseq',
      'workflowy', 'craft', 'drafts', 'ghostwriter', 'byword', 'writeroom',
      'google docs', 'libreoffice writer', 'pages', 'one note'],
    urlPatterns: [
      /docs\.google\.com\/document/, /notion\.so/, /notion\.com/,
      /medium\.com\/write/, /substack\.com\/publish/, /ghost\.io\/admin/,
      /wordpress\.com\/post/, /hashnode\.com\/post/, /dev\.to\/new/,
      /overleaf\.com/, /hackmd\.io/, /dropbox\.com\/paper/,
    ],
    titleKeywords: ['draft', 'document', 'report', 'article', 'blog', 'post', 'essay',
      'writing', 'edit', 'proofread', 'content', 'copy', 'proposal', 'brief',
      'spec', 'readme', 'documentation', 'changelog', 'release notes',
      'newsletter', 'email template', 'script', 'whitepaper', 'case study',
      'press release', 'pitch deck', 'memo', 'summary'],
    appKeywords: ['write', 'doc', 'note', 'text', 'word', 'draft', 'notion', 'obsidian'],
    weights: { appName: 1.0, urlPattern: 0.9, titleKeyword: 0.75, appKeyword: 0.7 },
  },
  {
    ...CATEGORIES.MEETING,
    appNames: ['zoom', 'google meet', 'microsoft teams', 'skype', 'webex', 'whereby',
      'around', 'facetime', 'discord', 'loom', 'claap', 'mmhmm', 'descript'],
    urlPatterns: [
      /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/,
      /zoom\.us\/j\/\d+/, /zoom\.us\/s\/\d+/,
      /teams\.microsoft\.com\/l\/meetup-join/,
      /whereby\.com\/[a-z0-9-]+/,
      /webex\.com\/meet/, /go\.webex\.com/,
      /around\.co\//, /discord\.com\/channels.*voice/,
    ],
    titleKeywords: ['meeting', 'call', 'conference', 'standup', 'stand-up', 'sync', 'review',
      'interview', 'demo', 'presentation', '1:1', 'one on one', 'all hands',
      'town hall', 'retrospective', 'sprint review', 'planning session',
      'kick-off', 'kickoff', 'onboarding', 'discovery', 'handover',
      'zoom meeting', 'google meet', 'teams call'],
    appKeywords: ['zoom', 'meet', 'call', 'video', 'conference', 'teams', 'skype'],
    weights: { appName: 1.0, urlPattern: 1.0, titleKeyword: 0.9, appKeyword: 0.9 },
  },
  {
    ...CATEGORIES.COMMUNICATION,
    appNames: ['slack', 'microsoft teams', 'discord', 'telegram', 'signal', 'whatsapp',
      'imessage', 'messages', 'mail', 'outlook', 'spark', 'superhuman', 'airmail',
      'apple mail', 'thunderbird', 'gmail', 'hey', 'mimestream', 'missive'],
    urlPatterns: [
      /mail\.google\.com/, /outlook\.live\.com/, /outlook\.office\.com/,
      /app\.slack\.com/, /discord\.com\/channels\/\d/,
      /web\.whatsapp\.com/, /telegram\.org/, /signal\.org/,
      /teams\.microsoft\.com(?!.*meetup-join)/,
      /front\.app/, /missive\.com/, /helpscout\.com/,
    ],
    titleKeywords: ['email', 'message', 'chat', 'inbox', 'reply', 'compose', 'thread',
      'slack', 'discord', 'dm', 'direct message', 'notification', 'channel',
      'unread', 'starred', 'draft email', 'send', 'forward', 'cc', 'bcc'],
    appKeywords: ['slack', 'email', 'mail', 'chat', 'message', 'inbox', 'discord'],
    weights: { appName: 0.9, urlPattern: 0.9, titleKeyword: 0.75, appKeyword: 0.75 },
  },
  {
    ...CATEGORIES.PLANNING,
    appNames: ['notion', 'trello', 'asana', 'linear', 'jira', 'clickup', 'monday',
      'basecamp', 'height', 'shortcut', 'todoist', 'things', 'omnifocus', 'reminders',
      'calendar', 'fantastical', 'calendly', 'reclaim', 'sunsama', 'akiflow',
      'productboard', 'aha!', 'roadmunk', 'miro', 'figjam', 'whimsical', 'lucidchart'],
    urlPatterns: [
      /trello\.com/, /app\.asana\.com/, /linear\.app/,
      /[a-z]+\.atlassian\.net\/jira/, /app\.clickup\.com/,
      /[a-z]+\.monday\.com/, /basecamp\.com/, /app\.height\.app/,
      /todoist\.com/, /app\.producthunt\.com/, /productboard\.com/,
      /calendar\.google\.com/, /miro\.com\/app/, /whimsical\.com/,
    ],
    titleKeywords: ['plan', 'planning', 'roadmap', 'sprint', 'backlog', 'task', 'todo',
      'checklist', 'project', 'milestone', 'deadline', 'schedule', 'calendar',
      'timeline', 'board', 'kanban', 'epic', 'story', 'issue', 'ticket',
      'priority', 'estimation', 'velocity', 'capacity', 'okr', 'goal', 'kpi'],
    appKeywords: ['plan', 'project', 'task', 'todo', 'board', 'roadmap', 'jira', 'asana', 'linear'],
    weights: { appName: 0.9, urlPattern: 0.9, titleKeyword: 0.75, appKeyword: 0.75 },
  },
  {
    ...CATEGORIES.RESEARCH,
    appNames: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera', 'vivaldi'],
    urlPatterns: [
      /scholar\.google\.com/, /pubmed\.ncbi\.nlm\.nih\.gov/, /arxiv\.org/,
      /researchgate\.net/, /jstor\.org/, /wikipedia\.org/, /britannica\.com/,
      /semanticscholar\.org/, /sciencedirect\.com/, /springer\.com/,
      /books\.google\.com/, /goodreads\.com\/book/,
      /chatgpt\.com/, /chat\.openai\.com/, /claude\.ai/, /bard\.google\.com/,
      /perplexity\.ai/, /you\.com/, /phind\.com/,
    ],
    titleKeywords: ['research', 'study', 'learn', 'reading', 'article', 'paper', 'reference',
      'source', 'analysis', 'overview', 'guide', 'tutorial', 'how to', 'what is',
      'comparison', 'review', 'summary', 'introduction', 'explained',
      'chatgpt', 'claude', 'ai assistant', 'prompt', 'generate'],
    appKeywords: ['search', 'browse', 'read', 'wiki', 'research', 'study'],
    weights: { appName: 0.3, urlPattern: 0.8, titleKeyword: 0.65, appKeyword: 0.4 },
  },
  {
    ...CATEGORIES.LEARNING,
    appNames: ['chrome', 'safari', 'firefox', 'arc', 'anki', 'duolingo', 'coursera'],
    urlPatterns: [
      /udemy\.com\/course/, /coursera\.org\/learn/, /pluralsight\.com\/courses/,
      /linkedin\.com\/learning/, /egghead\.io/, /frontendmasters\.com/,
      /laracasts\.com/, /treehouse\.com/, /skillshare\.com\/class/,
      /khanacademy\.org/, /brilliant\.org/, /duolingo\.com/,
      /youtube\.com\/watch.*learn/, /youtube\.com\/c\/.*programming/,
      /youtube\.com\/playlist\?list=PL/, /youtu\.be/,
      /scrimba\.com/, /codecademy\.com/, /theodinproject\.com/,
      /exercism\.org/, /leetcode\.com/, /hackerrank\.com/, /codewars\.com/,
    ],
    titleKeywords: ['course', 'tutorial', 'lesson', 'learn', 'study', 'lecture', 'exercise',
      'practice', 'quiz', 'certification', 'training', 'chapter', 'module',
      'class', 'workshop', 'bootcamp', 'webinar', 'masterclass'],
    appKeywords: ['course', 'learn', 'tutorial', 'study', 'lesson', 'udemy', 'coursera'],
    weights: { appName: 0.2, urlPattern: 0.9, titleKeyword: 0.75, appKeyword: 0.65 },
  },
  {
    ...CATEGORIES.ADMIN,
    appNames: ['excel', 'microsoft excel', 'google sheets', 'numbers', 'airtable',
      'quickbooks', 'xero', 'freshbooks', 'wave', 'sage', 'expensify',
      'harvest', 'toggl', 'clockify', 'paypal', 'stripe', 'square'],
    urlPatterns: [
      /sheets\.google\.com/, /docs\.google\.com\/spreadsheets/,
      /airtable\.com\/[a-z]+\/[a-z]+\/grid/, /quickbooks\.com/, /xero\.com/,
      /drive\.google\.com/, /dropbox\.com/, /box\.com\/s/,
      /app\.hubspot\.com/, /salesforce\.com/, /pipedrive\.com/,
      /expensify\.com/, /harvest\.com/, /toggl\.com\/app/,
    ],
    titleKeywords: ['invoice', 'budget', 'expense', 'finance', 'billing', 'payment',
      'spreadsheet', 'report', 'analytics', 'admin', 'management', 'settings',
      'configuration', 'crm', 'lead', 'pipeline', 'revenue', 'forecast',
      'payroll', 'receipt', 'reimbursement', 'contract', 'proposal'],
    appKeywords: ['invoice', 'budget', 'sheet', 'excel', 'finance', 'admin', 'crm'],
    weights: { appName: 0.9, urlPattern: 0.85, titleKeyword: 0.7, appKeyword: 0.7 },
  },
  {
    ...CATEGORIES.DISTRACTION,
    appNames: ['youtube', 'netflix', 'disney+', 'hulu', 'hbo max', 'amazon prime video',
      'twitch', 'reddit', 'twitter', 'x', 'instagram', 'facebook', 'tiktok',
      'pinterest', 'snapchat', 'tumblr', 'spotify', '9gag'],
    urlPatterns: [
      /youtube\.com\/(?!watch\?.*list=PL[A-Z]|c\/.*edu|channel\/.*educ)/,
      /netflix\.com\/watch/, /twitch\.tv\/[a-z]/, /reddit\.com\/(r\/|hot|new|top)/,
      /twitter\.com\/home/, /x\.com\/home/, /instagram\.com\/(feed|reels|stories)/,
      /facebook\.com\/(?!business|ads)/, /tiktok\.com\/@/, /pinterest\.com\/feed/,
      /9gag\.com/, /buzzfeed\.com/, /dailymail\.co\.uk/, /tmz\.com/,
      /theonion\.com/, /clickhole\.com/, /boredpanda\.com/,
    ],
    titleKeywords: ['watch', 'stream', 'streaming', 'episode', 'season', 'movie', 'show',
      'trending', 'viral', 'feed', 'scroll', 'explore', 'discover', 'recommended',
      'for you', 'home feed', 'reels', 'shorts', 'stories', 'memes',
      'entertainment', 'comedy', 'funny', 'gaming', 'let\'s play'],
    appKeywords: ['youtube', 'netflix', 'reddit', 'twitter', 'instagram', 'tiktok', 'stream'],
    weights: { appName: 1.0, urlPattern: 1.0, titleKeyword: 0.8, appKeyword: 0.9 },
  },
];

// ── WORKFLOW TEMPLATES ─────────────────────────────────────────────────────────
// Maps category combinations → intelligent session names

const WORKFLOW_NAMES = {
  // Development workflows
  'development':                          ['Deep Development Sprint', 'Focused Coding Session', 'Engineering Work'],
  'development+development':              ['Extended Development Session', 'Deep Code Sprint', 'Engineering Deep Work'],
  'development+research':                 ['Technical Research & Development', 'Dev Research Session', 'Exploratory Engineering'],
  'development+communication':            ['Dev + Team Collaboration', 'Engineering Sync', 'Code Review & Discussion'],
  'development+planning':                 ['Sprint Planning & Development', 'Dev Planning Session', 'Engineering Scoping'],
  'development+writing':                  ['Documentation & Development', 'Technical Writing Sprint', 'Dev Spec Work'],
  'development+meeting':                  ['Technical Meeting + Dev Work', 'Engineering Review', 'Dev Sprint Review'],
  // Design workflows
  'design':                              ['Deep Design Session', 'Focused Design Work', 'Creative Design Sprint'],
  'design+design':                        ['Extended Design Session', 'Design Deep Dive', 'Creative Deep Work'],
  'design+research':                      ['Design Research & Inspiration', 'UX Research Session', 'Design Discovery'],
  'design+communication':                 ['Design Review & Feedback', 'Design Collaboration', 'Creative Review Session'],
  'design+writing':                       ['Design Specification Writing', 'UX Writing Session', 'Design Documentation'],
  'design+planning':                      ['Design Sprint Planning', 'Creative Roadmapping', 'Design Scoping Session'],
  // Writing workflows
  'writing':                             ['Deep Writing Session', 'Focused Content Work', 'Writing Sprint'],
  'writing+research':                     ['Research & Content Writing', 'Content Research Session', 'Writing with Sources'],
  'writing+writing':                      ['Extended Writing Session', 'Long-form Writing Deep Work', 'Content Production Sprint'],
  'writing+communication':                ['Editorial Review & Writing', 'Content Collaboration', 'Writing + Feedback Loop'],
  'writing+planning':                     ['Content Planning & Writing', 'Editorial Planning Session', 'Content Strategy Work'],
  // Meeting workflows
  'meeting':                             ['Meeting Block', 'Scheduled Meeting', 'Team Call'],
  'meeting+communication':                ['Meeting + Follow-up', 'Meeting & Action Items', 'Call & Email Block'],
  'meeting+planning':                     ['Planning Meeting', 'Strategic Discussion', 'Roadmapping Session'],
  'meeting+writing':                      ['Meeting Notes & Documentation', 'Post-Meeting Write-up', 'Meeting Documentation'],
  // Research workflows
  'research':                            ['Research Session', 'Information Gathering', 'Topic Exploration'],
  'research+research':                    ['Deep Research Session', 'Comprehensive Research Block', 'Extended Research Sprint'],
  'research+writing':                     ['Research & Writing', 'Content Research Session', 'Evidence-based Writing'],
  'research+planning':                    ['Research-Driven Planning', 'Discovery & Planning', 'Informed Strategy Session'],
  // Communication workflows
  'communication':                       ['Communication & Email Block', 'Team Sync', 'Inbox Management'],
  'communication+communication':          ['Extended Communication Block', 'Email & Messaging Sprint', 'Inbox Zero Session'],
  'communication+planning':              ['Planning & Coordination', 'Strategic Communication', 'Team Alignment'],
  // Planning workflows
  'planning':                            ['Planning Session', 'Task Organization', 'Roadmap Work'],
  'planning+planning':                    ['Deep Planning Session', 'Strategic Planning Block', 'Project Organization Sprint'],
  // Distraction patterns
  'distraction':                         ['Distraction Loop', 'Unfocused Browsing', 'Off-task Activity'],
  'distraction+distraction':              ['Extended Distraction Pattern', 'Significant Focus Loss', 'Off-task Spiral'],
  // Mixed deep work
  'development+design':                   ['Full-stack Creative Session', 'Design + Engineering Sprint', 'Creative Development Work'],
  'design+development':                   ['Design-to-Code Session', 'Implementation Sprint', 'Creative Engineering'],
  'writing+design':                       ['Content & Design Session', 'Creative Content Sprint', 'Brand & Copy Work'],
  // Learning
  'learning':                            ['Learning Session', 'Skill Development Block', 'Educational Session'],
  'learning+development':                 ['Learning & Building', 'Tutorial + Practice Session', 'Skill Application Sprint'],
  'learning+research':                    ['Research & Learning', 'Deep Learning Session', 'Knowledge Acquisition'],
  // Admin
  'admin':                               ['Administrative Work', 'Business Management', 'Operational Tasks'],
  'admin+communication':                  ['Admin & Communications', 'Business Ops Block', 'Management & Email'],
};

// ── FOCUS STATE THRESHOLDS ────────────────────────────────────────────────────

const FOCUS_THRESHOLDS = {
  DEEP_WORK_MIN_SECS:        1500, // 25 min uninterrupted on deep work app
  FLOW_STATE_MIN_SECS:       3600, // 60 min sustained focus
  FRAGMENTED_SWITCHES_PER_H: 30,   // > 30 app switches/hr = fragmented
  HIGH_SWITCHES_PER_H:       15,   // 15–30 = multitasking
  LOW_SWITCHES_PER_H:        5,    // < 5 = deep work rhythm
  DISTRACTION_REVISIT_MINS:  10,   // same URL < 10 min = repeat distraction
  PASSIVE_IDLE_SECS:         30,   // on entertainment with no keyboard = passive
  COGNITIVE_FATIGUE_WORK_H:  5,    // 5+ hrs continuous work = fatigue risk
};

// ── DISTRACTION SIGNALS ────────────────────────────────────────────────────────

const DISTRACTION_APPS = new Set([
  'youtube', 'netflix', 'twitch', 'reddit', 'twitter', 'x', 'instagram',
  'facebook', 'tiktok', 'pinterest', 'snapchat', 'tumblr', '9gag', 'discord',
]);

const DISTRACTION_URL_PATTERNS = [
  /youtube\.com(?!.*\?list=PL.*learn)/, /netflix\.com\/watch/,
  /twitch\.tv\/[a-z]/, /reddit\.com\/(r\/|hot|new|top|best)/,
  /twitter\.com\/home/, /x\.com\/home/,
  /instagram\.com\/(feed|reels|stories|explore)/,
  /facebook\.com\/(?!business|ads|marketplace)/, /tiktok\.com\/@/,
  /pinterest\.com\/feed/, /9gag\.com/, /buzzfeed\.com/,
];

// ── PRODUCTIVITY WEIGHTS ──────────────────────────────────────────────────────

const PRODUCTIVITY_WEIGHTS = {
  deep_work:     1.0,
  shallow_work:  0.5,
  meeting:       0.4,
  distraction:  -0.8,
  break:         0.0,
  unknown:       0.2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AI ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class FlowLedgerAI {
  constructor(db, dbHelpers) {
    this.db = db;
    this.run = dbHelpers.run;
    this.get = dbHelpers.get;
    this.all = dbHelpers.all;

    // In-memory state
    this.userPatterns   = new Map(); // learned keyword boosts from corrections
    this.switchLog      = [];        // { ts, appName, url } — rolling 2-hr window
    this.urlVisitLog    = new Map(); // url → [timestamps] for repeat detection
    this.sessionBuffer  = [];        // recent classified activities for workflow detection
    this.lastDeepStart  = null;      // timestamp when current deep work block started

    this._init();
  }

  _init() {
    try { this._loadUserPatterns(); } catch (_) {}
  }

  // ── USER PATTERN LOADING ──────────────────────────────────────────────────

  _loadUserPatterns() {
    const rows = this.all(
      'SELECT keyword, category, boost FROM ai_user_patterns ORDER BY boost DESC',
      []
    );
    for (const r of rows) {
      this.userPatterns.set(r.keyword.toLowerCase(), { category: r.category, boost: r.boost });
    }
  }

  // ── CORE CLASSIFICATION ───────────────────────────────────────────────────

  /**
   * Classify a single activity into a category with confidence score.
   * Returns { category, label, sessionType, deepWork, confidence, signals }
   */
  classifyActivity(appName = '', url = '', title = '') {
    const app   = (appName || '').toLowerCase().trim();
    const urlL  = (url     || '').toLowerCase();
    const titleL= (title   || '').toLowerCase();

    const scores = {};

    for (const pattern of PATTERNS) {
      let score = 0;
      const signals = [];

      // App name exact/partial match
      if (app) {
        const appMatch = pattern.appNames.some(a => app.includes(a) || a.includes(app));
        if (appMatch) {
          score += pattern.weights.appName;
          signals.push(`app:${app}`);
        }
        // App keyword match
        const kwMatch = pattern.appKeywords?.some(k => app.includes(k));
        if (kwMatch) {
          score += pattern.weights.appKeyword * 0.5;
          signals.push(`appKw:${app}`);
        }
      }

      // URL pattern match
      if (urlL) {
        const urlMatch = pattern.urlPatterns.some(p => p.test(urlL));
        if (urlMatch) {
          score += pattern.weights.urlPattern;
          signals.push(`url:${urlL.slice(0, 40)}`);
        }
      }

      // Title keyword match (count unique matches, cap at 3)
      if (titleL) {
        let titleHits = 0;
        for (const kw of pattern.titleKeywords) {
          if (titleL.includes(kw)) {
            titleHits++;
            signals.push(`title:${kw}`);
            if (titleHits >= 3) break;
          }
        }
        if (titleHits > 0) {
          score += pattern.weights.titleKeyword * Math.min(titleHits, 3) / 3;
        }
      }

      if (score > 0) scores[pattern.key] = { score, cat: pattern, signals };
    }

    // Apply user-learned pattern boosts
    const combinedText = `${app} ${urlL} ${titleL}`;
    for (const [keyword, learned] of this.userPatterns) {
      if (combinedText.includes(keyword)) {
        if (!scores[learned.category]) scores[learned.category] = { score: 0, cat: PATTERNS.find(p => p.key === learned.category) || {}, signals: [] };
        scores[learned.category].score += learned.boost;
        scores[learned.category].signals.push(`learned:${keyword}`);
      }
    }

    // Find winner
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b.score - a.score);

    if (sorted.length === 0) {
      return { category: 'focus', label: 'Work Session', sessionType: 'shallow_work', deepWork: false, confidence: 0.1, signals: [] };
    }

    const [winKey, winData] = sorted[0];
    const cat = winData.cat;

    // Normalize confidence to 0–1
    const maxPossibleScore = 1.0 + 1.0 + 0.9 + 0.8; // all weights combined
    const confidence = Math.min(winData.score / maxPossibleScore, 1.0);

    // Resolve category metadata
    const catDef = Object.values(CATEGORIES).find(c => c.key === winKey) || CATEGORIES.FOCUS;

    return {
      category:    catDef.label,
      categoryKey: winKey,
      label:       catDef.label,
      sessionType: catDef.sessionType,
      deepWork:    catDef.deepWork,
      confidence:  Math.round(confidence * 100) / 100,
      color:       catDef.color,
      signals:     winData.signals.slice(0, 5),
    };
  }

  // ── WORKFLOW DETECTION ────────────────────────────────────────────────────

  /**
   * Given a list of recent classified activities, determine the workflow type
   * and generate an intelligent session name.
   */
  detectWorkflow(activities) {
    if (!activities || activities.length === 0) {
      return { workflowName: 'Work Session', primaryCategory: 'focus', continuityScore: 0 };
    }

    // Count category occurrences (weight by duration)
    const catDuration = {};
    let totalDuration = 0;

    for (const act of activities) {
      const key = act.category_key || 'focus';
      const dur = act.duration || act.duration_seconds || 60;
      catDuration[key] = (catDuration[key] || 0) + dur;
      totalDuration += dur;
    }

    // Sort by weighted duration
    const sorted = Object.entries(catDuration).sort(([, a], [, b]) => b - a);
    const primary = sorted[0]?.[0] || 'focus';
    const secondary = sorted[1]?.[0];

    // Compute continuity: how consistent is the category?
    const primaryPct = (catDuration[primary] || 0) / Math.max(totalDuration, 1);
    const continuityScore = Math.round(primaryPct * 100);

    // Look up workflow name
    let nameKey = primary;
    if (secondary && catDuration[secondary] / totalDuration > 0.2) {
      nameKey = `${primary}+${secondary}`;
    }

    const nameOptions = WORKFLOW_NAMES[nameKey] || WORKFLOW_NAMES[primary] || ['Work Session'];
    const workflowName = nameOptions[Math.floor(Math.random() * nameOptions.length)];

    // Calculate intent confidence
    const intentConfidence = Math.min(
      continuityScore / 100 + (activities.length >= 3 ? 0.1 : 0),
      1.0
    );

    return {
      workflowName,
      primaryCategory: primary,
      secondaryCategory: secondary,
      continuityScore,
      intentConfidence: Math.round(intentConfidence * 100) / 100,
      categoryBreakdown: catDuration,
      totalDurationSecs: totalDuration,
    };
  }

  /**
   * Generate an intelligent session name from a set of app activities.
   *
   * Previously this only looked at `workflow.workflowName` — a name picked
   * randomly from a small canned phrase list keyed by category, completely
   * ignoring window_title/app_name/url on every activity. It now extracts
   * the actual, time-weighted, cleaned window-title phrase that best
   * describes what was on screen (same scoring the calendar event writer
   * uses — see windowTitleAnalyzer.js), and only falls back to the canned
   * name when no activity had a usable title (e.g. idle blocks).
   */
  summarizeSession(activities, projectName, clientName) {
    const workflow  = this.detectWorkflow(activities);
    const titleInfo = summarizeWindowTitles(activities);

    const TITLE_QUALITY_THRESHOLD = 20;
    let name;
    let nameHasOwnProject = false;
    if (titleInfo.bestPhrase && titleInfo.bestPhraseScore >= TITLE_QUALITY_THRESHOLD) {
      const humanized = humanizePhrase(titleInfo.bestPhrase);
      // IDE-style titles ("file.js — Project") already carry their own project
      // context — use it directly instead of stacking our project/client prefix
      // on top, which previously produced "Flow Ledger — File.Js — Flow Ledger".
      if (humanized.project) {
        name = `${humanized.project} — ${humanized.text}`;
        nameHasOwnProject = true;
      } else {
        name = humanized.text;
      }
    } else {
      name = workflow.workflowName;
    }

    // Personalise with project/client context if available (skip when the
    // title already embeds its own project context — see above).
    if (!nameHasOwnProject) {
      if (projectName && workflow.continuityScore > 60) {
        name = `${projectName} — ${name}`;
      } else if (clientName && workflow.continuityScore > 60) {
        name = `${clientName} — ${name}`;
      }
    }

    return {
      name,
      sessionType:  workflow.primaryCategory,
      isDeepWork:   ['development', 'design', 'writing', 'focus'].includes(workflow.primaryCategory),
      confidence:   workflow.intentConfidence,
      description:  this._buildDescription(workflow, activities, titleInfo),
    };
  }

  _buildDescription(workflow, activities, titleInfo = null) {
    const info = titleInfo || summarizeWindowTitles(activities);
    const parts = [];
    if (workflow.totalDurationSecs > 0) {
      parts.push(`${Math.round(workflow.totalDurationSecs / 60)} min`);
    }
    if (workflow.continuityScore > 75) parts.push('highly focused');
    else if (workflow.continuityScore > 50) parts.push('moderately focused');
    else parts.push('fragmented');
    if (workflow.secondaryCategory) {
      parts.push(`${workflow.primaryCategory} + ${workflow.secondaryCategory}`);
    } else {
      parts.push(workflow.primaryCategory);
    }
    let detail = parts.join(' · ');

    // Mention the actual app(s) instead of staying purely category-level.
    if (info.distinctApps.length === 1) {
      detail += ` in ${info.distinctApps[0]}`;
    } else if (info.distinctApps.length > 1) {
      detail += ` across ${info.distinctApps.slice(0, 2).join(' & ')}`;
    }

    // Surface a second, distinct piece of work seen during the session —
    // real substance instead of stats-only text.
    const secondary = info.distinctPhrases.find(
      p => p.phrase.toLowerCase() !== (info.bestPhrase || '').toLowerCase()
    );
    if (secondary) {
      detail += `; also touched ${humanizePhrase(secondary.phrase).text}`;
    }

    return detail;
  }

  // ── FOCUS DETECTION ───────────────────────────────────────────────────────

  /**
   * Record an app switch event for focus analysis.
   */
  recordSwitch(appName, url, ts = Date.now()) {
    this.switchLog.push({ ts, appName: appName || '', url: url || '' });

    // Prune to rolling 2-hour window
    const cutoff = ts - 2 * 3600 * 1000;
    this.switchLog = this.switchLog.filter(e => e.ts >= cutoff);

    // Track URL revisits for distraction detection
    if (url) {
      const key = this._urlKey(url);
      const visits = this.urlVisitLog.get(key) || [];
      visits.push(ts);
      // Keep only last 1 hour
      const hourAgo = ts - 3600 * 1000;
      this.urlVisitLog.set(key, visits.filter(t => t >= hourAgo));
    }
  }

  /**
   * Analyse current focus state based on recent app switches and activity.
   * Returns { score, state, deepWorkSecs, switchRate, insights }
   */
  analyzeFocus(currentAppName = '', currentUrl = '', currentCategory = '') {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;

    // Switches in last hour
    const recentSwitches = this.switchLog.filter(e => e.ts >= oneHourAgo);
    const switchRate     = recentSwitches.length; // per hour

    // Average time between switches
    let avgDwellMs = 0;
    if (recentSwitches.length > 1) {
      const dwells = [];
      for (let i = 1; i < recentSwitches.length; i++) {
        dwells.push(recentSwitches[i].ts - recentSwitches[i - 1].ts);
      }
      avgDwellMs = dwells.reduce((a, b) => a + b, 0) / dwells.length;
    }

    // Deep work time in last hour (time on deep work apps)
    let deepWorkMs = 0;
    for (let i = 0; i < recentSwitches.length - 1; i++) {
      const sw = recentSwitches[i];
      const classification = this.classifyActivity(sw.appName, sw.url, '');
      if (classification.deepWork) {
        deepWorkMs += recentSwitches[i + 1].ts - sw.ts;
      }
    }

    // Determine focus state
    let state = 'focused';
    let score = 100;
    const insights = [];

    if (switchRate > FOCUS_THRESHOLDS.FRAGMENTED_SWITCHES_PER_H) {
      state = 'fragmented';
      score -= 40;
      insights.push('High context switching — attention fragmented');
    } else if (switchRate > FOCUS_THRESHOLDS.HIGH_SWITCHES_PER_H) {
      state = 'multitasking';
      score -= 20;
      insights.push('Frequent app switching — multitasking mode');
    } else if (switchRate <= FOCUS_THRESHOLDS.LOW_SWITCHES_PER_H && deepWorkMs > 30 * 60 * 1000) {
      state = 'flow';
      score += 10;
      insights.push('Low switching + sustained deep work — flow state');
    }

    // Check for distraction patterns
    const distractionSwitches = recentSwitches.filter(sw => this._isDistraction(sw.url));
    const distractionPct = recentSwitches.length > 0
      ? distractionSwitches.length / recentSwitches.length : 0;

    if (distractionPct > 0.4) {
      state = 'distracted';
      score -= 30;
      insights.push(`${Math.round(distractionPct * 100)}% of switches were to distraction sites`);
    }

    // Deep work bonus
    const deepWorkPct = deepWorkMs / (3600 * 1000);
    score += deepWorkPct * 20;

    // Clamp score
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Check for flow state (uninterrupted deep work >= 25 min)
    const currentClassification = this.classifyActivity(currentAppName, currentUrl, '');
    if (currentClassification.deepWork) {
      if (!this.lastDeepStart) {
        this.lastDeepStart = now;
      }
      const uninterruptedSecs = (now - this.lastDeepStart) / 1000;
      if (uninterruptedSecs >= FOCUS_THRESHOLDS.DEEP_WORK_MIN_SECS) {
        state = uninterruptedSecs >= FOCUS_THRESHOLDS.FLOW_STATE_MIN_SECS ? 'flow' : 'deep_work';
        score = Math.max(score, 75);
      }
    } else {
      this.lastDeepStart = null;
    }

    return {
      score,
      state,
      deepWorkSecs:    Math.round(deepWorkMs / 1000),
      switchRate,
      avgDwellSecs:    Math.round(avgDwellMs / 1000),
      distractionPct:  Math.round(distractionPct * 100),
      insights,
    };
  }

  // ── DISTRACTION DETECTION ─────────────────────────────────────────────────

  /**
   * Detect active distraction patterns.
   * Returns { isDistracted, score, patterns, recommendation }
   */
  detectDistraction(appName = '', url = '', title = '') {
    const now    = Date.now();
    const app    = (appName || '').toLowerCase();
    const urlL   = (url || '').toLowerCase();
    const patterns = [];
    let score = 0;

    // Direct distraction app/URL
    const isDirectDistraction = DISTRACTION_APPS.has(app) ||
      DISTRACTION_URL_PATTERNS.some(p => p.test(urlL));

    if (isDirectDistraction) {
      score += 50;
      patterns.push({ type: 'entertainment', label: `Distraction: ${appName || url}` });
    }

    // Repeat visit detection (same URL > 2 times in 10 min)
    if (urlL) {
      const key     = this._urlKey(urlL);
      const visits  = this.urlVisitLog.get(key) || [];
      const tenMinAgo = now - FOCUS_THRESHOLDS.DISTRACTION_REVISIT_MINS * 60 * 1000;
      const recentVisits = visits.filter(t => t >= tenMinAgo).length;

      if (recentVisits >= 3 && isDirectDistraction) {
        score += 30;
        patterns.push({ type: 'doom_scroll', label: `Revisited ${key} ${recentVisits}× in 10 min` });
      } else if (recentVisits >= 5) {
        score += 20;
        patterns.push({ type: 'repeat_visit', label: `High-frequency revisit: ${key}` });
      }
    }

    // Rapid switching INTO distraction from work
    const recentSwitches = this.switchLog.slice(-6);
    const alternating = this._detectAlternating(recentSwitches);
    if (alternating) {
      score += 20;
      patterns.push({ type: 'work_distraction_toggle', label: 'Alternating between work and distraction' });
    }

    const isDistracted = score >= 40;
    const recommendation = isDistracted ? this._distractionRecommendation(patterns) : null;

    return { isDistracted, score: Math.min(score, 100), patterns, recommendation };
  }

  _detectAlternating(switches) {
    if (switches.length < 4) return false;
    let workDistraction = 0;
    for (let i = 1; i < switches.length; i++) {
      const prev = this._isDistraction(switches[i - 1].url);
      const curr = this._isDistraction(switches[i].url);
      if (prev !== curr) workDistraction++;
    }
    return workDistraction >= 3; // 3+ alternations in last 6 switches
  }

  _distractionRecommendation(patterns) {
    const types = patterns.map(p => p.type);
    if (types.includes('doom_scroll'))              return 'You\'re stuck in a scroll loop. Try closing that tab and setting a 25-minute focus timer.';
    if (types.includes('work_distraction_toggle'))  return 'Back-and-forth between work and distractions hurts flow. Block distracting sites for your next session.';
    if (types.includes('entertainment'))            return 'Entertainment detected during work hours. Consider using Focus Mode to stay on track.';
    return 'Distraction pattern detected. A short break then a focused sprint often helps.';
  }

  _isDistraction(url = '') {
    const urlL = url.toLowerCase();
    return DISTRACTION_APPS.has(urlL) || DISTRACTION_URL_PATTERNS.some(p => p.test(urlL));
  }

  _urlKey(url = '') {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname.replace(/^www\./, '');
    } catch { return url.slice(0, 50); }
  }

  // ── PRODUCTIVITY SCORING ──────────────────────────────────────────────────

  /**
   * Calculate comprehensive productivity scores for a day's activities.
   * Returns { focusScore, workflowScore, distractionResistance, efficiencyScore, overall, breakdown }
   */
  calculateProductivityScores(activities) {
    if (!activities || activities.length === 0) {
      return { focusScore: 0, workflowScore: 0, distractionResistance: 100, efficiencyScore: 0, overall: 0, deepWorkMins: 0 };
    }

    const totalSecs   = activities.reduce((s, a) => s + (a.duration || a.duration_seconds || 0), 0);
    if (totalSecs < 60) {
      return { focusScore: 0, workflowScore: 0, distractionResistance: 100, efficiencyScore: 0, overall: 0, deepWorkMins: 0 };
    }

    // Categorize each activity
    const classified = activities.map(a => {
      const c = this.classifyActivity(a.app_name || '', a.url || '', a.title || '');
      return { ...a, ...c, duration: a.duration || a.duration_seconds || 0 };
    });

    // Duration by session type
    const byType = {};
    for (const a of classified) {
      const t = a.sessionType || 'unknown';
      byType[t] = (byType[t] || 0) + a.duration;
    }

    const deepWorkSecs     = byType.deep_work  || 0;
    const shallowWorkSecs  = byType.shallow_work || 0;
    const meetingSecs      = byType.meeting     || 0;
    const distractionSecs  = byType.distraction || 0;
    const workSecs         = deepWorkSecs + shallowWorkSecs + meetingSecs;

    // ── Focus Quality Score (0–100) ──────────────────────────────────────────
    // Based on: deep work %, uninterrupted blocks, switch rate
    const deepWorkPct    = workSecs > 0 ? deepWorkSecs / totalSecs : 0;
    const distractionPct = totalSecs > 0 ? distractionSecs / totalSecs : 0;

    // Find longest uninterrupted deep work block
    let longestDeepBlock = 0, currentDeepBlock = 0;
    for (const a of classified) {
      if (a.deepWork) { currentDeepBlock += a.duration; longestDeepBlock = Math.max(longestDeepBlock, currentDeepBlock); }
      else if (a.sessionType === 'distraction') { currentDeepBlock = 0; }
    }

    const focusScore = Math.round(
      deepWorkPct * 60 +
      (longestDeepBlock / 3600) * 20 - // bonus for long blocks (up to 20 pts for 1hr)
      distractionPct * 40 +
      (deepWorkSecs > 3600 ? 10 : 0)  // bonus for 1+ hr deep work
    );

    // ── Workflow Stability Score (0–100) ─────────────────────────────────────
    // Based on: category continuity, session length variance
    const categories = classified.map(a => a.categoryKey || 'focus');
    const categoryChanges = categories.filter((c, i) => i > 0 && c !== categories[i - 1]).length;
    const switchRate = categories.length > 1 ? categoryChanges / (categories.length - 1) : 0;
    const workflowScore = Math.round(Math.max(0, 100 - switchRate * 120));

    // ── Distraction Resistance Score (0–100) ─────────────────────────────────
    const distractionResistance = Math.round(Math.max(0, 100 - distractionPct * 150));

    // ── Efficiency Score (0–100) ──────────────────────────────────────────────
    // Deep work / total time (including breaks, distractions)
    const efficiencyScore = totalSecs > 0
      ? Math.round((deepWorkSecs + shallowWorkSecs * 0.5) / totalSecs * 100)
      : 0;

    // ── Overall Score ─────────────────────────────────────────────────────────
    const overall = Math.round(
      focusScore          * 0.35 +
      workflowScore       * 0.20 +
      distractionResistance * 0.25 +
      efficiencyScore     * 0.20
    );

    return {
      focusScore:           Math.min(100, Math.max(0, focusScore)),
      workflowScore:        Math.min(100, Math.max(0, workflowScore)),
      distractionResistance:Math.min(100, Math.max(0, distractionResistance)),
      efficiencyScore:      Math.min(100, Math.max(0, efficiencyScore)),
      overall:              Math.min(100, Math.max(0, overall)),
      deepWorkMins:         Math.round(deepWorkSecs / 60),
      distractionMins:      Math.round(distractionSecs / 60),
      workMins:             Math.round(workSecs / 60),
      longestDeepBlockMins: Math.round(longestDeepBlock / 60),
      breakdown:            byType,
    };
  }

  // ── BEHAVIORAL ANALYTICS ──────────────────────────────────────────────────

  /**
   * Analyze behavioral patterns from the last N days of activities.
   * Returns { peakHours, productiveApps, distractionPatterns, insights, alerts }
   */
  analyzeBehavior(activities) {
    if (!activities || activities.length === 0) return { insights: [], alerts: [], peakHours: [] };

    // Classify all activities
    const classified = activities.map(a => {
      const c = this.classifyActivity(a.app_name || '', a.url || '', a.title || '');
      const hour = new Date((a.started_at || a.created_at || 0) * 1000).getHours();
      return { ...a, ...c, hour, duration: a.duration || a.duration_seconds || 60 };
    });

    // ── Peak productivity hours ──────────────────────────────────────────────
    const hourlyDeepWork = {};
    for (const a of classified) {
      if (a.deepWork || a.sessionType === 'shallow_work') {
        const w = a.deepWork ? 1.0 : 0.4;
        hourlyDeepWork[a.hour] = (hourlyDeepWork[a.hour] || 0) + a.duration * w;
      }
    }
    const peakHours = Object.entries(hourlyDeepWork)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour, 10));

    // ── Distraction patterns ──────────────────────────────────────────────────
    const distractionByHour = {};
    for (const a of classified) {
      if (a.sessionType === 'distraction') {
        distractionByHour[a.hour] = (distractionByHour[a.hour] || 0) + a.duration;
      }
    }
    const peakDistractionHour = Object.entries(distractionByHour)
      .sort(([, a], [, b]) => b - a)[0];

    // ── Most productive apps ──────────────────────────────────────────────────
    const appDeepWork = {};
    for (const a of classified) {
      if (a.deepWork && a.app_name) {
        appDeepWork[a.app_name] = (appDeepWork[a.app_name] || 0) + a.duration;
      }
    }
    const topApps = Object.entries(appDeepWork)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([app, secs]) => ({ app, mins: Math.round(secs / 60) }));

    // ── Meeting impact ────────────────────────────────────────────────────────
    const meetingDays    = new Set();
    const nonMeetingDays = new Set();
    const deepWorkByDay  = {};
    const meetingByDay   = {};

    for (const a of classified) {
      const day = new Date((a.started_at || 0) * 1000).toDateString();
      deepWorkByDay[day]  = (deepWorkByDay[day]  || 0) + (a.deepWork ? a.duration : 0);
      meetingByDay[day]   = (meetingByDay[day]   || 0) + (a.sessionType === 'meeting' ? a.duration : 0);
      if (a.sessionType === 'meeting') meetingDays.add(day);
      else nonMeetingDays.add(day);
    }

    const avgDeepOnMeetingDay    = average(Object.entries(deepWorkByDay).filter(([d]) => meetingDays.has(d)).map(([, v]) => v));
    const avgDeepOnNonMeetingDay = average(Object.entries(deepWorkByDay).filter(([d]) => !meetingDays.has(d) && deepWorkByDay[d]).map(([, v]) => v));
    const meetingImpactPct = avgDeepOnNonMeetingDay > 0
      ? Math.round((1 - avgDeepOnMeetingDay / avgDeepOnNonMeetingDay) * 100) : 0;

    // ── Burnout indicators ────────────────────────────────────────────────────
    const totalWorkSecs = classified.reduce((s, a) => s + (a.sessionType !== 'distraction' && a.sessionType !== 'break' ? a.duration : 0), 0);
    const totalDays     = new Set(classified.map(a => new Date((a.started_at || 0) * 1000).toDateString())).size || 1;
    const avgWorkHrsPerDay = totalWorkSecs / totalDays / 3600;

    // ── Insights ──────────────────────────────────────────────────────────────
    const insights = [];
    const alerts   = [];

    if (peakHours.length > 0) {
      const h = peakHours[0];
      const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
      insights.push({
        type: 'peak_hours',
        icon: '⏰',
        message: `Peak productivity in the ${period} (${formatHour(h)} – ${formatHour(h + 2)})`,
        importance: 'high',
      });
    }

    if (peakDistractionHour && parseInt(peakDistractionHour[1]) > 600) {
      const h = parseInt(peakDistractionHour[0]);
      insights.push({
        type: 'distraction_peak',
        icon: '📱',
        message: `Distraction activity peaks around ${formatHour(h)} — consider blocking distractions then`,
        importance: 'medium',
      });
    }

    if (meetingImpactPct > 20 && meetingDays.size > 2) {
      insights.push({
        type: 'meeting_impact',
        icon: '📅',
        message: `Meetings reduce your deep work time by ~${meetingImpactPct}%`,
        importance: 'medium',
      });
    }

    if (topApps.length > 0) {
      insights.push({
        type: 'top_apps',
        icon: '🚀',
        message: `Most productive in: ${topApps.slice(0, 3).map(a => a.app).join(', ')}`,
        importance: 'low',
      });
    }

    if (avgWorkHrsPerDay > FOCUS_THRESHOLDS.COGNITIVE_FATIGUE_WORK_H) {
      alerts.push({
        type: 'burnout_risk',
        icon: '⚠️',
        message: `Averaging ${avgWorkHrsPerDay.toFixed(1)} hrs/day — watch for cognitive fatigue`,
        severity: 'warning',
      });
    }

    // Total distraction check
    const totalDistSecs = classified.reduce((s, a) => s + (a.sessionType === 'distraction' ? a.duration : 0), 0);
    const totalSecs     = classified.reduce((s, a) => s + a.duration, 0);
    const distPct       = totalSecs > 0 ? totalDistSecs / totalSecs : 0;

    if (distPct > 0.25) {
      alerts.push({
        type: 'high_distraction',
        icon: '🎯',
        message: `${Math.round(distPct * 100)}% of tracked time is spent on distractions — consider using Focus Profiles`,
        severity: 'warning',
      });
    }

    return {
      peakHours,
      topApps,
      meetingImpactPct,
      avgWorkHrsPerDay: Math.round(avgWorkHrsPerDay * 10) / 10,
      insights,
      alerts,
      distractionPct: Math.round(distPct * 100),
    };
  }

  // ── LEARNING SYSTEM ───────────────────────────────────────────────────────

  /**
   * Learn from a user correction: when user renames/reclassifies a session.
   * Extracts keywords from the original context and boosts the correct category.
   */
  learnFromCorrection(appName, url, title, originalCategory, correctedCategory) {
    if (!correctedCategory || originalCategory === correctedCategory) return;

    const keywords = this._extractKeywords(`${appName} ${url} ${title}`);

    for (const kw of keywords) {
      const existing = this.userPatterns.get(kw);

      if (existing && existing.category === correctedCategory) {
        // Reinforce existing correct pattern
        const newBoost = Math.min(existing.boost + 0.15, 1.0);
        this.userPatterns.set(kw, { category: correctedCategory, boost: newBoost });
        this._upsertPattern(kw, correctedCategory, newBoost);
      } else if (existing && existing.category !== correctedCategory) {
        // ── FIX: pattern exists for a DIFFERENT category — override it with a
        // boost strong enough to beat the built-in pattern score (typically 0.8).
        const newBoost = Math.min(existing.boost + 0.40, 1.0);
        this.userPatterns.set(kw, { category: correctedCategory, boost: newBoost });
        this._upsertPattern(kw, correctedCategory, newBoost);
      } else {
        // Brand-new pattern — use 0.55 so it beats a weak signal but can still
        // be overridden by a strong built-in pattern match (encouraging corrections).
        const boost = 0.55;
        this.userPatterns.set(kw, { category: correctedCategory, boost });
        this._upsertPattern(kw, correctedCategory, boost);
      }
    }
  }

  /**
   * Store a strong, direct app-name → category override.
   * Called when the user bulk-applies a category to ALL sessions of an app.
   * Boost of 0.95 ensures the user's choice beats every built-in pattern
   * (which max out around 0.8) for future sessions from that app.
   */
  learnAppOverride(appName, category, boost = 0.95) {
    if (!appName || !category) return;

    // Primary: store the full app name (lowercase) as a keyword.
    // classifyActivity builds combinedText = `${app} ...` so this always matches.
    const primaryKw = appName.toLowerCase().trim();
    if (primaryKw.length >= 2) {
      this.userPatterns.set(primaryKw, { category, boost });
      this._upsertPattern(primaryKw, category, boost);
    }

    // Secondary: individual words of multi-word app names (e.g. "google chrome" → "google", "chrome")
    const words = primaryKw.split(/\s+/).filter(w => w.length >= 3);
    for (const word of words) {
      if (word === primaryKw) continue; // already handled above
      const wordBoost = Math.min(boost * 0.85, 0.95);
      const existing  = this.userPatterns.get(word);
      // Only set word-level patterns for the same category to avoid
      // polluting unrelated apps that share common words (e.g. "studio").
      if (!existing || existing.category === category) {
        this.userPatterns.set(word, { category, boost: wordBoost });
        this._upsertPattern(word, category, wordBoost);
      }
    }
  }

  _extractKeywords(text = '') {
    const t = text.toLowerCase();
    // Extract meaningful tokens (3+ chars, not stopwords)
    const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'com', 'www']);
    return [...new Set(
      t.replace(/[^a-z0-9\s]/g, ' ')
       .split(/\s+/)
       .filter(w => w.length >= 3 && !STOPWORDS.has(w))
       .slice(0, 10)
    )];
  }

  _upsertPattern(keyword, category, boost) {
    try {
      this.run(
        `INSERT INTO ai_user_patterns (keyword, category, boost, updated_at)
         VALUES (?, ?, ?, strftime('%s','now'))
         ON CONFLICT(keyword) DO UPDATE SET category=excluded.category, boost=excluded.boost, updated_at=excluded.updated_at`,
        [keyword, category, boost]
      );
    } catch (_) {}
  }

  // ── DAILY SCORE PERSISTENCE ───────────────────────────────────────────────

  /**
   * Persist today's computed productivity scores to the DB.
   */
  saveDailyScores(userId, dateKey, scores) {
    try {
      this.run(
        `INSERT INTO ai_daily_scores
           (user_id, date_key, focus_score, workflow_score, distraction_resistance,
            efficiency_score, overall_score, deep_work_mins, distraction_mins, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,strftime('%s','now'))
         ON CONFLICT(user_id, date_key) DO UPDATE SET
           focus_score=excluded.focus_score,
           workflow_score=excluded.workflow_score,
           distraction_resistance=excluded.distraction_resistance,
           efficiency_score=excluded.efficiency_score,
           overall_score=excluded.overall_score,
           deep_work_mins=excluded.deep_work_mins,
           distraction_mins=excluded.distraction_mins,
           updated_at=excluded.updated_at`,
        [
          userId, dateKey,
          scores.focusScore, scores.workflowScore, scores.distractionResistance,
          scores.efficiencyScore, scores.overall,
          scores.deepWorkMins, scores.distractionMins,
        ]
      );
    } catch (_) {}
  }

  /**
   * Load historical daily scores for the last N days.
   */
  getHistoricalScores(userId, days = 14) {
    try {
      return this.all(
        `SELECT * FROM ai_daily_scores WHERE user_id=? ORDER BY date_key DESC LIMIT ?`,
        [userId, days]
      );
    } catch (_) { return []; }
  }

  // ── SWITCH EVENT PERSISTENCE ──────────────────────────────────────────────

  persistSwitchEvent(userId, appName, url, category, sessionType) {
    try {
      this.run(
        `INSERT INTO ai_switch_events (user_id, app_name, url, category, session_type, ts)
         VALUES (?, ?, ?, ?, ?, strftime('%s','now'))`,
        [userId, appName || '', url || '', category || '', sessionType || '']
      );
    } catch (_) {}
  }
}

// ── UTILITY FUNCTIONS ─────────────────────────────────────────────────────────

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function formatHour(h) {
  const hour = ((h % 24) + 24) % 24;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12} ${ampm}`;
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = { FlowLedgerAI, CATEGORIES, PATTERNS, WORKFLOW_NAMES, FOCUS_THRESHOLDS };
