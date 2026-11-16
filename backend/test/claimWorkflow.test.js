import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIM_STATUSES } from '../src/utils/fraClaimRules.js';
import {
  TERMINAL_STATUSES, WORKFLOW_ACTIONS, WORKFLOW_ACTION_NAMES, WORKFLOW_TRANSITIONS, getAllowedActions, isKnownAction, resolveTransition,
} from '../src/utils/claimWorkflow.js';

// The documented transition map, written out independently of the implementation.
const EXPECTED = [
  ['ACCEPT_FOR_PROCESSING', 'APPLICATION_RECEIVED', 'PENDING'],
  ['START_REVIEW', 'PENDING', 'UNDER_REVIEW'],
  ['FORWARD', 'UNDER_REVIEW', 'FORWARDED'],
  ['RETURN_FOR_REVIEW', 'FORWARDED', 'UNDER_REVIEW'],
  ['APPROVE', 'UNDER_REVIEW', 'APPROVED'],
  ['APPROVE', 'FORWARDED', 'APPROVED'],
  ['REJECT', 'UNDER_REVIEW', 'REJECTED'],
  ['REJECT', 'FORWARDED', 'REJECTED'],
];

test('the transition table is exactly the documented map (8 edges, 6 actions)', () => {
  assert.deepEqual(WORKFLOW_TRANSITIONS.map((t) => t.join('|')).sort(), EXPECTED.map((t) => t.join('|')).sort());
  assert.deepEqual([...WORKFLOW_ACTION_NAMES].sort(), ['ACCEPT_FOR_PROCESSING', 'APPROVE', 'FORWARD', 'REJECT', 'RETURN_FOR_REVIEW', 'START_REVIEW']);
});

test('every valid transition resolves to the documented target status', () => {
  for (const [action, from, to] of EXPECTED) {
    const r = resolveTransition(from, action);
    assert.equal(r.ok, true, `${action} from ${from}`);
    assert.equal(r.toStatus, to, `${action} from ${from}`);
  }
});

test('EVERY other (status, action) pair is invalid: full matrix', () => {
  const valid = new Set(EXPECTED.map((t) => `${t[0]}|${t[1]}`));
  let invalid = 0;
  for (const status of CLAIM_STATUSES) {
    for (const action of WORKFLOW_ACTION_NAMES) {
      const r = resolveTransition(status, action);
      if (valid.has(`${action}|${status}`)) continue;
      assert.deepEqual(r, { ok: false, reason: 'INVALID_TRANSITION' }, `${action} must not be allowed from ${status}`);
      invalid += 1;
    }
  }
  assert.equal(invalid, CLAIM_STATUSES.length * WORKFLOW_ACTION_NAMES.length - EXPECTED.length);   // 6*6-8 = 28
});

test('a status can never be set directly: status names are not actions; junk actions are unknown', () => {
  for (const notAnAction of [...CLAIM_STATUSES, 'approve', 'Approve', '', null, undefined, 5, {}, [], 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(isKnownAction(notAnAction), false, String(notAnAction));
    assert.deepEqual(resolveTransition('UNDER_REVIEW', notAnAction), { ok: false, reason: 'UNKNOWN_ACTION' });
  }
});

test('APPROVED and REJECTED are terminal: no actions available', () => {
  assert.deepEqual(TERMINAL_STATUSES, ['APPROVED', 'REJECTED']);
  for (const s of TERMINAL_STATUSES) assert.deepEqual(getAllowedActions(s), []);
});

test('allowed actions per status (what the UI is told)', () => {
  const names = (s) => getAllowedActions(s).map((a) => a.action);
  assert.deepEqual(names('APPLICATION_RECEIVED'), ['ACCEPT_FOR_PROCESSING']);
  assert.deepEqual(names('PENDING'), ['START_REVIEW']);
  assert.deepEqual(names('UNDER_REVIEW'), ['FORWARD', 'APPROVE', 'REJECT']);
  assert.deepEqual(names('FORWARDED'), ['RETURN_FOR_REVIEW', 'APPROVE', 'REJECT']);
  const reject = getAllowedActions('UNDER_REVIEW').find((a) => a.action === 'REJECT');
  assert.equal(reject.requiresReason, true);
  assert.equal(reject.toStatus, 'REJECTED');
  assert.ok(getAllowedActions('UNDER_REVIEW').filter((a) => a.action !== 'REJECT').every((a) => a.requiresReason === false));
});

test('only REJECT requires a reason', () => {
  for (const name of WORKFLOW_ACTION_NAMES) assert.equal(WORKFLOW_ACTIONS[name].requiresReason, name === 'REJECT', name);
});

test('the table is frozen (cannot be altered at runtime)', () => {
  assert.throws(() => { 'use strict'; WORKFLOW_ACTIONS.APPROVE = {}; }, TypeError);
  assert.throws(() => { 'use strict'; WORKFLOW_TRANSITIONS.push(['X', 'Y', 'Z']); }, TypeError);
});
