/**
 * useCalendarAI — React hook for Calendar AI Engine integration
 *
 * Accepts pre-fetched calendar data (Unix timestamps, seconds) from CalendarView
 * and runs all AI engines locally: productivity analysis, session matching,
 * conflict detection, focus forecasting, and insights generation.
 *
 * Usage:
 *   const ai = useCalendarAI({ userId, date, sessions, calEvents, autoSessions, projects, clients });
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { analyzeProductivity } from '../ai/engines/productivityAnalysisEngine.js';
import { generateDayFocusForecast, getNextFocusRecommendation } from '../ai/predictors/focusPredictionEngine.js';
import { analyzeEvent, suggestProjectFromAutoSessions } from '../ai/engines/eventIntelligenceEngine.js';
import { getLastContinuityState } from '../ai/engines/sessionContinuityEngine.js';
import { queryGraph } from '../ai/engines/featureGraphEngine.js';
import {
  matchSessionsToEvents,
  calculateScheduleAdherence,
  findUntrackedGaps,
  mergeAdjacentSessions,
  detectDuplicateSessions,
} from '../ai/matching/sessionMatchingEngine.js';
import { runFullConflictScan } from '../ai/services/calendarConflictEngine.js';
import { recommendBreaks } from '../ai/planning/calendarPlanningEngine.js';
import { parseCommand, executeCommand, getCommandSuggestions, saveCommandToHistory } from '../ai/services/calendarCommandEngine.js';
import { generateInsightsBundleForSidebar } from '../ai/analyzers/calendarInsightsEngine.js';
import { calendarMemoryEngine } from '../ai/memory/calendarMemoryEngine.js';
import { analyzeContext, hasMeaningfulTitle } from '../ai/engines/eventContextAnalyzer.js';
import { writeEventContent, generateTitle, isVagueTitle, recordTitleFeedback, writeMissingEventContent } from '../ai/engines/eventWritingEngine.js';
import { generateSessionRecap, generateDailySummary, generateProductivityNote, suggestLiveTitles, labelDeepWork } from '../ai/engines/sessionSummaryEngine.js';
import { triggerLearning } from '../ai/adaptive/behaviorAnalyticsBridge.js';

// ─── Unix timestamp → ISO string converter ────────────────────────────────────
// CalendarView uses Unix seconds; AI engines expect ISO strings.

function unixToISO(unixSecs) {
  if (!unixSecs || !Number.isFinite(unixSecs)) return null;
  return new Date(unixSecs * 1000).toISOString();
}

/** Convert a session (Unix seconds) to AI-engine format (ISO strings) */
function adaptSession(s) {
  if (!s) return null;
  return {
    ...s,
    started_at: unixToISO(s.started_at),
    ended_at: s.ended_at ? unixToISO(s.ended_at) : null,
    // Keep duration_seconds as-is
  };
}

/** Convert a calendar event (Unix seconds) to AI-engine format */
function adaptCalEvent(e) {
  if (!e) return null;
  return {
    ...e,
    start_time: unixToISO(e.start_time),
    end_time: unixToISO(e.end_time),
  };
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {string}  params.userId
 * @param {Date}    params.date         - currently viewed date
 * @param {Array}   params.sessions     - manual sessions (Unix timestamps, seconds)
 * @param {Array}   params.calEvents    - calendar events (Unix timestamps, seconds)
 * @param {Array}   params.autoSessions - auto-tracked sessions (Unix timestamps, seconds)
 * @param {Array}   params.projects
 * @param {Array}   params.clients
 * @param {Array}   [params.dailyScores]
 * @param {boolean} [params.enabled]
 */
export function useCalendarAI({
  userId,
  date = new Date(),
  sessions = [],
  calEvents = [],
  autoSessions = [],
  projects = [],
  clients = [],
  dailyScores = [],
  enabled = true,
} = {}) {

  const [analysis, setAnalysis]   = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  // Command state
  const [commandInput,   setCommandInput]   = useState('');
  const [commandPreview, setCommandPreview] = useState(null);
  const [commandResult,  setCommandResult]  = useState(null);
  const [commandLoading, setCommandLoading] = useState(false);

  // ─── Data adaptation (Unix → ISO) ──────────────────────────────────────────

  const adaptedSessions     = useMemo(() => sessions.map(adaptSession).filter(Boolean),    [sessions]);
  const adaptedCalEvents    = useMemo(() => calEvents.map(adaptCalEvent).filter(Boolean),  [calEvents]);
  const adaptedAutoSessions= useMemo(() => autoSessions.map(adaptSession).filter(Boolean),[autoSessions]);

  // ─── Core analysis (runs when data changes) ─────────────────────────────────

  const runAnalysis = useCallback(() => {
    if (!userId || !enabled) return;
    if (!adaptedSessions.length && !adaptedCalEvents.length && !adaptedAutoSessions.length) {
      setAnalysis(null);
      return;
    }

    setIsLoading(true);

    // Run synchronously in a timeout so we don't block the render
    const timer = setTimeout(() => {
      if (!isMountedRef.current) return;
      try {
        const allSessions = [...adaptedAutoSessions, ...adaptedSessions];

        // Session matching
        const mergedAuto     = mergeAdjacentSessions(adaptedAutoSessions, 5);
        const enrichedEvents = matchSessionsToEvents(adaptedCalEvents, mergedAuto, adaptedSessions);
        const adherence      = calculateScheduleAdherence(enrichedEvents);
        const duplicateIds   = detectDuplicateSessions(adaptedCalEvents, mergedAuto);

        // Productivity analysis (only actual past sessions)
        const productivity   = analyzeProductivity(allSessions, adaptedCalEvents);

        // Adaptive behavioral learning — runs in a microtask so analysis is never blocked.
        // The engine is a singleton; multiple calls in rapid succession are no-ops.
        Promise.resolve().then(() => {
          try { triggerLearning(adaptedSessions, adaptedAutoSessions); }
          catch (err) { console.warn('[useCalendarAI] Adaptive learning failed:', err); }
        });

        // Conflict detection
        const conflictReport = runFullConflictScan(adaptedCalEvents);

        // Focus forecast for selected date
        const focusForecast  = generateDayFocusForecast(date, adaptedCalEvents);

        // Untracked gaps
        const untrackedGaps  = findUntrackedGaps(allSessions, adaptedCalEvents);

        // Next focus window recommendation
        const nextFocusWindow = getNextFocusRecommendation(new Date(), adaptedCalEvents);

        // Break recommendations
        const breakRecommendations = recommendBreaks(adaptedCalEvents);

        // Pull AI pipeline context for richer insights (read-only, no side effects)
        const continuityProfile = getLastContinuityState();
        const featureGraph      = queryGraph();

        // Insights bundle for sidebar (now includes workflow objective + feature progress)
        const insights = generateInsightsBundleForSidebar({
          autoSessions:      mergedAuto,
          manualSessions:    adaptedSessions,
          calendarEvents:    adaptedCalEvents,
          enrichedEvents,
          dailyScores,
          conflictReport,
          burnoutRisk:       productivity.burnoutRisk,
          continuityProfile,
          featureGraph,
        });

        // Update memory
        calendarMemoryEngine.learnFromSessions(allSessions);

        if (isMountedRef.current) {
          setAnalysis({
            productivity,
            enrichedEvents,
            adherence,
            conflictReport,
            focusForecast,
            untrackedGaps,
            nextFocusWindow,
            breakRecommendations,
            insights,
            duplicateSessionIds: [...duplicateIds],
          });
        }
      } catch (err) {
        console.warn('[useCalendarAI] Analysis failed:', err);
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    }, 50); // Tiny defer so React finishes its render first

    return () => clearTimeout(timer);
  }, [
    userId, enabled, date,
    // Use lengths as cheap dependency — avoids deep comparison
    adaptedSessions.length, adaptedCalEvents.length, adaptedAutoSessions.length,
    dailyScores.length,
  ]);

  useEffect(() => {
    const cleanup = runAnalysis();
    return cleanup;
  }, [runAnalysis]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ─── Command processing ─────────────────────────────────────────────────────

  const previewCommand = useCallback((text) => {
    setCommandInput(text);
    if (!text?.trim() || text.length < 6) { setCommandPreview(null); return; }
    setCommandPreview(parseCommand(text));
  }, []);

  const processCommand = useCallback(async (text, context = {}) => {
    if (!text?.trim()) return null;
    setCommandLoading(true);
    setCommandResult(null);
    try {
      const command = parseCommand(text);
      const result = await executeCommand(command, {
        existingEvents: adaptedCalEvents,
        ...context,
      });
      saveCommandToHistory(command, result);
      if (isMountedRef.current) {
        setCommandResult({ command, result });
        setCommandPreview(null);
        if (result.success) {
          // Trigger re-analysis after command succeeds
          setTimeout(runAnalysis, 300);
        }
      }
      return { command, result };
    } catch (err) {
      const r = { error: err.message };
      if (isMountedRef.current) setCommandResult(r);
      return r;
    } finally {
      if (isMountedRef.current) setCommandLoading(false);
    }
  }, [adaptedCalEvents, runAnalysis]);

  const clearCommand = useCallback(() => {
    setCommandInput('');
    setCommandResult(null);
    setCommandPreview(null);
  }, []);

  const getEventIntelligence = useCallback((event) => {
    const adapted = adaptCalEvent(event);
    if (!adapted) return null;
    return analyzeEvent(adapted, { projects, clients, historicalSessions: adaptedSessions });
  }, [projects, clients, adaptedSessions]);

  // ─── Derived shortcuts ──────────────────────────────────────────────────────

  const productivity       = analysis?.productivity       || null;
  const enrichedEvents     = analysis?.enrichedEvents     || [];
  const adherence          = analysis?.adherence          || null;
  const conflictReport     = analysis?.conflictReport     || null;
  const focusForecast      = analysis?.focusForecast      || null;
  const insights           = analysis?.insights           || null;
  const nextFocusWindow    = analysis?.nextFocusWindow    || null;
  const breakRecommendations = analysis?.breakRecommendations || [];
  const untrackedGaps      = analysis?.untrackedGaps      || [];
  const duplicateSessionIds= analysis?.duplicateSessionIds || [];

  const topRecommendation   = insights?.recommendations?.[0] || null;
  const hasAlerts           = insights?.summary?.hasAlerts || false;
  const currentSession      = insights?.currentSession || null;
  const nextEvent           = insights?.nextEvent || null;
  const scheduleQuality     = insights?.scheduleQuality || null;
  const focusTrend          = insights?.focusTrend || null;
  const deepWorkRatio       = insights?.deepWorkRatio || null;
  const missedSessions      = insights?.missedSessions || [];

  // New intelligence shortcuts
  const workflowObjective   = insights?.workflowObjective   || null;
  const implementationPhase = insights?.implementationPhase || null;
  const aiToolUsage         = insights?.aiToolUsage         || null;
  const featureProgress     = insights?.featureProgress     || null;
  const currentWorkType     = insights?.summary?.currentWorkType || null;

  // Build a map of eventId → enrichment for quick lookup in the calendar grid
  const enrichedEventMap = useMemo(() => {
    const map = new Map();
    for (const e of enrichedEvents) {
      if (e.id) map.set(e.id, e._ai);
    }
    return map;
  }, [enrichedEvents]);

  return {
    // State
    isLoading,
    analysis,
    insights,

    // Productivity
    productivity,
    enrichedEvents,
    enrichedEventMap,
    adherence,
    conflictReport,
    focusForecast,
    nextFocusWindow,
    breakRecommendations,
    untrackedGaps,
    duplicateSessionIds,

    // Insight shortcuts
    topRecommendation,
    hasAlerts,
    currentSession,
    nextEvent,
    scheduleQuality,
    focusTrend,
    deepWorkRatio,
    missedSessions,

    // New intelligence shortcuts
    workflowObjective,
    implementationPhase,
    aiToolUsage,
    featureProgress,
    currentWorkType,

    // Command
    commandInput,
    commandPreview,
    commandResult,
    commandLoading,
    previewCommand,
    processCommand,
    clearCommand,
    getCommandSuggestions,

    // Event intelligence
    getEventIntelligence,

    // ─── Event Writing Engine ────────────────────────────────────────────────

    /**
     * Generate AI title + description for a session that has no meaningful title.
     * Pass the session, its overlapping auto-sessions, project, and client.
     * Returns null if the session already has a meaningful title.
     */
    writeEventContent: useCallback((session, sessionAutoSessions = [], project = null, client = null) => {
      if (!session) return null;
      if (hasMeaningfulTitle(session.title)) return null;

      const context = analyzeContext({
        autoSessions: sessionAutoSessions,
        session,
        project,
        client,
      });

      return writeEventContent(context, {
        title: session.title,
        description: session.notes || session.description,
      });
    }, []),

    /**
     * Generate just a title for a session from its context.
     */
    generateSessionTitle: useCallback((session, sessionAutoSessions = [], project = null, client = null) => {
      const context = analyzeContext({ autoSessions: sessionAutoSessions, session, project, client });
      return generateTitle(context);
    }, []),

    /**
     * Get live title suggestions for a session in progress.
     * Call this every 30-60s while the user is tracking.
     */
    getLiveTitleSuggestions: useCallback((liveAutoSessions = [], project = null, client = null) => {
      return suggestLiveTitles(liveAutoSessions, project, client);
    }, []),

    /**
     * Auto-fill titles/descriptions for all sessions in the current view
     * that have vague or missing titles.
     */
    fillMissingTitles: useCallback(() => {
      if (!adaptedSessions.length) return [];
      return writeMissingEventContent(adaptedSessions, adaptedAutoSessions, projects, clients);
    }, [adaptedSessions, adaptedAutoSessions, projects, clients]),

    /**
     * Generate a rich recap for a completed session.
     */
    getSessionRecap: useCallback((session, sessionAutoSessions = [], project = null, client = null) => {
      if (!session) return null;
      return generateSessionRecap(session, sessionAutoSessions, project, client);
    }, []),

    /**
     * Get the deep work label for a session (e.g. "Deep Focus", "Quick Session").
     */
    getDeepWorkLabel: useCallback((session, sessionAutoSessions = []) => {
      return labelDeepWork(session, sessionAutoSessions);
    }, []),

    /**
     * Generate a short productivity note for a session block.
     */
    getProductivityNote: useCallback((session, sessionAutoSessions = []) => {
      return generateProductivityNote(session, sessionAutoSessions);
    }, []),

    /**
     * Today's daily summary — memoized to avoid recomputing on every render.
     */
    dailySummary: useMemo(() => generateDailySummary(
      date,
      adaptedSessions,
      adaptedAutoSessions,
      adaptedCalEvents,
      projects,
      clients,
    ), [date, adaptedSessions.length, adaptedAutoSessions.length, adaptedCalEvents.length, projects, clients]),

    /** @deprecated Use dailySummary directly. Kept for backward compat. */
    getDailySummary: useCallback(() => generateDailySummary(
      date, adaptedSessions, adaptedAutoSessions, adaptedCalEvents, projects, clients,
    ), [date, adaptedSessions.length, adaptedAutoSessions.length, adaptedCalEvents.length, projects, clients]),

    /**
     * Get a unified workflow context object for display in the UI.
     * Combines objective, phase, feature progress, and AI tool usage.
     */
    getWorkflowContext: useCallback(() => ({
      objective:    workflowObjective,
      phase:        implementationPhase,
      aiUsage:      aiToolUsage,
      features:     featureProgress,
      workType:     currentWorkType,
      hasContext:   !!(workflowObjective || featureProgress || implementationPhase),
    }), [workflowObjective, implementationPhase, aiToolUsage, featureProgress, currentWorkType]),

    /**
     * Suggest the best-matching project for a focus session.
     * Uses auto-session telemetry (window titles, app names) — much more
     * accurate than matching only on the session title string.
     *
     * @param {Object} session          - the manual session record
     * @param {Array}  sessionAutoSessions - raw auto-sessions for this time window
     * @param {Array}  projectList      - optional override project list (defaults to hook's projects)
     * @returns {{ projectId, projectName, projectColor, confidence, source } | null}
     */
    suggestProject: useCallback((session, sessionAutoSessions = [], projectList = null) => {
      const list = projectList || projects;
      if (!list.length) return null;
      return suggestProjectFromAutoSessions(
        sessionAutoSessions,
        list,
        session?.title || '',
      );
    }, [projects]),

    /** Record whether the user kept or edited an AI-generated title. */
    recordTitleFeedback,

    /** Check if a title is vague/empty and needs AI replacement. */
    isVagueTitle,

    // Memory
    getMemorySnapshot: () => calendarMemoryEngine.snapshot(),
    setWorkHours: (s, e) => calendarMemoryEngine.setPreferredWorkHours(s, e),

    // Manual refresh
    refresh: runAnalysis,
  };
}

export default useCalendarAI;
