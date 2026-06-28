/**
 * Anomaly Detection Engine
 * Part of the Predictive Intelligence layer.
 *
 * Diffs TODAY's signals-so-far against the learned baseline for this exact
 * hour/day-of-week, and flags meaningful deviations as they happen — instead
 * of only summarizing what happened at the end of the day.
 */

function durationSecs(s) {
  if (s.duration_seconds > 0) return s.duration_seconds;
  const start = s.started_at, end = s.ended_at;
  return end && start && end > start ? end - start : 0;
}

function todaysSwitchStats(autoSessions) {
  const active = autoSessions.filter(a => !a.is_idle && durationSecs(a) > 0);
  const totalMins = active.reduce((s, a) => s + durationSecs(a), 0) / 60;
  if (active.length <= 1 || !totalMins) return { perHour: 0, totalMins };
  let switches = 0;
  for (let i = 1; i < active.length; i++) {
    if (active[i].app_name !== active[i - 1].app_name) switches++;
  }
  return { perHour: (switches / totalMins) * 60, totalMins };
}

function todaysDeepWorkRatio(sessions) {
  const totalSecs = sessions.reduce((s, x) => s + durationSecs(x), 0);
  if (!totalSecs) return null;
  const deepSecs = sessions.filter(s => s.is_deep_work).reduce((s, x) => s + durationSecs(x), 0);
  return deepSecs / totalSecs;
}

/**
 * @param {Object} behavioral   - adaptiveBehaviorEngine.getIntelligence() snapshot
 * @param {Object} opts
 * @param {Array}  opts.sessions     - today's manual sessions
 * @param {Array}  opts.autoSessions - today's auto-tracked sessions
 */
export function detectAnomalies(behavioral, { sessions = [], autoSessions = [] } = {}) {
  const anomalies = [];
  if (!behavioral?.focus || behavioral.focus.observations < 10) {
    return { available: false, reason: 'insufficient_history', anomalies, hasAnomalies: false, confidence: 0 };
  }

  const hour = new Date().getHours();
  const hourCount = behavioral.focus.hourlyCounts?.[hour] || 0;

  // ── Deep-work ratio anomaly ────────────────────────────────────────────────
  if (hourCount >= 3) {
    const baselineRatio = (behavioral.focus.deepWorkRatio || 0) / 100;
    const todayRatio = todaysDeepWorkRatio(sessions);
    if (todayRatio != null && baselineRatio > 0.15) {
      const dropPct = (baselineRatio - todayRatio) / baselineRatio;
      if (dropPct >= 0.4) {
        anomalies.push({
          type: 'focus_drop',
          severity: dropPct >= 0.65 ? 'high' : 'moderate',
          message: `Deep work today is running ${Math.round(dropPct * 100)}% below your usual ${behavioral.focus.peakWindow || 'pace'}.`,
          recommendation: behavioral.focus.peakWindow
            ? `If you have flexibility, shift remaining deep work into ${behavioral.focus.peakWindow} — that's historically your strongest window.`
            : 'Block 25-30 minutes with notifications off to rebuild momentum before the day ends.',
        });
      }
    }
  }

  // ── Context-switch anomaly ─────────────────────────────────────────────────
  const cs = behavioral.contextSwitch;
  if (cs && cs.observations >= 10) {
    // cs.baseline/hourlyBaseline are stored in switches-per-10-minutes
    // (adaptiveBehaviorEngine's internal unit) — convert to per-hour before
    // comparing against today's per-hour rate, or this is off by 6x.
    const baselinePer10Min = cs.hourlyBaseline?.[hour] ?? cs.baseline;
    const baselinePerHour = baselinePer10Min * 6;
    const { perHour: todaySwitch, totalMins } = todaysSwitchStats(autoSessions);
    if (baselinePerHour > 0 && todaySwitch > baselinePerHour * 1.8 && todaySwitch >= 4) {
      const excessPerHour = todaySwitch - baselinePerHour;
      // Rough, clearly-labeled estimate — ~3 focus-recovery minutes per
      // switch beyond baseline, applied across today's tracked hours.
      const estimatedFocusLossMins = Math.round(Math.min(90, excessPerHour * (totalMins / 60) * 3));
      anomalies.push({
        type: 'fragmentation_spike',
        severity: todaySwitch > baselinePerHour * 2.5 ? 'high' : 'moderate',
        message: `You're switching between apps ${Math.round(todaySwitch)} times per hour, well above your usual ${Math.round(baselinePerHour)}/hr for this hour.`
          + (estimatedFocusLossMins >= 10 ? ` Estimated to cost ~${estimatedFocusLossMins}m of deep work today.` : ''),
        recommendation: 'Batch similar tasks into one block and silence notifications for the next 25-30 minutes to break the pattern.',
        estimatedFocusLossMins,
      });
    }
  }

  // ── Burnout escalation anomaly ──────────────────────────────────────────────
  const burnout = behavioral.burnout;
  if (burnout && burnout.riskLevel === 'critical') {
    anomalies.push({
      type: 'burnout_critical',
      severity: 'high',
      message: 'Fatigue has crossed into critical risk — this is a strong signal to stop for the day.',
      recommendation: 'End deep work now; a real break (not another tab) is what actually lowers fatigue from here.',
    });
  }

  return {
    available: true,
    confidence: Math.min(0.9, 0.3 + Math.min(hourCount / 10, 0.3) + Math.min((cs?.observations || 0) / 60, 0.3)),
    anomalies,
    hasAnomalies: anomalies.length > 0,
  };
}
