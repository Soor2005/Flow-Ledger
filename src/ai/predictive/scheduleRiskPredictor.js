/**
 * Schedule Risk Predictor
 * Part of the Predictive Intelligence layer.
 *
 * Given an upcoming (or about-to-start) event, predicts — before it happens —
 * whether it's likely to run over its planned duration and whether the time
 * slot it's booked in is historically a low-focus window for this user.
 * Existing engines only describe sessions after the fact; this is the one
 * module that reasons about a session that hasn't happened yet.
 */

function blend(scoreA, countA, scoreB, weightB = 0.3) {
  if (countA >= 2) return scoreA * (1 - weightB) + scoreB * weightB;
  return scoreB;
}

/**
 * @param {Object} behavioral - adaptiveBehaviorEngine.getIntelligence() snapshot
 * @param {Object} upcomingEvent
 * @param {number} upcomingEvent.hour            - 0-23, local start hour
 * @param {number} upcomingEvent.dow             - 0=Sun..6=Sat
 * @param {string} [upcomingEvent.projectId]
 * @param {string} [upcomingEvent.category]
 * @param {number} upcomingEvent.plannedDurationMins
 * @param {string} [upcomingEvent.label]
 */
export function predictScheduleRisk(behavioral, upcomingEvent) {
  if (!behavioral || !upcomingEvent) return null;
  const { hour, dow, projectId, plannedDurationMins, label } = upcomingEvent;

  const focus = behavioral.focus || {};
  const cs    = behavioral.contextSwitch || {};
  const projectBehaviors = behavioral.workflow?.projectBehaviors || {};

  // ── Focus forecast for this exact slot ────────────────────────────────────
  const hourScore = focus.hourlyScores?.[hour] ?? 50;
  const dowScore  = focus.dowScores?.[dow] ?? 50;
  const focusForecastScore = Math.round(blend(hourScore, focus.hourlyCounts?.[hour] || 0, dowScore, 0.35));

  // ── Expected fragmentation for this hour ───────────────────────────────────
  const expectedSwitchRate = Math.round((cs.hourlyBaseline?.[hour] ?? cs.baseline ?? 3) * 10) / 10;

  // ── Overrun risk from this project's historical actual duration ───────────
  const pb = projectId ? projectBehaviors[projectId] : null;
  let overrunProbability = 0.15; // baseline uncertainty when there's no history at all
  let overrunMinutesEstimate = 0;
  let overrunConfidence = 0.2;

  if (pb && pb.count >= 3 && plannedDurationMins > 0) {
    const delta = pb.avgMins - plannedDurationMins;
    overrunMinutesEstimate = Math.round(Math.max(0, delta));
    // Ratio of historical overshoot to planned time, saturating at 1.0
    overrunProbability = Math.max(0.05, Math.min(0.95, 0.5 + delta / (plannedDurationMins * 2)));
    overrunConfidence = Math.min(0.9, 0.4 + pb.count * 0.05);
  }

  const riskLevel =
    overrunProbability >= 0.6 || focusForecastScore < 35 ? 'high'
    : overrunProbability >= 0.35 || focusForecastScore < 55 ? 'moderate'
    : 'low';

  const recommendation =
    riskLevel === 'high' && overrunMinutesEstimate > 10
      ? `This usually runs ~${overrunMinutesEstimate}m longer than planned — consider blocking extra time or trimming scope.`
      : riskLevel === 'high'
      ? 'This slot has historically been a low-focus window — consider moving deep work elsewhere.'
      : riskLevel === 'moderate'
      ? 'Worth a buffer — this slot is only moderately reliable for focused work.'
      : 'Looks like a solid slot based on your history.';

  return {
    label:     label || null,
    hour, dow,
    focusForecastScore,
    expectedSwitchRate,
    overrunProbability: Math.round(overrunProbability * 100) / 100,
    overrunMinutesEstimate,
    riskLevel,
    confidence: Math.round(((overrunConfidence + Math.min((focus.hourlyCounts?.[hour] || 0) / 10, 0.5)) / 1.5) * 100) / 100,
    recommendation,
  };
}
