import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_ID_PATTERN, CLAIM_STATUSES, checkClaimConsistency, generateClaimId, isValidClaimId, normalizeClaimId, validateGeoJsonGeometry,
} from '../src/utils/fraClaimRules.js';
import { buildDemoClaims } from '../src/seed/demoFraClaims.js';

const ring = [[80, 21], [80.01, 21], [80.01, 21.01], [80, 21.01], [80, 21]];

test('status list is exactly the six required statuses', () => {
  assert.deepEqual(CLAIM_STATUSES, ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW', 'FORWARDED', 'APPROVED', 'REJECTED']);
});

test('claim ID pattern accepts valid IDs and rejects malformed ones', () => {
  for (const ok of ['FRA-MP-2025-A7K2QX', 'FRA-OD-1999-000000', 'FRA-CG-2025-DEMO04']) assert.ok(isValidClaimId(ok), ok);
  for (const bad of ['', 'fra-mp-2025-a7k2qx', 'FRA-M-2025-A7K2QX', 'FRA-MP-25-A7K2QX', 'FRA-MP-2025-A7K2Q', 'FRA-MP-2025-A7K2QXX',
    'FRA-MP-2025-A7K2Q!', ' FRA-MP-2025-A7K2QX', 'FRA-MP-2025-A7K2QX\n', 'XRA-MP-2025-A7K2QX', 'FRA-MP-2025-A7K2QX; DROP']) {
    assert.equal(isValidClaimId(bad), false, JSON.stringify(bad));
  }
  assert.equal(CLAIM_ID_PATTERN.source.startsWith('^') && CLAIM_ID_PATTERN.source.endsWith('$'), true, 'pattern must be anchored');
});

test('normalizeClaimId trims and upper-cases strings; non-strings become empty', () => {
  assert.equal(normalizeClaimId('  fra-mp-2025-a7k2qx '), 'FRA-MP-2025-A7K2QX');
  for (const v of [null, undefined, 5, {}, { $ne: null }, ['FRA-MP-2025-A7K2QX']]) assert.equal(normalizeClaimId(v), '');
});

test('generateClaimId produces valid, readable, non-repeating IDs', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    const id = generateClaimId('MP', 2025);
    assert.ok(isValidClaimId(id), id);
    assert.doesNotMatch(id.split('-')[3], /[ILO01]/, 'look-alike characters must not be generated');
    seen.add(id);
  }
  assert.ok(seen.size > 495);
  assert.throws(() => generateClaimId('mp'));
  assert.throws(() => generateClaimId('MP', 25));
});

test('GeoJSON validator accepts Polygon and MultiPolygon', () => {
  assert.equal(validateGeoJsonGeometry({ type: 'Polygon', coordinates: [ring] }).valid, true);
  assert.equal(validateGeoJsonGeometry({ type: 'MultiPolygon', coordinates: [[ring], [ring]] }).valid, true);
});

test('GeoJSON validator rejects bad geometry', () => {
  const cases = {
    null: null, string: 'x', array: [], noType: { coordinates: [ring] }, point: { type: 'Point', coordinates: [80, 21] },
    empty: { type: 'Polygon', coordinates: [] }, missing: { type: 'Polygon' },
    shortRing: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] },
    unclosed: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
    latOutOfRange: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 95], [0, 0]]] },
    lngOutOfRange: { type: 'Polygon', coordinates: [[[0, 0], [190, 0], [1, 1], [0, 0]]] },
    nan: { type: 'Polygon', coordinates: [[[0, 0], [NaN, 0], [1, 1], [0, 0]]] },
    strings: { type: 'Polygon', coordinates: [[['0', '0'], ['1', '0'], ['1', '1'], ['0', '0']]] },
    multiWrong: { type: 'MultiPolygon', coordinates: [ring] },
    multiEmpty: { type: 'MultiPolygon', coordinates: [] },
  };
  for (const [name, g] of Object.entries(cases)) assert.equal(validateGeoJsonGeometry(g).valid, false, name);
});

test('GeoJSON validator caps vertex count', () => {
  const big = Array.from({ length: 20001 }, (_, i) => [80 + (i % 10) / 1000, 21 + (i % 7) / 1000]);
  big[big.length - 1] = big[0];
  assert.equal(validateGeoJsonGeometry({ type: 'Polygon', coordinates: [big] }).valid, false);
});

const good = () => ({
  status: 'REJECTED', rejectionReason: 'Reason', dataSource: 'DEMO',
  statusHistory: [{ status: 'PENDING', changedAt: '2025-01-01' }, { status: 'REJECTED', changedAt: '2025-02-01' }],
});

test('consistency: a coherent claim has no problems', () => {
  assert.deepEqual(checkClaimConsistency(good()), []);
  assert.deepEqual(checkClaimConsistency({ ...good(), status: 'PENDING', rejectionReason: null, statusHistory: [{ status: 'PENDING', changedAt: new Date() }] }), []);
});

test('consistency: catches each rule violation', () => {
  const has = (claim, re) => assert.ok(checkClaimConsistency(claim).some((p) => re.test(p)), JSON.stringify(checkClaimConsistency(claim)));
  has({ ...good(), rejectionReason: '' }, /rejectionReason is required/);
  has({ ...good(), rejectionReason: null }, /rejectionReason is required/);
  has({ ...good(), status: 'APPROVED', statusHistory: [{ status: 'APPROVED', changedAt: '2025-01-01' }] }, /must be empty/);
  has({ ...good(), status: 'PENDING' }, /latest statusHistory/);
  has({ ...good(), statusHistory: [] }, /at least one entry/);
  has({ ...good(), statusHistory: [{ status: 'REJECTED', changedAt: '2025-02-01' }, { status: 'REJECTED', changedAt: '2025-01-01' }] }, /chronological/);
  has({ ...good(), statusHistory: [{ status: 'NOPE', changedAt: '2025-01-01' }, { status: 'REJECTED', changedAt: '2025-02-01' }] }, /not valid/);
  has({ ...good(), statusHistory: [{ status: 'PENDING', changedAt: 'garbage' }, { status: 'REJECTED', changedAt: '2025-02-01' }] }, /valid date/);
  has({ ...good(), dataSource: undefined }, /dataSource/);
  has({ ...good(), dataSource: 'REAL' }, /dataSource/);
  has({ ...good(), status: 'DONE' }, /valid status/);
});

test('demo seed data: every claim is valid, DEMO-flagged, and covers all statuses that matter', () => {
  const claims = buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: Date.UTC(2026, 0, 1) });
  assert.equal(claims.length, 10);
  const ids = new Set();
  for (const c of claims) {
    assert.ok(isValidClaimId(c.claimId), c.claimId);
    ids.add(c.claimId);
    assert.equal(c.dataSource, 'DEMO');
    assert.deepEqual(checkClaimConsistency(c), [], c.claimId);
    if (c.geometry) assert.equal(validateGeoJsonGeometry(c.geometry).valid, true, c.claimId);
    assert.match(c.applicant.fullName, /^Demo /);
  }
  assert.equal(ids.size, 10, 'claim IDs must be unique');
  assert.ok(claims.some((c) => c.status === 'REJECTED' && c.rejectionReason));
  assert.ok(claims.some((c) => c.geometry?.type === 'MultiPolygon'));
  assert.ok(claims.some((c) => !c.geometry), 'one claim without a boundary for the map empty state');
  const owners = new Set(claims.map((c) => c.farmer));
  assert.deepEqual([...owners].sort(), ['A', 'B'], 'claims must belong to two different farmers');
});
