// The FRA claim workflow for the single GOVERNMENT_OFFICIAL role, written out explicitly.
//
// Clients send an ACTION name. They never send a status: the new status is looked up here from the claim's
// CURRENT status and the action, so a status can only change along an edge listed below.
//
//   ACCEPT_FOR_PROCESSING  APPLICATION_RECEIVED                 -> PENDING
//   START_REVIEW           PENDING                              -> UNDER_REVIEW
//   FORWARD                UNDER_REVIEW                         -> FORWARDED
//   RETURN_FOR_REVIEW      FORWARDED                            -> UNDER_REVIEW
//   APPROVE                UNDER_REVIEW | FORWARDED             -> APPROVED
//   REJECT                 UNDER_REVIEW | FORWARDED             -> REJECTED   (a reason is REQUIRED)
//
// APPROVED and REJECTED are terminal: no action is available from them (reopening / appeals are out of scope).
// Remarks are optional on every action and are INTERNAL (visible to officials only).
// The rejection reason is shown to the applicant, so it must be written for them.

export const REMARKS_MAX = 1000;
export const REASON_MAX = 1000;

export const WORKFLOW_ACTIONS = Object.freeze({
  ACCEPT_FOR_PROCESSING: { label: 'Accept for processing', from: ['APPLICATION_RECEIVED'], to: 'PENDING', requiresReason: false, description: 'Confirm the application is complete and move it to Pending.' },
  START_REVIEW: { label: 'Start review', from: ['PENDING'], to: 'UNDER_REVIEW', requiresReason: false, description: 'Begin reviewing the claim.' },
  FORWARD: { label: 'Forward to next level', from: ['UNDER_REVIEW'], to: 'FORWARDED', requiresReason: false, description: 'Forward the reviewed claim to the next committee.' },
  RETURN_FOR_REVIEW: { label: 'Return for review', from: ['FORWARDED'], to: 'UNDER_REVIEW', requiresReason: false, description: 'Bring a forwarded claim back for further review.' },
  APPROVE: { label: 'Approve', from: ['UNDER_REVIEW', 'FORWARDED'], to: 'APPROVED', requiresReason: false, description: 'Approve the claim. This cannot be undone.' },
  REJECT: { label: 'Reject', from: ['UNDER_REVIEW', 'FORWARDED'], to: 'REJECTED', requiresReason: true, description: 'Reject the claim. A reason is required and is shown to the applicant. This cannot be undone.' },
});

export const WORKFLOW_ACTION_NAMES = Object.keys(WORKFLOW_ACTIONS);

// The explicit transition list (for documentation and tests): [action, from, to]
export const WORKFLOW_TRANSITIONS = Object.freeze(
  WORKFLOW_ACTION_NAMES.flatMap((action) => WORKFLOW_ACTIONS[action].from.map((from) => [action, from, WORKFLOW_ACTIONS[action].to]))
);

export const TERMINAL_STATUSES = Object.freeze(['APPROVED', 'REJECTED']);

export const isKnownAction = (action) => typeof action === 'string' && Object.hasOwn(WORKFLOW_ACTIONS, action);

/** Actions available from a status, in a stable order, described for the UI. */
export const getAllowedActions = (status) =>
  WORKFLOW_ACTION_NAMES.filter((a) => WORKFLOW_ACTIONS[a].from.includes(status)).map((a) => ({
    action: a,
    label: WORKFLOW_ACTIONS[a].label,
    description: WORKFLOW_ACTIONS[a].description,
    toStatus: WORKFLOW_ACTIONS[a].to,
    requiresReason: WORKFLOW_ACTIONS[a].requiresReason,
  }));

/** Returns { ok: true, toStatus, requiresReason } or { ok: false, reason: 'UNKNOWN_ACTION' | 'INVALID_TRANSITION' }. */
export const resolveTransition = (currentStatus, action) => {
  if (!isKnownAction(action)) return { ok: false, reason: 'UNKNOWN_ACTION' };
  const def = WORKFLOW_ACTIONS[action];
  if (!def.from.includes(currentStatus)) return { ok: false, reason: 'INVALID_TRANSITION' };
  return { ok: true, toStatus: def.to, requiresReason: def.requiresReason };
};
