/**
 * Semantic Memory Engine
 * Lightweight local semantic memory using TF-IDF vector embeddings and
 * cosine similarity. No LLMs, no external APIs, no model downloads.
 *
 * Architecture:
 * - Pre-computed productivity vocabulary (~180 terms) provides the vector space
 * - Sessions are represented as sparse TF-IDF vectors in this space
 * - Cosine similarity finds semantically related sessions
 * - K-means style clustering groups recurring workflows
 * - All data stored in localStorage
 */

import { SEMANTIC_TERM_GROUPS } from './productivityOntologyEngine.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const MEMORY_KEY = 'fl_semantic_memory_v1';
const MAX_SESSION_MEMORY = 120;   // Keep last 120 sessions
const SIMILARITY_THRESHOLD = 0.35;
const IDF_SMOOTHING = 1;          // Prevent divide-by-zero in IDF

// ─── Productivity Vocabulary ──────────────────────────────────────────────────
// Pre-defined term space for semantic projection.
// Organized by conceptual domain for interpretability.

const PRODUCTIVITY_VOCABULARY = [
  // Calendar & scheduling
  'calendar', 'event', 'schedule', 'scheduling', 'appointment', 'booking',
  'slot', 'block', 'timeblock', 'drag', 'drop', 'date', 'week', 'month',
  'recurring', 'collision', 'overlap', 'rescheduling', 'timepicker',

  // AI & intelligence
  'ai', 'intelligence', 'semantic', 'embedding', 'inference', 'reasoning',
  'context', 'ontology', 'vector', 'similarity', 'behavioral', 'memory',
  'engine', 'model', 'nlp', 'prediction', 'classification', 'clustering',

  // Frontend & React
  'component', 'react', 'hook', 'render', 'state', 'props', 'effect',
  'animation', 'layout', 'responsive', 'modal', 'sidebar', 'panel', 'ui', 'ux',
  'design', 'interaction', 'hover', 'transition', 'tailwind', 'style',

  // Backend & data
  'api', 'server', 'database', 'schema', 'query', 'endpoint', 'auth',
  'middleware', 'service', 'route', 'handler', 'supabase', 'postgres',
  'migration', 'localstorage', 'storage', 'fetch', 'mutation',

  // Testing & quality
  'test', 'spec', 'jest', 'vitest', 'cypress', 'playwright', 'unit',
  'integration', 'e2e', 'assertion', 'mock', 'stub', 'coverage', 'qa',

  // Analytics & productivity
  'analytics', 'productivity', 'focus', 'deepwork', 'burnout', 'insights',
  'dashboard', 'metrics', 'chart', 'report', 'visualization', 'statistics',
  'tracking', 'efficiency', 'performance', 'session', 'autosession',

  // Workflow & development process
  'debug', 'fix', 'bug', 'error', 'issue', 'refactor', 'optimize', 'clean',
  'implement', 'build', 'create', 'feature', 'module', 'architecture',
  'system', 'pipeline', 'automation', 'deploy', 'release', 'ship',

  // Documentation & planning
  'docs', 'documentation', 'readme', 'wiki', 'write', 'draft', 'spec',
  'guide', 'plan', 'roadmap', 'sprint', 'backlog', 'scope', 'strategy',

  // Collaboration & tools
  'figma', 'notion', 'linear', 'github', 'slack', 'vscode', 'cursor',
  'review', 'feedback', 'pull request', 'collaboration', 'meeting',

  // Flow Ledger specific
  'flowledger', 'ledger', 'timetracking', 'windowtitle', 'appcategory',
  'contextswitch', 'focusscore', 'narrativesynthesis', 'continuity',

  // Programming languages & runtimes
  'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'kotlin',
  'swift', 'ruby', 'php', 'csharp', 'cpp', 'scala', 'elixir', 'clojure',
  'node', 'deno', 'bun', 'wasm', 'webassembly', 'lua',

  // Frameworks & libraries
  'nextjs', 'nuxt', 'remix', 'astro', 'gatsby', 'express', 'fastapi',
  'django', 'rails', 'spring', 'laravel', 'nestjs', 'hono', 'trpc',
  'redux', 'zustand', 'mobx', 'jotai', 'recoil', 'rxjs',
  'prisma', 'drizzle', 'sequelize', 'mongoose', 'typeorm',
  'graphql', 'apollo', 'urql', 'relay',

  // DevOps & infrastructure
  'docker', 'kubernetes', 'k8s', 'terraform', 'pulumi', 'ansible', 'helm',
  'ci', 'cd', 'pipeline', 'github actions', 'vercel', 'netlify', 'cloudflare',
  'aws', 'gcp', 'azure', 'lambda', 'ec2', 's3', 'rds', 'redis', 'kafka',
  'nginx', 'caddy', 'traefik', 'vault', 'consul',
  'monitoring', 'logging', 'tracing', 'observability', 'sentry', 'datadog',

  // Security
  'security', 'vulnerability', 'penetration', 'audit', 'cve', 'csrf',
  'xss', 'injection', 'encryption', 'token', 'jwt', 'oauth', 'saml',
  'rbac', 'permission', 'session', 'rate limit', 'sanitize', 'validate',

  // Mobile development
  'mobile', 'ios', 'android', 'react native', 'flutter', 'expo',
  'xcode', 'android studio', 'simulator', 'emulator', 'push notification',
  'app store', 'play store', 'gesture', 'native', 'hybrid',

  // Data science & ML
  'data', 'dataset', 'model', 'training', 'inference', 'loss', 'gradient',
  'neural', 'transformer', 'llm', 'fine-tune', 'prompt', 'embedding',
  'pandas', 'numpy', 'pytorch', 'tensorflow', 'sklearn', 'jupyter',
  'pipeline', 'etl', 'warehouse', 'bigquery', 'spark',

  // UX & design
  'wireframe', 'prototype', 'mockup', 'sketch', 'zeplin', 'framer',
  'typography', 'color', 'spacing', 'grid', 'breakpoint', 'dark mode',
  'accessibility', 'a11y', 'aria', 'contrast', 'usability', 'heuristic',

  // Performance & optimization
  'performance', 'latency', 'throughput', 'bottleneck', 'profiling',
  'benchmark', 'cache', 'memoize', 'lazy', 'bundle', 'treeshake',
  'lighthouse', 'core web vitals', 'lcp', 'cls', 'fid', 'ttfb',
  'minify', 'compress', 'cdn', 'preload', 'prefetch',

  // Communication & process
  'standup', 'retro', 'sprint', 'kanban', 'agile', 'scrum', 'jira',
  'ticket', 'issue', 'milestone', 'epic', 'story', 'task', 'comment',
  'slack', 'discord', 'email', 'zoom', 'loom', 'demo', 'presentation',

  // Version control & code review
  'git', 'commit', 'branch', 'merge', 'rebase', 'cherry-pick', 'stash',
  'diff', 'patch', 'conflict', 'resolve', 'tag', 'release', 'changelog',
  'pull request', 'code review', 'approve', 'request changes', 'lgtm',
];

// Build vocabulary index once
const VOCAB_INDEX = {};
PRODUCTIVITY_VOCABULARY.forEach((term, i) => { VOCAB_INDEX[term] = i; });
const VOCAB_SIZE = PRODUCTIVITY_VOCABULARY.length;

// ─── TF-IDF Vectorization ─────────────────────────────────────────────────────

/**
 * Convert text tokens to a sparse term-frequency vector.
 */
function termFrequency(tokens) {
  const tf = new Float32Array(VOCAB_SIZE);
  let total = 0;

  for (const token of tokens) {
    const lower = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = VOCAB_INDEX[lower];
    if (idx !== undefined) {
      tf[idx]++;
      total++;
    } else {
      // Partial match: check if any vocab term contains this token
      for (const [term, termIdx] of Object.entries(VOCAB_INDEX)) {
        if (term.includes(lower) || lower.includes(term)) {
          tf[termIdx] += 0.5;
          total += 0.5;
          break;
        }
      }
    }
  }

  // Normalize to relative frequencies
  if (total > 0) {
    for (let i = 0; i < VOCAB_SIZE; i++) tf[i] /= total;
  }

  return tf;
}

/**
 * Compute IDF weights from a corpus of TF vectors.
 */
function computeIDF(corpus) {
  const docFreq = new Float32Array(VOCAB_SIZE);

  for (const vec of corpus) {
    for (let i = 0; i < VOCAB_SIZE; i++) {
      if (vec[i] > 0) docFreq[i]++;
    }
  }

  const idf = new Float32Array(VOCAB_SIZE);
  const N = corpus.length;

  for (let i = 0; i < VOCAB_SIZE; i++) {
    idf[i] = Math.log((N + IDF_SMOOTHING) / (docFreq[i] + IDF_SMOOTHING)) + 1;
  }

  return idf;
}

/**
 * Apply IDF weighting to a TF vector → TF-IDF vector.
 */
function applyIDF(tf, idf) {
  const tfidf = new Float32Array(VOCAB_SIZE);
  for (let i = 0; i < VOCAB_SIZE; i++) tfidf[i] = tf[i] * idf[i];
  return tfidf;
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < VOCAB_SIZE; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Session Tokenization ─────────────────────────────────────────────────────

function tokenizeSession(sessionRecord) {
  const parts = [
    sessionRecord.title || '',
    sessionRecord.description || '',
    ...(sessionRecord.keywords || []),
    ...(sessionRecord.titlePhrases || []),
    ...(sessionRecord.apps || []),
    ...(sessionRecord.features || []),
    sessionRecord.workMode || '',
    sessionRecord.category || '',
    // Dominant workflow label — boosts semantic similarity for sessions
    // sharing the same primary workflow identity (e.g. "Flow Ledger")
    sessionRecord.dominantLabel || sessionRecord.dominantWorkflowLabel || '',
  ];

  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

// ─── Memory Storage ───────────────────────────────────────────────────────────

function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { sessions: [], idf: null };
    const parsed = JSON.parse(raw);
    // Restore Float32Arrays from plain arrays
    parsed.sessions = (parsed.sessions || []).map(s => ({
      ...s,
      tf: s.tf ? new Float32Array(s.tf) : null,
    }));
    return parsed;
  } catch {
    return { sessions: [], idf: null };
  }
}

function saveMemory(memory) {
  try {
    // Serialize Float32Arrays to plain arrays for JSON storage
    const serializable = {
      ...memory,
      sessions: memory.sessions.map(s => ({
        ...s,
        tf: s.tf ? Array.from(s.tf) : null,
      })),
    };
    localStorage.setItem(MEMORY_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn('[SemanticMemory] Save failed:', e.message);
  }
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

class SemanticMemoryEngine {
  constructor() {
    this._mem = loadMemory();
    this._idf = null;  // Recomputed lazily after writes
    this._dirty = false;
    this._saveTimer = null;
  }

  // ─── Write ──────────────────────────────────────────────────────────────

  /**
   * Store a session in semantic memory.
   *
   * @param {Object} sessionRecord - { id, title, keywords, titlePhrases, apps, features, workMode, category, timestamp }
   */
  remember(sessionRecord) {
    if (!sessionRecord?.id) return;

    // Avoid duplicates
    const existing = this._mem.sessions.findIndex(s => s.id === sessionRecord.id);

    const tokens = tokenizeSession(sessionRecord);
    const tf = termFrequency(tokens);

    const record = {
      id: sessionRecord.id,
      title: sessionRecord.title || '',
      workMode: sessionRecord.workMode || '',
      category: sessionRecord.category || '',
      features: (sessionRecord.features || []).slice(0, 4),
      timestamp: sessionRecord.timestamp || Date.now(),
      // Store dominant workflow label so cluster recall can group by workflow identity
      dominantLabel: sessionRecord.dominantLabel || sessionRecord.dominantWorkflowLabel || '',
      dominanceScore: sessionRecord.dominanceScore || 0,
      tf,
    };

    if (existing >= 0) {
      this._mem.sessions[existing] = record;
    } else {
      this._mem.sessions.unshift(record);
      if (this._mem.sessions.length > MAX_SESSION_MEMORY) {
        this._mem.sessions = this._mem.sessions.slice(0, MAX_SESSION_MEMORY);
      }
    }

    this._idf = null; // Invalidate cached IDF
    this._dirty = true;
    this._scheduleSave();
  }

  // ─── IDF Computation ─────────────────────────────────────────────────────

  _getIDF() {
    if (this._idf && !this._dirty) return this._idf;
    const corpus = this._mem.sessions.filter(s => s.tf).map(s => s.tf);
    if (corpus.length === 0) {
      this._idf = new Float32Array(VOCAB_SIZE).fill(1);
    } else {
      this._idf = computeIDF(corpus);
    }
    return this._idf;
  }

  _getTFIDF(session) {
    if (!session.tf) return new Float32Array(VOCAB_SIZE);
    return applyIDF(session.tf, this._getIDF());
  }

  // ─── Similarity Search ────────────────────────────────────────────────────

  /**
   * Find semantically similar past sessions.
   *
   * @param {Object} queryRecord - same shape as remember() input
   * @param {number} topK - max results
   * @param {number} minSimilarity - threshold (0-1)
   * @returns {Array} Sorted by similarity desc: [{ session, similarity }]
   */
  findSimilar(queryRecord, topK = 8, minSimilarity = SIMILARITY_THRESHOLD) {
    if (this._mem.sessions.length === 0) return [];

    const tokens = tokenizeSession(queryRecord);
    const queryTF = termFrequency(tokens);
    const queryTFIDF = applyIDF(queryTF, this._getIDF());

    const scored = this._mem.sessions
      .filter(s => s.id !== queryRecord.id && s.tf)
      .map(s => ({
        session: s,
        similarity: cosineSimilarity(queryTFIDF, this._getTFIDF(s)),
      }))
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, topK);
  }

  /**
   * Retrieve sessions that match a feature cluster.
   *
   * @param {string[]} featureIds - e.g. ['calendar_system', 'ui_components']
   * @param {number} topK
   */
  recallByFeature(featureIds, topK = 10) {
    const featureSet = new Set(featureIds);
    return this._mem.sessions
      .filter(s => s.features?.some(f => featureSet.has(f)))
      .slice(0, topK)
      .map(s => ({ session: s, matchedFeatures: s.features.filter(f => featureSet.has(f)) }));
  }

  /**
   * Retrieve sessions that share the same dominant workflow label.
   * Used by the continuity engine to find recurring workflow objectives.
   *
   * @param {string} workflowLabel - dominant workflow label to match
   * @param {number} topK
   * @returns {Array} matching session records
   */
  recallByDominantWorkflow(workflowLabel, topK = 10) {
    if (!workflowLabel) return [];
    const labelNorm = workflowLabel.toLowerCase().trim();
    return this._mem.sessions
      .filter(s => s.dominantLabel && s.dominantLabel.toLowerCase().includes(labelNorm))
      .slice(0, topK)
      .map(s => ({ session: s, dominanceScore: s.dominanceScore || 0 }));
  }

  /**
   * Detect recurring workflow themes across stored sessions.
   * Returns topic clusters by counting co-occurring vocabulary terms.
   */
  detectRecurringThemes(windowSize = 20) {
    const recent = this._mem.sessions.slice(0, windowSize);
    if (recent.length < 3) return [];

    const groupCounts = {};
    for (const group of Object.keys(SEMANTIC_TERM_GROUPS)) groupCounts[group] = 0;

    for (const s of recent) {
      if (!s.tf) continue;
      for (const [group, terms] of Object.entries(SEMANTIC_TERM_GROUPS)) {
        for (const term of terms) {
          const idx = VOCAB_INDEX[term];
          if (idx !== undefined && s.tf[idx] > 0) {
            groupCounts[group] += s.tf[idx];
          }
        }
      }
    }

    return Object.entries(groupCounts)
      .filter(([, count]) => count > 0.5)
      .sort(([, a], [, b]) => b - a)
      .map(([group, count]) => ({
        group,
        strength: Math.min(count / recent.length, 1),
        label: group.replace(/_/g, ' '),
        sessionCount: recent.filter(s => {
          if (!s.tf) return false;
          return (SEMANTIC_TERM_GROUPS[group] || []).some(term => {
            const idx = VOCAB_INDEX[term];
            return idx !== undefined && s.tf[idx] > 0;
          });
        }).length,
      }));
  }

  /**
   * Identify recurring work objectives from session history.
   * Groups sessions by semantic theme and extracts common objectives.
   *
   * @param {number} topN - number of objectives to return
   * @returns {Array} objectives sorted by recurrence
   */
  recallRecurringObjectives(topN = 5) {
    const sessions = this._mem.sessions.slice(0, 60);
    if (sessions.length < 3) return [];

    // Group sessions by feature overlap
    const featureGroups = {};
    for (const s of sessions) {
      const key = (s.features || []).slice(0, 2).sort().join('+') || 'general';
      if (!featureGroups[key]) featureGroups[key] = [];
      featureGroups[key].push(s);
    }

    const objectives = Object.entries(featureGroups)
      .filter(([, grp]) => grp.length >= 2)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, topN)
      .map(([featureKey, grp]) => {
        const titles = grp.map(s => s.title).filter(Boolean);
        const modes = grp.map(s => s.workMode).filter(Boolean);
        const topMode = modes.sort((a, b) =>
          modes.filter(m => m === b).length - modes.filter(m => m === a).length
        )[0] || 'deep_implementation';

        return {
          featureKey,
          features: featureKey.split('+').filter(f => f !== 'general'),
          occurrences: grp.length,
          recentTitle: titles[0] || null,
          dominantMode: topMode,
          lastSeen: Math.max(...grp.map(s => s.timestamp || 0)),
          recencyScore: grp.length / sessions.length,
        };
      });

    return objectives;
  }

  /**
   * Get workflow clusters — groups of semantically similar sessions.
   * Returns richer data than clusterRecentSessions for use in narratives.
   *
   * @param {number} windowSize
   * @returns {Array} workflow cluster objects
   */
  getWorkflowClusters(windowSize = 30) {
    const rawClusters = this.clusterRecentSessions(windowSize, 0.40);
    return rawClusters
      .filter(cluster => cluster.length >= 2)
      .map(cluster => {
        const titles = cluster.map(s => s.title).filter(Boolean);
        const features = [...new Set(cluster.flatMap(s => s.features || []))];
        const modes = cluster.map(s => s.workMode).filter(Boolean);
        const topMode = modes.sort((a, b) =>
          modes.filter(m => m === b).length - modes.filter(m => m === a).length
        )[0] || 'deep_implementation';

        const themes = this.detectRecurringThemes(windowSize)
          .filter(t => t.sessionCount >= 2).slice(0, 3);

        // Surface the dominant workflow label for this cluster when most sessions agree
        const dominantLabels = cluster.map(s => s.dominantLabel).filter(Boolean);
        const labelFreq = {};
        for (const l of dominantLabels) labelFreq[l] = (labelFreq[l] || 0) + 1;
        const topLabel = Object.entries(labelFreq).sort(([, a], [, b]) => b - a)[0];
        const clusterWorkflowLabel = (topLabel && topLabel[1] / cluster.length >= 0.5)
          ? topLabel[0] : null;

        return {
          size: cluster.length,
          titles: titles.slice(0, 3),
          features: features.slice(0, 4),
          dominantMode: topMode,
          topThemes: themes.map(t => t.group),
          cohesion: cluster.length / Math.max(rawClusters.length, 1),
          workflowLabel: clusterWorkflowLabel,
        };
      })
      .sort((a, b) => b.size - a.size);
  }

  /**
   * Get the semantic continuity score AND a rich context object
   * for use in contextual reasoning.
   *
   * @param {Object} queryRecord
   * @returns {{ score: number, recurringObjectives: Array, topThemes: Array }}
   */
  getRichContinuityContext(queryRecord) {
    const score = this.getContinuityScore(queryRecord);
    const recurringObjectives = this.recallRecurringObjectives(3);
    const topThemes = this.detectRecurringThemes(15).slice(0, 4);

    return { score, recurringObjectives, topThemes };
  }

  /**
   * Cluster recent sessions by semantic similarity.
   * Simple greedy clustering (no k-means dependency).
   *
   * @param {number} windowSize - how many recent sessions to cluster
   * @param {number} threshold - similarity threshold for same cluster
   */
  clusterRecentSessions(windowSize = 20, threshold = 0.45) {
    const recent = this._mem.sessions.slice(0, windowSize).filter(s => s.tf);
    if (recent.length < 2) return recent.map(s => [s]);

    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < recent.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [recent[i]];
      assigned.add(i);

      const vecI = this._getTFIDF(recent[i]);

      for (let j = i + 1; j < recent.length; j++) {
        if (assigned.has(j)) continue;
        const sim = cosineSimilarity(vecI, this._getTFIDF(recent[j]));
        if (sim >= threshold) {
          cluster.push(recent[j]);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters.sort((a, b) => b.length - a.length);
  }

  /**
   * Get a semantic continuity score between the current context and recent history.
   * High score = user is continuing familiar work.
   */
  getContinuityScore(queryRecord) {
    const recent = this._mem.sessions.slice(0, 10);
    if (recent.length === 0) return 0;

    const tokens = tokenizeSession(queryRecord);
    const queryTF = termFrequency(tokens);
    const queryTFIDF = applyIDF(queryTF, this._getIDF());

    let totalSimilarity = 0;
    let count = 0;

    // Exponential decay: more recent sessions matter more
    for (let i = 0; i < recent.length; i++) {
      const s = recent[i];
      if (!s.tf) continue;
      const decay = Math.pow(0.85, i); // 0.85^0=1.0, 0.85^9≈0.23
      totalSimilarity += cosineSimilarity(queryTFIDF, this._getTFIDF(s)) * decay;
      count += decay;
    }

    return count > 0 ? Math.min(totalSimilarity / count, 1) : 0;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      saveMemory(this._mem);
      this._dirty = false;
    }, 3000);
  }

  /** Force immediate save */
  flush() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    saveMemory(this._mem);
    this._dirty = false;
  }

  /** Clear all semantic memory */
  reset() {
    this._mem = { sessions: [], idf: null };
    this._idf = null;
    this.flush();
  }

  /** Get count of stored sessions */
  get sessionCount() {
    return this._mem.sessions.length;
  }

  /** Export for debugging */
  snapshot() {
    return {
      sessionCount: this._mem.sessions.length,
      topTitles: this._mem.sessions.slice(0, 5).map(s => s.title),
    };
  }
}

// Singleton
export const semanticMemory = new SemanticMemoryEngine();
export default semanticMemory;
