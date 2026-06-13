/**
 * Feature Graph Engine
 * Builds and maintains a product feature relationship graph.
 * Understands which features/systems the user is actively building,
 * connecting sessions into a coherent product context.
 *
 * Uses adjacency-based graph traversal, not LLMs.
 */

import { FEATURE_ONTOLOGY } from './productivityOntologyEngine.js';

// ─── Storage ──────────────────────────────────────────────────────────────────

const GRAPH_KEY_BASE = 'fl_feature_graph_v1';
const TEMPORAL_DECAY = 0.92; // Score decays 8% per "observation period"
const MIN_ACTIVATION = 0.08;  // Below this score, node is considered inactive

// Project-isolated graph key — prevents cross-project feature contamination.
// Falls back to base key when no project is provided (single-project setups).
function getGraphKey(projectId) {
  return projectId ? `${GRAPH_KEY_BASE}_${projectId}` : GRAPH_KEY_BASE;
}

// ─── Graph Node ───────────────────────────────────────────────────────────────

function defaultNode(featureId) {
  return {
    featureId,
    label: FEATURE_ONTOLOGY[featureId]?.label || featureId,
    system: FEATURE_ONTOLOGY[featureId]?.system || 'core',
    activationScore: 0,    // 0-1: how active this feature is right now
    totalObservations: 0,
    lastSeen: null,
    edges: {},             // featureId → edgeWeight (co-occurrence strength)
  };
}

// ─── Graph Persistence ────────────────────────────────────────────────────────

function loadGraph(projectId) {
  try {
    const raw = localStorage.getItem(getGraphKey(projectId));
    return raw ? JSON.parse(raw) : { nodes: {}, lastDecayAt: Date.now() };
  } catch {
    return { nodes: {}, lastDecayAt: Date.now() };
  }
}

function saveGraph(graph, projectId) {
  try {
    localStorage.setItem(getGraphKey(projectId), JSON.stringify(graph));
  } catch {}
}

// ─── Temporal Decay ───────────────────────────────────────────────────────────

function applyDecay(graph) {
  const now = Date.now();
  const hoursSince = (now - (graph.lastDecayAt || now)) / 3600000;

  // Apply decay once per 2 hours of elapsed time
  const decaySteps = Math.floor(hoursSince / 2);
  if (decaySteps === 0) return graph;

  const decayFactor = Math.pow(TEMPORAL_DECAY, decaySteps);

  for (const node of Object.values(graph.nodes)) {
    node.activationScore *= decayFactor;
    for (const edgeId of Object.keys(node.edges)) {
      node.edges[edgeId] *= decayFactor;
    }
    // Remove very weak edges
    for (const [edgeId, w] of Object.entries(node.edges)) {
      if (w < 0.01) delete node.edges[edgeId];
    }
  }

  graph.lastDecayAt = now;
  return graph;
}

// ─── Graph Update ─────────────────────────────────────────────────────────────

/**
 * Activate feature nodes based on detected features in a session.
 * Stronger matches → higher activation boost.
 */
function activateNodes(graph, detectedFeatures) {
  if (!detectedFeatures?.length) return graph;

  for (const feat of detectedFeatures) {
    const id = feat.featureId;
    if (!graph.nodes[id]) graph.nodes[id] = defaultNode(id);

    const node = graph.nodes[id];
    const boost = Math.min(feat.strength * 0.8 + 0.1, 0.9);

    // Additive activation with ceiling
    node.activationScore = Math.min(node.activationScore + boost, 1.0);
    node.totalObservations++;
    node.lastSeen = Date.now();

    // Also activate related features at reduced strength
    const related = FEATURE_ONTOLOGY[id]?.relatedFeatures || [];
    for (const relId of related) {
      if (!graph.nodes[relId]) graph.nodes[relId] = defaultNode(relId);
      graph.nodes[relId].activationScore = Math.min(
        graph.nodes[relId].activationScore + boost * 0.3,
        0.6,
      );
    }
  }

  // Build/strengthen edges between co-occurring features
  for (let i = 0; i < detectedFeatures.length; i++) {
    for (let j = i + 1; j < detectedFeatures.length; j++) {
      const a = detectedFeatures[i].featureId;
      const b = detectedFeatures[j].featureId;
      if (!graph.nodes[a] || !graph.nodes[b]) continue;

      const edgeStrength = (detectedFeatures[i].strength + detectedFeatures[j].strength) / 2 * 0.6;

      graph.nodes[a].edges[b] = Math.min((graph.nodes[a].edges[b] || 0) + edgeStrength, 1.0);
      graph.nodes[b].edges[a] = Math.min((graph.nodes[b].edges[a] || 0) + edgeStrength, 1.0);
    }
  }

  return graph;
}

// ─── Active Feature Cluster Detection ────────────────────────────────────────

/**
 * Find the most active feature cluster using BFS from top-scoring nodes.
 */
function findActiveCluster(graph, maxSize = 5) {
  const activeNodes = Object.values(graph.nodes)
    .filter(n => n.activationScore >= MIN_ACTIVATION)
    .sort((a, b) => b.activationScore - a.activationScore);

  if (!activeNodes.length) return [];

  // BFS from top node to find connected active features
  const cluster = [];
  const visited = new Set();
  const queue = [activeNodes[0].featureId];

  while (queue.length > 0 && cluster.length < maxSize) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    const node = graph.nodes[id];
    if (!node || node.activationScore < MIN_ACTIVATION) continue;

    cluster.push(node);

    // Enqueue connected nodes sorted by edge weight
    const neighbors = Object.entries(node.edges)
      .filter(([nId]) => !visited.has(nId) && graph.nodes[nId]?.activationScore >= MIN_ACTIVATION)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([nId]) => nId);

    queue.push(...neighbors);
  }

  return cluster.sort((a, b) => b.activationScore - a.activationScore);
}

// ─── System Identification ────────────────────────────────────────────────────

function identifyActiveSystem(cluster) {
  if (!cluster.length) return null;

  const systemCounts = {};
  for (const node of cluster) {
    const sys = node.system || 'core';
    systemCounts[sys] = (systemCounts[sys] || 0) + node.activationScore;
  }

  const topSystem = Object.entries(systemCounts).sort(([, a], [, b]) => b - a)[0];

  const systemLabels = {
    core: 'core product system',
    frontend: 'frontend & UI',
    backend: 'backend & data layer',
    analytics: 'analytics & reporting',
    ai: 'AI intelligence engine',
    tracking: 'session tracking system',
  };

  return topSystem
    ? { system: topSystem[0], label: systemLabels[topSystem[0]] || topSystem[0], strength: topSystem[1] }
    : null;
}

// ─── Feature Narrative Builder ────────────────────────────────────────────────

function buildFeatureNarrative(cluster, activeSystem) {
  if (!cluster.length) return null;

  const topFeature = cluster[0];
  const secondFeature = cluster[1];
  const systemLabel = activeSystem?.label || 'product system';

  if (cluster.length >= 3) {
    return `Developing the ${topFeature.label.toLowerCase()}, ${secondFeature.label.toLowerCase()}, and related ${systemLabel} components`;
  }

  if (cluster.length === 2) {
    return `Improving the ${topFeature.label.toLowerCase()} and ${secondFeature.label.toLowerCase()}`;
  }

  return `Building ${topFeature.label.toLowerCase()} functionality`;
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Update the feature graph with detected features from the current session,
 * then return the active feature cluster and related intelligence.
 *
 * @param {Array} detectedFeatures - from contextCompressionEngine features array
 * @returns {Object} featureGraphResult
 */
export function updateAndQueryGraph(detectedFeatures = [], options = {}) {
  const projectId = options?.project?.id || options?.projectId || null;
  let graph = loadGraph(projectId);

  // Apply temporal decay first
  graph = applyDecay(graph);

  // Activate nodes from current session
  graph = activateNodes(graph, detectedFeatures);

  // Persist updated graph (namespaced by project)
  saveGraph(graph, projectId);

  // Find most active feature cluster
  const activeCluster = findActiveCluster(graph, 5);

  // Identify the active system
  const activeSystem = identifyActiveSystem(activeCluster);

  // Build narrative
  const featureNarrative = buildFeatureNarrative(activeCluster, activeSystem);

  // Top feature (most active single feature)
  const topFeature = activeCluster[0] || null;

  // All active features for context
  const allActiveFeatures = Object.values(graph.nodes)
    .filter(n => n.activationScore >= MIN_ACTIVATION)
    .sort((a, b) => b.activationScore - a.activationScore)
    .slice(0, 8)
    .map(n => ({
      featureId: n.featureId,
      label: n.label,
      system: n.system,
      activationScore: Math.round(n.activationScore * 100) / 100,
    }));

  return {
    activeCluster: activeCluster.map(n => ({
      featureId: n.featureId,
      label: n.label,
      system: n.system,
      activationScore: Math.round(n.activationScore * 100) / 100,
    })),
    activeSystem,
    topFeature: topFeature ? {
      featureId: topFeature.featureId,
      label: topFeature.label,
      activationScore: Math.round(topFeature.activationScore * 100) / 100,
    } : null,
    allActiveFeatures,
    featureNarrative,
    graphSize: Object.keys(graph.nodes).length,
  };
}

/**
 * Query the graph without updating it.
 * Use this for read-only access (e.g., UI display).
 */
export function queryGraph(options = {}) {
  return updateAndQueryGraph([], options);
}

/**
 * Reset the feature graph (clear all activation history).
 */
export function resetGraph() {
  saveGraph({ nodes: {}, lastDecayAt: Date.now() });
}
