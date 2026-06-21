'use strict';

/**
 * Lightweight bridge for extractWorkflowIdentity in Electron main process.
 * Duplicates the dominance engine identity extraction without ESM imports.
 */

const STOP_WORDS = new Set([
  'the','a','an','and','or','in','on','at','to','for','of','with','is','are',
  'was','be','been','by','from','as','it','this','that','vs','via','new','tab',
  'untitled','document','window','file','page','home','main','index','app',
  'com','io','net','org','claude','chatgpt','gemini','auto','http','https',
  'www','localhost','code','visual','studio','google','chrome','safari','firefox',
  'edge','brave','arc','opera','browser','search','result','results',
]);

const AI_TOOL_APP_RE = /^(claude|chatgpt|gemini|copilot|perplexity|poe|phind)/i;
const BROWSER_APP_RE = /^(chrome|google chrome|firefox|safari|edge|microsoft edge|brave|arc|opera|vivaldi|chromium)/i;
const IDE_APP_RE = /^(vscode|visual studio code|cursor|webstorm|intellij|xcode|pycharm|rider|sublime|atom|vim|nvim|neovim|emacs)/i;
const APP_SUFFIX_STRIP_RE = /\s*[—–|·\-]\s*(claude|chatgpt|gemini|visual studio code|vs code|cursor|webstorm|intellij|xcode|google chrome|safari|firefox|edge|arc|brave|notion|figma|slack|linear|github)\s*$/i;

function normApp(str) {
  return String(str || '').toLowerCase().trim();
}

function extractKeywords(text) {
  return String(text || '').replace(APP_SUFFIX_STRIP_RE, '').replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/).map(w => w.toLowerCase().trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(url || '').replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '').toLowerCase();
  }
}

function extractWorkflowIdentity(session) {
  const app = normApp(session.app_name || '');
  const title = String(session.window_title || '').trim();
  const url = String(session.url || '').trim();

  if (AI_TOOL_APP_RE.test(app)) {
    const topic = title.replace(AI_TOOL_APP_RE, '').replace(APP_SUFFIX_STRIP_RE, '').trim();
    if (topic.length >= 4) {
      const kws = extractKeywords(topic).slice(0, 5);
      return { label: kws.slice(0, 3).join(' ') || topic.slice(0, 30).toLowerCase(), keywords: kws, category: 'ai_work' };
    }
  }

  if (IDE_APP_RE.test(app)) {
    const parts = title.split(/\s*[—–-]\s*/).map(p => p.trim()).filter(Boolean);
    const projectPart = parts.length >= 2 ? parts[1] : parts[0];
    if (projectPart) {
      const kws = extractKeywords(projectPart).slice(0, 5);
      return { label: kws.slice(0, 3).join(' ') || projectPart.slice(0, 30).toLowerCase(), keywords: kws, category: 'development' };
    }
  }

  if (!BROWSER_APP_RE.test(app) && app && !IDE_APP_RE.test(app)) {
    const cleanTitle = title.replace(APP_SUFFIX_STRIP_RE, '').trim();
    const kws = extractKeywords(cleanTitle || app).slice(0, 5);
    return { label: kws.slice(0, 3).join(' ') || app.slice(0, 20), keywords: kws, category: 'work' };
  }

  const cleanTitle = title.replace(APP_SUFFIX_STRIP_RE, '').trim();
  if (cleanTitle.length >= 4) {
    const kws = extractKeywords(cleanTitle).slice(0, 5);
    if (kws.length >= 1) return { label: kws.slice(0, 3).join(' '), keywords: kws, category: 'browser_work' };
  }

  const domain = extractDomain(url);
  if (domain) {
    return { label: domain.split('.')[0], keywords: extractKeywords(domain.replace(/\.(com|io|org|net|app|ai|dev)$/, '')), category: 'browser_work' };
  }

  return { label: app || 'unknown', keywords: extractKeywords(app), category: 'work' };
}

module.exports = { extractWorkflowIdentity };
