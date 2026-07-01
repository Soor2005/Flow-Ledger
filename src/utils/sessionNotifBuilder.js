import { analyzeContext } from '../ai/engines/eventContextAnalyzer.js';
import { generateTitle } from '../ai/engines/eventWritingEngine.js';

// Title  → event title (AI-generated or user-set, never "Auto: X")
// Body   → stat summary distinct from the title: duration · category · deep focus · project
// The body NEVER re-describes the title — no "Researched Research Session." echoes.
export function buildSessionEndNotif(session, durationSecs) {
  const h = Math.floor(durationSecs / 3600);
  const m = Math.round((durationSecs % 3600) / 60);
  const durLabel = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${Math.max(1, m)}m`;

  const CAT_LABELS = {
    development: 'Development', coding: 'Development', research: 'Research',
    design: 'Design', writing: 'Writing', planning: 'Planning',
    meeting: 'Meeting', communication: 'Communication', learning: 'Learning',
    data: 'Data & Analytics', admin: 'Admin', focus: 'Focus', break: 'Break',
  };
  const rawCat   = (session.category || '').toLowerCase();
  const catLabel = CAT_LABELS[rawCat] || (session.category
    ? session.category.charAt(0).toUpperCase() + session.category.slice(1)
    : 'Session');

  const parts = [durLabel, catLabel];
  if (session.is_deep_work) parts.push('Deep focus');
  if (session.project_name) parts.push(session.project_name);
  const body = parts.join(' · ');

  let notifTitle;
  try {
    const isAutoSession = (session.title || '').toLowerCase().startsWith('auto:');
    if (isAutoSession) {
      const appName = (session.title || '').replace(/^auto:\s*/i, '').trim();
      notifTitle = appName
        ? `${appName.charAt(0).toUpperCase() + appName.slice(1)} — auto-tracked`
        : 'Auto-tracked session';
    } else if (session.title && !['session', 'focus session', 'focus block', 'untitled'].includes(session.title.toLowerCase())) {
      notifTitle = session.title;
    } else {
      const context = analyzeContext({
        autoSessions: [],
        session: { ...session, duration_seconds: durationSecs },
        durationMins: Math.round(durationSecs / 60),
      });
      const titleResult = generateTitle(context);
      notifTitle = titleResult.title || session.title || catLabel + ' Session';
    }
  } catch {
    notifTitle = session.title || catLabel + ' Session';
  }

  return { title: notifTitle, description: body, durLabel, durationSecs };
}
