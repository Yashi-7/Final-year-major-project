// Unit tests for the pure browser-side logic (no React, no DOM, no dependencies): run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClaimId, validateClaimIdInput } from '../src/utils/claimId.js';
import { geometryBounds, isValidGeometry } from '../src/utils/geo.js';
import { toPayload, validateField, validateForm } from '../src/utils/cropFormValidation.js';
import { toYieldPayload, validateYieldField, validateYieldForm } from '../src/utils/yieldFormValidation.js';
import { CLAIM_ID_PATTERN, CLAIM_STATUSES, STATUS_META, CLAIM_TYPE_LABELS, DEMO_LABEL } from '../src/config/fraConfig.js';
import { NAV_LINKS } from '../src/config/navigation.js';

// ---------------------------------------------------------------- claim reference IDs
test('claim ID input: normalised (trim, upper-case) and validated against the reference-ID format', () => {
  assert.equal(normalizeClaimId('  fra-mp-2025-a7k2qx '), 'FRA-MP-2025-A7K2QX');
  assert.equal(validateClaimIdInput(' fra-mp-2025-a7k2qx '), '');
  for (const bad of ['', '   ', 'abc', 'FRA-MP-2025', 'FRA-MP-2025-ABCDEFG', 'FRA-M-2025-ABCDEF', 'FRA-MP-2025-ABC!EF', '{"$ne":null}', "'; DROP TABLE"]) {
    assert.notEqual(validateClaimIdInput(bad), '', JSON.stringify(bad));
  }
  for (const notString of [null, undefined, 5, {}, ['FRA-MP-2025-A7K2QX']]) {
    assert.equal(normalizeClaimId(notString), '');
    assert.notEqual(validateClaimIdInput(notString), '');
  }
});

test('claim ID pattern is anchored (no partial matches)', () => {
  assert.ok(CLAIM_ID_PATTERN.source.startsWith('^') && CLAIM_ID_PATTERN.source.endsWith('$'));
  assert.equal(CLAIM_ID_PATTERN.test('xFRA-MP-2025-A7K2QX'), false);
  assert.equal(CLAIM_ID_PATTERN.test('FRA-MP-2025-A7K2QXx'), false);
});

// ---------------------------------------------------------------- GeoJSON safety
const ring = [[80, 21], [80.01, 21], [80.01, 21.01], [80, 21.01], [80, 21]];

test('geometry: Polygon and MultiPolygon are valid; everything else is rejected without throwing', () => {
  assert.equal(isValidGeometry({ type: 'Polygon', coordinates: [ring] }), true);
  assert.equal(isValidGeometry({ type: 'MultiPolygon', coordinates: [[ring], [ring]] }), true);
  const bad = [null, undefined, 'x', 5, [], {}, { type: 'Point', coordinates: [1, 2] }, { type: 'Polygon' }, { type: 'Polygon', coordinates: [] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] },                                   // too few positions
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },                   // ring not closed
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 95], [0, 0]]] },                  // latitude out of range
    { type: 'Polygon', coordinates: [[[0, 0], [190, 0], [1, 1], [0, 0]]] },                 // longitude out of range
    { type: 'Polygon', coordinates: [[['0', '0'], ['1', '0'], ['1', '1'], ['0', '0']]] },   // strings, not numbers
    { type: 'Polygon', coordinates: [[[0, 0], [NaN, 0], [1, 1], [0, 0]]] },
    { type: 'MultiPolygon', coordinates: [ring] }, { type: 'MultiPolygon', coordinates: [] }];
  for (const g of bad) assert.equal(isValidGeometry(g), false, JSON.stringify(g));
  for (const g of bad) assert.doesNotThrow(() => geometryBounds(g));
});

test('geometry bounds: [[south, west], [north, east]] in Leaflet order, and null for unusable geometry', () => {
  assert.deepEqual(geometryBounds({ type: 'Polygon', coordinates: [ring] }), [[21, 80], [21.01, 80.01]]);
  const multi = geometryBounds({ type: 'MultiPolygon', coordinates: [[ring], [[[82, 19], [82.5, 19], [82.5, 19.5], [82, 19.5], [82, 19]]]] });
  assert.deepEqual(multi, [[19, 80], [21.01, 82.5]]);
  assert.equal(geometryBounds({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }), null);
});

// ---------------------------------------------------------------- crop recommendation form
const goodCrop = { nitrogen: '130', phosphorus: '48', potassium: '35', ph: '7.9', temperature: '24', rainfall: '900', humidity: '45', season: 'Rabi' };

test('crop form: a complete valid form passes and becomes a numeric payload', () => {
  assert.equal(validateForm(goodCrop).isValid, true);
  assert.deepEqual(toPayload(goodCrop), { nitrogen: 130, phosphorus: 48, potassium: 35, ph: 7.9, temperature: 24, rainfall: 900, humidity: 45, season: 'Rabi' });
});

test('crop form: every field is required, ranges are enforced, junk is rejected', () => {
  assert.equal(Object.keys(validateForm({}).errors).length, 8);
  for (const [field, bad] of [['ph', '14'], ['ph', '2'], ['humidity', '101'], ['rainfall', '-1'], ['temperature', '80'], ['nitrogen', '999'], ['ph', 'abc'], ['ph', '1e3'], ['ph', '7,5'], ['season', 'Monsoon'], ['season', '']]) {
    assert.notEqual(validateField(field, bad), '', `${field}=${bad}`);
  }
  for (const [field, ok] of [['ph', '3'], ['ph', '10'], ['humidity', '0'], ['humidity', '100'], ['rainfall', '0']]) assert.equal(validateField(field, ok), '', `${field}=${ok}`);
});

// ---------------------------------------------------------------- yield prediction form
const options = {
  years: { min: 1997, max: 2030, trainedMin: 1997, trainedMax: 2020 },
  states: ['Punjab', 'Kerala'],
  seasonsByState: { Punjab: ['Rabi'], Kerala: ['Whole Year'] },
  cropsByStateSeason: { Punjab: { Rabi: ['Wheat'] }, Kerala: { 'Whole Year': ['Coconut'] } },
};

test('yield form: only combinations from the model options are accepted', () => {
  const good = { state: 'Punjab', season: 'Rabi', crop: 'Wheat', year: '2015' };
  assert.equal(validateYieldForm(good, options).isValid, true);
  assert.notEqual(validateYieldField('crop', 'Coconut', good, options), '', 'a crop the model has no data for in that state/season');
  assert.notEqual(validateYieldField('season', 'Whole Year', good, options), '');
  assert.notEqual(validateYieldField('state', 'Atlantis', good, options), '');
});

test('yield form: the year must be a whole number inside the allowed range', () => {
  for (const bad of ['', '1996', '2031', 'abc', '2015.5', '-2015']) assert.notEqual(validateYieldField('year', bad, {}, options), '', bad);
  for (const ok of ['1997', '2030', ' 2015 ']) assert.equal(validateYieldField('year', ok, {}, options), '', ok);
});

test('yield payload contains exactly the four model features (never area or production)', () => {
  const payload = toYieldPayload({ state: 'Punjab', season: 'Rabi', crop: 'Wheat', year: ' 2015 ', area: '100', production: '5000' });
  assert.deepEqual(payload, { state: 'Punjab', season: 'Rabi', crop: 'Wheat', year: 2015 });
});

// ---------------------------------------------------------------- shared display configuration
test('claim statuses: the six workflow statuses each have a label, badge and timeline colour', () => {
  assert.deepEqual(CLAIM_STATUSES, ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW', 'FORWARDED', 'APPROVED', 'REJECTED']);
  for (const s of CLAIM_STATUSES) {
    assert.ok(STATUS_META[s].label && STATUS_META[s].badge && STATUS_META[s].dot, s);
  }
  assert.deepEqual(Object.keys(CLAIM_TYPE_LABELS), ['IFR', 'CR', 'CFR']);
});

test('the demo-data label is exactly "Demo / Illustrative Data"', () => {
  assert.equal(DEMO_LABEL, 'Demo / Illustrative Data');
});

test('navigation: each role only links to its own area and there are exactly two roles', () => {
  assert.deepEqual(Object.keys(NAV_LINKS).sort(), ['FARMER', 'GOVERNMENT_OFFICIAL']);
  assert.ok(NAV_LINKS.FARMER.every((l) => l.to.startsWith('/farmer/')));
  assert.ok(NAV_LINKS.GOVERNMENT_OFFICIAL.every((l) => l.to.startsWith('/government/')));
});
