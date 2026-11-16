import test from 'node:test';
import assert from 'node:assert/strict';
import { signGrant, verifyGrant } from '../src/utils/fraGrant.js';
import { createFailureLimiter } from '../src/utils/failureLimiter.js';

const SECRET = 'test-secret-that-is-long-enough-123456';
const NOW = 1_800_000_000_000;
const mk = (over = {}) => signGrant({ farmerId: 'farmer-A', claimObjectId: 'aaaaaaaaaaaaaaaaaaaaaaaa', ttlSeconds: 600, now: NOW, ...over }, SECRET).token;

test('valid grant verifies for the same farmer and carries the claim id', () => {
  const r = verifyGrant(mk(), { farmerId: 'farmer-A', now: NOW + 1000 }, SECRET);
  assert.deepEqual(r, { ok: true, claimObjectId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
});

test('grant is bound to its farmer', () => {
  assert.deepEqual(verifyGrant(mk(), { farmerId: 'farmer-B', now: NOW }, SECRET), { ok: false, reason: 'wrong_farmer' });
});

test('grant expires', () => {
  assert.equal(verifyGrant(mk(), { farmerId: 'farmer-A', now: NOW + 599_000 }, SECRET).ok, true);
  assert.deepEqual(verifyGrant(mk(), { farmerId: 'farmer-A', now: NOW + 600_000 }, SECRET), { ok: false, reason: 'expired' });
});

test('tampering with payload or signature is detected', () => {
  const [p, s] = mk().split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, p: 'fra-claim-view', fid: 'farmer-A', cid: 'bbbbbbbbbbbbbbbbbbbbbbbb', iat: 1, exp: 9_999_999_999 })).toString('base64url');
  assert.equal(verifyGrant(`${forged}.${s}`, { farmerId: 'farmer-A', now: NOW }, SECRET).reason, 'signature');
  assert.equal(verifyGrant(`${p}.${s.slice(0, -2)}AA`, { farmerId: 'farmer-A', now: NOW }, SECRET).ok, false);
});

test('a grant signed with a different secret is rejected', () => {
  const other = signGrant({ farmerId: 'farmer-A', claimObjectId: 'a'.repeat(24), now: NOW }, 'another-secret-that-is-long-enough-99').token;
  assert.equal(verifyGrant(other, { farmerId: 'farmer-A', now: NOW }, SECRET).reason, 'signature');
});

test('malformed input never throws and is rejected', () => {
  for (const bad of [undefined, null, 5, {}, [], '', 'abc', 'a.b.c', '....', 'x'.repeat(2000), 'not base64!.zzz']) {
    assert.equal(verifyGrant(bad, { farmerId: 'farmer-A', now: NOW }, SECRET).ok, false, String(bad).slice(0, 20));
  }
});

test('a login-style token cannot be used as a grant (purpose + derived key)', () => {
  // A token signed directly with the raw secret (as a JWT would be) fails the derived-key signature check.
  assert.equal(verifyGrant('eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.c2ln', { farmerId: '1', now: NOW }, SECRET).ok, false);
});

test('missing or short secret is a configuration error, not a silent pass', () => {
  assert.throws(() => signGrant({ farmerId: 'a', claimObjectId: 'b' }, undefined), /not configured/);
  assert.throws(() => verifyGrant(mk(), { farmerId: 'farmer-A' }, ''), /not configured/);
});

test('failure limiter: blocks after max failures, per key, and expires', () => {
  let t = 0;
  const lim = createFailureLimiter({ max: 3, windowMs: 60_000, now: () => t });
  for (let i = 0; i < 3; i += 1) { assert.equal(lim.check('a').blocked, false); lim.fail('a'); }
  const blocked = lim.check('a');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(lim.check('b').blocked, false, 'other users unaffected');
  t = 30_000; assert.equal(lim.check('a').retryAfterSeconds, 30);
  t = 60_001; assert.equal(lim.check('a').blocked, false, 'window expired');
});
