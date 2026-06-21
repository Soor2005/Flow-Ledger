/**
 * Supporting tools — enrich workflow context but never trigger workflow splits.
 * Application / URL / tab changes within this set are context signals only.
 */

export const SUPPORTING_TOOL_APPS = [
  'chatgpt',
  'claude',
  'gemini',
  'copilot',
  'perplexity',
  'poe',
  'phind',
  'github',
  'google chrome',
  'chrome',
  'microsoft edge',
  'edge',
  'firefox',
  'brave',
  'arc',
  'opera',
  'safari',
  'vivaldi',
  'visual studio code',
  'vscode',
  'cursor',
  'code',
  'terminal',
  'windows terminal',
  'iterm',
  'iterm2',
  'warp',
  'hyper',
  'kitty',
  'alacritty',
  'wezterm',
  'powershell',
  'notion',
  'obsidian',
  'flow ledger',
];

export const SUPPORTING_TOOL_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'perplexity.ai',
  'poe.com',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'notion.so',
  'notion.site',
  'docs.google.com',
  'developer.mozilla.org',
  'stackoverflow.com',
  'npmjs.com',
  'readthedocs.io',
  'devdocs.io',
];

const APP_RE = SUPPORTING_TOOL_APPS.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const DOMAIN_RE = SUPPORTING_TOOL_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');

export const SUPPORTING_APP_RE = new RegExp(`^(${APP_RE})$`, 'i');
export const SUPPORTING_DOMAIN_RE = new RegExp(`(?:^|\\.)(${DOMAIN_RE})$`, 'i');

export function normalizeToolName(name = '') {
  return String(name || '').replace(/\.exe$/i, '').trim().toLowerCase();
}

export function safeUrlHostname(url = '') {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

export function isSupportingToolApp(appName = '') {
  const norm = normalizeToolName(appName);
  if (!norm) return false;
  if (SUPPORTING_APP_RE.test(norm)) return true;
  return SUPPORTING_TOOL_APPS.some(t => norm.includes(t));
}

export function isSupportingToolUrl(url = '') {
  const host = safeUrlHostname(url);
  if (!host) return false;
  return SUPPORTING_DOMAIN_RE.test(host) || SUPPORTING_TOOL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
}

export function isSupportingToolContext(appName = '', url = '') {
  return isSupportingToolApp(appName) || isSupportingToolUrl(url);
}
