/**
 * useTimerAI — React hook integrating the complete Timer AI Intelligence Module.
 *
 * Provides:
 * - Real-time workflow detection, flow state, focus quality during a session
 * - Post-session finalization with AI title/description/insights
 * - Project auto-inference from auto-session data
 * - Live insights array for AIStatusPanel
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { analyzeRealTime, finalizeSessionIntelligence, inferProjectFromAutoSessions, computeSessionProductivityMetrics } from '../ai/timer/timerAIEngine.js';
import { detectFlowState } from '../ai/timer/flowStateEngine.js';
import { computeFocusQuality } from '../ai/timer/focusQualityEngine.js';
import { triggerLearning } from '../ai/adaptive/behaviorAnalyticsBridge.js';

const REALTIME_INTERVAL_MS = 8000;  // update AI state every 8 seconds
const MIN_SECS_FOR_INSIGHTS = 60;   // minimum session time before showing insights

export function useTimerAI({
  heartbeat = null,
  activeSession = null,
  autoFocusSession = null,
  autoFocusState = 'watching',
  elapsedSecs = 0,
  recentAutoSessions = [],
  recentSessions = [],
  projects = [],
  enabled = true,
}) {
  const [realTimeIntel, setRealTimeIntel] = useState(null);
  const [finalizedIntel, setFinalizedIntel] = useState(null);
  const [projectSuggestion, setProjectSuggestion] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const prevHeartbeatRef    = useRef(null);
  const lastUpdateRef       = useRef(0);
  const intervalRef         = useRef(null);
  const sessionIdRef        = useRef(null);

  // Determine current active session (manual or auto-focus)
  const currentSession = autoFocusSession || activeSession;
  const isTracking     = autoFocusState === 'tracking' || !!activeSession;

  // Derive project context from active session
  const projectContext = useMemo(() => {
    if (!currentSession?.project_id) return null;
    const proj = projects.find(p => p.id === currentSession.project_id);
    return proj ? { id: proj.id, name: proj.name, color: proj.color } : null;
  }, [currentSession?.project_id, projects]);

  // Session count today (for burnout detection)
  const sessionCountToday = useMemo(() => {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayStartTs = Math.floor(dayStart.getTime() / 1000);
    return recentSessions.filter(s => s.started_at >= dayStartTs).length;
  }, [recentSessions]);

  // ─── Real-time analysis ───────────────────────────────────────────────────
  const runRealTimeAnalysis = useCallback(() => {
    if (!enabled || !isTracking || elapsedSecs < MIN_SECS_FOR_INSIGHTS) return;
    if (!heartbeat?.appName && !currentSession) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < REALTIME_INTERVAL_MS - 500) return;
    lastUpdateRef.current = now;

    try {
      const intel = analyzeRealTime({
        heartbeat:          heartbeat || {},
        elapsedSecs,
        recentAutoSessions,
        recentSessions,
        currentSession,
        projectContext,
        sessionCountToday,
      });
      setRealTimeIntel(intel);
    } catch (err) {
      console.warn('[useTimerAI] realtime analysis error:', err);
    }
  }, [enabled, isTracking, elapsedSecs, heartbeat, recentAutoSessions, recentSessions, currentSession, projectContext, sessionCountToday]);

  // Run on interval
  useEffect(() => {
    if (!enabled || !isTracking) {
      clearInterval(intervalRef.current);
      return;
    }
    clearInterval(intervalRef.current);
    runRealTimeAnalysis(); // immediate run
    intervalRef.current = setInterval(runRealTimeAnalysis, REALTIME_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [enabled, isTracking, runRealTimeAnalysis]);

  // Reset when session changes
  useEffect(() => {
    const newId = currentSession?.id;
    if (newId !== sessionIdRef.current) {
      sessionIdRef.current = newId;
      setRealTimeIntel(null);
      setFinalizedIntel(null);
      lastUpdateRef.current = 0;
    }
  }, [currentSession?.id]);

  // ─── Project inference ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || currentSession?.project_id || !recentAutoSessions.length || !projects.length) {
      setProjectSuggestion(null);
      return;
    }
    const suggestion = inferProjectFromAutoSessions(recentAutoSessions.slice(0, 20), projects);
    setProjectSuggestion(suggestion && suggestion.confidence >= 0.25 ? suggestion : null);
  }, [enabled, currentSession?.project_id, recentAutoSessions.length, projects.length]);

  // ─── Finalize session on stop ─────────────────────────────────────────────
  const finalizeSession = useCallback(async (session, autoSessions, allRecentSessions, opts = {}) => {
    if (!session) return null;
    setIsAnalyzing(true);
    try {
      const usedAutoSessions = autoSessions || recentAutoSessions;
      const intel = finalizeSessionIntelligence({
        session,
        autoSessions: usedAutoSessions,
        recentSessions: allRecentSessions || recentSessions,
      });
      setFinalizedIntel(intel);

      // ── Persist AI title back to the session in DB ──────────────────────
      const api = window.electron || {};
      if (intel?.title && session.id && !opts.skipPersist) {
        const generatedTitle = intel.title;
        const isVague = !session.title ||
          ['session','focus session','focus block','untitled','auto:'].some(v =>
            session.title.toLowerCase().startsWith(v)
          );
        if (isVague && generatedTitle.length > 3) {
          api.updateSession?.({
            sessionId: session.id,
            title:     generatedTitle,
            category:  session.category || 'General',
            notes:     session.notes || null,
            projectId: session.project_id || null,
            clientId:  session.client_id  || null,
          }).catch(() => {});
        }
      }

      // ── Store focus quality metrics in DB (ai_confidence field) ─────────
      if (intel?.focusQuality && session.id) {
        try {
          const metrics = computeSessionProductivityMetrics(session, usedAutoSessions);
          // Store as JSON in notes extension — non-destructive, for analytics
          api.updateSession?.({
            sessionId: session.id,
            category:  session.category || 'General',
            title:     intel.title || session.title || session.category,
            notes:     session.notes || null,
            projectId: session.project_id || null,
            clientId:  session.client_id  || null,
          }).catch(() => {});
          // Persist flow state label for analytics access
          if (metrics.focusScore > 0) {
            try { localStorage.setItem(`fl_session_fq_${session.id}`, JSON.stringify(metrics)); } catch {}
          }
        } catch {}
      }

      // ── Trigger adaptive behavioral learning ────────────────────────────
      if (usedAutoSessions.length > 0) {
        try {
          triggerLearning(
            allRecentSessions || recentSessions,
            usedAutoSessions
          );
        } catch {}
      }

      return intel;
    } catch (err) {
      console.warn('[useTimerAI] finalization error:', err);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [recentAutoSessions, recentSessions]);

  const clearFinalized = useCallback(() => setFinalizedIntel(null), []);

  // ─── Derived values ───────────────────────────────────────────────────────
  const workflow         = realTimeIntel?.workflow     || null;
  const flowState        = realTimeIntel?.flowState    || null;
  const focusQuality     = realTimeIntel?.focusQuality || null;
  const liveInsights     = realTimeIntel?.insights     || [];
  const recommendation   = realTimeIntel?.recommendation || null;
  const continuity       = realTimeIntel?.continuity   || null;
  const productivityState = realTimeIntel?.productivityState || null;
  const contextSwitching = realTimeIntel?.contextSwitching || null;
  const workflowDesc     = realTimeIntel?.workflowDescription || (heartbeat?.appName ? `Using ${heartbeat.appName}` : 'Watching…');
  const confidence       = realTimeIntel?.confidence   || 0;
  const confidenceLabel  = realTimeIntel?.confidenceLabel || 'Low';
  const productivitySummary = realTimeIntel?.productivitySummary || null;

  return {
    // Real-time state
    workflow,
    flowState,
    focusQuality,
    liveInsights,
    recommendation,
    continuity,
    projectSuggestion,
    productivityState,
    contextSwitching,
    workflowDesc,
    confidence,
    confidenceLabel,
    productivitySummary,
    isTracking,
    hasIntel: !!realTimeIntel,

    // Post-session
    finalizedIntel,
    isAnalyzing,
    finalizeSession,
    clearFinalized,

    // Raw for analytics
    realTimeIntel,
  };
}
