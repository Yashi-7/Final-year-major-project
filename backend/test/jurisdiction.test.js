import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaFromInput, buildClaimScopeFilter, describeArea, hasJurisdiction, normalizeAreas } from '../src/utils/jurisdiction.js';
import { buildDemoClaims, DEMO_OFFICIALS } from '../src/seed/demoFraClaims.js';
import { matches } from './fakes/mongoMatch.js';

const claims = buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: Date.UTC(2026, 0, 1) });
const idsFor = (areas) => {
  const filter = buildClaimScopeFilter(normalizeAreas(areas));
  return filter ? claims.filter((c) => matches(c, filter)).map((c) => c.claimId.slice(-6)).sort() : [];
};

test('DENY BY DEFAULT: missing, empty or malformed jurisdictions grant nothing', () => {
  for (const bad of [undefined, null, [], {}, 'Madhya Pradesh', 5, [null], [undefined], [{}], [{ state: '' }], [{ state: '   ' }],
    [{ district: 'Balaghat' }], [{ state: 5 }], [{ state: ['Madhya Pradesh'] }], [{ state: 'X'.repeat(101) }]]) {
    assert.deepEqual(normalizeAreas(bad), [], JSON.stringify(bad));
    assert.equal(buildClaimScopeFilter(normalizeAreas(bad)), null);
  }
  assert.equal(hasJurisdiction(undefined), false);
  assert.equal(hasJurisdiction({ jurisdiction: { areas: [] } }), false);
  assert.equal(hasJurisdiction({ jurisdiction: { areas: [{ state: 'Odisha' }] } }), true);
});

test('hierarchy: a tehsil without a district is invalid and grants nothing', () => {
  assert.deepEqual(normalizeAreas([{ state: 'Madhya Pradesh', tehsil: 'Demo Tehsil' }]), []);
  assert.equal(buildAreaFromInput({ state: 'Madhya Pradesh', tehsil: 'T' }).area, undefined);
  assert.ok(buildAreaFromInput({ state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'T' }).area);
});

test('operator objects and non-strings can never reach a filter', () => {
  for (const evil of [{ $ne: null }, { $regex: '.*' }, { $gt: '' }, ['Madhya Pradesh'], 123, true]) {
    assert.deepEqual(normalizeAreas([{ state: evil }]), [], JSON.stringify(evil));
    assert.deepEqual(normalizeAreas([{ state: 'Madhya Pradesh', district: evil }]).map((a) => a.district), [null], 'bad district is dropped, area narrows to nothing extra');
  }
});

test('a district that is not a plain string is dropped rather than widening or breaking the scope', () => {
  const [a] = normalizeAreas([{ state: 'Madhya Pradesh', district: { $ne: null } }]);
  assert.deepEqual(a, { state: 'Madhya Pradesh', district: null, tehsil: null });
});

test('normalizeAreas trims, de-duplicates and accepts Mongoose-style subdocuments', () => {
  const areas = normalizeAreas([{ state: ' Odisha ' }, { state: 'Odisha' }, { toObject: () => ({ state: 'Madhya Pradesh', district: 'Balaghat' }) }]);
  assert.deepEqual(areas, [{ state: 'Odisha', district: null, tehsil: null }, { state: 'Madhya Pradesh', district: 'Balaghat', tehsil: null }]);
});

test('scope filter shape: $or of exact string equalities on location fields only', () => {
  const f = buildClaimScopeFilter(normalizeAreas([{ state: 'Madhya Pradesh' }, { state: 'Odisha', district: 'Koraput' }]));
  assert.deepEqual(f, { $or: [{ 'location.state': 'Madhya Pradesh' }, { 'location.state': 'Odisha', 'location.district': 'Koraput' }] });
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(f)).$or[0]), ['location.state']);
});

test('SCOPE SEMANTICS on the demo claims: state-wide, district, multi-area, unknown', () => {
  assert.deepEqual(idsFor([{ state: 'Madhya Pradesh' }]), ['DEMO01', 'DEMO02', 'DEMO03', 'DEMO06', 'DEMO07', 'DEMO08', 'DEMO09', 'DEMO10']);
  assert.deepEqual(idsFor([{ state: 'Madhya Pradesh', district: 'Balaghat' }]), ['DEMO01', 'DEMO02', 'DEMO03', 'DEMO06', 'DEMO09']);
  assert.deepEqual(idsFor([{ state: 'Madhya Pradesh', district: 'Mandla' }]), ['DEMO07', 'DEMO08', 'DEMO10']);
  assert.deepEqual(idsFor([{ state: 'Odisha' }]), ['DEMO04']);
  assert.deepEqual(idsFor([{ state: 'Odisha' }, { state: 'Chhattisgarh' }]), ['DEMO04', 'DEMO05']);
  assert.deepEqual(idsFor([{ state: 'Assam' }]), []);
  assert.deepEqual(idsFor([{ state: 'Madhya Pradesh', district: 'Odisha' }]), [], 'a district name never matches other states');
  assert.deepEqual(idsFor([{ state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Demo Tehsil' }]), ['DEMO01', 'DEMO02', 'DEMO03', 'DEMO06', 'DEMO09']);
  assert.deepEqual(idsFor([{ state: 'Madhya Pradesh', district: 'Balaghat', tehsil: 'Nowhere' }]), []);
  assert.deepEqual(idsFor([]), []);
});

test('matching is exact: different letter case does not match (fails safe to "no claims")', () => {
  assert.deepEqual(idsFor([{ state: 'madhya pradesh' }]), []);
});

test('the mini matcher refuses operators, so a filter containing them would fail loudly in tests', () => {
  assert.throws(() => matches(claims[0], { 'location.state': { $ne: 'x' } }), /unsupported operator \$ne/);
  assert.throws(() => matches(claims[0], { $where: 'x' }), /unsupported operator/);
});

test('describeArea builds readable labels', () => {
  assert.equal(describeArea({ state: 'Madhya Pradesh', district: null, tehsil: null }), 'Madhya Pradesh');
  assert.equal(describeArea({ state: 'Madhya Pradesh', district: 'Balaghat', tehsil: null }), 'Madhya Pradesh › Balaghat');
});

test('demo officials: every area is valid, one has none, and scopes are distinct', () => {
  assert.equal(DEMO_OFFICIALS.length, 5);
  for (const o of DEMO_OFFICIALS) assert.equal(normalizeAreas(o.areas).length, o.areas.length, o.email);
  assert.equal(DEMO_OFFICIALS.filter((o) => o.areas.length === 0).length, 1);
  assert.ok(DEMO_OFFICIALS.every((o) => /@demo\.invalid$/.test(o.email)));
});
