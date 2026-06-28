import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import AppIcon from '../shared/AppIcon';
import { LoadingState } from '../shared/LoadingSpinner';
import {
  Radio, RefreshCw, ChevronLeft, ChevronRight, Moon, Globe, Search,
  Check, Edit2, X, Clock, Zap, Users, AlertTriangle, Code2, PenLine,
  BarChart2, Terminal, MessageSquare, Inbox, LayoutList, Monitor,
  ChevronDown, ChevronUp, Tag, Briefcase, UserCheck, ArrowRight,
  CheckCircle2, Circle, Layers, Activity, Calendar, TrendingUp,
  MoreHorizontal, SlidersHorizontal, Filter, Sparkles,
  ExternalLink, FolderPlus,
} from 'lucide-react';
import {
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { mergeWorkflowSessions } from '../../utils/workflowSessionMerge';

const api = window.electron || {};

// ─── Local date helper (avoids UTC-day-shift for users ahead of UTC) ──────────
function localDateStr(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(secs) {
  if (!secs || secs < 0) return '0s';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function fmtTime(u) {
  return new Date(u * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtTimeRange(a, b) { return `${fmtTime(a)} – ${fmtTime(b)}`; }
function fmtDateTime(u) {
  return new Date(u * 1000).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function safeHostname(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}
function getTrackedEntity(item = {}) {
  const domain = safeHostname(item.url || '');
  const appName = (item.app_name || 'Unknown app').trim() || 'Unknown app';
  if (domain) {
    return {
      key: `site:${domain}`,
      label: domain,
      secondaryLabel: appName,
      kind: 'website',
      domain,
      appName,
      url: item.url || '',
    };
  }
  return {
    key: `app:${appName.toLowerCase()}`,
    label: appName,
    secondaryLabel: '',
    kind: 'app',
    domain: '',
    appName,
    url: '',
  };
}
function makeKeywordSeed(item = {}) {
  const domain = safeHostname(item.url || '');
  const app = (item.app_name || '').trim().replace(/\.exe$/i, '');
  return domain || app || 'keyword';
}

const SMART_CATEGORY_DEFS = {
  development:   { type: 'deep',        label: 'Development',   color: '#6366f1', Icon: Code2 },
  design:        { type: 'deep',        label: 'Design',        color: '#f43f5e', Icon: PenLine },
  writing:       { type: 'deep',        label: 'Writing',       color: '#34d399', Icon: PenLine },
  research:      { type: 'shallow',     label: 'Research',      color: '#60a5fa', Icon: Globe },
  communication: { type: 'shallow',     label: 'Communication', color: '#a78bfa', Icon: MessageSquare },
  meeting:       { type: 'meeting',     label: 'Meetings',      color: '#f87171', Icon: Users },
  planning:      { type: 'shallow',     label: 'Planning',      color: '#fbbf24', Icon: Calendar },
  learning:      { type: 'shallow',     label: 'Learning',      color: '#2dd4bf', Icon: Sparkles },
  admin:         { type: 'neutral',     label: 'Admin',         color: '#94a3b8', Icon: Briefcase },
  distraction:   { type: 'distraction', label: 'Distraction',   color: '#fb923c', Icon: AlertTriangle },
  break:         { type: 'neutral',     label: 'Break',         color: '#cbd5e1', Icon: Moon },
  focus:         { type: 'deep',        label: 'Focus',         color: '#8b5cf6', Icon: Zap },
};

// ─── App classifier ───────────────────────────────────────────────────────────
// Handles both friendly app names AND Windows/macOS process names (.exe stripped)
function classifyApp(name = '') {
  const n = (name || '').toLowerCase().replace(/\.exe$/i, '').trim();
  if (!n || n === 'unknown') return { type: 'neutral', label: 'Other', color: '#6b7280', Icon: Monitor };

  // ── Video / Meetings ──────────────────────────────────────────────────────
  if (/zoom|webex|whereby|jitsi|gotomeeting/.test(n) ||
      /\bteams\b/.test(n))
    return { type: 'meeting', label: 'Meetings', color: '#f87171', Icon: Users };

  // ── Coding / Dev tools ────────────────────────────────────────────────────
  if (/\bcode\b|vscode|cursor|windsurf|zed|helix/.test(n) ||
      /\bvim\b|nvim|neovim|emacs/.test(n) ||
      /intellij|webstorm|pycharm|phpstorm|rider|clion|goland|datagrip|rubymine|rustrover/.test(n) ||
      /androidstudio|xcode|eclipse|netbeans|atom|brackets/.test(n) ||
      /notepad\+\+|notepadplusplus|npp/.test(n) ||
      /rstudio|spyder|jupyter|matlab|octave/.test(n) ||
      /postman|insomnia|tableplus|dbeaver|sequelpro|sequel pro|beekeeper/.test(n) ||
      /github desktop|sourcetree|fork|gitkraken|tower/.test(n))
    return { type: 'deep', label: 'Coding', color: '#6366f1', Icon: Code2 };

  // ── Terminal / CLI ────────────────────────────────────────────────────────
  if (/windowsterminal|alacritty|kitty|hyper|warp|iterm2?|gnome-terminal|konsole/.test(n) ||
      /\bwt\b|xterm|rxvt|terminator|urxvt/.test(n) ||
      /powershell|pwsh|\bbash\b|\bzsh\b|\bfish\b/.test(n))
    return { type: 'deep', label: 'Terminal', color: '#f59e0b', Icon: Terminal };

  // ── Design / Creative ─────────────────────────────────────────────────────
  if (/figma|sketch|photoshop|illustrator|canva|affinity/.test(n) ||
      /blender|inkscape|\bgimp\b|krita|procreate|mspaint|paint\.net|paintdotnet/.test(n) ||
      /premiere|aftereffects|finalcut|davinci|resolve|lightroom|captureone/.test(n) ||
      /framer|penpot|lunacy|marvel/.test(n))
    return { type: 'deep', label: 'Design', color: '#a78bfa', Icon: PenLine };

  // ── Writing / Notes ───────────────────────────────────────────────────────
  if (/winword|libreoffice writer|abiword/.test(n) ||
      /notion|obsidian|\bbear\b|typora|logseq|roamresearch|craft|ulysses|ia writer/.test(n) ||
      /scrivener|quill|marktext|zettlr/.test(n) ||
      /evernote|onenote|simplenote|joplin|standard notes/.test(n) ||
      /^notepad$|^wordpad$|textedit/.test(n) ||
      /^sublime/.test(n))
    return { type: 'deep', label: 'Writing', color: '#34d399', Icon: PenLine };

  // ── Spreadsheet / Data ────────────────────────────────────────────────────
  if (/\bexcel\b|msexcel|libreoffice calc|gnumeric/.test(n) ||
      /tableau|powerbi|looker|metabase|grafana|superset/.test(n))
    return { type: 'deep', label: 'Analysis', color: '#60a5fa', Icon: BarChart2 };

  // ── Presentation ──────────────────────────────────────────────────────────
  if (/powerpnt|powerpoint|keynote|libreoffice impress|prezi/.test(n))
    return { type: 'deep', label: 'Presentations', color: '#818cf8', Icon: BarChart2 };

  // ── Email ─────────────────────────────────────────────────────────────────
  if (/outlook|thunderbird|spark|airmail|mimestream|newton|mailspring|postbox/.test(n) ||
      /^mail$/.test(n))
    return { type: 'shallow', label: 'Email', color: '#64748b', Icon: MessageSquare };

  // ── Chat / Messaging ──────────────────────────────────────────────────────
  if (/slack|discord|telegram|whatsapp|\bsignal\b|messenger|googlechat/.test(n) ||
      /rocketchat|mattermost|wechat|\bline\b|viber|\bskype\b/.test(n))
    return { type: 'shallow', label: 'Chat', color: '#64748b', Icon: MessageSquare };

  // ── Browser ───────────────────────────────────────────────────────────────
  if (/chrome|msedge|\bedge\b|firefox|opera|brave|vivaldi|iexplore|maxthon|safari/.test(n) ||
      /\barc\b/.test(n))
    return { type: 'shallow', label: 'Browser', color: '#64748b', Icon: Globe };

  // ── Productivity / Tools ──────────────────────────────────────────────────
  if (/jira|linear|asana|monday|trello|basecamp|clickup|notion(?!.*desktop)/.test(n) ||
      /toggl|harvest|clockify|timely/.test(n) ||
      /calendar|fantastical|busycal/.test(n) ||
      /todoist|things|omnifocus|ticktick|habitica/.test(n))
    return { type: 'shallow', label: 'Productivity', color: '#38bdf8', Icon: BarChart2 };

  // ── Social Media ──────────────────────────────────────────────────────────
  if (/twitter|instagram|facebook|tiktok|\breddit\b|mastodon|bluesky|threads|linkedin|pinterest/.test(n))
    return { type: 'distraction', label: 'Social', color: '#ef4444', Icon: AlertTriangle };

  // ── Entertainment / Media ─────────────────────────────────────────────────
  if (/youtube|netflix|twitch|hulu|disneyplus|primevideo|hbomax/.test(n) ||
      /spotify|applemusic|tidal|soundcloud|deezer|\bvlc\b|\biina\b|\bmpv\b|quicktime/.test(n) ||
      /steam|epicgames|xboxapp|playnite|gamepass/.test(n))
    return { type: 'distraction', label: 'Entertainment', color: '#ef4444', Icon: AlertTriangle };

  return { type: 'neutral', label: 'Other', color: '#6b7280', Icon: Monitor };
}

function classifySession(item = {}) {
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
  if (/invoice|billing|settings|roadmap|backlog|calendar|admin/.test(merged)) {
    return { ...SMART_CATEGORY_DEFS.admin, categoryKey: 'admin', source: 'text' };
  }

  const base = classifyApp(item.app_name || '');
  return {
    ...base,
    categoryKey: (base.label || 'other').toLowerCase().replace(/\s+/g, '_'),
    source: 'heuristic',
  };
}

const TYPE_COLORS = {
  deep:'#6366f1', shallow:'#64748b', meeting:'#f87171',
  distraction:'#ef4444', neutral:'#6b7280',
};
const TYPE_BG = {
  deep:'#6366f115', shallow:'#64748b15', meeting:'#f8717115',
  distraction:'#ef444415', neutral:'#6b728015',
};

// ─── Block builder ────────────────────────────────────────────────────────────
const GAP_BREAK = 300;   // 5 min gap → always new block
const GAP_MERGE = 120;   // ≤2 min gap + same app + same project → merge

// Lightweight per-session project/client key (used during block splitting)
function sessionProjectKey(s, projects, clients) {
  const text = [s.app_name, s.window_title, s.url].filter(Boolean).join(' ').toLowerCase();
  const kwHit = (keywords) =>
    keywords
      ? keywords.split(',').some(kw => { const k = kw.trim().toLowerCase(); return k.length >= 2 && text.includes(k); })
      : false;
  // Prefer DB-assigned project_id (written at flush time by tracker)
  if (s.project_id) return `proj:${s.project_id}`;
  if (s.client_id)  return `cli:${s.client_id}`;
  // Fall back to keyword scan
  for (const p of projects) {
    if (text.includes(p.name.toLowerCase()) || kwHit(p.keywords)) return `proj:${p.id}`;
  }
  for (const c of clients) {
    if (text.includes(c.name.toLowerCase()) || kwHit(c.keywords)) return `cli:${c.id}`;
  }
  return 'unassigned';
}

function buildBlocks(sessions, projects, clients, savedMeta) {
  const active = sessions
    .filter(s => !s.is_idle && s.duration_seconds > 0)
    .sort((a, b) => a.started_at - b.started_at);

  if (!active.length) return [];

  const GHOST_RE = /^(notepad|wordpad|mspaint|calc|calculator|explorer)$/i;
  const raw = [];
  let cur = null;

  for (const s of active) {
    const prevEnd    = cur ? cur.ended_at : 0;
    const gap        = cur ? s.started_at - prevEnd : Infinity;
    const sameApp    = cur && s.app_name === cur.primaryApp;
    // Project key for this session — split block when project changes even within same app
    const sKey       = sessionProjectKey(s, projects, clients);
    const sameProj   = cur && sKey === cur.projectKey;
    const startNew   = !cur
      || gap > GAP_BREAK
      || (!sameApp && gap > GAP_MERGE)
      // Same app, small gap, but different project → new block
      || (sameApp && gap <= GAP_MERGE && sKey !== 'unassigned' && !sameProj);

    if (startNew) {
      cur = {
        id: `blk-${s.started_at}`,
        started_at:    s.started_at,
        ended_at:      s.started_at + s.duration_seconds,
        primaryApp:    s.app_name,
        sessions:      [s],
        totalDuration: s.duration_seconds,
        projectKey:    sKey,
      };
      raw.push(cur);
    } else {
      cur.ended_at = Math.max(cur.ended_at, s.started_at + s.duration_seconds);
      cur.totalDuration += s.duration_seconds;
      cur.sessions.push(s);
      // Keep the app with most time as primary; exclude ghost apps
      const tally = {};
      cur.sessions.forEach(x => {
        if (GHOST_RE.test(x.app_name) && !x.window_title?.trim()) return;
        tally[x.app_name] = (tally[x.app_name]||0) + x.duration_seconds;
      });
      const tallyEntries = Object.entries(tally);
      if (tallyEntries.length > 0) {
        cur.primaryApp = tallyEntries.sort((a,b)=>b[1]-a[1])[0][0];
      }
    }
  }

  // Enrich with classification + auto-label + saved meta
  return raw.map(blk => {
    const cls = classifySession(blk.sessions.find(s => s.app_name === blk.primaryApp) || blk.sessions[0] || { app_name: blk.primaryApp });

    // Override with meeting detection inside any session
    const hasMeeting = blk.sessions.some(s =>
      /zoom|teams|meet\.google|webex/i.test(`${s.app_name} ${s.window_title||''} ${s.url||''}`)
    );

    // ── AI-powered classification (time-weighted vote across sessions) ────────
    const aiVotes = {};
    let aiCoveredSecs = 0;
    let aiWeightedConf = 0;
    for (const s of blk.sessions) {
      if (s.ai_category && (s.ai_confidence || 0) > 0) {
        if (!aiVotes[s.ai_category]) aiVotes[s.ai_category] = { secs: 0, label: s.ai_label || s.ai_category };
        aiVotes[s.ai_category].secs += s.duration_seconds;
        aiCoveredSecs  += s.duration_seconds;
        aiWeightedConf += (s.ai_confidence || 0) * s.duration_seconds;
      }
    }
    const aiAvgConf    = aiCoveredSecs > 0 ? aiWeightedConf / aiCoveredSecs : 0;
    const aiCoverage   = blk.totalDuration > 0 ? aiCoveredSecs / blk.totalDuration : 0;
    const [dominantAiCat, dominantAiMeta] = Object.entries(aiVotes).sort((a, b) => b[1].secs - a[1].secs)[0] || [];
    const dominantAiLabel = dominantAiMeta?.label || null;
    // Use AI cls when it has covered enough of the block and is confident
    const useAiCls     = dominantAiCat && aiAvgConf >= 0.5 && aiCoverage >= 0.4 && !hasMeeting;
    const aiAutoAccepted = useAiCls && aiAvgConf >= 0.65;

    const finalCls = hasMeeting ? classifySession({ app_name: 'zoom' })
      : useAiCls ? {
          type:  AI_TYPE_MAP[dominantAiCat]  || 'neutral',
          label: dominantAiLabel             || dominantAiCat,
          color: AI_COLOR_MAP[dominantAiCat] || '#6b7280',
          Icon:  cls.Icon,
        }
      : cls;

    // Keyword-based auto-labelling
    const searchText = blk.sessions
      .map(s => [s.app_name, s.window_title, s.url].filter(Boolean).join(' '))
      .join(' ').toLowerCase();

    // ── Per-session keyword matching (prevents Client A carryover into Client B) ─
    // Each auto_session is matched independently; the project/client that wins
    // the most tracked seconds within the block is assigned to the whole block.
    const kwHit = (keywords, text) =>
      keywords
        ? keywords.split(',').some(kw => {
            const k = kw.trim().toLowerCase();
            return k.length >= 2 && text.includes(k);
          })
        : false;

    // Tally project/client seconds per session
    const assignTally = {}; // key → { projectId, projectName, clientId, clientName, secs }
    for (const s of blk.sessions) {
      const text = [s.app_name, s.window_title, s.url].filter(Boolean).join(' ').toLowerCase();
      let matched = null;

      for (const p of projects) {
        if (text.includes(p.name.toLowerCase()) || kwHit(p.keywords, text)) {
          const cl = clients.find(c => c.id === p.client_id);
          matched = {
            projectId: p.id, projectName: p.name,
            clientId: cl?.id || null, clientName: cl?.name || p.client_name || null,
          };
          break;
        }
      }
      if (!matched) {
        for (const c of clients) {
          if (text.includes(c.name.toLowerCase()) || kwHit(c.keywords, text)) {
            matched = { projectId: null, projectName: null, clientId: c.id, clientName: c.name };
            break;
          }
        }
      }

      if (matched) {
        const key = `${matched.projectId}||${matched.clientId}`;
        if (!assignTally[key]) assignTally[key] = { ...matched, secs: 0 };
        assignTally[key].secs += s.duration_seconds;
      }
    }

    // Pick winner by most tracked seconds; fall back to null if nothing matched
    const winner = Object.values(assignTally).sort((a, b) => b.secs - a.secs)[0] || null;
    const autoProject   = winner?.projectName  || null;
    const autoProjectId = winner?.projectId    || null;
    const autoClient    = winner?.clientName   || null;
    const autoClientId  = winner?.clientId     || null;

    // Browser URL grouping — collect unique hostnames
    const urls = [...new Set(
      blk.sessions
        .filter(s => s.url)
        .map(s => { try { return new URL(s.url).hostname; } catch { return s.url; } })
    )];

    // App and website breakdown
    const entityTally = {};
    const appTally = {};
    blk.sessions.forEach(s => {
      const entity = getTrackedEntity(s);
      if (!entityTally[entity.key]) entityTally[entity.key] = { ...entity, secs: 0, sample: s };
      entityTally[entity.key].secs += s.duration_seconds;
      if (!entityTally[entity.key].sample?.url && s.url) entityTally[entity.key].sample = s;

      appTally[s.app_name] = (appTally[s.app_name]||0) + s.duration_seconds;
    });
    const appBreakdown = Object.entries(appTally)
      .sort((a,b)=>b[1]-a[1])
      .map(([app, secs]) => {
        const session = blk.sessions.find(s => s.app_name === app) || { app_name: app };
        return { app, secs, cls: classifySession(session) };
      });
    const entityBreakdown = Object.values(entityTally)
      .sort((a, b) => b.secs - a.secs)
      .map(entry => ({
        ...entry,
        cls: classifySession(entry.sample || { app_name: entry.appName, url: entry.url }),
      }));

    // Context switch count — number of times the app changed across sessions
    let contextSwitches = 0;
    for (let i = 1; i < blk.sessions.length; i++) {
      if (blk.sessions[i].app_name !== blk.sessions[i - 1].app_name) contextSwitches++;
    }
    // Fragmentation score 0–100: 0 = fully focused, 100 = switching every minute
    const blkMins = blk.totalDuration / 60 || 1;
    const fragScore = Math.min(100, Math.round((contextSwitches / blkMins) * 100));

    const saved = savedMeta[blk.id] || {};

    return {
      ...blk,
      cls: finalCls,
      urls,
      appBreakdown,
      entityBreakdown,
      contextSwitches,
      fragScore,
      autoProject, autoProjectId,
      autoClient, autoClientId,
      // AI classification metadata
      aiCategory:    dominantAiCat   || null,
      aiLabel:       dominantAiLabel || null,
      aiConfidence:  Math.round(aiAvgConf * 100),
      aiAutoAccepted,
      // Auto-accept when AI is confident; user edits always win
      status:    saved.status    || (aiAutoAccepted ? 'accepted' : 'unreviewed'),
      project:   saved.project   || autoProject,
      projectId: saved.projectId || autoProjectId,
      client:    saved.client    || autoClient,
      clientId:  saved.clientId  || autoClientId,
      task:      saved.task      || '',
      taskId:    saved.taskId    || '',
      note:      saved.note      || '',
    };
  });
}

// ─── Inbox storage (localStorage) ────────────────────────────────────────────
function loadMeta(userId, dateKey) {
  try { return JSON.parse(localStorage.getItem(`fl:inbox:${userId}:${dateKey}`) || '{}'); }
  catch { return {}; }
}
function saveMeta(userId, dateKey, meta) {
  localStorage.setItem(`fl:inbox:${userId}:${dateKey}`, JSON.stringify(meta));
}

// ─── AI category → frontend type mapping ─────────────────────────────────────
const AI_TYPE_MAP = {
  development: 'deep',   design: 'deep',    writing: 'deep',
  research:    'deep',   learning: 'deep',  planning: 'shallow',
  meeting:     'meeting', communication: 'shallow', admin: 'shallow',
  distraction: 'distraction', entertainment: 'distraction', uncategorized: 'neutral',
};
const AI_COLOR_MAP = {
  development: '#6366F1', design: '#F43F8C', writing: '#34D399',
  research:    '#60A5FA', learning: '#A78BFA', planning: '#FBBF24',
  meeting:     '#F87171', communication: '#64748B', admin: '#94A3B8',
  distraction: '#FB923C', entertainment: '#FB923C', uncategorized: '#6B7280',
};

// ─── Productivity badge ───────────────────────────────────────────────────────
const PROD_BADGE = {
  deep:        { label: 'Deep Work',   bg: '#6366f115', color: '#818cf8' },
  meeting:     { label: 'Meeting',     bg: '#f8717115', color: '#fca5a5' },
  distraction: { label: 'Distraction', bg: '#ef444415', color: '#f87171' },
  shallow:     { label: 'Low Focus',   bg: '#64748b18', color: '#94a3b8' },
  neutral:     { label: 'Other',       bg: '#6b728015', color: '#9ca3af' },
};

// ─── Mini activity sparkline ──────────────────────────────────────────────────
function MiniSparkline({ blk, color, selected }) {
  const bars = useMemo(() => {
    if (!blk.sessions.length) return [];
    const span = (blk.ended_at - blk.started_at) || 1;
    const N = 20;
    const buckets = Array(N).fill(0);
    blk.sessions.forEach(s => {
      const offset = Math.max(0, s.started_at - blk.started_at);
      const idx = Math.min(Math.floor((offset / span) * N), N - 1);
      buckets[idx] += s.duration_seconds;
    });
    const maxV = Math.max(...buckets, 1);
    return buckets.map(v => Math.max(v / maxV, 0));
  }, [blk]);

  if (!bars.length) return <div style={{ width: 64 }}/>;

  return (
    <div className="flex items-end gap-px shrink-0" style={{ width: 64, height: 28 }}>
      {bars.map((h, i) => (
        <div key={i} className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(h * 100, 6)}%`,
            background: color + (h > 0.15 ? (selected ? 'dd' : 'aa') : '44'),
          }}/>
      ))}
    </div>
  );
}

// ─── Block card (list row) ────────────────────────────────────────────────────
function BlockCard({ blk, selected, onClick, onAccept, onEdit, isLive, showProjectFirst = true }) {
  const badge   = PROD_BADGE[blk.cls.type] || PROD_BADGE.neutral;
  const heading = showProjectFirst
    ? (blk.project || blk.client || blk.primaryApp)
    : blk.primaryApp;
  const subline = showProjectFirst
    ? ((blk.project || blk.client)
        ? `${blk.primaryApp}${blk.cls.label !== blk.primaryApp ? ' · ' + blk.cls.label : ''}`
        : blk.cls.label)
    : blk.cls.label;

  return (
    <div
      onClick={onClick}
      className={`act-block-card group flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-brd-subtle/40 last:border-b-0 ${
        selected ? 'is-selected' : ''
      }`}
      style={{ borderLeft: `2px solid ${blk.cls.color}${selected ? 'dd' : '66'}` }}
    >
      {/* Left: times + duration */}
      <div className="shrink-0 flex flex-col items-end pt-0.5 w-[50px] gap-0.5">
        <span className="text-[10px] font-mono text-tx-faint leading-tight tabular-nums">{fmtTime(blk.started_at)}</span>
        <span className="text-[10px] font-mono text-tx-faint leading-tight tabular-nums opacity-60">{fmtTime(blk.ended_at)}</span>
        <span className="text-[10px] font-bold mt-1 leading-tight tabular-nums" style={{ color: blk.cls.color }}>
          {fmt(blk.totalDuration)}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: title + badge + status chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="text-[13px] font-semibold text-tx-primary truncate max-w-[200px]">{heading}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0"
            style={{ background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-status-green bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded font-semibold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot inline-block"/>LIVE
            </span>
          )}
          {blk.aiAutoAccepted && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
              style={{ background: '#6366f118', color: '#818cf8', border: '1px solid #6366f128' }}>
              ✦ AI {blk.aiConfidence}%
            </span>
          )}
          {blk.status === 'accepted' && !blk.aiAutoAccepted && (
            <CheckCircle2 size={11} className="shrink-0" style={{ color: '#34D399' }}/>
          )}
          {blk.status === 'edited' && (
            <Edit2 size={10} className="shrink-0" style={{ color: '#60A5FA' }}/>
          )}
        </div>

        {/* Row 2: app · category */}
        <p className="text-[11px] text-tx-muted truncate mb-1">{subline}</p>

        {/* Row 3: URL pills OR project/client pills */}
        {blk.urls.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {blk.urls.slice(0, 3).map((u, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] bg-bg-input border border-brd-subtle px-1.5 py-0.5 rounded text-tx-faint">
                <Globe size={8}/>{u}
              </span>
            ))}
            {blk.urls.length > 3 && (
              <span className="text-[10px] text-tx-faint">+{blk.urls.length - 3}</span>
            )}
          </div>
        ) : (blk.project || blk.client || blk.task) ? (
          <div className="flex items-center gap-1 flex-wrap">
            {blk.client && (
              <span className="flex items-center gap-1 text-[10px] bg-bg-input border border-brd-subtle px-1.5 py-0.5 rounded text-tx-faint">
                <UserCheck size={8}/>{blk.client}
              </span>
            )}
            {blk.project && (
              <span className="flex items-center gap-1 text-[10px] bg-bg-input border border-brd-subtle px-1.5 py-0.5 rounded text-tx-faint">
                <Briefcase size={8}/>{blk.project}
              </span>
            )}
            {blk.task && (
              <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                blk.taskId
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
                  : 'bg-bg-input border border-brd-subtle text-tx-faint'
              }`}>
                {blk.taskId ? <CheckCircle2 size={8}/> : <Tag size={8}/>}
                {blk.task}
              </span>
            )}
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); onEdit(blk.id); }}
            className="flex items-center gap-1 text-[10px] text-tx-faint hover:text-accent transition-colors px-1 py-0.5 rounded">
            <Briefcase size={8}/>Assign to project…
          </button>
        )}
      </div>

      {/* Right: sparkline + action menu */}
      <div className="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
        <MiniSparkline blk={blk} color={blk.cls.color} selected={selected}/>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {blk.status !== 'accepted' && (
            <button onClick={e => { e.stopPropagation(); onAccept(blk.id); }}
              className="w-5 h-5 flex items-center justify-center rounded text-tx-faint hover:text-status-green transition-colors"
              title="Accept">
              <Check size={10}/>
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onEdit(blk.id); }}
            className="w-5 h-5 flex items-center justify-center rounded text-tx-faint hover:text-tx-primary transition-colors"
            title="Edit">
            <MoreHorizontal size={12}/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditModal({ blk, projects, clients, userId, onSave, onClose }) {
  const [form, setForm] = useState({
    project:   blk.project   || '',
    projectId: blk.projectId || '',
    client:    blk.client    || '',
    clientId:  blk.clientId  || '',
    task:      blk.task      || '',
    taskId:    blk.taskId    || '',
    note:      blk.note      || '',
  });
  const [tasks,       setTasks]       = useState([]);
  const [loadingTask, setLoadingTask] = useState(false);
  const [taskOpen,    setTaskOpen]    = useState(false);

  // Load tasks whenever projectId changes (or on mount)
  useEffect(() => {
    setLoadingTask(true);
    api.listTasks?.({ userId, projectId: form.projectId || undefined })
      .then(list => setTasks(list || []))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTask(false));
  }, [userId, form.projectId]);

  const selProject = id => {
    const p  = projects.find(x => x.id === id);
    const cl = p ? clients.find(c => c.id === p.client_id) : null;
    // Reset task when project changes
    setForm(f => ({
      ...f,
      projectId: id,
      project:   p?.name || '',
      clientId:  cl?.id  || f.clientId,
      client:    cl?.name || f.client,
      taskId:    '',
      task:      '',
    }));
    setTaskOpen(false);
  };

  const selTask = (t) => {
    if (!t) {
      setForm(f => ({ ...f, taskId: '', task: '' }));
    } else {
      setForm(f => ({ ...f, taskId: t.id, task: t.title }));
    }
    setTaskOpen(false);
  };

  const selectedTask = tasks.find(t => t.id === form.taskId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="w-[440px] bg-bg-card border border-brd-strong rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brd-default">
          <div>
            <h3 className="text-sm font-semibold text-tx-primary">Edit Time Block</h3>
            <p className="text-[10px] text-tx-faint">{fmtTimeRange(blk.started_at, blk.ended_at)} · {fmt(blk.totalDuration)}</p>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-tx-primary"><X size={15}/></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Project */}
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Project</label>
            <select value={form.projectId}
              onChange={e => selProject(e.target.value)}
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2 text-sm text-tx-primary focus:outline-none focus:border-accent">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {/* Client */}
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Client</label>
            <select value={form.clientId}
              onChange={e => {
                const cl = clients.find(c => c.id === e.target.value);
                setForm(f => ({ ...f, clientId: e.target.value, client: cl?.name || '' }));
              }}
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2 text-sm text-tx-primary focus:outline-none focus:border-accent">
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── Task picker (linked to real tasks DB) ─────────────────── */}
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">
              Link to Task
              {form.taskId && (
                <span className="ml-2 normal-case text-[10px] text-emerald-400 font-semibold">
                  · time will be tracked to this task
                </span>
              )}
            </label>
            <div className="relative">
              <button
                onClick={() => setTaskOpen(v => !v)}
                className="w-full flex items-center gap-2 bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm transition hover:border-accent/50 focus:outline-none"
              >
                {loadingTask ? (
                  <span className="text-tx-faint flex-1 text-left">Loading…</span>
                ) : selectedTask ? (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0"/>
                    <span className="flex-1 text-left text-tx-primary font-medium truncate">{selectedTask.title}</span>
                    {selectedTask.status && (
                      <span className="text-[10px] text-tx-faint shrink-0">{selectedTask.status}</span>
                    )}
                  </>
                ) : (
                  <>
                    <Circle size={13} className="text-tx-faint shrink-0"/>
                    <span className="flex-1 text-left text-tx-faint">No task linked</span>
                  </>
                )}
                <ChevronDown size={13} className="text-tx-faint shrink-0"/>
              </button>

              {taskOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-bg-card border border-brd-strong rounded-xl shadow-2xl overflow-hidden">
                  {/* Clear option */}
                  <button
                    onClick={() => selTask(null)}
                    className="act-list-row w-full flex items-center gap-2 px-3 py-2.5 text-sm text-tx-faint text-left"
                  >
                    <X size={11}/> No task
                  </button>
                  <div className="border-t border-brd-default"/>
                  <div className="max-h-48 overflow-y-auto">
                    {tasks.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-tx-faint italic">
                        {form.projectId ? 'No tasks for this project' : 'No tasks yet'}
                      </p>
                    ) : (
                      tasks.map(t => (
                        <button
                          key={t.id}
                          onClick={() => selTask(t)}
                          className="act-list-row w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                        >
                          {t.id === form.taskId
                            ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0"/>
                            : <Circle size={13} className="text-tx-faint shrink-0"/>
                          }
                          <span className={`flex-1 truncate ${t.id === form.taskId ? 'text-tx-primary font-semibold' : 'text-tx-secondary'}`}>
                            {t.title}
                          </span>
                          {t.status && (
                            <span className="text-[10px] text-tx-faint shrink-0 capitalize">{t.status}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  {tasks.length > 0 && (
                    <div className="border-t border-brd-default px-3 py-2">
                      <p className="text-[10px] text-tx-faint">{tasks.length} task{tasks.length !== 1 ? 's' : ''}{form.projectId ? ' in project' : ' total'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Note</label>
            <textarea value={form.note} onChange={e => setForm(f=>({...f,note:e.target.value}))}
              placeholder="Optional note…" rows={2}
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2 text-sm text-tx-primary placeholder-tx-faint focus:outline-none focus:border-accent resize-none"/>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="act-list-row flex-1 bg-brd-default text-tx-secondary py-2.5 rounded-xl text-sm">
            Cancel
          </button>
          <button onClick={() => onSave({ ...form, status:'edited' })}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">
            <Check size={14}/>Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Simple SVG donut ─────────────────────────────────────────────────────────
function DonutChart({ segments, size = 128, thickness = 18, centerLabel = 'Tracked', centerValue = '' }) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <filter id="donutGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={thickness} />
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circ;
          const gap = circ - dash;
          const node = (
            <circle
              key={i}
              cx={size/2}
              cy={size/2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              filter="url(#donutGlow)"
              style={{
                opacity: 0.98,
                transition: 'stroke-dasharray 600ms ease, stroke-dashoffset 600ms ease',
              }}
            />
          );
          offset += dash;
          return node;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[11px] uppercase tracking-[0.18em] text-[#8da1ff]">{centerLabel}</span>
        <span className="mt-1 text-[28px] font-extrabold leading-none text-white">{centerValue}</span>
      </div>
    </div>
  );
}

// ─── Block detail sidebar ─────────────────────────────────────────────────────
function BlockDetail({ blk, blocks, totalSecs, isLive, liveElapsed, onClose, onAccept, onEdit }) {
  const [note,        setNote]        = useState(blk.note || '');
  const [editingNote, setEditingNote] = useState(false);

  // Day-level type breakdown
  const dayBreakdown = useMemo(() => {
    const map = { deep: 0, shallow: 0, meeting: 0, distraction: 0, neutral: 0 };
    blocks.forEach(b => { map[b.cls.type] = (map[b.cls.type] || 0) + b.totalDuration; });
    return [
      { label: 'Deep Work', color: '#6366f1', value: map.deep                     },
      { label: 'Low Focus', color: '#64748b', value: map.shallow                  },
      { label: 'Meetings',  color: '#f87171', value: map.meeting                  },
      { label: 'Other',     color: '#6b7280', value: map.neutral + map.distraction },
    ].filter(s => s.value > 0);
  }, [blocks]);

  // Day-level top websites
  const topSites = useMemo(() => {
    const map = {};
    blocks.forEach(b => {
      b.urls.forEach(u => { map[u] = (map[u] || 0) + b.totalDuration; });
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([domain, secs]) => ({ domain, secs, pct: totalSecs > 0 ? Math.round(secs / totalSecs * 100) : 0 }));
  }, [blocks, totalSecs]);

  // Productivity score
  const productivityScore = useMemo(() => {
    if (!totalSecs) return 0;
    const deepSecs = blocks.filter(b => b.cls.type === 'deep').reduce((a, b) => a + b.totalDuration, 0);
    const distSecs = blocks.filter(b => b.cls.type === 'distraction').reduce((a, b) => a + b.totalDuration, 0);
    const raw = Math.round((deepSecs / totalSecs) * 100 - (distSecs / totalSecs) * 50 + Math.min(totalSecs / 3600, 4) * 2);
    return Math.max(0, Math.min(100, raw));
  }, [blocks, totalSecs]);

  const scoreLabel = productivityScore >= 80 ? 'Excellent' : productivityScore >= 60 ? 'Good' : productivityScore >= 40 ? 'Fair' : 'Low';
  const scoreColor = productivityScore >= 80 ? '#34D399' : productivityScore >= 60 ? '#7c6cf2' : productivityScore >= 40 ? '#FBBF24' : '#F87171';

  const fragScore = blk.fragScore ?? 0;
  const fragColor = fragScore >= 70 ? '#F87171' : fragScore >= 35 ? '#FBBF24' : '#34D399';
  const fragLabel = fragScore >= 70 ? 'High frag.' : fragScore >= 35 ? 'Moderate' : 'Minimal';

  const scoreRingC = 2 * Math.PI * 26;

  return (
    <div className="h-full flex flex-col bg-bg-app act-detail-panel overflow-hidden">

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="relative shrink-0 overflow-hidden">
        {/* Soft color wash */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${blk.cls.color}12 0%, transparent 60%)` }}/>

        <div className="relative px-4 pt-4 pb-4" style={{ borderBottom: '1px solid var(--act-detail-border)' }}>
          {/* Top row: type badge + close */}
          <div className="flex items-center justify-between mb-3.5">
            {isLive ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400
                               bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot"/>
                LIVE · {fmt(liveElapsed)}
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide"
                style={{ background: `${blk.cls.color}18`, color: blk.cls.color, border: `1px solid ${blk.cls.color}32` }}>
                {PROD_BADGE[blk.cls.type]?.label || blk.cls.label}
              </span>
            )}
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-tx-faint
                         hover:text-tx-primary transition-all act-icon-box">
              <X size={13}/>
            </button>
          </div>

          {/* App icon + name + time */}
          <div className="flex items-start gap-3">
            <AppIcon appName={blk.primaryApp} size={40} radius={11}/>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-tx-primary leading-tight truncate">{blk.primaryApp}</p>
              {(blk.project || blk.client) && (
                <p className="text-[11px] text-tx-faint truncate mt-0.5">
                  {[blk.client, blk.project].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                <span className="text-[10px] font-mono text-tx-faint tabular-nums">{fmtTimeRange(blk.started_at, blk.ended_at)}</span>
                <span className="text-[13px] font-bold tabular-nums" style={{ color: blk.cls.color }}>{fmt(blk.totalDuration)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SCROLLABLE BODY ═════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Context ── */}
        {(blk.project || blk.client || blk.taskId || blk.task) && (
          <div className="px-4 py-4 act-section-div">
            <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint mb-3">Context</p>
            <div className="space-y-2">
              {blk.client && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 act-icon-box">
                    <UserCheck size={12} className="text-tx-faint"/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-tx-faint uppercase tracking-wide leading-none mb-0.5">Client</p>
                    <p className="text-[12px] text-tx-primary font-semibold truncate">{blk.client}</p>
                  </div>
                </div>
              )}
              {blk.project && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 act-icon-box">
                    <Briefcase size={12} className="text-tx-faint"/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-tx-faint uppercase tracking-wide leading-none mb-0.5">Project</p>
                    <p className="text-[12px] text-tx-primary font-semibold truncate">{blk.project}</p>
                  </div>
                </div>
              )}
              {(blk.taskId || blk.task) && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                                  bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 size={12} className="text-emerald-400"/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-tx-faint uppercase tracking-wide leading-none mb-0.5">Task</p>
                    <p className="text-[12px] text-tx-primary font-semibold truncate">{blk.task || '—'}</p>
                  </div>
                  {blk.taskId && (
                    <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wide shrink-0
                                     bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                      tracked
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Note ── */}
        <div className="px-4 py-4 act-section-div">
          <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint mb-3">Note</p>
          {editingNote ? (
            <div>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                placeholder="Write a note about this session…" rows={3} autoFocus
                className="w-full rounded-xl px-3.5 py-2.5 text-[12px] text-tx-primary placeholder-tx-faint
                           focus:outline-none resize-none leading-relaxed transition-colors act-metric-card
                           focus:ring-1 focus:ring-accent/40"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { onEdit(blk.id); setEditingNote(false); }}
                  className="flex-1 text-[11px] py-2 rounded-lg bg-accent/15 hover:bg-accent/22
                             text-accent font-semibold transition-colors">
                  Save
                </button>
                <button onClick={() => setEditingNote(false)}
                  className="text-[11px] py-2 px-4 rounded-lg text-tx-faint hover:text-tx-secondary
                             act-action-btn transition-all">
                  Cancel
                </button>
              </div>
            </div>
          ) : blk.note ? (
            <div onClick={() => setEditingNote(true)}
              className="group relative cursor-pointer rounded-xl act-note-card px-3.5 py-3">
              <p className="text-[12px] text-tx-secondary leading-relaxed pr-5">{blk.note}</p>
              <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Edit2 size={10} className="text-tx-faint"/>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingNote(true)}
              className="w-full flex items-center justify-center gap-2 text-[11px] text-tx-faint
                         hover:text-tx-secondary rounded-xl py-3 transition-all"
              style={{ border: '1px dashed var(--act-detail-metric-brd)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--act-detail-note-hover-brd)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--act-detail-metric-brd)'}>
              <PenLine size={12}/>Add a note…
            </button>
          )}
        </div>

        {/* ── Focus Quality (context switching) ── */}
        {blk.sessions && blk.sessions.length > 1 && (
          <div className="px-4 py-4 act-section-div">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint">Focus Quality</p>
              <span className="text-[10px] text-tx-faint tabular-nums">{blk.sessions.length} segments</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-xl p-3.5 act-metric-card">
                <p className="text-[24px] font-extrabold text-tx-primary leading-none tabular-nums">
                  {blk.contextSwitches ?? 0}
                </p>
                <p className="text-[10px] text-tx-faint mt-2 leading-tight">
                  context switch{(blk.contextSwitches ?? 0) !== 1 ? 'es' : ''}
                </p>
              </div>
              <div className="rounded-xl p-3.5 act-metric-card">
                <p className="text-[24px] font-extrabold leading-none tabular-nums" style={{ color: fragColor }}>
                  {fragScore}
                </p>
                <p className="text-[10px] mt-2 leading-tight font-medium" style={{ color: fragColor + 'cc' }}>
                  {fragLabel}
                </p>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden act-track">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${fragScore}%`, background: fragColor }}/>
            </div>
          </div>
        )}

        {/* ── Day Split ── */}
        {dayBreakdown.length > 0 && (
          <div className="px-5 pt-5 pb-6 act-section-div">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint">Day Split</p>
              <span className="text-[10px] font-semibold text-tx-secondary tabular-nums">{fmt(totalSecs)}</span>
            </div>

            {/* Donut — centered, fills available width */}
            <div className="flex justify-center mb-5">
              {(() => {
                // Canvas size + inset padding so stroke + glow never touch the SVG edge
                const canvas = 176, inset = 8;
                const sz = canvas - inset * 2; // drawable diameter = 160
                const thick = 16;
                // r shrunk by half-thick so outer stroke edge stays inside canvas
                const r = sz / 2 - thick / 2;
                const cx = canvas / 2, cy = canvas / 2;
                const circ = 2 * Math.PI * r;
                const total = dayBreakdown.reduce((a, s) => a + s.value, 0) || 1;
                let offset = 0;
                return (
                  <div className="relative" style={{ width: canvas, height: canvas }}>
                    <svg
                      width={canvas} height={canvas}
                      viewBox={`0 0 ${canvas} ${canvas}`}
                      style={{ transform: 'rotate(-90deg)', overflow: 'visible', display: 'block' }}
                    >
                      <defs>
                        <filter id="splitGlow" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={thick}/>
                      {dayBreakdown.map((seg, i) => {
                        const dash = (seg.value / total) * circ;
                        const gap  = circ - dash;
                        const node = (
                          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                            stroke={seg.color} strokeWidth={thick}
                            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}
                            strokeLinecap="round" filter="url(#splitGlow)"
                            style={{ opacity: 0.95, transition: 'stroke-dasharray 600ms ease, stroke-dashoffset 600ms ease' }}/>
                        );
                        offset += dash;
                        return node;
                      })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                      <span className="text-accent" style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75, lineHeight: 1 }}>Total</span>
                      <span className="text-tx-primary" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(totalSecs)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Legend — two columns for 4+ items, single column otherwise */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: dayBreakdown.length >= 4 ? '1fr 1fr' : '1fr',
              gap: '8px 12px',
            }}>
              {dayBreakdown.map((seg, i) => {
                const pct = totalSecs > 0 ? Math.round(seg.value / totalSecs * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: seg.color, boxShadow: `0 0 5px ${seg.color}80` }}/>
                    <span className="text-[11px] text-tx-secondary truncate flex-1 min-w-0 leading-tight">{seg.label}</span>
                    <span className="shrink-0 text-[10px] font-bold tabular-nums rounded-md px-1.5 py-0.5 leading-none"
                      style={{ color: seg.color, background: `${seg.color}1a` }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Top Websites ── */}
        {topSites.length > 0 && (
          <div className="px-4 py-4 act-section-div">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint">Top Sites</p>
              <span className="text-[10px] text-tx-faint tabular-nums">{topSites.length} sites</span>
            </div>
            <div className="space-y-2.5">
              {topSites.map((site, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                    alt="" className="w-4 h-4 rounded-sm shrink-0"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  <span className="text-[11px] text-tx-primary flex-1 truncate font-medium">{site.domain}</span>
                  <div className="w-20 h-1.5 rounded-full overflow-hidden shrink-0 act-track">
                    <div className="h-full rounded-full transition-all" style={{ width: `${site.pct}%`, background: 'var(--color-accent, #7c6cf2)' }}/>
                  </div>
                  <span className="text-[10px] font-mono text-tx-faint w-7 text-right shrink-0 tabular-nums">{site.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Productivity Score ── */}
        {totalSecs > 0 && (
          <div className="px-4 py-4 act-section-div">
            <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint mb-3">Productivity Score</p>
            <div className="rounded-xl p-4 flex items-center gap-4 act-metric-card">
              {/* Score ring */}
              <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
                <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={32} cy={32} r={26} fill="none" stroke="var(--act-detail-ring-track)" strokeWidth={7}/>
                  {productivityScore > 0 && (
                    <circle cx={32} cy={32} r={26} fill="none" stroke={scoreColor}
                      strokeWidth={7} strokeLinecap="round"
                      strokeDasharray={`${(productivityScore / 100) * scoreRingC} ${scoreRingC}`}
                      style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)' }}/>
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[15px] font-extrabold tabular-nums" style={{ color: scoreColor }}>
                    {productivityScore}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-tx-primary">{scoreLabel}</p>
                <p className="text-[11px] text-tx-faint mt-0.5">day focus quality</p>
                <p className="text-[10px] text-tx-faint mt-1 tabular-nums">{fmt(totalSecs)} tracked</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Apps in block ── */}
        {blk.appBreakdown.length > 0 && (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-tx-faint">Apps in Block</p>
              <span className="text-[10px] text-tx-faint tabular-nums">{blk.sessions.length} events</span>
            </div>
            <div className="space-y-2.5">
              {blk.appBreakdown.map((a, i) => {
                const pct = blk.totalDuration > 0 ? Math.round(a.secs / blk.totalDuration * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <AppIcon appName={a.app} size={24} radius={6}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-tx-primary font-medium truncate">{a.app}</span>
                        <span className="text-[10px] text-tx-faint font-mono shrink-0 ml-2 tabular-nums">{fmt(a.secs)}</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden act-track">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: a.cls.color }}/>
                      </div>
                    </div>
                    <span className="text-[10px] text-tx-faint w-7 text-right shrink-0 tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ═══ ACTIONS ══════════════════════════════════════════════════════════ */}
      <div className="px-4 py-3.5 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--act-detail-border)' }}>
        {blk.status !== 'accepted' && (
          <button onClick={() => onAccept(blk.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold
                       transition-all bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20
                       hover:border-emerald-500/40 text-emerald-400 hover:text-emerald-300">
            <CheckCircle2 size={13}/>Accept Block
          </button>
        )}
        <button onClick={() => onEdit(blk.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold
                     act-action-btn text-tx-secondary hover:text-tx-primary">
          <Edit2 size={12}/>Edit
        </button>
      </div>

    </div>
  );
}

// ─── Visual timeline (hour grid) ──────────────────────────────────────────────
function Timeline({ blocks, selectedId, onSelect, live, isLive }) {
  const [hovered,   setHovered]   = useState(null);
  // Capture the hovered block's viewport rect so the portal tooltip can position
  // itself correctly regardless of any ancestor transforms / overflow containers.
  const [tipAnchor, setTipAnchor] = useState({ x: 0, top: 0, bottom: 0 });
  if (!blocks.length) return null;

  const now  = Math.floor(Date.now() / 1000);
  const minT = blocks[0].started_at;
  const maxT = isLive ? Math.max(blocks[blocks.length-1].ended_at, now) : blocks[blocks.length-1].ended_at;
  const span = maxT - minT || 1;

  // Hour markers every hour
  const startHour = new Date(minT*1000).getHours();
  const endHour   = new Date(maxT*1000).getHours() + 1;
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const toPos = t => Math.max(0, Math.min(100, ((t - minT) / span) * 100));

  // Format hour label
  const fmtHour = h => {
    const d = new Date(); d.setHours(h, 0, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(' ', '');
  };

  return (
    <div className="relative px-5 py-2.5 bg-bg-app/50">
      <div className="relative" style={{ height: 44 }}>
        {/* Track background */}
        <div className="absolute left-0 right-0 rounded" style={{ top: 4, height: 24, background: 'var(--timeline-track)' }}/>

        {/* Hour grid lines + labels */}
        {hours.map(h => {
          const d = new Date(minT*1000); d.setHours(h,0,0,0);
          const pos = toPos(d/1000);
          if (pos <= 0 || pos >= 99.5) return null;
          return (
            <React.Fragment key={h}>
              <div className="absolute top-1 pointer-events-none"
                style={{ left:`${pos}%`, height: 30, width: 1, background: 'var(--timeline-grid)' }}/>
              <span className="absolute text-[9px] text-tx-faint font-mono -translate-x-1/2"
                style={{ left:`${pos}%`, top: 31 }}>
                {fmtHour(h)}
              </span>
            </React.Fragment>
          );
        })}

        {/* Blocks */}
        {blocks.map(blk => {
          const left  = toPos(blk.started_at);
          const right = toPos(blk.ended_at);
          const width = Math.max(right - left, 0.4);
          const isSel = selectedId === blk.id;
          return (
            <div
              key={blk.id}
              onClick={() => onSelect(blk.id)}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHovered(blk.id);
                setTipAnchor({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
              }}
              onMouseLeave={() => setHovered(prev => prev === blk.id ? null : prev)}
              className="absolute rounded cursor-pointer hover:brightness-110 transition-all"
              style={{
                left:`${left}%`, width:`${width}%`,
                top: 4, height: 24,
                background: blk.cls.color + (isSel ? 'ff' : 'bb'),
                boxShadow: isSel ? `0 0 0 2px ${blk.cls.color}` : hovered === blk.id ? `0 10px 28px ${blk.cls.color}33` : 'none',
                outlineOffset: 1,
                zIndex: isSel ? 3 : 1,
              }}
              title={`${blk.primaryApp} · ${fmtTimeRange(blk.started_at, blk.ended_at)}`}
            />
          );
        })}

        {/* ── Tooltip portal — renders at document.body, immune to ancestor
              overflow / transform containment; smart flip above↔below ── */}
        {hovered && (() => {
          const blk = blocks.find(b => b.id === hovered);
          if (!blk) return null;

          const TIP_W  = 292;
          const NAV_H  = 80;   // Electron chrome + app top-nav height
          const GAP    = 10;   // gap between block edge and card

          // Clamp horizontal so card never bleeds past viewport edges
          const winW     = typeof window !== 'undefined' ? window.innerWidth : 1200;
          const clampedX = Math.max(TIP_W / 2 + 8, Math.min(winW - TIP_W / 2 - 8, tipAnchor.x));

          // Flip decision: show below when there isn't enough room above
          const spaceAbove = tipAnchor.top - NAV_H;
          const showBelow  = spaceAbove < 220;   // 220 = generous estimate for card height

          // Vertical position — above: anchor to block top; below: anchor to block bottom
          // Using translateY so the card size doesn't need to be known in advance
          const topVal      = showBelow ? tipAnchor.bottom + GAP : tipAnchor.top - GAP;
          const transformVal = showBelow
            ? 'translateX(-50%)'
            : 'translateX(-50%) translateY(-100%)';

          const cardBg   = 'rgba(10,13,26,0.97)';
          const caretClr = cardBg;

          const tooltip = (
            <div
              key="timeline-tooltip"
              className="fl-activity-timeline-tooltip pointer-events-none"
              data-below={showBelow ? 'true' : undefined}
              style={{
                position:  'fixed',
                left:      clampedX,
                top:       topVal,
                zIndex:    99999,
                transform: transformVal,
              }}
            >
              {/* Up-arrow caret when showing below the block */}
              {showBelow && (
                <div style={{
                  width: 0, height: 0, margin: '0 auto',
                  borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                  borderBottom: `7px solid ${cardBg}`,
                }} />
              )}

              {/* Card */}
              <div style={{
                width: TIP_W,
                background: cardBg,
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: `0 20px 48px rgba(0,0,0,0.72), 0 4px 16px rgba(0,0,0,0.45), 0 0 0 1px ${blk.cls.color}22`,
              }}>
                {/* Color accent strip */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${blk.cls.color}ee, ${blk.cls.color}33)` }} />

                {/* Header */}
                <div style={{ padding: '10px 14px 9px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {blk.primaryApp}
                    </p>
                    <p style={{ fontSize: 10, color: '#5a677d', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
                      {fmtTimeRange(blk.started_at, blk.ended_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                      color: blk.cls.color, background: `${blk.cls.color}18`,
                      border: `1px solid ${blk.cls.color}30`,
                    }}>
                      {blk.cls.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: blk.cls.color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                      {fmt(blk.totalDuration)}
                    </span>
                  </div>
                </div>

                {/* Entity breakdown */}
                {blk.entityBreakdown.length > 0 && (
                  <div style={{ padding: '8px 14px 10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {blk.entityBreakdown.slice(0, 4).map((entry, i) => {
                        const pct = blk.totalDuration > 0 ? Math.round((entry.secs / blk.totalDuration) * 100) : 0;
                        return (
                          <div key={`${entry.key}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AppIcon appName={entry.appName} url={entry.url} size={16} radius={4} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                                <p style={{ fontSize: 11, color: 'rgba(240,244,255,0.88)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {entry.label}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                  {entry.kind && (
                                    <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8896aa', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '1px 4px' }}>
                                      {entry.kind}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 10, fontWeight: 700, color: entry.cls.color, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                                </div>
                              </div>
                              <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: entry.cls.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {blk.entityBreakdown.length > 4 && (
                      <p style={{ marginTop: 6, fontSize: 9, color: '#5a677d' }}>
                        +{blk.entityBreakdown.length - 4} more · click to expand
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Down-arrow caret when showing above the block */}
              {!showBelow && (
                <div style={{
                  width: 0, height: 0, margin: '0 auto',
                  borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                  borderTop: `7px solid ${caretClr}`,
                }} />
              )}
            </div>
          );

          // Portal to document.body: guaranteed above all stacking contexts,
          // immune to ancestor overflow:hidden / transform containment.
          return createPortal(tooltip, document.body);
        })()}

        {/* Live "now" indicator */}
        {isLive && (() => {
          const pos = toPos(now);
          return pos > 0 && pos < 100 ? (
            <div className="absolute flex flex-col items-center pointer-events-none" style={{ left:`${pos}%`, top: 0, zIndex: 4 }}>
              <div className="w-px bg-green-400" style={{ height: 28 }}/>
              <span className="text-[9px] text-status-green font-semibold whitespace-nowrap -translate-x-1/2 mt-0.5">
                LIVE
              </span>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

function EventLogView({ events, selectedId, onSelect }) {
  if (!events.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-tx-faint">
        No tracked events for this date
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="space-y-2">
        {events.map(item => {
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-2xl p-3 text-left transition-all act-surface-sm ${
                isSelected ? 'act-surface-sm-sel shadow-card' : 'act-list-row'
              }`}
            >
              <div className="flex items-start gap-3">
                <AppIcon appName={item.app_name} url={item.url} size={28} radius={8} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-tx-primary">{item.app_name || 'Unknown app'}</p>
                    <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: item.cls.color, background: `${item.cls.color}18` }}>
                      {item.cls.label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-tx-faint">{item.window_title || item.domain || item.url || 'No window title captured'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#aab3d1]">
                    <span>{fmtDateTime(item.started_at)}</span>
                    <span>{fmt(item.duration_seconds)}</span>
                    <span>{item.deviceLabel}</span>
                    {item.domain && <span>{item.domain}</span>}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category scope confirmation modal ───────────────────────────────────────
// Shown when the user changes an event's category. Lets them choose whether
// the change applies only to this session, all of today's sessions from the
// same app, all sessions ever, or cancel.
function CategoryScopeModal({ appName, fromLabel, toLabel, toColor, onConfirm, onCancel }) {
  const options = [
    {
      id:    'this',
      title: 'This session only',
      desc:  'Update only this single tracked event.',
      Icon:  Monitor,
    },
    {
      id:    'today',
      title: "Today's sessions",
      desc:  `Update all ${appName} sessions recorded today.`,
      Icon:  Calendar,
    },
    {
      id:    'all',
      title: 'All sessions from this app',
      desc:  `Reclassify every recorded ${appName} session, past and future.`,
      Icon:  Globe,
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="w-[440px] bg-bg-card border border-brd-strong rounded-2xl shadow-2xl overflow-hidden scale-in">
        {/* Accent bar */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${toColor}cc, ${toColor}44)` }} />

        <div className="px-6 pt-5 pb-2">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${toColor}18`, border: `1px solid ${toColor}30` }}>
              <Tag size={16} style={{ color: toColor }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-tx-primary">Apply Category Change</h3>
              <p className="text-[11px] text-tx-faint mt-0.5">
                Changing <span className="font-semibold text-tx-secondary">{appName}</span> from{' '}
                <span className="font-semibold text-tx-secondary">{fromLabel}</span> →{' '}
                <span className="font-semibold" style={{ color: toColor }}>{toLabel}</span>
              </p>
            </div>
          </div>

          <p className="text-[11px] text-tx-muted mb-3">How far should this change apply?</p>
        </div>

        <div className="px-6 pb-4 space-y-2">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => onConfirm(opt.id)}
              className="act-list-row w-full flex items-start gap-3 rounded-xl border border-brd-default bg-bg-input px-4 py-3 text-left transition-all hover:border-brd-hover"
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${toColor}14`, border: `1px solid ${toColor}28` }}>
                <opt.Icon size={14} style={{ color: toColor }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-tx-primary">{opt.title}</p>
                <p className="text-[11px] text-tx-faint mt-0.5">{opt.desc}</p>
              </div>
              <ArrowRight size={14} className="text-tx-faint shrink-0 mt-1 ml-auto" />
            </button>
          ))}

          <button
            onClick={onCancel}
            className="act-list-row w-full rounded-xl border border-brd-subtle bg-bg-app py-2.5 text-sm font-medium text-tx-faint transition hover:text-tx-secondary mt-1">
            Cancel — keep original category
          </button>
        </div>
      </div>
    </div>
  );
}

function EventDetailPanel({
  item, onClose, onSave, onSaveCategoryBulk, onDelete,
  onCreateClientKeyword, onCreateProjectKeyword, onCreateTaskKeyword,
}) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  // Pending category change: stored while the scope-modal is visible
  const [pendingCat, setPendingCat] = useState(null); // { key, label } | null
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const showToast = useCallback((msg) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => { if (toastRef.current) clearTimeout(toastRef.current); }, []);

  useEffect(() => {
    if (!item) return;
    const seed = makeKeywordSeed(item);
    setForm({
      appName: item.app_name || '',
      windowTitle: item.window_title || '',
      url: item.url || '',
      categoryKey: item.cls.categoryKey || 'focus',
      categoryLabel: item.cls.label || 'Focus',
      clientName: seed,
      clientKeyword: seed,
      projectName: seed,
      projectKeyword: seed,
      taskTitle: item.window_title || item.app_name || seed,
      taskKeyword: seed,
    });
  }, [item]);

  if (!item || !form) return null;

  const categoryOptions = Object.entries(SMART_CATEGORY_DEFS);
  const domain = safeHostname(form.url);
  const categoryMeta = SMART_CATEGORY_DEFS[form.categoryKey] || item.cls;

  const setField = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  // Intercept category dropdown changes — show scope confirmation instead of
  // immediately committing. The modal resolves with one of the scope strings
  // or cancel (null), then we act accordingly.
  const handleCategoryChange = (value) => {
    if (!form || value === form.categoryKey) return; // no change
    const next = SMART_CATEGORY_DEFS[value] || SMART_CATEGORY_DEFS.focus;
    setPendingCat({ key: value, label: next.label, color: next.color });
  };

  const commitCategoryChange = async (scope) => {
    if (!pendingCat || !form) { setPendingCat(null); return; }
    const { key, label } = pendingCat;
    // Update local form state regardless of scope
    setForm(prev => ({ ...prev, categoryKey: key, categoryLabel: label }));
    setPendingCat(null);
    if (scope === 'this') {
      showToast('Category updated — click Save to apply');
      return;
    }
    // For broader scopes, call the parent bulk handler immediately
    await onSaveCategoryBulk?.({ appName: form.appName, categoryKey: key, categoryLabel: label, scope });
    const scopeLabel = scope === 'today' ? "today's sessions" : 'all sessions';
    showToast(`Category applied to ${scopeLabel}`);
  };

  const runAction = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); }
    finally { setBusy(''); }
  };

  return (
    <div className="h-full overflow-hidden border-l border-brd-subtle bg-bg-app relative">
      {/* Success toast */}
      {toast && (
        <div key={toast} className="fl-toast absolute bottom-5 left-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-[12px] font-semibold pointer-events-none"
          style={{ background: '#10b981', color: '#fff', whiteSpace: 'nowrap', transform: 'translateX(-50%)' }}>
          <CheckCircle2 size={13} />
          {toast}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-brd-subtle px-4 py-4">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-tx-primary">{form.appName || 'Tracked Event'}</p>
          <p className="text-[11px] text-tx-faint">{fmtDateTime(item.started_at)} · {fmt(item.duration_seconds)}</p>
        </div>
        <button onClick={onClose} className="act-nav-btn rounded-md p-1 text-tx-faint hover:text-tx-primary">
          <X size={14} />
        </button>
      </div>

      <div className="h-[calc(100%-73px)] overflow-y-auto px-4 py-4">
        <div className="act-surface-md rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AppIcon appName={form.appName} url={form.url} size={34} radius={10} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-tx-primary">{form.windowTitle || form.appName}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-tx-secondary">
                <span className="rounded-full border border-brd-default px-2 py-1">{item.deviceLabel}</span>
                {domain && <span className="rounded-full border border-brd-default px-2 py-1">{domain}</span>}
                <span className="rounded-full px-2 py-1" style={{ color: categoryMeta.color, background: `${categoryMeta.color}18` }}>{form.categoryLabel}</span>
              </div>
            </div>
            {form.url && (
              <button onClick={() => api.openExternal?.(form.url)} className="act-nav-btn rounded-lg border border-brd-default p-2 text-tx-faint hover:text-tx-primary">
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="act-surface-md mt-4 rounded-2xl p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-tx-faint">Details</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] text-tx-faint">App / Website</label>
              <input value={form.appName} onChange={setField('appName')} className="w-full rounded-xl border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-tx-faint">Window Title</label>
              <input value={form.windowTitle} onChange={setField('windowTitle')} className="w-full rounded-xl border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-tx-faint">Website URL</label>
              <input value={form.url} onChange={setField('url')} className="w-full rounded-xl border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-tx-faint">Time</label>
                <div className="act-surface-sm rounded-xl px-3 py-2 text-sm text-tx-primary">{fmtTimeRange(item.started_at, item.ended_at)}</div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-tx-faint">Device</label>
                <div className="act-surface-sm rounded-xl px-3 py-2 text-sm text-tx-primary">{item.deviceLabel}</div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-tx-faint">Category</label>
              <select
                value={form.categoryKey}
                onChange={e => handleCategoryChange(e.target.value)}
                className="w-full rounded-xl border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent"
              >
                {categoryOptions.map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
              {/* Hint that changes will trigger scope selection */}
              <p className="mt-1 text-[10px] text-tx-faint">
                Changing the category will ask how broadly to apply it.
              </p>
            </div>
          </div>
        </div>

        <div className="act-surface-md mt-4 rounded-2xl p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-tx-faint">Actions</p>
          <div className="space-y-4">
            <div className="act-surface-sm rounded-xl p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-tx-primary"><UserCheck size={14} />Create Client Keyword</div>
              <div className="grid grid-cols-2 gap-2">
                <input value={form.clientName} onChange={setField('clientName')} placeholder="Client name" className="rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
                <input value={form.clientKeyword} onChange={setField('clientKeyword')} placeholder="keyword" className="rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
              </div>
              <button onClick={() => runAction('client', () => onCreateClientKeyword(form.clientName, form.clientKeyword))} className="act-kw-btn mt-2 px-3 py-2 text-xs font-semibold text-tx-primary">
                {busy === 'client' ? 'Creating...' : 'Create Client Keyword'}
              </button>
            </div>

            <div className="act-surface-sm rounded-xl p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-tx-primary"><Briefcase size={14} />Create Project Keyword</div>
              <div className="grid grid-cols-2 gap-2">
                <input value={form.projectName} onChange={setField('projectName')} placeholder="Project name" className="rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
                <input value={form.projectKeyword} onChange={setField('projectKeyword')} placeholder="keyword" className="rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
              </div>
              <button onClick={() => runAction('project', () => onCreateProjectKeyword(form.projectName, form.projectKeyword))} className="act-kw-btn mt-2 px-3 py-2 text-xs font-semibold text-tx-primary">
                {busy === 'project' ? 'Creating...' : 'Create Project Keyword'}
              </button>
            </div>

            <div className="act-surface-sm rounded-xl p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-tx-primary"><FolderPlus size={14} />Create Task Keyword</div>
              <div className="grid grid-cols-2 gap-2">
                <input value={form.taskTitle} onChange={setField('taskTitle')} placeholder="Task title" className="rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
                <input value={form.taskKeyword} onChange={setField('taskKeyword')} placeholder="keyword" className="rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
              </div>
              <button onClick={() => runAction('task', () => onCreateTaskKeyword(form.taskTitle, form.taskKeyword))} className="act-kw-btn mt-2 px-3 py-2 text-xs font-semibold text-tx-primary">
                {busy === 'task' ? 'Creating...' : 'Create Task Keyword'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={async () => {
              await onSave({
                sessionId: item.id,
                appName: form.appName,
                windowTitle: form.windowTitle,
                url: form.url,
                categoryKey: form.categoryKey,
                categoryLabel: form.categoryLabel,
              });
              showToast('Changes saved');
            }}
            className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Save Event Changes
          </button>
          <button
            onClick={() => runAction('delete', () => onDelete(item.id))}
            className="rounded-xl border border-red-500/25 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/18"
          >
            {busy === 'delete' ? 'Deleting...' : 'Delete Event'}
          </button>
        </div>
      </div>

      {/* Category scope confirmation modal — rendered outside the scrollable area so it overlays correctly */}
      {pendingCat && (
        <CategoryScopeModal
          appName={form.appName}
          fromLabel={form.categoryLabel}
          toLabel={pendingCat.label}
          toColor={pendingCat.color}
          onConfirm={commitCategoryChange}
          onCancel={() => setPendingCat(null)}
        />
      )}
    </div>
  );
}

// ─── Activity Dashboard ───────────────────────────────────────────────────────
const DASH_RANGES = [
  { id: 'day',   label: 'Day'   },
  { id: 'week',  label: 'Week'  },
  { id: 'month', label: 'Month' },
];

const TYPE_META = {
  deep:        { label: 'Deep Work',   color: '#6366f1' },
  shallow:     { label: 'Low Focus',   color: '#64748b' },
  meeting:     { label: 'Meetings',    color: '#f87171' },
  distraction: { label: 'Distraction', color: '#ef4444' },
  neutral:     { label: 'Other',       color: '#6b7280' },
};

// ─── Event-group helpers ──────────────────────────────────────────────────────
/**
 * Groups auto-tracked activity blocks by overlapping calendar events / focus
 * sessions.  Supports three event types in calEvents:
 *   • Manual focus/meeting sessions  (source: undefined, from sessions table)
 *   • Linked calendar sessions       (notes starts with '__cal_event:')
 *   • Raw calendar events            (source: 'calendar', _calEvent: true)
 *
 * Blocks that don't overlap any event land in an "Unscheduled" group.
 * Events that have no overlapping blocks are still emitted as empty groups so
 * the user can see every scheduled event on the timeline.
 */
function buildEventGroups(blocks, calEvents) {
  const nowSec = Math.floor(Date.now() / 1000);

  // Only use events that have a valid completed time window
  const validEvents = (calEvents || [])
    .filter(e => e.started_at && e.ended_at && e.ended_at <= nowSec + 60)
    .sort((a, b) => a.started_at - b.started_at);

  if (!validEvents.length) {
    return blocks.length > 0
      ? [{ key: 'unscheduled', event: null, blocks, totalDuration: blocks.reduce((a, b) => a + b.totalDuration, 0), startedAt: blocks[0]?.started_at || 0 }]
      : [];
  }

  const assigned = new Set();
  const groups   = [];

  validEvents.forEach(evt => {
    // Use a small 60-second buffer so blocks that started just before the event
    // window (e.g., warm-up) still get grouped with it.
    const windowStart = evt.started_at - 60;
    const windowEnd   = evt.ended_at   + 60;

    const matching = blocks.filter(blk =>
      !assigned.has(blk.id) &&
      blk.started_at < windowEnd &&
      blk.ended_at   > windowStart
    );

    matching.forEach(b => assigned.add(b.id));

    // Emit the group even when empty so all events appear in the timeline
    groups.push({
      key:           evt.id || `calev_${evt.started_at}`,
      event:         evt,
      blocks:        matching,
      totalDuration: matching.reduce((a, b) => a + b.totalDuration, 0),
      startedAt:     evt.started_at,
    });
  });

  const leftover = blocks.filter(b => !assigned.has(b.id));
  if (leftover.length > 0) {
    groups.push({
      key:           'unscheduled',
      event:         null,
      blocks:        leftover,
      totalDuration: leftover.reduce((a, b) => a + b.totalDuration, 0),
      startedAt:     leftover[0]?.started_at || 0,
    });
  }

  groups.sort((a, b) => a.startedAt - b.startedAt);
  return groups;
}

// ─── Event group header ───────────────────────────────────────────────────────
/**
 * Renders the collapsible header for an event group.
 * Handles three event types:
 *   • null  → "Unscheduled Activity" (auto-tracked blocks with no session)
 *   • focus/meeting session (from sessions table)
 *   • calendar event (_calEvent: true, from calendar_events table)
 */
function EventGroupHeader({ event, totalDuration, blockCount, collapsed, onToggle }) {
  const isCalEvent = !!event?._calEvent;
  const isSession  = !!event && !isCalEvent;

  // Resolve display properties based on event type
  const evtColor = event?.color || (isCalEvent ? '#a78bfa' : '#6366f1');

  let typeLabel, title, sourceBadge;
  if (!event) {
    typeLabel   = '';
    title       = 'Unscheduled Activity';
    sourceBadge = null;
  } else if (isCalEvent) {
    typeLabel   = event.category_name || event.category || 'Calendar';
    title       = event.title || 'Calendar Event';
    sourceBadge = 'calendar';
  } else {
    // Manual session — derive type from session_type + category
    const st = (event.session_type || '').toLowerCase();
    const cat = (event.category || '').toLowerCase();
    typeLabel = st === 'meeting' || cat === 'meeting' ? 'Meeting'
      : event.is_deep_work ? 'Deep Work'
      : st === 'focus' ? 'Focus'
      : event.category || event.category_name || 'Session';
    title       = event.title || event.name || event.category || 'Focus Session';
    sourceBadge = 'session';
  }

  return (
    <button
      onClick={onToggle}
      className="act-list-row w-full flex items-center gap-3 px-4 py-2.5 border-b border-brd-subtle/60 transition-colors text-left group/evthdr"
      style={{ background: event ? `${evtColor}09` : 'transparent' }}
    >
      {/* Vertical color bar */}
      <div className="w-0.5 h-8 rounded-full shrink-0"
        style={{ background: event ? evtColor : 'var(--brd-default, #1e222e)' }}/>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-tx-primary truncate">{title}</span>

          {typeLabel && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
              style={{ background: `${evtColor}22`, color: evtColor }}>
              {typeLabel}
            </span>
          )}

          {/* Source badge: calendar vs session vs unscheduled */}
          {sourceBadge === 'calendar' && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.20)' }}>
              Calendar
            </span>
          )}
          {!event && (
            <span className="text-[9px] text-tx-faint uppercase tracking-wide shrink-0">no linked event</span>
          )}

          {/* Empty-group notice for calendar events with no tracked blocks */}
          {event && blockCount === 0 && (
            <span className="text-[9px] text-tx-faint italic shrink-0">no auto-tracked activity</span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {event && (
            <span className="text-[10px] text-tx-faint font-mono">
              {fmtTimeRange(event.started_at, event.ended_at)}
            </span>
          )}
          {blockCount > 0 && (
            <span className="text-[10px] text-tx-faint">
              {blockCount} block{blockCount !== 1 ? 's' : ''}
            </span>
          )}
          {totalDuration > 0 && (
            <span className="text-[10px] font-semibold" style={{ color: event ? evtColor : '#9ca3af' }}>
              {fmt(totalDuration)} tracked
            </span>
          )}

          {/* Show event duration for calendar events with no tracked time */}
          {event && totalDuration === 0 && event.ended_at > event.started_at && (
            <span className="text-[10px] text-tx-faint">
              {fmt(event.ended_at - event.started_at)} scheduled
            </span>
          )}

          {/* Meeting join link */}
          {event?.meeting_url && (
            <a href={event.meeting_url} target="_blank" rel="noopener noreferrer"
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors"
              style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.22)' }}
              onClick={e => e.stopPropagation()}>
              Join
            </a>
          )}
        </div>
      </div>

      {/* Collapse chevron */}
      <div className="text-tx-faint group-hover/evthdr:text-tx-secondary transition-colors shrink-0">
        {collapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}
      </div>
    </button>
  );
}

// ─── Event group section ──────────────────────────────────────────────────────
function EventGroupSection({ group, selectedId, liveBlockId, onSelect, onAccept, onEdit }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasBlocks = group.blocks.length > 0;
  return (
    <div>
      <EventGroupHeader
        event={group.event}
        totalDuration={group.totalDuration}
        blockCount={group.blocks.length}
        collapsed={collapsed}
        onToggle={() => setCollapsed(v => !v)}
      />
      {!collapsed && (
        hasBlocks ? (
          group.blocks.map((blk, idx) => {
            const prev = group.blocks[idx - 1];
            const gap  = prev ? blk.started_at - prev.ended_at : 0;
            return (
              <React.Fragment key={blk.id}>
                {gap > 300 && (
                  <div className="flex items-center gap-2 py-1 px-4">
                    <div className="flex-1 border-t border-dashed border-brd-subtle/40"/>
                    <span className="flex items-center gap-1 text-[10px] text-tx-faint shrink-0">
                      <Moon size={8}/>{fmt(gap)} gap
                    </span>
                    <div className="flex-1 border-t border-dashed border-brd-subtle/40"/>
                  </div>
                )}
                <BlockCard
                  blk={blk}
                  selected={selectedId === blk.id}
                  isLive={blk.id === liveBlockId}
                  onClick={() => onSelect(blk.id)}
                  onAccept={onAccept}
                  onEdit={onEdit}
                  showProjectFirst={false}
                />
              </React.Fragment>
            );
          })
        ) : (
          /* Calendar events with no auto-tracked blocks during their window */
          group.event && (
            <div className="px-7 py-3 flex items-center gap-2 text-[11px] text-tx-faint"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="h-1 w-1 rounded-full shrink-0" style={{ background: group.event.color || '#6366f1', opacity: 0.6 }}/>
              No auto-tracked activity during this event window.
            </div>
          )
        )
      )}
    </div>
  );
}

function ActivityPanel({ children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-white/[0.035] shadow-card ${className}`}
      style={{ background: 'var(--act-panel-bg)' }}
    >
      {children}
    </div>
  );
}

function DashboardSparkline({ color = '#7c6cf2' }) {
  return (
    <svg width="68" height="30" viewBox="0 0 68 30" aria-hidden="true">
      <path
        d="M2 25 C9 25 10 18 16 20 S25 25 29 15 S37 21 41 10 S48 18 52 9 S60 10 66 3"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M2 29 C9 29 10 22 16 24 S25 29 29 19 S37 25 41 14 S48 22 52 13 S60 14 66 7 L66 30 L2 30 Z"
        fill={color}
        opacity="0.14"
      />
    </svg>
  );
}

function ActivityDashboard({ user }) {
  const [dashRange,   setDashRange]   = useState('week');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return localDateStr(Math.floor(d.getTime() / 1000));
  });
  const [customEnd,   setCustomEnd]   = useState(() => localDateStr());
  const [autoData,    setAutoData]    = useState([]);
  const [loading,     setLoading]     = useState(false);

  // ── Time range ─────────────────────────────────────────────────────────────
  const { from, to, rangeLabel, isDayView } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const td  = new Date(); td.setHours(0, 0, 0, 0);
    if (dashRange === 'day')   return { from: Math.floor(td.getTime()/1000), to: now, rangeLabel: 'Today',          isDayView: true  };
    if (dashRange === 'week')  return { from: now - 7   * 86400, to: now, rangeLabel: 'Last 7 days',               isDayView: false };
    if (dashRange === 'month') return { from: now - 30  * 86400, to: now, rangeLabel: 'Last 30 days',              isDayView: false };
    if (dashRange === 'year')  return { from: now - 365 * 86400, to: now, rangeLabel: 'Last 365 days',             isDayView: false };
    if (dashRange === 'custom' && customStart && customEnd) {
      return {
        from:       Math.floor(new Date(customStart).getTime() / 1000),
        to:         Math.floor(new Date(customEnd + 'T23:59:59').getTime() / 1000),
        rangeLabel: `${customStart} → ${customEnd}`,
        isDayView:  customStart === customEnd,
      };
    }
    return { from: now - 7 * 86400, to: now, rangeLabel: 'Last 7 days', isDayView: false };
  }, [dashRange, customStart, customEnd]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.autoSessionsRange?.({ userId: user.id, from, to });
        if (!cancelled) setAutoData(data || []);
      } catch (err) {
        console.error('[ActivityDashboard] load failed:', err);
        if (!cancelled) setAutoData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.id, from, to]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeData = useMemo(
    () => mergeWorkflowSessions(autoData, { trace: true }).filter(s => !s.is_idle && (s.duration_seconds || 0) > 0),
    [autoData]
  );
  const totalSecs = activeData.reduce((a, s) => a + (s.duration_seconds || 0), 0);

  // Bar chart data — hourly for Day, daily otherwise
  const barData = useMemo(() => {
    if (isDayView) {
      const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, secs: 0 }));
      activeData.forEach(s => {
        const h = new Date((s.started_at || 0) * 1000).getHours();
        if (h >= 0 && h < 24) buckets[h].secs += (s.duration_seconds || 0);
      });
      return buckets.map(b => ({ ...b, hours: +(b.secs / 3600).toFixed(2) }));
    } else {
      // group by day
      const dayMap = {};
      activeData.forEach(s => {
        const dk = localDateStr(s.started_at || 0);
        dayMap[dk] = (dayMap[dk] || 0) + (s.duration_seconds || 0);
      });
      // Build ordered array from from→to
      const days = [];
      let cursor = from;
      while (cursor <= to) {
        const d  = new Date(cursor * 1000);
        const dk = localDateStr(cursor);
        const lbl = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
        days.push({ label: lbl, hours: +((dayMap[dk] || 0) / 3600).toFixed(2) });
        cursor += 86400;
      }
      return days;
    }
  }, [activeData, isDayView, from, to]);

  // Type breakdown for circular chart
  const typePie = useMemo(() => {
    const map = {};
    activeData.forEach(s => {
      const t = classifySession(s).type;
      map[t] = (map[t] || 0) + (s.duration_seconds || 0);
    });
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, secs]) => ({
        type, secs,
        label: TYPE_META[type]?.label || type,
        color: TYPE_META[type]?.color || '#6b7280',
        pct:   totalSecs > 0 ? Math.round(secs / totalSecs * 100) : 0,
      }));
  }, [activeData, totalSecs]);

  // Category ranked list (by classify label)
  const categoryRanked = useMemo(() => {
    const map = {};
    activeData.forEach(s => {
      const cls = classifySession(s);
      const label = cls.label;
      if (!map[label]) map[label] = { secs: 0, color: cls.color, Icon: cls.Icon };
      map[label].secs += (s.duration_seconds || 0);
    });
    const total = Object.values(map).reduce((a, v) => a + v.secs, 0) || 1;
    return Object.entries(map)
      .filter(([, v]) => v.secs > 0)
      .sort((a, b) => b[1].secs - a[1].secs)
      .slice(0, 10)
      .map(([label, value]) => ({
        label,
        secs: value.secs,
        pct: Math.round(value.secs / total * 100),
        color: value.color,
        Icon: value.Icon,
      }));
  }, [activeData]);

  // Apps ranked list
  const appsRanked = useMemo(() => {
    const map = {};
    activeData.forEach(s => {
      const entity = getTrackedEntity(s);
      if (!map[entity.key]) map[entity.key] = { secs: 0, sample: s, entity };
      if (!map[entity.key].sample?.url && s.url) map[entity.key].sample = s;
      map[entity.key].secs += (s.duration_seconds || 0);
    });
    const total = Object.values(map).reduce((a, v) => a + v.secs, 0) || 1;
    return Object.entries(map)
      .sort((a, b) => b[1].secs - a[1].secs)
      .slice(0, 12)
      .map(([, { secs, sample, entity }], i) => ({
        name: entity.label,
        secs,
        url: entity.url,
        secondaryLabel: entity.secondaryLabel,
        kind: entity.kind,
        pct:   Math.round(secs / total * 100),
        cls: classifySession(sample || { app_name: entity.appName, url: entity.url }),
        color: classifySession(sample || { app_name: entity.appName, url: entity.url }).color || '#6b7280',
        medal: ['🥇', '🥈', '🥉'][i] || null,
      }));
  }, [activeData]);

  const hourlyHeat = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, secs: 0 }));
    activeData.forEach(s => {
      const h = new Date((s.started_at || 0) * 1000).getHours();
      if (h >= 0 && h < 24) buckets[h].secs += (s.duration_seconds || 0);
    });
    const max = Math.max(...buckets.map(b => b.secs), 1);
    return buckets.map(b => ({ ...b, pct: Math.round((b.secs / max) * 100) }));
  }, [activeData]);

  const recentWindows = useMemo(() => {
    return [...activeData]
      .sort((a, b) => (b.started_at || 0) - (a.started_at || 0))
      .slice(0, 8)
      .map(s => ({ ...s, cls: classifySession(s) }));
  }, [activeData]);

  const bestDay = useMemo(() => {
    const byDay = {};
    activeData.forEach(s => {
      const dk = localDateStr(s.started_at || 0);
      byDay[dk] = (byDay[dk] || 0) + (s.duration_seconds || 0);
    });
    const [date, secs] = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || [];
    return date ? {
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      secs,
    } : null;
  }, [activeData]);

  const fmtH = secs => ((secs || 0) / 3600).toFixed(1) + 'h';
  const fmtM = secs => {
    const m = Math.round((secs || 0) / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
  };

  const barColor = '#7c6cf2';
  const deepSecs = typePie.find(t => t.type === 'deep')?.secs || 0;
  const distractedSecs = typePie.find(t => t.type === 'distraction')?.secs || 0;
  const meetingSecs = typePie.find(t => t.type === 'meeting')?.secs || 0;
  const shallowSecs = typePie.find(t => t.type === 'shallow')?.secs || 0;
  const focusScore = totalSecs > 0
    ? Math.max(0, Math.min(100, Math.round((deepSecs / totalSecs) * 100 - (distractedSecs / totalSecs) * 40 + Math.min(totalSecs / 3600, 6) * 3)))
    : 0;
  const focusLabel = focusScore >= 75 ? 'Strong focus' : focusScore >= 50 ? 'Balanced' : focusScore >= 25 ? 'Scattered' : 'Light signal';
  const contextSwitches = activeData.reduce((count, s, i, arr) => i > 0 && arr[i - 1].app_name !== s.app_name ? count + 1 : count, 0);
  const avgSessionMins = activeData.length ? Math.round((totalSecs / activeData.length) / 60) : 0;
  const topCategories = categoryRanked.slice(0, 6);
  const topApps = appsRanked.slice(0, 7);
  const dateRangeText = (() => {
    const f = new Date(from * 1000);
    const t = new Date(to * 1000);
    const left = f.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const right = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${left} - ${right}`;
  })();

  // ── Colour for focus-score badge ────────────────────────────────────────────
  const focusColor = focusScore >= 60 ? '#10b981' : focusScore >= 35 ? '#f59e0b' : '#ef4444';
  const peakHour   = hourlyHeat.reduce((mx, b) => b.secs > mx.secs ? b : mx, hourlyHeat[0]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 space-y-4">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">Activity Dashboard</h2>
            <p className="text-[11px] text-tx-faint mt-0.5 flex items-center gap-1.5">
              <span>{dateRangeText}</span>
              <span className="text-tx-faint/40">·</span>
              <span>{activeData.length.toLocaleString()} windows captured</span>
              {loading && (
                <span className="inline-flex items-center gap-1 text-accent animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent"/>refreshing
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Range pills */}
            <div className="flex rounded-lg border border-brd-default bg-bg-input p-0.5">
              {[
                { id: 'day',   label: 'Today'   },
                { id: 'week',  label: '7 Days'  },
                { id: 'month', label: '30 Days' },
              ].map(r => (
                <button key={r.id} onClick={() => setDashRange(r.id)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    dashRange === r.id
                      ? 'bg-accent text-white shadow-sm'
                      : 'act-filter-btn text-tx-faint'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            {
              label: 'Total Tracked',
              value: fmtH(totalSecs),
              sub: avgSessionMins > 0 ? `${avgSessionMins}m avg window` : 'No data yet',
              color: '#7c6cf2', Icon: Clock,
            },
            {
              label: 'Focus Score',
              value: String(focusScore),
              sub: focusLabel,
              color: focusColor, Icon: CheckCircle2,
            },
            {
              label: 'Deep Work',
              value: fmtH(deepSecs),
              sub: `${totalSecs ? Math.round(deepSecs / totalSecs * 100) : 0}% of tracked`,
              color: '#6366f1', Icon: Zap,
            },
            {
              label: 'Distractions',
              value: fmtH(distractedSecs),
              sub: `${totalSecs ? Math.round(distractedSecs / totalSecs * 100) : 0}% of tracked`,
              color: '#ef4444', Icon: AlertTriangle,
            },
            {
              label: 'App Switches',
              value: String(contextSwitches),
              sub: `${appsRanked.length} app${appsRanked.length !== 1 ? 's' : ''} used`,
              color: '#60a5fa', Icon: SlidersHorizontal,
            },
          ].map(kpi => (
            <div key={kpi.label}
              className="fl-card rounded-xl p-3.5 flex flex-col gap-2.5 min-w-0"
              style={{ borderLeft: `3px solid ${kpi.color}` }}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-tx-faint font-medium uppercase tracking-wider truncate">{kpi.label}</span>
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: kpi.color + '18' }}>
                  <kpi.Icon size={12} style={{ color: kpi.color }}/>
                </div>
              </div>
              <div>
                <p className="text-xl font-bold text-white leading-none">{kpi.value}</p>
                <p className="text-[10px] text-tx-faint mt-1 truncate">{kpi.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {totalSecs === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-brd-subtle/40 bg-bg-input/20">
            <div className="w-14 h-14 rounded-2xl bg-accent/8 flex items-center justify-center mb-4">
              <Activity size={22} className="text-accent opacity-40"/>
            </div>
            <p className="text-sm font-semibold text-tx-secondary">No activity data for this period</p>
            <p className="text-xs text-tx-faint mt-1.5">Auto-tracker records apps and websites every 4 seconds</p>
          </div>
        )}

        {/* ── Main content (only when data exists) ─────────────────────────── */}
        {totalSecs > 0 && (
          <>
            {/* ── Row 1: Bar chart + Type donut ── */}
            <div className="grid grid-cols-3 gap-4">

              {/* Bar chart — 2/3 */}
              <div className="col-span-2 fl-card rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {isDayView ? 'Hourly Activity' : 'Daily Activity'}
                    </p>
                    <p className="text-[10px] text-tx-faint mt-0.5">{fmtH(totalSecs)} tracked · {rangeLabel}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: barColor }}/>
                    <span className="text-[10px] text-tx-faint">hours</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={172}>
                  <BarChart data={barData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }} barCategoryGap="24%">
                    <defs>
                      <linearGradient id="dashBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#7c6cf2" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#7c6cf2" stopOpacity={0.35}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="label" tick={{ fill: '#5A6480', fontSize: 10 }} axisLine={false}
                      tickLine={false}
                      interval={isDayView ? 2 : (barData.length > 14 ? Math.floor(barData.length / 7) : 0)}/>
                    <YAxis tick={{ fill: '#5A6480', fontSize: 10 }} axisLine={false} tickLine={false}
                      unit="h" width={30}/>
                    <Tooltip
                      contentStyle={{
                        background: '#1A1D28',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 8, fontSize: 11, padding: '8px 12px',
                      }}
                      labelStyle={{ color: '#C4C8E0', marginBottom: 4, fontWeight: 600 }}
                      itemStyle={{ color: '#8090A8' }}
                      formatter={v => [`${v}h`, 'Time tracked']}
                      cursor={{ fill: 'rgba(124,108,242,0.04)' }}/>
                    <Bar dataKey="hours" fill="url(#dashBarGrad)" radius={[4, 4, 0, 0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Time by type donut — 1/3 */}
              <div className="fl-card rounded-xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-white">Time by Type</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(124,108,242,0.12)', color: '#9d8df5' }}>
                    {typePie.length} types
                  </span>
                </div>
                {typePie.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-tx-faint text-xs">No data</div>
                ) : (
                  <>
                    <div className="flex justify-center mb-3">
                      <DonutChart
                        segments={typePie.map(t => ({ value: t.secs, color: t.color }))}
                        size={148}
                        thickness={16}
                        centerLabel="Tracked"
                        centerValue={fmt(totalSecs)}
                      />
                    </div>
                    <div className="space-y-1 mt-auto">
                      {typePie.map((t, i) => (
                        <div key={i} className="act-list-row flex items-center gap-2 px-2 py-1.5 rounded-lg">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }}/>
                          <span className="text-[11px] text-tx-secondary flex-1 truncate">{t.label}</span>
                          <span className="text-[10px] text-tx-faint font-mono">{fmtM(t.secs)}</span>
                          <span className="text-[10px] font-bold w-8 text-right" style={{ color: t.color }}>{t.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Row 2: Focus Breakdown ── */}
            <div className="fl-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-accent/12 flex items-center justify-center">
                    <Filter size={13} className="text-accent"/>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white leading-tight">Focus Breakdown</p>
                    <p className="text-[10px] text-tx-faint leading-tight">How your active time was spent</p>
                  </div>
                </div>
                <span className="text-[10px] text-tx-faint">{fmtH(totalSecs)} active</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Deep Work',   secs: deepSecs,       color: '#6366f1', Icon: Zap,           desc: 'High-concentration work'  },
                  { label: 'Low Focus',   secs: shallowSecs,    color: '#64748b', Icon: Activity,      desc: 'Light tasks & browsing'   },
                  { label: 'Meetings',    secs: meetingSecs,    color: '#f87171', Icon: Users,         desc: 'Calls & collaborations'   },
                  { label: 'Distracted',  secs: distractedSecs, color: '#ef4444', Icon: AlertTriangle, desc: 'Off-task apps & sites'    },
                ].map(item => {
                  const pct = totalSecs ? Math.round(item.secs / totalSecs * 100) : 0;
                  return (
                    <div key={item.label}
                      className="rounded-xl border border-brd-subtle/60 bg-bg-input/40 p-3.5"
                      style={{ borderTop: `2px solid ${item.color}55` }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: item.color + '18' }}>
                          <item.Icon size={13} style={{ color: item.color }}/>
                        </div>
                        <span className="text-[11px] font-semibold text-white">{item.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-2.5">
                        <span className="text-lg font-bold text-white">{fmtM(item.secs)}</span>
                        <span className="text-[11px] font-semibold" style={{ color: item.color }}>{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-brd-default">
                        <div className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: `linear-gradient(90deg,${item.color}99,${item.color})` }}/>
                      </div>
                      <p className="text-[9px] text-tx-faint mt-2 truncate">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Row 3: Heatmap ── */}
            <div className="fl-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-accent/12 flex items-center justify-center">
                    <Clock size={13} className="text-accent"/>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white leading-tight">Hourly Activity Heatmap</p>
                    <p className="text-[10px] text-tx-faint leading-tight">
                      {hourlyHeat.some(b => b.secs > 0)
                        ? `Peak at ${peakHour.hour < 12 ? `${peakHour.hour || 12}${peakHour.hour < 12 ? 'am' : 'pm'}` : `${peakHour.hour === 12 ? 12 : peakHour.hour - 12}pm`} · local time`
                        : 'Local time'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-tx-faint">less</span>
                  {[0.05, 0.25, 0.50, 0.75, 1.0].map((o, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm"
                      style={{ background: `rgba(124,108,242,${o})` }}/>
                  ))}
                  <span className="text-[9px] text-tx-faint">more</span>
                </div>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                {hourlyHeat.map(bucket => (
                  <div key={bucket.hour} className="min-w-0 group">
                    <div
                      className="h-11 rounded-md border border-white/[0.04] transition-all duration-150 group-hover:border-accent/40 group-hover:scale-y-105 cursor-default"
                      title={`${String(bucket.hour).padStart(2,'0')}:00 — ${bucket.secs ? fmtM(bucket.secs) : 'No activity'}`}
                      style={{
                        background: bucket.secs
                          ? `rgba(124,108,242,${(0.12 + (bucket.pct / 100) * 0.78).toFixed(3)})`
                          : 'rgba(255,255,255,0.02)',
                      }}
                    />
                    {[0, 6, 12, 18, 23].includes(bucket.hour) && (
                      <p className="mt-1 text-center text-[9px] text-tx-faint leading-none">
                        {bucket.hour === 0 ? '12a' : bucket.hour === 12 ? '12p'
                          : bucket.hour < 12 ? `${bucket.hour}a` : `${bucket.hour - 12}p`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Row 4: Categories + Top Apps ── */}
            {(() => {
              // Rank badge — uniform size, number-only, tinted by position
              const RANK = [
                { bg: 'rgba(234,179,8,0.13)',   color: '#B45309', border: 'rgba(234,179,8,0.22)'   }, // 1st — amber
                { bg: 'rgba(148,163,184,0.11)', color: '#94A3B8', border: 'rgba(148,163,184,0.20)' }, // 2nd — slate
                { bg: 'rgba(249,115,22,0.11)',  color: '#C2410C', border: 'rgba(249,115,22,0.20)'  }, // 3rd — sienna
              ];
              const rankBadge = (i) => {
                const s = i < 3 ? RANK[i] : { bg: 'rgba(255,255,255,0.04)', color: '#4A5568', border: 'rgba(255,255,255,0.08)' };
                return (
                  <div
                    className="shrink-0 flex items-center justify-center rounded-md text-[10px] font-bold tabular-nums leading-none"
                    style={{ width: 20, height: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                    {i + 1}
                  </div>
                );
              };

              return (
                <div className="grid grid-cols-2 gap-4">

                  {/* ── Categories ── */}
                  <div className="fl-card rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-brd-subtle/70">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-accent/10 flex items-center justify-center">
                          <Filter size={10} className="text-accent"/>
                        </div>
                        <span className="text-[11px] font-semibold text-white">Categories</span>
                      </div>
                      <span className="text-[10px] text-tx-faint tabular-nums">{categoryRanked.length} types</span>
                    </div>

                    {categoryRanked.length === 0 ? (
                      <div className="px-4 py-8 text-tx-faint text-xs text-center">No category data</div>
                    ) : (
                      <div className="divide-y divide-brd-subtle/30">
                        {categoryRanked.map((cat, i) => (
                          <div key={i}
                            className="act-list-row flex items-center gap-2.5 px-3.5 py-2.5 group">

                            {/* Rank badge */}
                            {rankBadge(i)}

                            {/* Category icon */}
                            <div className="shrink-0 flex items-center justify-center rounded-lg"
                              style={{
                                width: 24, height: 24,
                                background: cat.color + '14',
                                border: `1px solid ${cat.color}22`,
                              }}>
                              {cat.Icon && <cat.Icon size={12} style={{ color: cat.color }}/>}
                            </div>

                            {/* Name + bar */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-[11px] font-medium text-tx-primary truncate leading-none">{cat.label}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] tabular-nums text-tx-faint">{fmtM(cat.secs)}</span>
                                  <span className="text-[10px] font-semibold tabular-nums w-[26px] text-right leading-none"
                                    style={{ color: cat.color }}>{cat.pct}%</span>
                                </div>
                              </div>
                              <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--act-detail-ring-track)' }}>
                                <div className="h-full rounded-full"
                                  style={{ width: `${cat.pct}%`, background: `linear-gradient(90deg,${cat.color}60,${cat.color}e0)` }}/>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Top Apps & Sites ── */}
                  <div className="fl-card rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-brd-subtle/70">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-accent/10 flex items-center justify-center">
                          <BarChart2 size={10} className="text-accent"/>
                        </div>
                        <span className="text-[11px] font-semibold text-tx-primary">Top Apps & Sites</span>
                      </div>
                      <span className="text-[10px] text-tx-faint tabular-nums">{appsRanked.length} tracked</span>
                    </div>

                    {appsRanked.length === 0 ? (
                      <div className="px-4 py-8 text-tx-faint text-xs text-center">No app data</div>
                    ) : (
                      <div className="divide-y divide-brd-subtle/30">
                        {appsRanked.map((app, i) => (
                          <div key={app.name + i}
                            className="act-list-row flex items-center gap-2.5 px-3.5 py-2.5 group">

                            {/* Rank badge */}
                            {rankBadge(i)}

                            {/* App icon */}
                            <AppIcon appName={app.secondaryLabel || app.name} url={app.url} size={22} radius={5}/>

                            {/* Name + bar */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                {/* Left: name + category pill */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[11px] font-medium text-tx-primary truncate leading-none">{app.name}</span>
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 leading-none"
                                    style={{ background: app.cls.color + '14', color: app.cls.color }}>
                                    {app.cls.label}
                                  </span>
                                </div>
                                {/* Right: time + % */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] tabular-nums text-tx-faint">{fmtM(app.secs)}</span>
                                  <span className="text-[10px] font-semibold tabular-nums w-[26px] text-right leading-none"
                                    style={{ color: app.cls.color }}>{app.pct}%</span>
                                </div>
                              </div>
                              {app.secondaryLabel && (
                                <p className="text-[9px] text-tx-faint truncate leading-none mb-1.5">{app.secondaryLabel}</p>
                              )}
                              <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--act-detail-ring-track)' }}>
                                <div className="h-full rounded-full"
                                  style={{ width: `${app.pct}%`, background: `linear-gradient(90deg,${app.cls.color}60,${app.cls.color}e0)` }}/>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}

            {/* ── Row 5: Insight trio ── */}
            <div className="grid grid-cols-3 gap-3">

              {/* Best day */}
              <div className="fl-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#f59e0b18' }}>
                    <Calendar size={12} style={{ color: '#f59e0b' }}/>
                  </div>
                  <p className="text-[11px] font-semibold text-white">Best Day</p>
                </div>
                <p className="text-2xl font-bold text-white leading-none">
                  {bestDay ? fmtH(bestDay.secs) : '—'}
                </p>
                <p className="text-[10px] text-tx-faint mt-1.5">
                  {bestDay?.date || 'No data yet'}
                </p>
              </div>

              {/* Avg window */}
              <div className="fl-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                    <Activity size={12} className="text-emerald-400"/>
                  </div>
                  <p className="text-[11px] font-semibold text-white">Avg Window</p>
                </div>
                <p className="text-2xl font-bold text-white leading-none">{avgSessionMins}m</p>
                <p className="text-[10px] text-tx-faint mt-1.5">{activeData.length.toLocaleString()} windows · {appsRanked.length} apps</p>
              </div>

              {/* Focus score */}
              <div className="fl-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: focusColor + '18' }}>
                    <Zap size={12} style={{ color: focusColor }}/>
                  </div>
                  <p className="text-[11px] font-semibold text-white">Focus Score</p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl font-bold text-white leading-none">{focusScore}</p>
                  <p className="text-[10px]" style={{ color: focusColor }}>/100</p>
                </div>
                <p className="text-[10px] text-tx-faint mt-1.5">{focusLabel}</p>
              </div>
            </div>

            {/* ── Row 6: Recent Windows ── */}
            <div className="fl-card rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-brd-subtle">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-accent/12 flex items-center justify-center">
                    <LayoutList size={11} className="text-accent"/>
                  </div>
                  <p className="text-xs font-semibold text-white">Recent Windows</p>
                </div>
                <span className="text-[10px] text-tx-faint">{recentWindows.length} latest</span>
              </div>
              <div className="divide-y divide-brd-subtle/40">
                {recentWindows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-tx-faint">No recent windows</div>
                ) : recentWindows.map((item, i) => (
                  <div key={`${item.started_at}-${i}`}
                    className="act-list-row grid grid-cols-[80px_minmax(0,1fr)_72px] items-center gap-3 px-4 py-2.5">
                    <span className="text-[10px] font-mono text-tx-faint">{fmtTime(item.started_at)}</span>
                    <div className="min-w-0 flex items-center gap-2">
                      <AppIcon appName={item.app_name} url={item.url} size={20} radius={5}/>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[11px] font-semibold text-tx-primary">{item.app_name || 'Unknown'}</p>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold shrink-0"
                            style={{ background: item.cls.color + '18', color: item.cls.color }}>
                            {item.cls.label}
                          </span>
                        </div>
                        {(item.window_title || item.url) && (
                          <p className="truncate text-[10px] text-tx-faint">{item.window_title || item.url}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-right text-[10px] font-mono text-tx-secondary">{fmtM(item.duration_seconds)}</span>
                  </div>
                ))}
              </div>
            </div>

          </>
        )}

      </div>
    </div>
  );
}

// ─── Apps Analytics View ─────────────────────────────────────────────────────
// Completely different from Inbox — shows aggregated per-app usage as a ranked
// list with category badges, time bars, and a category breakdown summary.
function AppsView({ autoData, dateKey }) {
  const active = autoData.filter(s => !s.is_idle && s.duration_seconds > 0);

  // Per-entity totals
  const appMap = {};
  active.forEach(s => {
    const entity = getTrackedEntity(s);
    if (!appMap[entity.key]) {
      appMap[entity.key] = {
        app: entity.label,
        appName: entity.appName,
        secondaryLabel: entity.secondaryLabel,
        kind: entity.kind,
        secs: 0,
        cls: classifySession(s),
        url: entity.url || '',
        hits: 0,
      };
    }
    if (!appMap[entity.key].url && entity.url) appMap[entity.key].url = entity.url;
    appMap[entity.key].secs += s.duration_seconds;
    appMap[entity.key].hits += 1;
  });
  const appList = Object.values(appMap).sort((a, b) => b.secs - a.secs);
  const grandTotal = appList.reduce((s, a) => s + a.secs, 0);

  // Category totals for summary bar
  const catMap = {};
  appList.forEach(a => {
    const lbl = a.cls.label;
    if (!catMap[lbl]) catMap[lbl] = { label: lbl, secs: 0, color: a.cls.color, type: a.cls.type };
    catMap[lbl].secs += a.secs;
  });
  const catList = Object.values(catMap).sort((a, b) => b.secs - a.secs);

  if (!appList.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-tx-faint text-sm">
        No app usage data for {dateKey}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
      {/* ── Category breakdown bar ── */}
      <div className="fl-card rounded-xl p-4">
        <p className="text-[10px] text-tx-faint uppercase tracking-wider font-semibold mb-3">Category Breakdown</p>
        {/* Stacked bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex mb-3 bg-brd-default">
          {catList.map(c => grandTotal > 0 && (
            <div key={c.label}
              style={{ width: `${(c.secs / grandTotal) * 100}%`, background: c.color }}
              title={`${c.label}: ${fmt(c.secs)}`}
              className="h-full transition-all"/>
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {catList.map(c => (
            <div key={c.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }}/>
              <span className="text-[11px] text-tx-secondary">{c.label}</span>
              <span className="text-[11px] font-semibold text-white">{fmt(c.secs)}</span>
              <span className="text-[10px] text-tx-faint">
                {grandTotal > 0 ? `${Math.round((c.secs / grandTotal) * 100)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ranked app list ── */}
      <div className="fl-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brd-default">
          <p className="text-[10px] text-tx-faint uppercase tracking-wider font-semibold">
            Apps & Processes — {appList.length} tracked
          </p>
          <span className="text-[10px] text-tx-faint">Total: {fmt(grandTotal)}</span>
        </div>
        <div className="divide-y divide-brd-subtle">
          {appList.map((a, i) => {
            const pct = grandTotal > 0 ? (a.secs / grandTotal) * 100 : 0;
            const { Icon } = a.cls;
            return (
              <div key={a.app} className="act-list-row flex items-center gap-3 px-4 py-2.5">
                {/* Rank */}
                <span className="w-5 text-[10px] text-tx-faint font-mono shrink-0 text-right">{i + 1}</span>
                {/* App icon */}
                <AppIcon appName={a.appName} url={a.url} size={28} radius={7} />
                {/* Name + category */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-tx-primary truncate">{a.app}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{ background: `${a.cls.color}18`, color: a.cls.color }}>
                      {a.cls.label}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.14em] text-tx-faint shrink-0">{a.kind}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-tx-faint">
                    {a.secondaryLabel && <span className="truncate">{a.secondaryLabel}</span>}
                    <span>{a.hits} event{a.hits !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Time bar */}
                  <div className="mt-1 w-full h-1.5 bg-brd-default rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: a.cls.color }}/>
                  </div>
                </div>
                {/* Time + pct */}
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-semibold text-white">{fmt(a.secs)}</p>
                  <p className="text-[10px] text-tx-faint">{Math.round(pct)}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ActivityPage({ user }) {
  const [autoData,     setAutoData]     = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [clients,      setClients]      = useState([]);
  const [calEvents,    setCalEvents]    = useState([]);  // calendar / focus sessions for grouping
  const [loading,      setLoading]      = useState(true);
  const [dateKey,      setDateKey]      = useState(localDateStr());
  const [live,         setLive]         = useState(null);
  const [isIdle,       setIsIdle]       = useState(false);
  const [tab,          setTab]          = useState('timeline'); // 'timeline'|'inbox'|'apps'|'dashboard'
  const [selectedId,   setSelectedId]   = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [inboxFilter,  setInboxFilter]  = useState('all'); // 'all'|'unreviewed'|'accepted'
  const [typeFilter,   setTypeFilter]   = useState('all'); // 'all'|'deep'|'shallow'|'meeting'|'distraction'
  const [search,       setSearch]       = useState('');
  const [savedMeta,    setSavedMeta]    = useState({});

  const isToday = dateKey === localDateStr();

  // Load everything
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Day boundaries for sessions query
      const dayTs = new Date(dateKey); dayTs.setHours(0, 0, 0, 0);
      const dayFrom = Math.floor(dayTs.getTime() / 1000);
      const dayTo   = dayFrom + 86400;

      const [auto, projs, cls, sessions, calList] = await Promise.all([
        api.autoSessionsByDate?.({ userId: user.id, dateKey }),
        api.listProjects?.({ userId: user.id }),
        api.listClients?.({ userId: user.id }),
        // includeAutoBlocks=false so __auto_block: rows stay out of the calendar view.
        // We merge auto-block sessions separately only when building block groups.
        api.listSessions?.({ userId: user.id, from: dayFrom, to: dayTo, includeAutoBlocks: false }).catch(() => []),
        // Real calendar events (from calendar_events table — Google, iCal, etc.)
        api.calendarList?.({ userId: user.id, from: dayFrom, to: dayTo }).catch(() => []),
      ]);

      const meta = loadMeta(user.id, dateKey);
      setAutoData(auto || []);
      setProjects(projs || []);
      setClients(cls || []);
      setSavedMeta(meta);

      // ── Build unified calEvents for timeline grouping ──────────────────────
      // 1. Manual / focus sessions (already excludes __auto_block: rows)
      const focusSessions = (sessions || []).filter(s => s.started_at && s.ended_at);

      // 2. Track which calendar_event IDs are already represented by a linked
      //    session row (notes = '__cal_event:<id>') so we don't double-render.
      const linkedCalIds = new Set(
        focusSessions
          .map(s => { const m = String(s.notes || '').match(/^__cal_event:(.+)$/); return m?.[1]; })
          .filter(Boolean)
      );

      // 3. Normalize calendar events → unified shape with started_at / ended_at.
      //    Skip events that are already covered by a linked session row.
      //    Also skip all-day events (no useful time range).
      const nowSec = Math.floor(Date.now() / 1000);
      const normalizedCal = (calList || [])
        .filter(e =>
          e.start_time && e.end_time &&
          e.end_time <= nowSec &&      // only past/ongoing events (not future scheduled)
          !e.all_day &&
          !linkedCalIds.has(e.id)
        )
        .map(e => ({
          // Common shape shared with focusSessions:
          id:           `calev_${e.id}`,
          started_at:   e.start_time,
          ended_at:     e.end_time,
          title:        e.title_override || e.title || 'Calendar Event',
          category:     e.meeting_url ? 'Meeting' : 'Calendar',
          category_name: e.meeting_url ? 'Meeting' : 'Calendar',
          color:        e.color || e.source_color || '#6366f1',
          source:       'calendar',
          meeting_url:  e.meeting_url || null,
          // passthrough fields for EventGroupHeader
          _calEvent:    true,
        }));

      // 4. Merge: focus sessions first (higher priority), then calendar events
      setCalEvents([...focusSessions, ...normalizedCal]);
    } catch (err) {
      console.error('[Activity] load failed:', err);
      setAutoData(prev => prev.length ? prev : []);
    } finally {
      setLoading(false);
    }
  }, [user.id, dateKey]);

  useEffect(() => { load(); setSelectedId(null); setSelectedEventId(null); }, [load]);

  // Live tracker
  useEffect(() => {
    const poll = async () => {
      try {
        const info = await api.autoSessionsLive?.({ userId: user.id });
        setLive(info || null);
      } catch {
        // silently ignore live-poll failures (transient IPC errors)
      }
    };
    poll();
    const t = setInterval(poll, 4000);
    const offHB = api.onTrackerHeartbeat?.((d) => { setLive(d); setIsIdle(false); });
    const offI  = api.onTrackerIdle?.(() => setIsIdle(true));
    const offR  = api.onTrackerResume?.(() => { setIsIdle(false); if(isToday) load(); });
    return () => { clearInterval(t); offHB?.(); offI?.(); offR?.(); };
  }, [user.id, isToday, load]);

  // Build blocks
  const blocks = useMemo(
    () => buildBlocks(autoData, projects, clients, savedMeta),
    [autoData, projects, clients, savedMeta]
  );

  const selectedBlock = blocks.find(b => b.id === selectedId) || null;
  const editingBlock  = blocks.find(b => b.id === editingId)  || null;
  const eventRows = useMemo(() => {
    // Merge consecutive raw tracker rows for the same app/site into a single
    // entry (the tracker heartbeats periodically, so one continuous stretch
    // of using the same app can otherwise show up as many duplicate rows).
    const chronological = [...autoData]
      .filter(s => !s.is_idle && (s.duration_seconds || 0) > 0)
      .sort((a, b) => (a.started_at || 0) - (b.started_at || 0));

    const merged = [];
    for (const s of chronological) {
      const domain = safeHostname(s.url || '');
      const last   = merged[merged.length - 1];
      const sameEntity = last && last.app_name === s.app_name && (last.domain || '') === domain;
      if (sameEntity) {
        last.duration_seconds = (last.duration_seconds || 0) + (s.duration_seconds || 0);
        if (!last.window_title && s.window_title) last.window_title = s.window_title;
        if (!last.url && s.url) last.url = s.url;
      } else {
        merged.push({ ...s, domain });
      }
    }

    return merged
      .sort((a, b) => (b.started_at || 0) - (a.started_at || 0))
      .map(item => ({
        ...item,
        cls: classifySession(item),
        domain: item.domain || safeHostname(item.url || ''),
        deviceLabel: item.url ? 'Desktop website' : 'Desktop app',
      }));
  }, [autoData]);
  const selectedEvent = eventRows.find(item => item.id === selectedEventId) || null;

  // Meta update helpers
  const updateMeta = useCallback((id, patch) => {
    setSavedMeta(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      saveMeta(user.id, dateKey, next);
      return next;
    });
  }, [user.id, dateKey]);

  const handleAccept = useCallback((id) => {
    updateMeta(id, { status: 'accepted' });
    if (selectedId === id) setSelectedId(null);

    // Persist auto-detected project/client to the sessions table so that
    // Projects, Clients, and Goals pages correctly reflect tracked time.
    const blk = blocks.find(b => b.id === id);
    if (blk && (blk.projectId || blk.clientId)) {
      const payload = {
        userId:    user.id,
        blockId:   id,
        projectId: blk.projectId  || null,
        clientId:  blk.clientId   || null,
        task:      blk.task       || null,
        startedAt: blk.started_at,
        endedAt:   blk.ended_at,
        duration:  blk.totalDuration,
        type:      blk.cls.type,
        note:      blk.note       || null,
      };
      api.autoSaveBlock?.(payload)?.catch(err => console.warn('autoSaveBlock (accept) failed', err));
    }
  }, [updateMeta, selectedId, blocks, user.id]);

  const handleSaveEdit = useCallback((id, data) => {
    updateMeta(id, data);
    setEditingId(null);

    // Always persist to the sessions table so Projects, Clients, Tasks and
    // Goals pages reflect tracked time — including when the user clears a
    // project/client assignment (data.projectId === '' must be saved as null,
    // not silently kept from the previous blk value).
    const blk = blocks.find(b => b.id === id);
    if (blk) {
      const payload = {
        userId:    user.id,
        blockId:   id,
        projectId: data.projectId  || null,
        clientId:  data.clientId   || null,
        taskId:    data.taskId     || null,
        task:      data.task       || blk.task  || null,
        startedAt: blk.started_at,
        endedAt:   blk.ended_at,
        duration:  blk.totalDuration,
        type:      blk.cls.type,
        note:      data.note       || blk.note  || null,
        prevTaskId: blk.taskId     || null,
      };
      api.autoSaveBlock?.(payload)?.catch(err => console.warn('autoSaveBlock failed', err));
    }
  }, [updateMeta, blocks, user.id]);

  const handleSaveEvent = useCallback(async ({ sessionId, appName, windowTitle, url, categoryKey, categoryLabel }) => {
    try {
      await api.updateAutoSession?.({ sessionId, appName, windowTitle, url, categoryKey, categoryLabel });
      setAutoData(prev => prev.map(item => item.id === sessionId ? {
        ...item,
        app_name: appName,
        window_title: windowTitle,
        url,
        ai_category: categoryKey,
        ai_label: categoryLabel,
      } : item));
    } catch (err) {
      console.error('[Activity] handleSaveEvent failed:', err);
    }
  }, []);

  const handleSaveCategoryBulk = useCallback(async ({ appName, categoryKey, categoryLabel, scope }) => {
    const dayTs = new Date(dateKey);
    dayTs.setHours(0, 0, 0, 0);
    const todayFrom = Math.floor(dayTs.getTime() / 1000);
    try {
      await api.updateAutoSessionByApp?.({
        userId: user.id,
        appName,
        categoryKey,
        categoryLabel,
        scope,
        todayFrom,
        todayTo: todayFrom + 86400,
      });
      // Immediately reflect changes in local state for instant UI feedback
      setAutoData(prev => prev.map(item => {
        if (item.app_name !== appName) return item;
        if (scope === 'today') {
          const ts = item.started_at || 0;
          if (ts < todayFrom || ts >= todayFrom + 86400) return item;
        }
        return { ...item, ai_category: categoryKey, ai_label: categoryLabel };
      }));
    } catch (err) {
      console.error('[Activity] handleSaveCategoryBulk failed:', err);
    }
  }, [user.id, dateKey]);

  const handleDeleteEvent = useCallback(async (sessionId) => {
    try {
      await api.deleteAutoSession?.({ sessionId });
      setAutoData(prev => prev.filter(item => item.id !== sessionId));
      setSelectedEventId(prev => prev === sessionId ? null : prev);
    } catch (err) {
      console.error('[Activity] handleDeleteEvent failed:', err);
    }
  }, []);

  const handleCreateClientKeyword = useCallback(async (name, keyword) => {
    try {
      const created = await api.createClient?.({
        userId: user.id,
        name: name || keyword,
        keywords: keyword,
        color: '#6366f1',
        billingType: 'none',
        status: 'active',
      });
      if (created) setClients(prev => [...prev, created]);
    } catch (err) {
      console.error('[Activity] createClient failed:', err);
    }
  }, [user.id]);

  const handleCreateProjectKeyword = useCallback(async (name, keyword) => {
    try {
      const created = await api.createProject?.({
        userId: user.id,
        name: name || keyword,
        keywords: keyword,
        color: '#3b82f6',
        status: 'active',
      });
      if (created) setProjects(prev => [...prev, created]);
    } catch (err) {
      console.error('[Activity] createProject failed:', err);
    }
  }, [user.id]);

  const handleCreateTaskKeyword = useCallback(async (title, keyword) => {
    try {
      await api.createTask?.({
        userId: user.id,
        title: title || keyword,
        keywords: keyword,
        status: 'todo',
        priority: 3,
      });
    } catch (err) {
      console.error('[Activity] createTask failed:', err);
    }
  }, [user.id]);

  // Accept all — marks every unreviewed block as accepted AND persists each
  // block that has a project/client to the sessions DB so that Projects,
  // Clients, and Goals pages reflect the tracked time.
  const acceptAll = () => {
    const next    = { ...savedMeta };
    const toSync  = [];
    blocks.filter(b => b.status === 'unreviewed').forEach(b => {
      next[b.id] = { ...next[b.id], status: 'accepted' };
      if (b.projectId || b.clientId) toSync.push(b);
    });
    setSavedMeta(next);
    saveMeta(user.id, dateKey, next);
    // Fire-and-forget DB sync for each qualifying block
    toSync.forEach(blk => {
      api.autoSaveBlock?.({
        userId:    user.id,
        blockId:   blk.id,
        projectId: blk.projectId  || null,
        clientId:  blk.clientId   || null,
        task:      blk.task       || null,
        startedAt: blk.started_at,
        endedAt:   blk.ended_at,
        duration:  blk.totalDuration,
        type:      blk.cls.type,
        note:      blk.note       || null,
      })?.catch(err => console.warn('[Activity] autoSaveBlock (acceptAll) failed:', err));
    });
  };

  // Filtered blocks (timeline + inbox + type filter)
  const filteredBlocks = useMemo(() => {
    let base = blocks;
    // Type filter (timeline tab)
    if ((tab === 'timeline') && typeFilter !== 'all') {
      base = base.filter(b => b.cls.type === typeFilter);
    }
    // Inbox status + search filter
    if (tab === 'inbox') {
      base = base.filter(b => {
        const matchFilter = inboxFilter === 'all' || b.status === inboxFilter;
        const matchSearch = !search
          || b.primaryApp.toLowerCase().includes(search.toLowerCase())
          || (b.project||'').toLowerCase().includes(search.toLowerCase())
          || (b.client||'').toLowerCase().includes(search.toLowerCase())
          || (b.task||'').toLowerCase().includes(search.toLowerCase());
        return matchFilter && matchSearch;
      });
    }
    return base;
  }, [blocks, tab, typeFilter, inboxFilter, search]);

  // Event-grouped view for the timeline tab (groups blocks by calendar session)
  const eventGroups = useMemo(
    () => buildEventGroups(filteredBlocks, calEvents),
    [filteredBlocks, calEvents]
  );

  // Summary stats
  const totalSecs    = blocks.reduce((a,b)=>a+b.totalDuration, 0);
  const deepSecs     = blocks.filter(b=>b.cls.type==='deep').reduce((a,b)=>a+b.totalDuration, 0);
  const shallowSecs  = blocks.filter(b=>b.cls.type==='shallow').reduce((a,b)=>a+b.totalDuration, 0);
  const meetingSecs  = blocks.filter(b=>b.cls.type==='meeting').reduce((a,b)=>a+b.totalDuration, 0);
  const distractSecs = blocks.filter(b=>b.cls.type==='distraction').reduce((a,b)=>a+b.totalDuration, 0);
  const unreviewed   = blocks.filter(b=>b.status==='unreviewed').length;

  const goDay = delta => {
    if (loading) return;                            // ignore while a load is in flight
    const d = new Date(dateKey);
    d.setDate(d.getDate() + delta);
    const n = localDateStr(Math.floor(d.getTime() / 1000));
    if (n <= localDateStr()) setDateKey(n);
  };
  const goToday = () => { if (!loading) setDateKey(localDateStr()); };

  // Find the live block (last block if tracking today)
  const liveBlockId = isToday && live?.appName && !isIdle && blocks.length
    ? blocks[blocks.length - 1].id : null;

  // Date label
  const dateLabel = (() => {
    const today = localDateStr();
    const yest  = (() => { const d=new Date(); d.setDate(d.getDate()-1); return localDateStr(Math.floor(d/1000)); })();
    if (dateKey === today) return `Today · ${new Date().toLocaleDateString('en', {month:'short', day:'numeric'})}`;
    if (dateKey === yest)  return `Yesterday · ${new Date(dateKey).toLocaleDateString('en', {month:'short', day:'numeric'})}`;
    return new Date(dateKey).toLocaleDateString('en', { weekday:'short', month:'short', day:'numeric' });
  })();

  return (
    <div className="fl-page">
      <div className="fl-work-surface flex flex-col">

        {/* ── Header ── */}
        <div className="fl-page-toolbar justify-between">
          {/* Left: icon + title + subtitle */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent shrink-0">
              <Radio size={15}/>
            </div>
            <div>
              <h1 className="text-sm font-bold text-tx-primary leading-tight">Activity</h1>
              <p className="text-[10px] text-tx-faint leading-tight">Track, review and optimize how your time flows.</p>
            </div>
          </div>

          {/* Center: tabs */}
          <div className="flex gap-0 rounded-lg border border-brd-default bg-bg-input p-0.5">
            {[
              { id: 'timeline',  Icon: LayoutList,  label: 'Timeline'  },
              { id: 'inbox',     Icon: Inbox,        label: 'Inbox',    badge: unreviewed },
              { id: 'apps',      Icon: BarChart2,    label: 'Apps'      },
              { id: 'events',    Icon: Clock,        label: 'Event Log' },
              { id: 'dashboard', Icon: TrendingUp,   label: 'Dashboard' },
            ].map(({ id, Icon, label, badge }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`act-tab-btn relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium ${
                  tab === id ? 'is-active shadow-sm' : 'text-tx-faint'
                }`}>
                <Icon size={11}/>{label}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold"
                    style={{ background: '#f59e0b', color: '#000' }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: date nav + refresh */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-bg-input border border-brd-default rounded-lg px-1 py-1">
              <button onClick={() => goDay(-1)} disabled={loading}
                className="act-nav-btn w-6 h-6 flex items-center justify-center rounded text-tx-secondary hover:text-tx-primary transition-all disabled:opacity-30">
                <ChevronLeft size={12}/>
              </button>
              <input type="date" value={dateKey} max={localDateStr()}
                disabled={loading}
                onChange={e => { if (!loading) setDateKey(e.target.value); }}
                className="bg-transparent text-xs text-tx-primary focus:outline-none px-1 disabled:opacity-50"/>
              <button onClick={() => goDay(1)} disabled={isToday || loading}
                className="act-nav-btn w-6 h-6 flex items-center justify-center rounded text-tx-secondary hover:text-tx-primary transition-all disabled:opacity-30">
                <ChevronRight size={12}/>
              </button>
            </div>
            {!isToday && (
              <button onClick={goToday}
                className="act-nav-btn text-[10px] text-tx-faint hover:text-tx-primary px-2.5 py-1.5 rounded-lg bg-bg-input border border-brd-default hover:border-brd-hover transition-all">
                Today
              </button>
            )}
            <button onClick={load} disabled={loading}
              className="act-nav-btn w-8 h-8 flex items-center justify-center rounded-lg border border-brd-default bg-bg-input text-tx-secondary hover:text-tx-primary hover:border-brd-hover transition-all disabled:opacity-40"
              title="Refresh">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>
        </div>

        {/* ── Dashboard tab ── */}
        {tab === 'dashboard' && (
          <div className="flex-1 overflow-hidden">
            <ActivityDashboard user={user}/>
          </div>
        )}

        {tab !== 'dashboard' && (
          <>
            {/* ── KPI stat bar ── */}
            <div className="flex items-stretch gap-0 border-b border-brd-subtle shrink-0 overflow-x-auto">
              {/* Live / captured cell */}
              <div className="flex items-center gap-3 px-4 py-3 min-w-[220px]" style={{ borderRight: '1px solid var(--act-kpi-cell-border)' }}>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isToday && !isIdle && live?.appName
                    ? <span className="flex items-center gap-1.5 text-[10px] font-bold text-status-green bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot"/>LIVE
                      </span>
                    : isToday && isIdle
                      ? <span className="flex items-center gap-1 text-[10px] text-tx-faint px-2 py-0.5 rounded-full border border-brd-subtle">
                          <Moon size={9}/>Idle
                        </span>
                      : null
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-tx-primary truncate leading-snug">
                    {isToday && live?.appName && !isIdle ? live.appName : 'Overview'}
                  </p>
                  <p className="text-[10px] text-tx-faint truncate leading-snug">
                    <span className="font-medium text-tx-muted">{fmt(totalSecs)}</span>
                    {' '}captured · {blocks.length} block{blocks.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Metric cells */}
              {[
                { label:'Deep Work',  secs: deepSecs,     color:'#818cf8', pct: totalSecs > 0 ? Math.round(deepSecs/totalSecs*100) : 0,     Icon: Zap      },
                { label:'Low Focus',  secs: shallowSecs,  color:'#64748b', pct: totalSecs > 0 ? Math.round(shallowSecs/totalSecs*100) : 0,  Icon: Activity },
                { label:'Meetings',   secs: meetingSecs,  color:'#f87171', pct: totalSecs > 0 ? Math.round(meetingSecs/totalSecs*100) : 0,  Icon: Users    },
                { label:'Total Time', secs: totalSecs,    color:'#9CA3AF', pct: null,                                                        Icon: Clock    },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 px-4 py-3 shrink-0 group"
                  style={{ borderRight: '1px solid var(--act-kpi-cell-border)' }}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-colors"
                    style={{ background: `${s.color}14`, border: `1px solid ${s.color}28` }}>
                    <s.Icon size={12} style={{ color: s.color }}/>
                  </div>
                  <div>
                    <p className="text-[10px] text-tx-faint leading-none mb-1">{s.label}</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-bold text-tx-primary tabular-nums leading-none">{fmt(s.secs)}</span>
                      {s.pct !== null && s.secs > 0 && (
                        <span className="text-[10px] font-semibold tabular-nums leading-none" style={{ color: s.color }}>
                          {s.pct}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <LoadingState label="Loading activity…" size={20} className="text-tx-faint" />
              </div>
            ) : blocks.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-tx-faint">
                <Monitor size={32} className="mb-2 opacity-12"/>
                <p className="text-sm font-medium text-tx-secondary">No activity recorded for {dateKey}</p>
                <p className="text-xs text-tx-faint">Auto-tracker records apps and websites every 4 seconds</p>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">

                {/* ── Left panel ── */}
                <div className={`flex flex-col overflow-hidden transition-all ${(selectedBlock || selectedEvent) ? 'w-[60%]' : 'w-full'}`}>

                  {/* Timeline visual (timeline + inbox tabs) */}
                  {(tab === 'timeline' || tab === 'inbox') && (
                    <div className="border-b border-brd-subtle shrink-0">
                      <Timeline
                        blocks={blocks} selectedId={selectedId}
                        onSelect={id => setSelectedId(prev => prev===id ? null : id)}
                        live={live} isLive={isToday && !isIdle}/>
                    </div>
                  )}

                  {/* ── Filter / toolbar bar ── */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-brd-subtle shrink-0 bg-bg-sidebar/30">
                    {tab === 'timeline' && (
                      <>
                        {/* Type filters */}
                        <div className="flex items-center gap-1">
                          {[
                            { id: 'all',         label: 'All Activity', Icon: LayoutList    },
                            { id: 'deep',        label: 'Focus',        Icon: Zap           },
                            { id: 'shallow',     label: 'Low Focus',    Icon: Activity      },
                            { id: 'meeting',     label: 'Meetings',     Icon: Users         },
                            { id: 'distraction', label: 'Distractions', Icon: AlertTriangle },
                          ].map(f => (
                            <button key={f.id} onClick={() => setTypeFilter(f.id)}
                              className={`act-filter-btn flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${
                                typeFilter === f.id ? 'is-active' : 'text-tx-faint'
                              }`}>
                              <f.Icon size={10}/>{f.label}
                            </button>
                          ))}
                        </div>
                        {/* Date label */}
                        <span className="text-[10px] text-tx-faint">{dateLabel}</span>
                      </>
                    )}

                    {tab === 'inbox' && (
                      <>
                        {/* Inbox filters + search */}
                        <div className="flex items-center gap-2 flex-1">
                          <div className="fl-inbox-tabs flex items-center gap-1 bg-bg-input border border-brd-default rounded-lg p-0.5">
                            {[
                              { id: 'all',        label: 'All',      count: blocks.length },
                              { id: 'unreviewed', label: 'To Review', count: blocks.filter(b=>b.status==='unreviewed').length },
                              { id: 'accepted',   label: 'Done',      count: blocks.filter(b=>b.status==='accepted'||b.status==='edited').length },
                            ].map(f => (
                              <button key={f.id} onClick={() => setInboxFilter(f.id)}
                                className={`act-inbox-tab flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium ${
                                  inboxFilter === f.id ? 'is-active shadow-sm' : 'text-tx-faint'
                                }`}>
                                {f.label}
                                {f.count > 0 && (
                                  <span className={`text-[10px] px-1 rounded min-w-[16px] text-center ${
                                    inboxFilter === f.id
                                      ? f.id === 'unreviewed' ? 'bg-amber-500/20 text-amber-400' : 'bg-accent/10 text-tx-secondary'
                                      : 'bg-brd-default/40 text-tx-faint'
                                  }`}>{f.count}</span>
                                )}
                              </button>
                            ))}
                          </div>
                          <div className="relative flex-1 max-w-xs">
                            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-faint pointer-events-none"/>
                            <input value={search} onChange={e => setSearch(e.target.value)}
                              placeholder="Search…"
                              className="w-full bg-bg-input border border-brd-default rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-tx-primary placeholder-tx-faint focus:outline-none focus:border-accent transition-colors"/>
                            {search && (
                              <button onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-tx-faint hover:text-tx-primary">
                                <X size={10}/>
                              </button>
                            )}
                          </div>
                        </div>
                        {unreviewed > 0 && (
                          <button onClick={acceptAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold ml-2 shrink-0"
                            style={{ background: '#10b98115', border:'1px solid #10b98130', color:'#10b981' }}>
                            <CheckCircle2 size={10}/>Accept All
                          </button>
                        )}
                      </>
                    )}

                    {tab === 'apps' && (
                      <span className="text-[10px] text-tx-faint">{dateLabel}</span>
                    )}

                    {tab === 'events' && (
                      <span className="text-[10px] text-tx-faint">{dateLabel}</span>
                    )}
                  </div>

                  {/* ── Block list / Apps view ── */}
                  {tab === 'apps' ? (
                    <AppsView autoData={autoData} dateKey={dateKey}/>
                  ) : tab === 'events' ? (
                    <EventLogView
                      events={eventRows}
                      selectedId={selectedEventId}
                      onSelect={id => setSelectedEventId(prev => prev === id ? null : id)}
                    />
                  ) : (
                    <div className="flex-1 overflow-y-auto">
                      {tab === 'timeline' ? (
                        /* ── Event-grouped timeline ── */
                        filteredBlocks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-tx-faint py-16">
                            <Activity size={28} className="mb-2 opacity-20"/>
                            <p className="text-xs text-tx-secondary">No blocks match this filter</p>
                          </div>
                        ) : eventGroups.map(group => (
                          <EventGroupSection
                            key={group.key}
                            group={group}
                            selectedId={selectedId}
                            liveBlockId={liveBlockId}
                            onSelect={id => setSelectedId(prev => prev === id ? null : id)}
                            onAccept={handleAccept}
                            onEdit={id => setEditingId(id)}
                          />
                        ))
                      ) : (
                        /* ── Inbox flat list ── */
                        filteredBlocks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-tx-faint py-16">
                            <Activity size={28} className="mb-2 opacity-20"/>
                            <p className="text-xs text-tx-secondary">No blocks match this filter</p>
                          </div>
                        ) : filteredBlocks.map((blk, idx) => {
                          const prev = filteredBlocks[idx - 1];
                          const gap  = prev ? blk.started_at - prev.ended_at : 0;
                          return (
                            <React.Fragment key={blk.id}>
                              {gap > 300 && (
                                <div className="flex items-center gap-2 py-1 px-4">
                                  <div className="flex-1 border-t border-dashed border-brd-subtle/40"/>
                                  <span className="flex items-center gap-1 text-[10px] text-tx-faint shrink-0">
                                    <Moon size={8}/>{fmt(gap)} gap
                                  </span>
                                  <div className="flex-1 border-t border-dashed border-brd-subtle/40"/>
                                </div>
                              )}
                              <BlockCard
                                blk={blk}
                                selected={selectedId === blk.id}
                                isLive={blk.id === liveBlockId}
                                onClick={() => setSelectedId(prev => prev === blk.id ? null : blk.id)}
                                onAccept={handleAccept}
                                onEdit={id => setEditingId(id)}
                              />
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* ── Right: Block detail sidebar ── */}
                {selectedBlock && (tab === 'timeline' || tab === 'inbox') && (
                  <div className="flex-1 overflow-hidden min-w-0">
                    <BlockDetail
                      blk={selectedBlock}
                      blocks={blocks}
                      totalSecs={totalSecs}
                      isLive={selectedBlock.id === liveBlockId}
                      liveElapsed={live?.elapsed || 0}
                      onClose={() => setSelectedId(null)}
                      onAccept={handleAccept}
                      onEdit={id => setEditingId(id)}
                    />
                  </div>
                )}
                {selectedEvent && tab === 'events' && (
                  <div className="flex-1 overflow-hidden min-w-0">
                    <EventDetailPanel
                      item={selectedEvent}
                      onClose={() => setSelectedEventId(null)}
                      onSave={handleSaveEvent}
                      onSaveCategoryBulk={handleSaveCategoryBulk}
                      onDelete={handleDeleteEvent}
                      onCreateClientKeyword={handleCreateClientKeyword}
                      onCreateProjectKeyword={handleCreateProjectKeyword}
                      onCreateTaskKeyword={handleCreateTaskKeyword}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Edit modal ── */}
        {editingBlock && (
          <EditModal
            blk={editingBlock}
            projects={projects}
            clients={clients}
            userId={user.id}
            onClose={() => setEditingId(null)}
            onSave={data => handleSaveEdit(editingBlock.id, data)}
          />
        )}
      </div>
    </div>
  );
}
