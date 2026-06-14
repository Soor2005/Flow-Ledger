const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Auth — legacy local
  register:      (d) => ipcRenderer.invoke('auth:register', d),
  login:         (d) => ipcRenderer.invoke('auth:login', d),
  restoreSession:(d) => ipcRenderer.invoke('auth:restoreSession', d),
  updateTarget:  (d) => ipcRenderer.invoke('auth:updateTarget', d),
  updateProfile: (d) => ipcRenderer.invoke('user:updateProfile', d),

  // Auth — Supabase
  supabaseLogin:          (d) => ipcRenderer.invoke('auth:supabaseLogin', d),
  supabaseLogout:         ()  => ipcRenderer.invoke('auth:supabaseLogout'),
  validateActivationKey:  (d) => ipcRenderer.invoke('auth:validateActivationKey', d),

  // Deep-link callback from Electron (e.g. flowledger://auth/callback)
  onAuthDeepLink: (cb) => {
    const handler = (_, url) => cb(url);
    ipcRenderer.on('auth:deepLink', handler);
    return () => ipcRenderer.removeListener('auth:deepLink', handler);
  },

  // Manual sessions
  startSession:           (d) => ipcRenderer.invoke('sessions:start', d),
  stopSession:            (d) => ipcRenderer.invoke('sessions:stop', d),
  scheduleSession:        (d) => ipcRenderer.invoke('sessions:schedule', d),
  listSessions:           (d) => ipcRenderer.invoke('sessions:list', d),
  activeSession:          (d) => ipcRenderer.invoke('sessions:active', d),
  activeScheduledSession: (d) => ipcRenderer.invoke('sessions:active_scheduled', d),
  deleteSession:          (d) => ipcRenderer.invoke('sessions:delete', d),
  updateSession:          (d) => ipcRenderer.invoke('sessions:update', d),
  updateSessionTime:      (d) => ipcRenderer.invoke('sessions:updateTime', d),

  // Scheduled-session dock events (main → renderer push)
  onScheduledSession: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tracker:scheduledSession', handler);
    return () => ipcRenderer.removeListener('tracker:scheduledSession', handler);
  },

  // Auto-tracked sessions (passive, no-interaction)
  autoSessionsToday:  (d) => ipcRenderer.invoke('autoSessions:today', d),
  autoSessionsByDate: (d) => ipcRenderer.invoke('autoSessions:byDate', d),
  autoSessionsRange:  (d) => ipcRenderer.invoke('autoSessions:range', d),
  autoSessionsLive:   (d) => ipcRenderer.invoke('autoSessions:live', d),
  autoSaveBlock:      (d) => ipcRenderer.invoke('autoSessions:saveBlock', d),
  updateAutoSession:        (d) => ipcRenderer.invoke('autoSessions:update', d),
  updateAutoSessionByApp:   (d) => ipcRenderer.invoke('autoSessions:updateCategoryByApp', d),
  deleteAutoSession:        (d) => ipcRenderer.invoke('autoSessions:delete', d),

  // Auto-tracker control
  getTrackingSettings:      (d) => ipcRenderer.invoke('tracking:getSettings', d),
  updateTrackingSettings:   (d) => ipcRenderer.invoke('tracking:updateSettings', d),
  updateTrackingExclusions: (d) => ipcRenderer.invoke('tracking:updateExclusions', d),
  startTracker:             (d) => ipcRenderer.invoke('tracking:startTracker', d),
  stopTracker:              ()  => ipcRenderer.invoke('tracking:stopTracker'),
  stopAutoSession:          ()  => ipcRenderer.invoke('tracking:stopAutoSession'),
  pauseAutoSession:         ()  => ipcRenderer.invoke('tracking:pauseAutoSession'),
  resumeAutoTracking:       ()  => ipcRenderer.invoke('tracking:resumeAutoTracking'),
  trackerStatus:            ()  => ipcRenderer.invoke('tracking:status'),

  // Tracker events (pushed from main → renderer)
  onTrackerHeartbeat: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tracker:heartbeat', handler);
    return () => ipcRenderer.removeListener('tracker:heartbeat', handler);
  },
  onTrackerActivity: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tracker:activity', handler);
    return () => ipcRenderer.removeListener('tracker:activity', handler);
  },
  onTrackerIdle:   (cb) => {
    const handler = () => cb();
    ipcRenderer.on('tracker:idle', handler);
    return () => ipcRenderer.removeListener('tracker:idle', handler);
  },
  onTrackerResume: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('tracker:resume', handler);
    return () => ipcRenderer.removeListener('tracker:resume', handler);
  },
  onTrackerBlocked: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tracker:blocked', handler);
    return () => ipcRenderer.removeListener('tracker:blocked', handler);
  },

  // Auto-focus state (main-process owned state machine)
  // Call once on mount to sync current state, then listen for changes.
  getAutoFocusState: () => ipcRenderer.invoke('tracker:getAutoFocusState'),
  onAutoFocusState: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tracker:afState', handler);
    return () => ipcRenderer.removeListener('tracker:afState', handler);
  },

  onSessionStopped: (cb) => {
    const handler = (_, d) => cb(d);  // pass full session metadata (title, category, duration, titleGenerating)
    ipcRenderer.on('session:stopped', handler);
    return () => ipcRenderer.removeListener('session:stopped', handler);
  },

  // Focus mode
  startFocusMode: (d) => ipcRenderer.invoke('focusMode:start', d),
  stopFocusMode:  ()  => ipcRenderer.invoke('focusMode:stop'),
  focusModeStatus:()  => ipcRenderer.invoke('focusMode:status'),
  onFocusModeChanged: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('focusMode:changed', handler);
    return () => ipcRenderer.removeListener('focusMode:changed', handler);
  },

  // App Usage
  appUsageToday:     (d) => ipcRenderer.invoke('appUsage:today', d),
  appUsageBySession: (d) => ipcRenderer.invoke('appUsage:bySession', d),
  appUsageByDate:    (d) => ipcRenderer.invoke('appUsage:byDate', d),
  appUsageRange:     (d) => ipcRenderer.invoke('appUsage:range', d),

  // Categories
  listCategories:  (d) => ipcRenderer.invoke('categories:list', d),
  createCategory:  (d) => ipcRenderer.invoke('categories:create', d),
  deleteCategory:  (d) => ipcRenderer.invoke('categories:delete', d),

  // Projects
  listProjects:          (d) => ipcRenderer.invoke('projects:list', d),
  createProject:         (d) => ipcRenderer.invoke('projects:create', d),
  updateProject:         (d) => ipcRenderer.invoke('projects:update', d),
  deleteProject:         (d) => ipcRenderer.invoke('projects:delete', d),
  projectStats:          (d) => ipcRenderer.invoke('projects:stats', d),
  projectRecentSessions: (d) => ipcRenderer.invoke('projects:recentSessions', d),

  // Clients
  listClients:   (d) => ipcRenderer.invoke('clients:list', d),
  createClient:  (d) => ipcRenderer.invoke('clients:create', d),
  updateClient:  (d) => ipcRenderer.invoke('clients:update', d),
  deleteClient:  (d) => ipcRenderer.invoke('clients:delete', d),
  clientStats:   (d) => ipcRenderer.invoke('clients:stats', d),

  // Tasks
  listTasks:        (d) => ipcRenderer.invoke('tasks:list', d),
  createTask:       (d) => ipcRenderer.invoke('tasks:create', d),
  updateTask:       (d) => ipcRenderer.invoke('tasks:update', d),
  deleteTask:       (d) => ipcRenderer.invoke('tasks:delete', d),
  taskLastActivity: (d) => ipcRenderer.invoke('tasks:lastActivity', d),

  // Tags
  listTags:             (d) => ipcRenderer.invoke('tags:list', d),
  createTag:            (d) => ipcRenderer.invoke('tags:create', d),
  deleteTag:            (d) => ipcRenderer.invoke('tags:delete', d),
  tagsForSession:       (d) => ipcRenderer.invoke('tags:forSession', d),
  addTagToSession:      (d) => ipcRenderer.invoke('tags:addToSession', d),
  removeTagFromSession: (d) => ipcRenderer.invoke('tags:removeFromSession', d),

  // Calendar
  calendarSources:        (d) => ipcRenderer.invoke('calendar:sources', d),
  calendarAddSource:      (d) => ipcRenderer.invoke('calendar:addSource', d),
  calendarRemoveSource:   (d) => ipcRenderer.invoke('calendar:removeSource', d),
  calendarSync:           (d) => ipcRenderer.invoke('calendar:sync', d),
  calendarList:           (d) => ipcRenderer.invoke('calendar:list', d),
  calendarConvertMeetings:(d) => ipcRenderer.invoke('calendar:convertMeetings', d),
  calendarAssignProject:  (d) => ipcRenderer.invoke('calendar:assignProject', d),
  calendarUpdateEvent:    (d) => ipcRenderer.invoke('calendar:updateEvent', d),
  calendarDeleteEvent:    (d) => ipcRenderer.invoke('calendar:deleteEvent', d),
  // Google Calendar OAuth
  calendarGoogleHasCredentials: ()  => ipcRenderer.invoke('calendar:googleHasCredentials'),
  calendarGoogleSetCredentials: (d) => ipcRenderer.invoke('calendar:googleSetCredentials', d),
  calendarGoogleConnect:        (d) => ipcRenderer.invoke('calendar:googleConnect', d),

  // Distraction rules
  listDistractions:   (d) => ipcRenderer.invoke('distractions:list', d),
  createDistraction:  (d) => ipcRenderer.invoke('distractions:create', d),
  toggleDistraction:  (d) => ipcRenderer.invoke('distractions:toggle', d),
  deleteDistraction:  (d) => ipcRenderer.invoke('distractions:delete', d),

  // Blocker Profiles
  listBlockerProfiles:   (d) => ipcRenderer.invoke('blockerProfiles:list', d),
  createBlockerProfile:  (d) => ipcRenderer.invoke('blockerProfiles:create', d),
  updateBlockerProfile:  (d) => ipcRenderer.invoke('blockerProfiles:update', d),
  toggleBlockerProfile:  (d) => ipcRenderer.invoke('blockerProfiles:toggle', d),
  deleteBlockerProfile:  (d) => ipcRenderer.invoke('blockerProfiles:delete', d),
  listProfileRules:      (d) => ipcRenderer.invoke('blockerProfiles:listRules', d),
  addProfileRule:        (d) => ipcRenderer.invoke('blockerProfiles:addRule', d),
  removeProfileRule:     (d) => ipcRenderer.invoke('blockerProfiles:removeRule', d),

  // Break settings
  getBreakSettings:    (d) => ipcRenderer.invoke('break:getSettings', d),
  updateBreakSettings: (d) => ipcRenderer.invoke('break:updateSettings', d),
  dismissBreak:        (d) => ipcRenderer.invoke('break:dismiss', d),
  onBreakReminder:     (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('break:reminder', handler);
    return () => ipcRenderer.removeListener('break:reminder', handler);
  },

  // Stats
  statsSummary:         (d) => ipcRenderer.invoke('stats:summary', d),
  statsDaily:           (d) => ipcRenderer.invoke('stats:daily', d),
  focusScore:           (d) => ipcRenderer.invoke('stats:focusScore', d),
  statsStreak:          (d) => ipcRenderer.invoke('stats:streak', d),
  statsHeatmap:         (d) => ipcRenderer.invoke('stats:heatmap', d),
  contextScore:         (d) => ipcRenderer.invoke('stats:contextScore', d),

  // Goals
  listGoals:    (d) => ipcRenderer.invoke('goals:list', d),
  createGoal:   (d) => ipcRenderer.invoke('goals:create', d),
  deleteGoal:   (d) => ipcRenderer.invoke('goals:delete', d),
  goalProgress: (d) => ipcRenderer.invoke('goals:progress', d),
  updateStreak: (d) => ipcRenderer.invoke('streaks:update', d),

  // Pending entries
  listPending:   (d) => ipcRenderer.invoke('pending:list', d),
  reviewPending: (d) => ipcRenderer.invoke('pending:review', d),

  // Native app icon (returns base64 data URL or null for unknown apps)
  getAppIcon: (d) => ipcRenderer.invoke('app:getIcon', d),

  // Open URL in system browser
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ── Auto-updater ───────────────────────────────────────────────────────────
  updaterGetInfo:    ()  => ipcRenderer.invoke('updater:getInfo'),
  updaterCheck:      ()  => ipcRenderer.invoke('updater:check'),
  updaterDownload:   ()  => ipcRenderer.invoke('updater:download'),
  updaterInstall:    ()  => ipcRenderer.invoke('updater:install'),
  updaterSetChannel: (d) => ipcRenderer.invoke('updater:setChannel', d),

  onUpdaterChecking:     (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('updater:checking',     h); return () => ipcRenderer.removeListener('updater:checking',     h); },
  onUpdaterAvailable:    (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('updater:available',    h); return () => ipcRenderer.removeListener('updater:available',    h); },
  onUpdaterNotAvailable: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('updater:notAvailable', h); return () => ipcRenderer.removeListener('updater:notAvailable', h); },
  onUpdaterProgress:     (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('updater:progress',     h); return () => ipcRenderer.removeListener('updater:progress',     h); },
  onUpdaterDownloaded:   (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('updater:downloaded',   h); return () => ipcRenderer.removeListener('updater:downloaded',   h); },
  onUpdaterError:        (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('updater:error',        h); return () => ipcRenderer.removeListener('updater:error',        h); },

  // Spotify
  spotifyStartAuth:  (d) => ipcRenderer.invoke('spotify:startAuth',   d),
  spotifyGetTokens:  ()  => ipcRenderer.invoke('spotify:getTokens'),
  spotifySaveTokens: (d) => ipcRenderer.invoke('spotify:saveTokens',  d),
  spotifyClearTokens:()  => ipcRenderer.invoke('spotify:clearTokens'),

  // Profitability
  profitabilitySummary: (d) => ipcRenderer.invoke('profitability:summary', d),

  // Extended stats (new)
  workIntensity:    (d) => ipcRenderer.invoke('stats:workIntensity', d),
  hourlyHeatmap:    (d) => ipcRenderer.invoke('stats:hourlyHeatmap', d),
  deepWorkBlocks:   (d) => ipcRenderer.invoke('stats:deepWorkBlocks', d),
  topApps:          (d) => ipcRenderer.invoke('stats:topApps', d),
  billableSummary:  (d) => ipcRenderer.invoke('stats:billableSummary', d),
  weekComparison:   (d) => ipcRenderer.invoke('stats:weekComparison', d),
  distractionRatio: (d) => ipcRenderer.invoke('stats:distractionRatio', d),

  // ── AI Engine ──────────────────────────────────────────────────────────────
  // On-demand invoke handlers
  aiClassify:           (d) => ipcRenderer.invoke('ai:classify',           d),
  aiGetDailyScores:     (d) => ipcRenderer.invoke('ai:getDailyScores',     d),
  aiHistoricalScores:   (d) => ipcRenderer.invoke('ai:historicalScores',   d),
  aiBehavioralInsights: (d) => ipcRenderer.invoke('ai:behavioralInsights', d),
  aiFocusState:         (d) => ipcRenderer.invoke('ai:focusState',         d),
  aiLearnCorrection:    (d) => ipcRenderer.invoke('ai:learnCorrection',    d),
  aiDetectDistraction:  (d) => ipcRenderer.invoke('ai:detectDistraction',  d),
  aiWorkflowSummary:    (d) => ipcRenderer.invoke('ai:workflowSummary',    d),

  // Push events (main → renderer)
  onAiDailyScores: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('ai:dailyScores', handler);
    return () => ipcRenderer.removeListener('ai:dailyScores', handler);
  },
  onAiFocusState: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('ai:focusState', handler);
    return () => ipcRenderer.removeListener('ai:focusState', handler);
  },
  onAiWorkflowSummary: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('ai:workflowSummary', handler);
    return () => ipcRenderer.removeListener('ai:workflowSummary', handler);
  },
  onAiDistractionAlert: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('ai:distractionAlert', handler);
    return () => ipcRenderer.removeListener('ai:distractionAlert', handler);
  },

  // ── Flow state in-app event ───────────────────────────────────────────────
  onSessionFlowState: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('session:flowState', handler);
    return () => ipcRenderer.removeListener('session:flowState', handler);
  },

  // ── Task notifications (main → renderer) ──────────────────────────────────
  onTasksDaily: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tasks:daily', handler);
    return () => ipcRenderer.removeListener('tasks:daily', handler);
  },
  onTasksOverdue: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tasks:overdue', handler);
    return () => ipcRenderer.removeListener('tasks:overdue', handler);
  },
  onTasksYesterday: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tasks:yesterday', handler);
    return () => ipcRenderer.removeListener('tasks:yesterday', handler);
  },
  onTaskDueToday: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tasks:dueToday', handler);
    return () => ipcRenderer.removeListener('tasks:dueToday', handler);
  },
  onTaskReminder: (cb) => {
    const handler = (_, d) => cb(d);
    ipcRenderer.on('tasks:reminder', handler);
    return () => ipcRenderer.removeListener('tasks:reminder', handler);
  },
});
