/**
 * Calendar AI Engine — Main Orchestrator
 * Coordinates all sub-engines: memory, productivity analysis, focus prediction,
 * event intelligence, session matching, conflict detection, planning,
 * commands, and insights.
 *
 * Usage:
 *   import { calendarAIEngine } from '../ai/engines/calendarAIEngine';
 *   const insights = await calendarAIEngine.analyze(userId, date);
 */

import { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';
import { analyzeProductivity } from './productivityAnalysisEngine.js';
import { generateDayFocusForecast, getNextFocusRecommendation } from '../predictors/focusPredictionEngine.js';
import { analyzeEvents, analyzeEvent } from './eventIntelligenceEngine.js';
import {
  matchSessionsToEvents,
  calculateScheduleAdherence,
  findUntrackedGaps,
  mergeAdjacentSessions,
  detectDuplicateSessions,
} from '../matching/sessionMatchingEngine.js';
import { runFullConflictScan, assessWeeklyBurnoutRisk } from '../services/calendarConflictEngine.js';
import {
  generateWeeklySchedule,
  generateDeepWorkRecommendations,
  recommendBreaks,
} from '../planning/calendarPlanningEngine.js';
import { parseCommand, executeCommand } from '../services/calendarCommandEngine.js';
import { generateInsightsBundleForSidebar } from '../analyzers/calendarInsightsEngine.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function invalidateCache(prefix = '') {
  if (!prefix) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ─── Event Bus ────────────────────────────────────────────────────────────────

const EVENT_NS = 'fl-ai-calendar';

function dispatch(eventName, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(`${EVENT_NS}:${eventName}`, {
      detail: { ...detail, timestamp: new Date().toISOString() },
      bubbles: false,
    }));
  } catch {}
}

function subscribe(eventName, handler) {
  const fullName = `${EVENT_NS}:${eventName}`;
  window.addEventListener(fullName, handler);
  return () => window.removeEventListener(fullName, handler);
}

// ─── Data Fetching Helpers ────────────────────────────────────────────────────

async function fetchSessions(userId, startDate, endDate) {
  if (!window.electron?.listSessions) return [];
  try {
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);
    const result = await window.electron.listSessions(userId, start, end);
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

async function fetchAutoSessions(userId, date) {
  try {
    if (window.electron?.autoSessionsByDate) {
      const dateKey = date.toISOString().slice(0, 10);
      const result = await window.electron.autoSessionsByDate(userId, dateKey);
      return Array.isArray(result) ? result : [];
    }
    if (window.electron?.autoSessionsToday) {
      const result = await window.electron.autoSessionsToday(userId);
      return Array.isArray(result) ? result : [];
    }
    return [];
  } catch { return []; }
}

async function fetchAutoSessionsRange(userId, startDate, endDate) {
  if (!window.electron?.autoSessionsRange) return [];
  try {
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);
    const result = await window.electron.autoSessionsRange(userId, start, end);
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

async function fetchCalendarEvents(userId, startDate, endDate) {
  if (!window.electron?.listCalendarEvents) return [];
  try {
    const result = await window.electron.listCalendarEvents(
      userId,
      startDate.toISOString(),
      endDate.toISOString()
    );
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

// ─── Main Analysis ────────────────────────────────────────────────────────────

/**
 * Run full daily analysis for a given date and user.
 * Combines productivity, session matching, conflict detection, and insights.
 * @param {string} userId
 * @param {Date} date
 * @param {Object} options - { forceRefresh, projects, clients, dailyScores }
 * @returns {Promise<Object>}
 */
async function analyze(userId, date = new Date(), options = {}) {
  const { forceRefresh = false, projects = [], clients = [], dailyScores = [] } = options;

  const dateKey = date.toISOString().slice(0, 10);
  const cacheKey = `analysis:${userId}:${dateKey}`;

  if (!forceRefresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  dispatch('analysis:start', { date: dateKey });

  try {
    // Fetch data in parallel
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [autoSessions, manualSessions, calendarEvents] = await Promise.all([
      fetchAutoSessions(userId, date),
      fetchSessions(userId, dayStart, dayEnd),
      fetchCalendarEvents(userId, dayStart, dayEnd),
    ]);

    // Session processing
    const mergedAutoSessions = mergeAdjacentSessions(autoSessions, 5);
    const allSessions = [...mergedAutoSessions, ...manualSessions];

    // Match sessions to events
    const enrichedEvents = matchSessionsToEvents(calendarEvents, mergedAutoSessions, manualSessions);

    // Detect duplicates
    const duplicateIds = detectDuplicateSessions(calendarEvents, mergedAutoSessions);

    // Schedule adherence
    const adherence = calculateScheduleAdherence(enrichedEvents);

    // Productivity analysis
    const productivity = analyzeProductivity(allSessions, calendarEvents);

    // Conflict detection
    const conflictReport = runFullConflictScan(calendarEvents);

    // Focus forecast
    const focusForecast = generateDayFocusForecast(date, calendarEvents);

    // Event intelligence
    const eventAnalyses = analyzeEvents(calendarEvents, { projects, clients, historicalSessions: manualSessions });

    // Untracked gaps
    const untrackedGaps = findUntrackedGaps(allSessions, calendarEvents);

    // Next focus recommendation
    const nextFocusWindow = getNextFocusRecommendation(new Date(), calendarEvents);

    // Break recommendations
    const breakRecommendations = recommendBreaks(calendarEvents);

    // Insights bundle
    const insights = generateInsightsBundleForSidebar({
      autoSessions: mergedAutoSessions,
      manualSessions,
      calendarEvents,
      enrichedEvents,
      dailyScores,
      conflictReport,
      burnoutRisk: productivity.burnoutRisk,
    });

    const result = {
      date: dateKey,
      userId,
      timestamp: new Date().toISOString(),

      // Raw data (filtered)
      autoSessions: mergedAutoSessions,
      manualSessions,
      calendarEvents,
      enrichedEvents,
      duplicateSessionIds: [...duplicateIds],

      // Analysis results
      productivity,
      adherence,
      conflictReport,
      focusForecast,
      eventAnalyses: Object.fromEntries(eventAnalyses),
      untrackedGaps,
      nextFocusWindow,
      breakRecommendations,
      insights,

      // Meta
      dataQuality: {
        hasAutoSessions: mergedAutoSessions.length > 0,
        hasManualSessions: manualSessions.length > 0,
        hasCalendarEvents: calendarEvents.length > 0,
        totalTrackedMins: Math.round(
          allSessions.reduce((sum, s) => sum + (s.duration_seconds || 0) / 60, 0)
        ),
      },
    };

    setCache(cacheKey, result);
    dispatch('analysis:complete', { date: dateKey, score: productivity.overallScore });

    // Update memory with new patterns
    calendarMemoryEngine.learnFromSessions(allSessions);
    calendarMemoryEngine.learnFromMeetings(
      calendarEvents.filter(e => (e.title || '').toLowerCase().includes('meeting') ||
        (e.ai_category || '').toLowerCase() === 'meeting')
    );

    return result;

  } catch (error) {
    console.error('[CalendarAI] Analysis failed:', error);
    dispatch('analysis:error', { error: error.message });
    return { error: error.message, date: dateKey };
  }
}

// ─── Weekly Analysis ──────────────────────────────────────────────────────────

/**
 * Run weekly analysis and schedule generation.
 * @param {string} userId
 * @param {Date} weekStart - Monday of target week
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function analyzeWeek(userId, weekStart, options = {}) {
  const { projects = [], clients = [] } = options;

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const [autoSessions, manualSessions, calendarEvents] = await Promise.all([
    fetchAutoSessionsRange(userId, weekStart, weekEnd),
    fetchSessions(userId, weekStart, weekEnd),
    fetchCalendarEvents(userId, weekStart, weekEnd),
  ]);

  const weeklySchedule = generateWeeklySchedule(weekStart, calendarEvents, projects);
  const burnoutRisk = assessWeeklyBurnoutRisk(calendarEvents);

  const allSessions = [...autoSessions, ...manualSessions];
  const productivity = analyzeProductivity(allSessions, calendarEvents);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    weeklySchedule,
    burnoutRisk,
    productivity,
    totalEvents: calendarEvents.length,
    totalSessions: allSessions.length,
  };
}

// ─── Command Processing ───────────────────────────────────────────────────────

/**
 * Process a natural language calendar command.
 * @param {string} commandText
 * @param {Object} context - { userId, existingEvents, onCreateEvent, onUpdateEvent, onDeleteEvent }
 * @returns {Promise<Object>}
 */
async function processCommand(commandText, context = {}) {
  const command = parseCommand(commandText);

  dispatch('command:parsed', { command });

  const result = await executeCommand(command, {
    existingEvents: context.existingEvents || [],
    onCreateEvent: context.onCreateEvent,
    onUpdateEvent: context.onUpdateEvent,
    onDeleteEvent: context.onDeleteEvent,
  });

  if (result.success) {
    invalidateCache(`analysis:${context.userId}`);
    dispatch('command:executed', { command, result });
  }

  return { command, result };
}

// ─── Event Intelligence ───────────────────────────────────────────────────────

/**
 * Get AI suggestions for a specific event.
 * @param {Object} event
 * @param {Object} context - { projects, clients, historicalSessions }
 * @returns {Object}
 */
function analyzeEventIntelligence(event, context = {}) {
  return analyzeEvent(event, context);
}

// ─── Live Insights ────────────────────────────────────────────────────────────

/**
 * Get the current live insights without a full analysis run.
 * Faster than analyze() — uses cached data + live session state.
 * @param {string} userId
 * @param {Object} context - pre-fetched data
 * @returns {Object}
 */
function getLiveInsights(userId, context = {}) {
  const {
    autoSessions = [],
    manualSessions = [],
    calendarEvents = [],
    enrichedEvents = [],
    dailyScores = [],
    conflictReport = null,
  } = context;

  return generateInsightsBundleForSidebar({
    autoSessions,
    manualSessions,
    calendarEvents,
    enrichedEvents,
    dailyScores,
    conflictReport,
    burnoutRisk: null,
  });
}

// ─── Memory Access ────────────────────────────────────────────────────────────

function getMemorySnapshot() {
  return calendarMemoryEngine.snapshot();
}

function resetMemory() {
  calendarMemoryEngine.reset();
  invalidateCache();
}

function setWorkHours(start, end) {
  calendarMemoryEngine.setPreferredWorkHours(start, end);
  invalidateCache();
}

// ─── Subscription Helpers ─────────────────────────────────────────────────────

function onAnalysisComplete(handler) {
  return subscribe('analysis:complete', e => handler(e.detail));
}

function onAnalysisStart(handler) {
  return subscribe('analysis:start', e => handler(e.detail));
}

function onCommandExecuted(handler) {
  return subscribe('command:executed', e => handler(e.detail));
}

// ─── Engine Export ────────────────────────────────────────────────────────────

export const calendarAIEngine = {
  // Core
  analyze,
  analyzeWeek,
  processCommand,
  analyzeEventIntelligence,
  getLiveInsights,

  // Memory
  getMemorySnapshot,
  resetMemory,
  setWorkHours,

  // Event subscriptions
  onAnalysisComplete,
  onAnalysisStart,
  onCommandExecuted,

  // Cache management
  invalidateCache,

  // Direct engine access (for advanced use)
  memory: calendarMemoryEngine,
};

export default calendarAIEngine;
