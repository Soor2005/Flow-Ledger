/**
 * Session Finalization Engine
 * Runs after a session ends to generate final, human-quality
 * title + description + insights. Never runs during live tracking.
 */

import { mergeWorkflowFromSessions } from './workflowIntelligenceEngine.js';
import { computeFocusQuality }       from './focusQualityEngine.js';
import { buildProductivitySummary }  from './productivityReasoningEngine.js';
import { detectFlowState }           from './flowStateEngine.js';

// ─── Workflow → Title Templates ───────────────────────────────────────────────
const TITLE_TEMPLATES = {
  development: [
    (project, action) => action && project ? `${action} ${project}` : project ? `${project} Development` : 'Software Development Session',
    (project) => project ? `Building ${project}` : 'Engineering Session',
  ],
  design: [
    (project) => project ? `Designing ${project}` : 'UI/UX Design Session',
    (project) => project ? `${project} Visual Design` : 'Design Work',
  ],
  writing: [
    (project) => project ? `Writing ${project}` : 'Documentation & Writing',
    (project) => project ? `${project} Documentation` : 'Writing Session',
  ],
  research: [
    (project) => project ? `Researching ${project}` : 'Research Session',
    (project) => project ? `${project} Analysis` : 'Research & Analysis',
  ],
  planning: [
    (project) => project ? `Planning ${project}` : 'Project Planning',
    (project) => project ? `${project} Strategy` : 'Strategic Planning',
  ],
  meeting: [() => 'Video Meeting', () => 'Team Meeting'],
  communication: [() => 'Team Communication', (project) => project ? `${project} Communication` : 'Team Sync'],
  ai_research:   [(project) => project ? `AI-Assisted ${project} Work` : 'AI-Assisted Development'],
  email:         [() => 'Email & Correspondence'],
  data:          [(project) => project ? `${project} Data Analysis` : 'Data & Analytics'],
  learning:      [(project) => project ? `Learning ${project}` : 'Learning Session'],
  other:         [(project) => project ? `${project} Work` : 'Focused Work Session'],
};

// ─── Description templates ────────────────────────────────────────────────────
function buildDescription(workflow, focusQuality, durationSecs, autoSessions) {
  const mins = Math.round(durationSecs / 60);
  const { dominantType, primaryProject, appCount, uniqueApps } = workflow;
  const { overall: score, breakdown } = focusQuality;
  const deepPct = breakdown?.deepPct || 0;

  const TYPE_VERBS = {
    development:   'Implemented and developed',
    design:        'Designed and refined',
    writing:       'Authored and documented',
    research:      'Researched and analyzed',
    planning:      'Planned and organized',
    meeting:       'Participated in',
    communication: 'Coordinated and communicated on',
    ai_research:   'Explored and developed with AI assistance',
    data:          'Analyzed and processed',
    learning:      'Studied and practiced',
  };
  const verb = TYPE_VERBS[dominantType] || 'Worked on';

  const objectPart = primaryProject ? `${primaryProject} workflows` : 'project work';
  const toolContext = uniqueApps.length > 0
    ? uniqueApps.slice(0, 2).join(' and ')
    : 'primary tools';

  const qualityPart = score >= 80
    ? 'maintaining high focus throughout'
    : score >= 60
      ? 'with consistent productive momentum'
      : deepPct >= 40
        ? `with ${deepPct}% deep work engagement`
        : 'across multiple work contexts';

  let desc = `${verb} ${objectPart} using ${toolContext}, ${qualityPart}.`;

  // Add context if multi-workflow
  if (appCount > 3 && dominantType !== 'meeting') {
    desc += ` Session spanned ${appCount} tools across ${mins} minutes.`;
  }

  return desc;
}

// ─── Main finalization ────────────────────────────────────────────────────────
export function finalizeSession(session, autoSessions = [], recentSessions = []) {
  if (!session) return null;

  const durationSecs = session.duration_seconds ||
    ((session.ended_at || Math.floor(Date.now() / 1000)) - session.started_at);

  // 1. Merge workflow from all auto-sessions during this manual session's window
  const workflow = mergeWorkflowFromSessions(autoSessions, session);

  // 2. Compute final focus quality
  const focusQuality = computeFocusQuality(autoSessions, durationSecs);

  // 3. Detect flow state
  const flowState = detectFlowState(autoSessions, durationSecs, focusQuality.overall);

  // 4. Generate title
  const title = generateFinalTitle(session, workflow, focusQuality);

  // 5. Generate description
  const description = buildDescription(workflow, focusQuality, durationSecs, workflow);

  // 6. Build insights bundle
  const insights = buildSessionInsights(session, workflow, focusQuality, flowState, durationSecs);

  // 7. Determine is_deep_work
  const isDeepWork = durationSecs >= 25 * 60 &&
    (focusQuality.breakdown?.deepPct >= 50 || focusQuality.deepWorkScore >= 65);

  return {
    title,
    description,
    insights,
    focusQuality,
    flowState,
    workflow,
    isDeepWork,
    confidence: workflow ? 0.85 : 0.60,
  };
}

function generateFinalTitle(session, workflow, focusQuality) {
  // Don't overwrite user-set titles
  if (session.title && !['session','focus session','focus block','untitled'].includes((session.title || '').toLowerCase())) {
    return session.title;
  }

  const { dominantType, primaryProject, action } = workflow || {};
  const templates = TITLE_TEMPLATES[dominantType || 'other'] || TITLE_TEMPLATES.other;

  // Pick best template
  for (const tpl of templates) {
    const result = tpl(primaryProject, action);
    if (result && result.length > 5 && result.length < 70) return result;
  }

  return session.category || 'Focus Session';
}

// ─── Session Insights Builder ─────────────────────────────────────────────────
function buildSessionInsights(session, workflow, focusQuality, flowState, durationSecs) {
  const mins = Math.round(durationSecs / 60);
  const { overall: score, breakdown, switchesPerHour } = focusQuality;
  const { dominantType, primaryProject } = workflow;

  const items = [];

  // Key objective
  const objMap = {
    development:   'Build, implement, or debug software components',
    design:        'Create or refine user interface designs',
    writing:       'Author documentation or content',
    research:      'Gather and analyze information',
    planning:      'Organize and strategize project work',
    meeting:       'Collaborate with team members',
    communication: 'Coordinate with team on key topics',
    ai_research:   'Leverage AI tools for development or research',
  };
  items.push({
    type: 'objective',
    label: 'Key Objective',
    value: primaryProject
      ? `${objMap[dominantType] || 'Focused work'} for ${primaryProject}`
      : (objMap[dominantType] || 'Productive focused work'),
  });

  // Workflow detected
  items.push({
    type: 'workflow',
    label: 'Workflow',
    value: workflow.dominantType
      ? dominantType.charAt(0).toUpperCase() + dominantType.slice(1).replace('_', ' ')
      : 'Mixed',
  });

  // Focus quality
  items.push({
    type: 'quality',
    label: 'Focus Quality',
    value: `${score}/100 — ${focusQuality.label}`,
    score,
    color: focusQuality.color,
  });

  // Deep work %
  if (breakdown?.deepPct !== undefined) {
    items.push({
      type: 'deep_work',
      label: 'Deep Work',
      value: `${breakdown.deepPct}% of ${mins} minutes`,
    });
  }

  // Context switching
  if (switchesPerHour !== undefined) {
    const ctxQuality = switchesPerHour < 4 ? 'Excellent' : switchesPerHour < 8 ? 'Good' : switchesPerHour < 14 ? 'Moderate' : 'High';
    items.push({
      type: 'context_switch',
      label: 'Context Switching',
      value: `${ctxQuality} — ${Math.round(switchesPerHour)} switches/hr`,
    });
  }

  // Flow state
  items.push({
    type: 'flow_state',
    label: 'Flow State',
    value: flowState.label,
    color: flowState.color,
  });

  return items;
}

// ─── Generate AI recommendation for completed session ─────────────────────────
export function generateSessionRecommendation(insights, flowState, focusQuality) {
  const { overall: score } = focusQuality;
  const { id: stateId } = flowState;

  if (score >= 85) return 'Excellent session. Continue similar workflows during your peak focus hours.';
  if (stateId === 'context_switching') return 'Next session: open only your primary work tool for the first 30 minutes.';
  if (stateId === 'research_mode') return 'Consider a focused implementation session to convert research into output.';
  if (score >= 65) return 'Strong session. Schedule a similar block tomorrow for continued momentum.';
  if (score >= 45) return 'Good progress. Block notifications next session to improve focus depth.';
  return 'Try starting your next session with the most important task to build early momentum.';
}
