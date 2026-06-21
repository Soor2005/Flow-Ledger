/**
 * Workflow diagnostic events — structured logging for tracking pipeline debugging.
 */

export const WORKFLOW_EVENTS = {
  STARTED:              'WORKFLOW_STARTED',
  CONTINUED:            'WORKFLOW_CONTINUED',
  LOCKED:               'WORKFLOW_LOCKED',
  EXTENDED:             'WORKFLOW_EXTENDED',
  SPLIT:                'WORKFLOW_SPLIT',
  CONFIDENCE:           'WORKFLOW_CONFIDENCE',
  SUPPORTING_TOOL:      'SUPPORTING_TOOL_DETECTED',
  SESSION_SPLIT:        'SESSION_SPLIT_REASON',
  SESSION_CONTINUATION: 'SESSION_CONTINUATION_REASON',
};

const PREFIX = '[WORKFLOW]';

export function logWorkflowEvent(event, payload = {}) {
  const entry = {
    ts: Date.now(),
    event,
    ...payload,
  };
  console.debug(PREFIX, event, entry);
  return entry;
}
