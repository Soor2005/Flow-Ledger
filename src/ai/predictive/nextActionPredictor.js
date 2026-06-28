/**
 * Next Action Predictor
 * Part of the Predictive Intelligence layer.
 *
 * Uses learned recurring-workflow patterns (what you tend to work on, and at
 * what hour) to anticipate what's likely next — so the app can proactively
 * offer to start tracking it instead of waiting to be told.
 */

// Gaussian-ish closeness score: 1.0 at exact hour match, decaying smoothly,
// wrapping around midnight (23 and 0 are 1 hour apart, not 23).
function hourCloseness(targetHour, avgHour) {
  const diff = Math.min(Math.abs(targetHour - avgHour), 24 - Math.abs(targetHour - avgHour));
  return Math.max(0, 1 - diff / 4); // zero out beyond a 4-hour window
}

/**
 * @param {Object} behavioral - adaptiveBehaviorEngine.getIntelligence() snapshot
 * @param {Object} opts
 * @param {Array}  [opts.projects]
 * @param {string} [opts.currentProjectId] - exclude what's already active
 * @param {number} [opts.hour] - override current hour (testing/explicit forecast)
 */
export function predictNextAction(behavioral, { projects = [], currentProjectId = null, hour = null } = {}) {
  const patterns = behavioral?.workflow?.recurringPatterns || [];
  if (!patterns.length) {
    return { available: false, reason: 'insufficient_history', predictions: [] };
  }

  const targetHour = hour ?? new Date().getHours();
  const totalObservations = behavioral.workflow.observations || 1;

  const ranked = patterns
    .filter(p => !currentProjectId || p.projectId !== currentProjectId)
    .map(p => {
      const closeness = hourCloseness(targetHour, p.avgStartHour);
      const frequencyWeight = Math.min(p.frequency / 10, 1);
      const score = closeness * 0.65 + frequencyWeight * 0.35;
      const project = projects.find(proj => proj.id === p.projectId);
      return {
        label: project?.name || p.label,
        projectId: p.projectId || null,
        category: p.category,
        avgStartHour: p.avgStartHour,
        frequency: p.frequency,
        score: Math.round(score * 100) / 100,
        confidence: Math.min(0.92, 0.3 + Math.min(p.frequency / 12, 0.4) + Math.min(totalObservations / 80, 0.2)),
      };
    })
    .filter(p => p.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return {
    available: ranked.length > 0,
    predictions: ranked,
    insight: ranked.length
      ? `Around this time you usually work on "${ranked[0].label}" — want to start tracking it?`
      : null,
  };
}
