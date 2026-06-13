/**
 * Context Compression Engine
 * Transforms raw, noisy auto-session tracking data into clean, weighted
 * workflow signals. Primary data ingestion layer for all reasoning engines.
 * No LLMs required — signal extraction and noise reduction.
 */

import { APP_CATEGORIES, DOMAIN_TOPICS, extractWindowTitlePhrases } from './eventContextAnalyzer.js';
import { FEATURE_ONTOLOGY, AI_TOOL_DOMINANCE_THRESHOLD } from './productivityOntologyEngine.js';
import { getDominantSessions } from './workflowDominanceEngine.js';

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_SESSION_SECS = 10;
const CONTINUOUS_GAP_SECS = 300; // < 5 min gap = continuous block

// ─── Domain Topic Map ─────────────────────────────────────────────────────────
// Single source of truth is DOMAIN_TOPICS imported from eventContextAnalyzer.js.
// Previously this file had its own DOMAIN_META with only 14 entries — a strict
// subset of DOMAIN_TOPICS's 30 entries — causing domains like vercel.com/netlify.com
// to be enriched by eventContextAnalyzer but silently dropped by contextCompressionEngine
// (R-06). Using the shared map ensures both engines see the same domain universe.
const DOMAIN_META = DOMAIN_TOPICS;

// ─── Utilities ────────────────────────────────────────────────────────────────

function toSecs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e10 ? val / 1000 : val;
  const d = new Date(val);
  return isNaN(d) ? 0 : d.getTime() / 1000;
}

function sessionDuration(s) {
  if (s.duration_seconds > 0) return s.duration_seconds;
  const start = toSecs(s.started_at);
  const end = toSecs(s.ended_at);
  return end > start ? end - start : 0;
}

function normApp(str) {
  return String(str || '').toLowerCase().trim();
}

// ─── Utility App Filter ───────────────────────────────────────────────────────
// OS-level utility apps add noise — they carry no meaningful work signal.

const UTILITY_APP_NORM_RE = /^(snipping\s*tool|snip\s*&\s*sketch|screenshot|photos|camera|calculator|notepad|wordpad|paint|windows\s*explorer|file\s*explorer|finder|activity\s*monitor|task\s*manager|system\s*preferences|settings|control\s*panel|magnifier|sticky\s*notes|clock|weather|maps|microsoft\s*store|app\s*store|spotlight|cortana|siri|widgets|action\s*center|system\s*info|disk\s*utility)$/i;

function isUtilityApp(name = '') {
  return UTILITY_APP_NORM_RE.test(name.trim());
}

// ─── App Signal Aggregation ───────────────────────────────────────────────────

function aggregateApps(sessions) {
  const map = {};
  for (const s of sessions) {
    const key = normApp(s.app_name);
    if (!key) continue;
    if (isUtilityApp(key)) continue; // skip OS utilities entirely
    const dur = sessionDuration(s);
    if (!map[key]) {
      map[key] = {
        name: s.app_name || key,
        normalizedName: key,
        category: APP_CATEGORIES[key] || APP_CATEGORIES[key.split(' ')[0]] || 'research',
        totalSecs: 0,
        sessionCount: 0,
        contextSwitches: 0,
      };
    }
    map[key].totalSecs += dur;
    map[key].sessionCount++;
    map[key].contextSwitches += s.context_switches || 0;
  }
  return Object.values(map).sort((a, b) => b.totalSecs - a.totalSecs);
}

// ─── Domain Aggregation ───────────────────────────────────────────────────────

// Domains that should never appear as "tools used" — entertainment and personal
const SUPPRESS_DOMAIN_RE = /^(www\.)?(youtube|netflix|twitch|spotify|disneyplus|primevideo|hulu|peacock|hbomax|crunchyroll|soundcloud|vimeo|dailymotion|reddit|twitter|x\.com|instagram|facebook|tiktok|pinterest|tumblr|imgur|9gag|buzzfeed|quora|wikipedia|medium|gmail|mail\.google|calendar\.google|drive\.google|docs\.google|sheets\.google|slides\.google|meet\.google)\./i;

function aggregateDomains(sessions) {
  const map = {};
  for (const s of sessions) {
    if (!s.url) continue;
    try {
      const url = new URL(s.url.startsWith('http') ? s.url : `https://${s.url}`);
      const domain = url.hostname.replace(/^www\./, '');

      // Only include whitelisted meaningful work domains — suppress entertainment,
      // personal sites, and social media from appearing as "tools used"
      const meta = DOMAIN_META[domain];
      if (!meta) continue;  // skip unknown domains entirely

      if (SUPPRESS_DOMAIN_RE.test(domain)) continue;

      if (!map[domain]) {
        map[domain] = {
          domain,
          topic: meta.topic,
          category: meta.category,
          totalSecs: 0,
        };
      }
      map[domain].totalSecs += sessionDuration(s);
    } catch {}
  }
  return Object.values(map).sort((a, b) => b.totalSecs - a.totalSecs).slice(0, 8);
}

// ─── Keyword Extraction ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','in','on','at','to','for','of','with','is','are',
  'was','be','been','by','from','as','it','this','that','vs','via','new','tab',
  'com','io','net','org','app','claude','chatgpt','gemini','auto','http','https',
  'www','localhost','untitled','window','file','page','home','main','index',
]);

function extractKeywords(sessions) {
  const freq = {};
  for (const s of sessions) {
    // Skip utility apps — their window titles add noise, not signal
    if (s.app_name && isUtilityApp(normApp(s.app_name))) continue;

    const sources = [s.window_title || '', s.url || ''];
    for (const src of sources) {
      const words = src.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
      for (const w of words) freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 20).map(([w]) => w);
}

// ─── Temporal Pattern Analysis ────────────────────────────────────────────────

function analyzeTemporalPatterns(sessions) {
  if (sessions.length < 2) {
    return {
      continuityScore: sessions.length ? 0.5 : 0,
      avgGapSecs: 0,
      maxContinuousBlockMins: Math.round((sessions[0] ? sessionDuration(sessions[0]) : 0) / 60),
      isFragmented: false,
      sessionCount: sessions.length,
    };
  }

  const sorted = [...sessions].sort((a, b) => toSecs(a.started_at) - toSecs(b.started_at));
  let totalGap = 0, gapCount = 0;
  let maxBlock = 0, currentBlock = sessionDuration(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = toSecs(sorted[i - 1].ended_at) || toSecs(sorted[i - 1].started_at) + sessionDuration(sorted[i - 1]);
    const currStart = toSecs(sorted[i].started_at);
    const gap = Math.max(0, currStart - prevEnd);

    if (gap < CONTINUOUS_GAP_SECS) {
      currentBlock += gap + sessionDuration(sorted[i]);
    } else {
      maxBlock = Math.max(maxBlock, currentBlock);
      currentBlock = sessionDuration(sorted[i]);
      totalGap += gap;
      gapCount++;
    }
  }
  maxBlock = Math.max(maxBlock, currentBlock);

  const avgGapSecs = gapCount > 0 ? totalGap / gapCount : 0;
  const totalSecs = sorted.reduce((sum, s) => sum + sessionDuration(s), 0);
  const continuityScore = Math.min(maxBlock / Math.max(totalSecs, 1), 1);

  return {
    continuityScore,
    avgGapSecs,
    maxContinuousBlockMins: Math.round(maxBlock / 60),
    isFragmented: continuityScore < 0.4 || avgGapSecs > 600,
    sessionCount: sessions.length,
  };
}

// ─── AI Conversation Topic Extraction ────────────────────────────────────────
// When the primary workspace is an AI tool (Claude/ChatGPT), the window titles
// are actual conversation topic labels — extremely high-value semantic signals.
// Extract them separately so downstream engines can weight them appropriately.

const AI_TOOL_APP_RE = /^(claude|chatgpt|gemini|copilot|perplexity|poe|phind)/i;

// Prefixes that appear in AI chat window titles that should be stripped
const AI_TITLE_STRIP_RE = /^(claude\s*[-—]\s*|chatgpt\s*[-—]\s*|gemini\s*[-—]\s*|new chat\s*[-—]?\s*|conversation\s*[-—]?\s*)/i;

// Phrases that are just chat UI noise (not meaningful conversation titles)
const AI_TITLE_NOISE_RE = /^(new chat|untitled|conversation|assistant|ai assistant|claude|chatgpt|gemini)\s*$/i;

function extractAIConversationTopics(sessions) {
  const topics = [];
  for (const s of sessions) {
    const appName = (s.app_name || '').toLowerCase();
    if (!AI_TOOL_APP_RE.test(appName)) continue;

    const rawTitle = s.window_title || '';
    if (!rawTitle) continue;

    // Strip known AI app prefix/suffix
    let topic = rawTitle
      .replace(AI_TITLE_STRIP_RE, '')
      .replace(/\s*[-—|·]\s*(Claude|ChatGPT|Gemini|Claude\.ai)\s*$/i, '')
      .trim();

    if (!topic || AI_TITLE_NOISE_RE.test(topic) || topic.length < 6) continue;

    const dur = s.duration_seconds ||
      Math.max(0, (toSecs(s.ended_at) || 0) - (toSecs(s.started_at) || 0));

    topics.push({ topic, appName: s.app_name, durationSecs: dur });
  }

  // Deduplicate by topic text, summing duration
  const seen = new Map();
  for (const t of topics) {
    const key = t.topic.toLowerCase();
    if (seen.has(key)) {
      seen.get(key).durationSecs += t.durationSecs;
    } else {
      seen.set(key, { ...t });
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.durationSecs - a.durationSecs)
    .slice(0, 6);
}

// ─── Feature Signal Detection ─────────────────────────────────────────────────

function detectFeatureSignals(titlePhrases, keywords) {
  const allText = [...titlePhrases.map(p => p.phrase), ...keywords].join(' ').toLowerCase();
  const results = [];

  for (const [featureId, feature] of Object.entries(FEATURE_ONTOLOGY)) {
    const matched = feature.keywords.filter(kw => allText.includes(kw));
    if (matched.length > 0) {
      results.push({
        featureId,
        label: feature.label,
        system: feature.system,
        matchedKeywords: matched,
        strength: matched.length / feature.keywords.length,
        relatedFeatures: feature.relatedFeatures,
      });
    }
  }

  return results.sort((a, b) => b.strength - a.strength).slice(0, 6);
}

// ─── Primary Category ─────────────────────────────────────────────────────────

function determinePrimaryCategory(apps, domains) {
  const catTime = {};
  for (const app of apps) {
    catTime[app.category] = (catTime[app.category] || 0) + app.totalSecs;
  }
  for (const d of domains) {
    if (d.category !== 'research') {
      catTime[d.category] = (catTime[d.category] || 0) + d.totalSecs * 0.4;
    }
  }
  const sorted = Object.entries(catTime).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || 'development';
}

// ─── Signal Strength Score ────────────────────────────────────────────────────

function scoreSignalStrength({ titlePhrases, apps, features, temporalPatterns }) {
  let score = 0;
  if (titlePhrases.length >= 3) score += 40;
  else if (titlePhrases.length >= 1) score += 20;
  if (apps.length >= 2) score += 20;
  else if (apps.length >= 1) score += 10;
  if (features.length >= 2) score += 25;
  else if (features.length >= 1) score += 12;
  if (temporalPatterns.continuityScore >= 0.7) score += 15;
  else if (temporalPatterns.continuityScore >= 0.4) score += 7;
  return Math.min(score, 100);
}

// ─── Main Compression Function ────────────────────────────────────────────────

/**
 * Compress raw auto-sessions into clean, prioritized workflow signals.
 * This output feeds all contextual reasoning engines.
 *
 * KEY CHANGE: applies Workflow Dominance filtering BEFORE phrase/keyword extraction.
 * This prevents URL pollution (YouTube 3-min tabs) and last-activity bias
 * (ShareX 15-min overriding 90-min Flow Ledger work) from corrupting the output.
 *
 * @param {Array}  autoSessions - raw auto-tracked sessions
 * @param {Object} [options]    - { project, client } for project-relevance scoring
 * @returns {Object} compressedContext
 */
export function compressContext(autoSessions = [], options = {}) {
  const allActive = autoSessions.filter(s => !s.is_idle && sessionDuration(s) >= MIN_SESSION_SECS);

  if (!allActive.length) {
    return {
      isEmpty: true,
      titlePhrases: [],
      keywords: [],
      apps: [],
      domains: [],
      features: [],
      temporalPatterns: { continuityScore: 0, isFragmented: false, sessionCount: 0 },
      signalStrength: 0,
      totalActiveSecs: 0,
      totalActiveMins: 0,
      contextSwitches: 0,
      primaryCategory: 'development',
      primaryApp: null,
      primaryAppCategory: null,
      isBrowserDominated: false,
    };
  }

  // ── Workflow Dominance Filter ──────────────────────────────────────────────
  // Run dominance analysis on ALL active sessions, then restrict phrase/keyword
  // extraction to only the dominant workflow sessions. This prevents:
  //   • YouTube 3-min clips from polluting the primary workflow context
  //   • A 15-min ShareX window overriding 90 min of Flow Ledger work
  //   • Last-activity bias from the most recent (but brief) app switch
  const { dominantSessions, metadata: dominanceMetadata } = getDominantSessions(allActive, options);

  // If dominance filtering left us with a reasonable set, use it;
  // otherwise fall back to all active sessions (prevents blank output on fully fragmented sessions).
  const active = dominantSessions.length >= 1 ? dominantSessions : allActive;

  const titlePhrases = extractWindowTitlePhrases(active);
  const aiConversationTopics = extractAIConversationTopics(active);
  const keywords = extractKeywords(active);
  const apps = aggregateApps(active);
  const domains = aggregateDomains(active);
  const temporalPatterns = analyzeTemporalPatterns(active);

  // Merge AI conversation topics into title phrases as high-priority signals
  // (AI conversation titles are more semantically specific than generic window titles)
  const mergedPhrases = aiConversationTopics.length
    ? [
        ...aiConversationTopics.map(t => ({ phrase: t.topic, durationSecs: t.durationSecs * 1.4, isAITopic: true })),
        ...titlePhrases.filter(p => !aiConversationTopics.some(t => t.topic.toLowerCase() === p.phrase.toLowerCase())),
      ].sort((a, b) => b.durationSecs - a.durationSecs)
    : titlePhrases;

  // Boost keywords from AI conversation topics
  const aiTopicKeywords = aiConversationTopics
    .flatMap(t => t.topic.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4))
    .filter(w => !keywords.includes(w))
    .slice(0, 8);

  const enrichedKeywords = [...new Set([...keywords, ...aiTopicKeywords])];
  const features = detectFeatureSignals(mergedPhrases, enrichedKeywords);

  const totalActiveSecs = active.reduce((sum, s) => sum + sessionDuration(s), 0);
  const contextSwitches = active.reduce((sum, s) => sum + (s.context_switches || 0), 0);

  const primaryCategory = determinePrimaryCategory(apps, domains);
  const primaryApp = apps[0]?.name || null;
  const primaryAppCategory = apps[0]?.category || null;

  // Browser-dominated = more than 60% time in browsers
  const browserSecs = apps
    .filter(a => ['chrome', 'firefox', 'safari', 'arc', 'brave', 'edge', 'opera'].some(b => a.normalizedName.includes(b)))
    .reduce((sum, a) => sum + a.totalSecs, 0);
  const isBrowserDominated = totalActiveSecs > 0 && browserSecs / totalActiveSecs > 0.6;

  // AI workspace detection: is this session primarily happening inside an AI tool?
  const aiSecs = apps.filter(a => AI_TOOL_APP_RE.test(a.normalizedName || '')).reduce((s, a) => s + a.totalSecs, 0);
  const isAIWorkspace = totalActiveSecs > 0 && aiSecs / totalActiveSecs >= AI_TOOL_DOMINANCE_THRESHOLD;

  const compressed = {
    isEmpty: false,
    titlePhrases: mergedPhrases,
    keywords: enrichedKeywords,
    apps,
    domains,
    features,
    temporalPatterns,
    totalActiveSecs,
    totalActiveMins: Math.round(totalActiveSecs / 60),
    contextSwitches,
    primaryCategory,
    primaryApp,
    primaryAppCategory,
    isBrowserDominated,
    isAIWorkspace,
    aiConversationTopics,
    aiWorkspaceFraction: totalActiveSecs > 0 ? Math.round(aiSecs / totalActiveSecs * 100) / 100 : 0,
    sessionCount: active.length,
    // ── Workflow Dominance metadata ──────────────────────────────────────────
    // Carries forward dominance analysis results for downstream engines.
    // dominantWorkflowLabel: human-readable primary workflow name
    // dominanceScore:        0-100 confidence that we correctly identified the primary workflow
    // noisePct:              % of session time filtered as noise/distractions
    dominantWorkflowLabel: dominanceMetadata?.label || null,
    dominanceScore:        dominanceMetadata?.score || 0,
    noisePct:              dominanceMetadata?.noisePct || 0,
    dominanceFilteredCount: dominanceMetadata?.filteredCount || 0,
  };

  compressed.signalStrength = scoreSignalStrength(compressed);

  return compressed;
}

/**
 * Build a compact fingerprint string for cache comparison.
 */
export function contextFingerprint(compressed) {
  const app = (compressed.primaryApp || 'none').toLowerCase().slice(0, 8);
  const feat = compressed.features[0]?.featureId || 'none';
  const phrase = compressed.titlePhrases[0]?.phrase?.slice(0, 15) || 'none';
  return `${app}|${feat}|${phrase}`;
}
