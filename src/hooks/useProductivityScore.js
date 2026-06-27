import { useState, useEffect, useCallback, useRef } from 'react';
import { classifyActivityApp } from '../utils/activityCategories';

const api = window.electron || {};

// Same formula HomePage uses for its "PROD. SCORE" stat — kept in sync so the
// header widget and the home page never disagree on what today's score is.
function computeScore(sessions) {
  const active = (sessions || []).filter(s => !s.is_idle && (s.duration_seconds || 0) > 0);
  let totalSecs = 0, deepSecs = 0, distractSecs = 0;
  active.forEach(s => {
    const dur = s.duration_seconds || 0;
    totalSecs += dur;
    const type = classifyActivityApp(s.app_name || '').type;
    if (type === 'deep') deepSecs += dur;
    else if (type === 'distraction') distractSecs += dur;
  });
  if (!totalSecs) return 0;
  return Math.max(0, Math.min(100, Math.round(
    (deepSecs / totalSecs) * 100 - (distractSecs / totalSecs) * 50 + Math.min(totalSecs / 3600, 4) * 2
  )));
}

/**
 * Today's productivity score (0-100) plus a same-formula comparison against
 * yesterday, for lightweight header/widget use — polls every 60s.
 */
export default function useProductivityScore(userId) {
  const [score, setScore] = useState(0);
  const [trend, setTrend] = useState(null); // { up, pct } | null
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const from = Math.floor(todayStart.getTime() / 1000);

    try {
      const [today, yesterday] = await Promise.all([
        api.autoSessionsToday?.({ userId }).catch(() => []),
        api.autoSessionsRange?.({ userId, from: from - 86400, to: from }).catch(() => []),
      ]);
      if (!mountedRef.current) return;
      const todayScore = computeScore(today);
      const prevScore = computeScore(yesterday);
      setScore(todayScore);
      setTrend(prevScore > 0
        ? { up: todayScore >= prevScore, pct: Math.abs(Math.round(((todayScore - prevScore) / prevScore) * 100)) }
        : null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const t = setInterval(load, 60_000);
    return () => { mountedRef.current = false; clearInterval(t); };
  }, [load]);

  return { score, trend, loading };
}
