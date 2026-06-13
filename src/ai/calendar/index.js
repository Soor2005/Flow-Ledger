/**
 * Calendar AI — Public API
 * Single import point for all calendar AI capabilities.
 *
 * Usage:
 *   import { calendarAI, parseCommand, analyzeProductivity } from 'src/ai/calendar';
 *
 * For React components:
 *   import { useCalendarAI } from 'src/hooks/useCalendarAI';
 */

// ─── Main Orchestrator ────────────────────────────────────────────────────────
export { calendarAIEngine, default as calendarAI } from '../engines/calendarAIEngine.js';

// ─── Memory ───────────────────────────────────────────────────────────────────
export { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';

// ─── Productivity Analysis ────────────────────────────────────────────────────
export {
  analyzeProductivity,
  calculateFocusQualityScore,
  calculateContextSwitchingScore,
  calculateBurnoutRisk,
  analyzeDistraction,
  analyzeDeepWork,
  calculateSessionEfficiency,
  analyzePlannedVsActual,
  analyzeRecovery,
  generateProductivityInsights,
} from '../engines/productivityAnalysisEngine.js';

// ─── Focus Prediction ─────────────────────────────────────────────────────────
export {
  buildHourlyFocusMap,
  predictBestFocusWindows,
  predictLowEnergyPeriods,
  recommendDeepWorkSlots,
  predictRecoveryTiming,
  generateDayFocusForecast,
  getNextFocusRecommendation,
} from '../predictors/focusPredictionEngine.js';

// ─── Event Intelligence ───────────────────────────────────────────────────────
export {
  detectCategory,
  detectSessionType,
  isDeepWork,
  estimateDuration,
  matchProject,
  matchClient,
  analyzeEvent,
  analyzeEvents,
  enrichAutoSession,
  suggestEventTitles,
} from '../engines/eventIntelligenceEngine.js';

// ─── Session Matching ─────────────────────────────────────────────────────────
export {
  findOverlappingSessions,
  matchSessionsToEvents,
  detectDuplicateSessions,
  buildCompletedSession,
  calculateScheduleAdherence,
  findUntrackedGaps,
  mergeAdjacentSessions,
} from '../matching/sessionMatchingEngine.js';

// ─── Conflict Detection ───────────────────────────────────────────────────────
export {
  detectOverlaps,
  detectBackToBack,
  detectMeetingOverload,
  detectFocusInterruptions,
  detectLongFocusBlocks,
  detectOverloadedDay,
  assessWeeklyBurnoutRisk,
  runFullConflictScan,
  CONFLICT_TYPES,
  SEVERITY,
} from '../services/calendarConflictEngine.js';

// ─── Planning ─────────────────────────────────────────────────────────────────
export {
  generateDeepWorkRecommendations,
  generateMeetingBalancingPlan,
  allocateProjectTime,
  generateWeeklySchedule,
  recommendBreaks,
} from '../planning/calendarPlanningEngine.js';

// ─── Commands ─────────────────────────────────────────────────────────────────
export {
  parseCommand,
  executeCommand,
  saveCommandToHistory,
  getCommandHistory,
  getCommandSuggestions,
  INTENTS,
} from '../services/calendarCommandEngine.js';

// ─── Insights ─────────────────────────────────────────────────────────────────
export {
  getCurrentSessionInsight,
  getNextEventInsight,
  getMissedSessions,
  getFocusTrend,
  getDeepWorkRatioInsight,
  getScheduleQualityInsight,
  getProductivityPeakInsight,
  generateAIRecommendations,
  generateInsightsBundleForSidebar,
  // New intelligence insights
  getWorkflowObjectiveInsight,
  getImplementationPhaseInsight,
  getAIToolUsageInsight,
  getFeatureProgressInsight,
} from '../analyzers/calendarInsightsEngine.js';

// ─── Event Context Analyzer ───────────────────────────────────────────────────
export {
  analyzeContext,
  analyzeSessionContext,
  hasMeaningfulTitle,
  extractWindowTitlePhrases,
  detectWorkSubtype,
  cleanWindowTitle,
  APP_CATEGORIES,
  DOMAIN_TOPICS,
  CATEGORY_VERBS,
  WORK_SUBTYPES,
} from '../engines/eventContextAnalyzer.js';

// ─── Event Writing Engine ─────────────────────────────────────────────────────
export {
  generateTitle,
  generateDescription,
  writeEventContent,
  writeMissingEventContent,
  isVagueTitle,
  improvVagueTitle,
  recordTitleFeedback,
} from '../engines/eventWritingEngine.js';

// ─── Session Summary Engine ───────────────────────────────────────────────────
export {
  generateSessionRecap,
  generateDailySummary,
  generateWeeklySummary,
  generateProductivityNote,
  suggestLiveTitles,
  labelDeepWork,
} from '../engines/sessionSummaryEngine.js';

// ─── Contextual Reasoning System (v3) ────────────────────────────────────────

// Productivity Ontology
export {
  WORKFLOW_ARCHETYPES,
  FEATURE_ONTOLOGY,
  SEMANTIC_TERM_GROUPS,
  PRODUCTIVITY_STATES,
  matchWorkflowArchetype,
  matchProductFeatures,
  getSemanticGroup,
  detectProductivityState,
} from '../engines/productivityOntologyEngine.js';

// Context Compression
export {
  compressContext,
  contextFingerprint,
} from '../engines/contextCompressionEngine.js';

// Behavioral Inference
export {
  inferBehavior,
  getBehaviorVerb,
  summarizeBehavior,
} from '../engines/behaviorInferenceEngine.js';

// Semantic Memory
export {
  semanticMemory,
} from '../engines/semanticMemoryEngine.js';
// Note: semanticMemory is a singleton class instance with methods:
//   .remember(record)              — store a session in semantic memory
//   .findSimilar(record, topK)     — cosine-similarity search
//   .recallByFeature(featureIds)   — recall by feature cluster
//   .recallByDominantWorkflow(lbl) — recall by dominant workflow label (v3)
//   .detectRecurringThemes()       — recurring theme detection
//   .getWorkflowClusters()         — cluster sessions (surfaces workflowLabel)
//   .recallRecurringObjectives()   — recurring objective inference

// Session Continuity
export {
  analyzeContinuity,
  getLastContinuityState,
} from '../engines/sessionContinuityEngine.js';

// Feature Graph
export {
  updateAndQueryGraph,
  queryGraph,
  resetGraph,
} from '../engines/featureGraphEngine.js';

// Workflow State
export {
  resolveWorkflowState,
  quickWorkTypeLabel,
} from '../engines/workflowStateEngine.js';

// Contextual Reasoning (legacy — use reasoningOrchestrator for new code)
export {
  reason,
  reasonSync,
  getModeActionVerb,
} from '../engines/contextualReasoningEngine.js';

// Narrative Synthesis
export {
  synthesize,
  synthesizeBatch,
} from '../engines/narrativeSynthesisEngine.js';

// ─── Contextual Intelligence Pipeline (v4) ───────────────────────────────────

// Unified orchestrator — primary entry point for all AI generation
export {
  orchestrateSync,
  orchestrate,
  invalidateCache,
  getCacheStats,
} from '../reasoningOrchestrator.js';

// Telemetry Sanitizer
export {
  sanitizeSessions,
  sanitizeWindowTitle,
  normalizeAppName,
  normalizeURL,
} from '../engines/telemetrySanitizer.js';

// Signal Ranking
export {
  rankSignals,
  extractSignals,
  scoreSignals,
  getTopPhrases,
  getMeaningfulTools,
} from '../engines/signalRankingEngine.js';

// Intent Inference
export {
  inferIntent,
  getIntentVerb,
  INTENT_TYPES,
} from '../engines/intentInferenceEngine.js';

// Humanization
export {
  humanize,
  humanizeTerm,
  quickWorkflowPhrase,
} from '../engines/humanizationEngine.js';

// ─── Semantic Workflow Intelligence (v2) ─────────────────────────────────────

// Workflow Segmentation (Rize-style workblock grouping)
export {
  segmentWorkflow,
  mergeSegments,
  segmentsAreRelated,
  getSegmentPrimaryEco,
} from '../engines/workflowSegmentationEngine.js';

// Workblock Fusion (semantic context convergence)
export {
  fuseWorkblock,
  fuseWorkblockSync,
  getFusedPhrase,
} from '../engines/workblockFusionEngine.js';

// Expanded Ontology exports
export {
  WORKFLOW_CONCEPTS,
  IMPLEMENTATION_STAGE_VOCABULARY,
  INTENT_FEATURE_PHRASES,
  getIntentFeaturePhrase,
  // Workflow dominance ontology (v3)
  WORKFLOW_DOMINANCE_WEIGHTS,
  NOISE_APP_PATTERNS,
  NOISE_URL_PATTERNS,
  getWorkflowDominanceWeight,
  isNoiseActivity,
} from '../engines/productivityOntologyEngine.js';

// ─── Workflow Dominance ───────────────────────────────────────────────────────
export {
  analyzeDominance,
  getDominantSessions,
  getSessionSegmentation,
  WORKFLOW_CLASS,
} from '../engines/workflowDominanceEngine.js';

// ─── Title Quality Filters (v4) ───────────────────────────────────────────────

// Generic Keyword Filter — prevents "Inspecting Productivity" class titles
export {
  ABSOLUTE_GENERICS,
  COMPOUND_SAFE_GENERICS,
  AUTO_REJECT_TITLE_PATTERNS,
  isGenericWord,
  isGenericSubject,
  scoreSubjectSpecificity,
  filterGenericKeywords,
  rankPhrasesBySpecificity,
  checkTitleRejectPatterns,
  detectRepetition,
  pickBestSubject,
} from '../engines/genericKeywordFilter.js';

// Action Inference Engine — Action + Subject before keyword-based generation
export {
  ACTION_DEFINITIONS,
  inferAction,
  getActionVerbsForMode,
} from '../engines/actionInferenceEngine.js';

// Narrative Quality Engine — quality scoring and auto-rejection gate
export {
  QUALITY_PASS_THRESHOLD,
  QUALITY_WARN_THRESHOLD,
  scoreTitle,
  scoreDescription,
  checkNarrativeQuality,
  isTitleAcceptable,
  extractTitleSubject,
  describeQuality,
} from '../engines/narrativeQualityEngine.js';
