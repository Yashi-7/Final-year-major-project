// Verifies the crop-recommendation, yield-prediction and FRA-claim contracts are identical in Flask, Node and the
// React forms, and that only Farmers get the Crop Recommendation / Yield Prediction nav links.   Run: node scripts/check-schema-sync.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const flask = JSON.parse(fs.readFileSync(path.join(root, 'ml-service/crop_recommendation/schema.json'), 'utf8'));
const node = await import(pathToFileURL(path.join(root, 'backend/src/config/cropRecommendationSchema.js')));
const react = await import(pathToFileURL(path.join(root, 'frontend/src/config/cropRecommendationFields.js')));
const nav = await import(pathToFileURL(path.join(root, 'frontend/src/config/navigation.js')));

const pick = (fields) => fields.map(({ name, min, max }) => ({ name, min, max }));
assert.deepEqual(pick(node.NUMERIC_FIELDS), pick(flask.numericFields), 'backend fields differ from Flask schema.json');
assert.deepEqual(pick(react.NUMERIC_FIELDS), pick(flask.numericFields), 'frontend fields differ from Flask schema.json');
assert.deepEqual(node.SEASONS, flask.seasons, 'backend seasons differ from Flask schema.json');
assert.deepEqual(react.SEASONS.map((s) => s.value), flask.seasons, 'frontend seasons differ from Flask schema.json');

// ---- yield prediction ----
const yFlask = JSON.parse(fs.readFileSync(path.join(root, 'ml-service/yield_prediction/schema.json'), 'utf8'));
const yNode = await import(pathToFileURL(path.join(root, 'backend/src/config/yieldPredictionSchema.js')));
const yReact = await import(pathToFileURL(path.join(root, 'frontend/src/config/yieldPredictionFields.js')));
assert.deepEqual(yFlask.features, ['state', 'season', 'crop', 'year'], 'yield features must be exactly state, season, crop, year');
assert.ok(!yFlask.features.includes('area') && !yFlask.features.includes('production'), 'area/production must never be features');
assert.deepEqual(yNode.YIELD_FEATURES, yFlask.features, 'backend yield features differ from Flask');
assert.deepEqual([yNode.YEAR_MIN, yNode.YEAR_MAX], [yFlask.year.min, yFlask.year.max], 'backend year range differs from Flask');
assert.deepEqual([yReact.YEAR_MIN, yReact.YEAR_MAX], [yFlask.year.min, yFlask.year.max], 'frontend year range differs from Flask');
assert.equal(yNode.MAX_TEXT_LENGTH, yFlask.maxTextLength, 'backend max text length differs from Flask');

// ---- FRA monitoring: reference-ID format, statuses, GeoJSON rules must agree between backend and frontend ----
const fraRules = await import(pathToFileURL(path.join(root, 'backend/src/utils/fraClaimRules.js')));
const fraCfg = await import(pathToFileURL(path.join(root, 'frontend/src/config/fraConfig.js')));
const geo = await import(pathToFileURL(path.join(root, 'frontend/src/utils/geo.js')));
assert.equal(fraCfg.CLAIM_ID_PATTERN.source, fraRules.CLAIM_ID_PATTERN.source, 'claim ID pattern differs between backend and frontend');
assert.deepEqual(fraCfg.CLAIM_STATUSES, fraRules.CLAIM_STATUSES, 'claim statuses differ between backend and frontend');
assert.deepEqual(Object.keys(fraCfg.STATUS_META), fraRules.CLAIM_STATUSES, 'frontend STATUS_META must cover every status');
assert.deepEqual(Object.keys(fraCfg.CLAIM_TYPE_LABELS), fraRules.CLAIM_TYPES, 'frontend claim types differ from backend');
const r = [[80, 21], [80.01, 21], [80.01, 21.01], [80, 21.01], [80, 21]];
const fixtures = [
  { type: 'Polygon', coordinates: [r] }, { type: 'MultiPolygon', coordinates: [[r], [r]] }, null, 'x', [], { type: 'Point', coordinates: [1, 2] },
  { type: 'Polygon', coordinates: [] }, { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] },
  { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }, { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 95], [0, 0]]] },
  { type: 'Polygon', coordinates: [[['0', '0'], ['1', '0'], ['1', '1'], ['0', '0']]] }, { type: 'MultiPolygon', coordinates: [r] }, { type: 'MultiPolygon', coordinates: [] },
];
fixtures.forEach((g, i) => assert.equal(geo.isValidGeometry(g), fraRules.validateGeoJsonGeometry(g).valid, `geometry validators disagree on fixture ${i}`));

// ---- frontend route separation: every /government/* page lives inside the GOVERNMENT_OFFICIAL guard, every /farmer/* page inside the FARMER guard ----
const app = fs.readFileSync(path.join(root, 'frontend/src/App.jsx'), 'utf8');
const govStart = app.indexOf("allowedRoles={['GOVERNMENT_OFFICIAL']}");
const farmerStart = app.indexOf("allowedRoles={['FARMER']}");
assert.ok(govStart !== -1 && farmerStart !== -1, 'both role-guarded route groups must exist');
const [firstStart, secondStart] = [farmerStart, govStart].sort((a, b) => a - b);
const groupOf = (i) => (i >= secondStart ? (secondStart === govStart ? 'GOVERNMENT_OFFICIAL' : 'FARMER') : i >= firstStart ? (firstStart === govStart ? 'GOVERNMENT_OFFICIAL' : 'FARMER') : null);
for (const m of app.matchAll(/<Route path="(\/(?:government|farmer)\/[^"]*)"/g)) {
  const expected = m[1].startsWith('/government/') ? 'GOVERNMENT_OFFICIAL' : 'FARMER';
  assert.equal(groupOf(m.index), expected, `${m[1]} must be inside the ${expected}-only route group`);
}
assert.doesNotMatch(app, /admin/i, 'no admin routes');
for (const role of ['FARMER', 'GOVERNMENT_OFFICIAL']) {
  const own = role === 'FARMER' ? '/farmer/' : '/government/';
  assert.ok(nav.NAV_LINKS[role].every((l) => l.to.startsWith(own)), `${role} navigation must only link to its own pages`);
}

const has = (role) => nav.NAV_LINKS[role].some((l) => l.label === 'Crop Recommendation');
assert.equal(has('FARMER'), true, 'Farmer sidebar must include Crop Recommendation');
assert.equal(has('GOVERNMENT_OFFICIAL'), false, 'Government sidebar must NOT include Crop Recommendation');
const hasYield = (role) => nav.NAV_LINKS[role].some((l) => l.label === 'Yield Prediction');
assert.equal(hasYield('FARMER'), true, 'Farmer sidebar must include Yield Prediction');
assert.equal(hasYield('GOVERNMENT_OFFICIAL'), false, 'Government sidebar must NOT include Yield Prediction');
const hasFra = (role) => nav.NAV_LINKS[role].some((l) => l.label === 'FRA Monitoring');
const hasGisMap = (role) => nav.NAV_LINKS[role].some((l) => l.label === 'Government GIS Map');
assert.equal(hasGisMap('GOVERNMENT_OFFICIAL'), true, 'Government sidebar must include Government GIS Map');
assert.equal(hasGisMap('FARMER'), false, 'Farmer sidebar must NOT include Government GIS Map');
assert.equal(hasFra('FARMER'), true, 'Farmer sidebar must include FRA Monitoring');
assert.equal(hasFra('GOVERNMENT_OFFICIAL'), false, 'Government sidebar must NOT include FRA Monitoring');

console.log('OK: Flask, backend and frontend schemas match (crop, yield, FRA); all three modules are Farmer-only in navigation; /farmer/* and /government/* routes are role-separated.');
