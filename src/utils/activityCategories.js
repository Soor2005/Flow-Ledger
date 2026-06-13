export const SMART_CATEGORY_DEFS = {
  development:   { type: 'deep',        label: 'Development',   color: '#6366f1' },
  design:        { type: 'deep',        label: 'Design',        color: '#a78bfa' },
  writing:       { type: 'deep',        label: 'Writing',       color: '#34d399' },
  research:      { type: 'shallow',     label: 'Research',      color: '#60a5fa' },
  communication: { type: 'shallow',     label: 'Communication', color: '#a78bfa' },
  meeting:       { type: 'meeting',     label: 'Meetings',      color: '#f87171' },
  planning:      { type: 'shallow',     label: 'Planning',      color: '#fbbf24' },
  learning:      { type: 'shallow',     label: 'Learning',      color: '#2dd4bf' },
  admin:         { type: 'neutral',     label: 'Admin',         color: '#94a3b8' },
  distraction:   { type: 'distraction', label: 'Distraction',   color: '#fb923c' },
  break:         { type: 'neutral',     label: 'Break',         color: '#cbd5e1' },
  focus:         { type: 'deep',        label: 'Focus',         color: '#8b5cf6' },
  browser:       { type: 'shallow',     label: 'Browser',       color: '#64748b' },
  ai:            { type: 'deep',        label: 'AI',            color: '#8b5cf6' },
  terminal:      { type: 'deep',        label: 'Terminal',      color: '#f59e0b' },
  productivity:  { type: 'shallow',     label: 'Productivity',  color: '#38bdf8' },
  analysis:      { type: 'deep',        label: 'Analysis',      color: '#60a5fa' },
  social:        { type: 'distraction', label: 'Social',        color: '#ef4444' },
  entertainment: { type: 'distraction', label: 'Entertainment', color: '#ef4444' },
  other:         { type: 'neutral',     label: 'Other',         color: '#6b7280' },
};

export function classifyActivityApp(name = '') {
  const n = (name || '').toLowerCase().replace(/\.exe$/i, '').trim();
  if (!n || n === 'unknown') return { ...SMART_CATEGORY_DEFS.other, categoryKey: 'other' };

  if (/zoom|webex|whereby|jitsi|gotomeeting/.test(n) || /\bteams\b/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.meeting, categoryKey: 'meeting' };
  }
  if (/\bcode\b|vscode|cursor|windsurf|zed|helix|\bvim\b|nvim|neovim|emacs|intellij|webstorm|pycharm|phpstorm|rider|clion|goland|datagrip|rubymine|rustrover|androidstudio|xcode|eclipse|netbeans|atom|brackets|notepad\+\+|notepadplusplus|npp|rstudio|spyder|jupyter|matlab|octave|postman|insomnia|tableplus|dbeaver|sequelpro|sequel pro|beekeeper|github desktop|sourcetree|fork|gitkraken|tower/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.development, categoryKey: 'development' };
  }
  if (/windowsterminal|alacritty|kitty|hyper|warp|iterm2?|gnome-terminal|konsole|\bwt\b|xterm|rxvt|terminator|urxvt|powershell|pwsh|\bbash\b|\bzsh\b|\bfish\b/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.terminal, categoryKey: 'terminal' };
  }
  if (/chatgpt|claude|copilot|gemini|perplexity|poe|cursor|windsurf/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.ai, categoryKey: 'ai' };
  }
  if (/figma|sketch|photoshop|illustrator|canva|affinity|blender|inkscape|\bgimp\b|krita|procreate|mspaint|paint\.net|paintdotnet|premiere|aftereffects|finalcut|davinci|resolve|lightroom|captureone|framer|penpot|lunacy|marvel/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.design, categoryKey: 'design' };
  }
  if (/winword|libreoffice writer|abiword|notion|obsidian|\bbear\b|typora|logseq|roamresearch|craft|ulysses|ia writer|scrivener|quill|marktext|zettlr|evernote|onenote|simplenote|joplin|standard notes|^notepad$|^wordpad$|textedit|^sublime/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.writing, categoryKey: 'writing' };
  }
  if (/\bexcel\b|msexcel|libreoffice calc|gnumeric|tableau|powerbi|looker|metabase|grafana|superset/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.analysis, categoryKey: 'analysis' };
  }
  if (/powerpnt|powerpoint|keynote|libreoffice impress|prezi/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.development, label: 'Presentations', color: '#818cf8', categoryKey: 'presentations' };
  }
  if (/outlook|thunderbird|spark|airmail|mimestream|newton|mailspring|postbox|^mail$/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.communication, label: 'Email', color: '#64748b', categoryKey: 'email' };
  }
  if (/slack|discord|telegram|whatsapp|\bsignal\b|messenger|googlechat|rocketchat|mattermost|wechat|\bline\b|viber|\bskype\b/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.communication, label: 'Chat', color: '#64748b', categoryKey: 'communication' };
  }
  if (/chrome|msedge|\bedge\b|firefox|opera|brave|vivaldi|iexplore|maxthon|safari|\barc\b/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.browser, categoryKey: 'browser' };
  }
  if (/jira|linear|asana|monday|trello|basecamp|clickup|notion(?!.*desktop)|toggl|harvest|clockify|timely|calendar|fantastical|busycal|todoist|things|omnifocus|ticktick|habitica/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.productivity, categoryKey: 'productivity' };
  }
  if (/twitter|instagram|facebook|tiktok|\breddit\b|mastodon|bluesky|threads|linkedin|pinterest/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.social, categoryKey: 'social' };
  }
  if (/youtube|netflix|twitch|hulu|disneyplus|primevideo|hbomax|spotify|applemusic|tidal|soundcloud|deezer|\bvlc\b|\biina\b|\bmpv\b|quicktime|steam|epicgames|xboxapp|playnite|gamepass/.test(n)) {
    return { ...SMART_CATEGORY_DEFS.entertainment, categoryKey: 'entertainment' };
  }
  return { ...SMART_CATEGORY_DEFS.other, categoryKey: 'other' };
}

export function classifyActivitySession(item = {}) {
  const aiKey = (item.ai_category || '').toLowerCase().trim();
  if (aiKey && SMART_CATEGORY_DEFS[aiKey]) {
    return {
      ...SMART_CATEGORY_DEFS[aiKey],
      label: item.ai_label || SMART_CATEGORY_DEFS[aiKey].label,
      categoryKey: aiKey,
      source: 'ai',
    };
  }

  const merged = [item.app_name, item.window_title, item.url].filter(Boolean).join(' ').toLowerCase();
  const url = item.url || '';

  if (/github\.com|gitlab\.com|localhost|127\.0\.0\.1|npmjs\.com|vercel\.app|render\.com/.test(url)) {
    return { ...SMART_CATEGORY_DEFS.development, categoryKey: 'development', source: 'url' };
  }
  if (/figma\.com|canva\.com|dribbble\.com|behance\.net|framer\.com/.test(url)) {
    return { ...SMART_CATEGORY_DEFS.design, categoryKey: 'design', source: 'url' };
  }
  if (/docs\.google\.com|notion\.so|developer\.mozilla|readthedocs|coursera|udemy|wikipedia\.org/.test(url)) {
    return { ...SMART_CATEGORY_DEFS.research, categoryKey: 'research', source: 'url' };
  }
  if (/slack\.com|discord\.com|teams\.microsoft\.com|mail\.google\.com|web\.whatsapp\.com/.test(url)) {
    return { ...SMART_CATEGORY_DEFS.communication, categoryKey: 'communication', source: 'url' };
  }
  if (/chatgpt|claude|gemini|perplexity|copilot/.test(url) || /chatgpt|claude|gemini|perplexity|copilot/.test(merged)) {
    return { ...SMART_CATEGORY_DEFS.ai, categoryKey: 'ai', source: 'url' };
  }
  if (/invoice|billing|settings|roadmap|backlog|calendar|admin/.test(merged)) {
    return { ...SMART_CATEGORY_DEFS.admin, categoryKey: 'admin', source: 'text' };
  }

  return { ...classifyActivityApp(item.app_name || ''), source: 'heuristic' };
}
