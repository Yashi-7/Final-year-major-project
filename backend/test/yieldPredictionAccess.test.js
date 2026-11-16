/**
 * Access control + behaviour for /api/farmer/yield-prediction (POST) and /options (GET).
 * Same approach as cropRecommendationAccess.test.js: the real authorize / validator / controller / service /
 * ML client run behind a stubbed `authenticate` (needs MongoDB) and a mock Flask. Router wiring is
 * checked statically against the real routes file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import authorize from '../src/middleware/roleMiddleware.js';
import { validateYieldPrediction } from '../src/validators/yieldPredictionValidator.js';
import { predictYield, yieldOptions } from '../src/controllers/yieldPredictionController.js';
import { YIELD_BODY, YIELD_OK, YIELD_OPTIONS_OK, jsonReply, runChain, startMockMl } from './helpers.js';

const authAs = (user) => (req, res, next) => {
  if (!user) return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
  req.user = user;
  return next();
};
const predictChain = (user) => [authAs(user), authorize('FARMER'), validateYieldPrediction, predictYield];
const optionsChain = (user) => [authAs(user), authorize('FARMER'), yieldOptions];
const req = (body) => ({ body, headers: {}, cookies: {} });
const FARMER = { role: 'FARMER' };
const GOV = { role: 'GOVERNMENT_OFFICIAL' };

const withMl = async (handler, fn) => {
  const mock = await startMockMl(handler);
  process.env.ML_SERVICE_URL = mock.url;
  try { await fn(mock); } finally { delete process.env.ML_SERVICE_URL; delete process.env.ML_SERVICE_TIMEOUT_MS; await mock.close(); }
};
const route = (q, r) => jsonReply(r, 200, q.url.endsWith('/options') ? YIELD_OPTIONS_OK : YIELD_OK);

test('FARMER + valid input -> 200, consistent response shape', () =>
  withMl(route, async (mock) => {
    const res = await runChain(predictChain(FARMER), req(YIELD_BODY));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.message, 'string');
    assert.equal(res.body.data.prediction.value, 4.87);
    assert.equal(res.body.data.inputs.crop, 'Wheat');
    assert.equal(mock.requests.length, 1);
  }));

test('unauthenticated -> 401 and the ML service is never called (both endpoints)', () =>
  withMl(route, async (mock) => {
    assert.equal((await runChain(predictChain(null), req(YIELD_BODY))).statusCode, 401);
    assert.equal((await runChain(optionsChain(null), req())).statusCode, 401);
    assert.equal(mock.requests.length, 0);
  }));

test('GOVERNMENT_OFFICIAL -> 403 on both endpoints, ML never called; invalid body still 403 not 400', () =>
  withMl(route, async (mock) => {
    const a = await runChain(predictChain(GOV), req(YIELD_BODY));
    const b = await runChain(optionsChain(GOV), req());
    const c = await runChain(predictChain(GOV), req({}));
    assert.deepEqual([a.statusCode, b.statusCode, c.statusCode], [403, 403, 403]);
    assert.equal(mock.requests.length, 0);
  }));

test('FARMER + invalid input -> 400 with field errors, ML never called', () =>
  withMl(route, async (mock) => {
    const res = await runChain(predictChain(FARMER), req({ ...YIELD_BODY, year: 1800, area: 10, production: 5 }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Validation failed');
    assert.deepEqual(res.body.errors.map((e) => e.field).sort(), ['area', 'production', 'year']);
    assert.equal(mock.requests.length, 0);
  }));

test('FARMER + unsupported combination (Flask says so) -> 400 with the field error', () =>
  withMl((q, r) => jsonReply(r, 400, { success: false, code: 'VALIDATION_ERROR', errors: [{ field: 'crop', message: 'No data for this crop in the selected state and season.' }] }), async () => {
    const res = await runChain(predictChain(FARMER), req({ ...YIELD_BODY, crop: 'Coconut' }));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body.errors, [{ field: 'crop', message: 'No data for this crop in the selected state and season.' }]);
  }));

test('FARMER + options -> 200 with form choices', () =>
  withMl(route, async () => {
    const res = await runChain(optionsChain(FARMER), req());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data.states, ['Punjab', 'Kerala']);
    assert.equal(res.body.data.years.max, 2030);
  }));

test('ML down -> 503 friendly, no internals (both endpoints)', async () => {
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:1';
  try {
    for (const [chain, body] of [[predictChain(FARMER), YIELD_BODY], [optionsChain(FARMER), undefined]]) {
      const res = await runChain(chain, req(body));
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.code, 'ML_SERVICE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(res.body), /127\.0\.0\.1|ECONN|stack/i);
    }
  } finally { delete process.env.ML_SERVICE_URL; }
});

test('ML timeout -> 504; ML model missing (Flask 503) -> 503; garbage -> 502', async () => {
  await withMl((q, r) => setTimeout(() => jsonReply(r, 200, YIELD_OK), 800), async () => {
    process.env.ML_SERVICE_TIMEOUT_MS = '100';
    const res = await runChain(predictChain(FARMER), req(YIELD_BODY));
    assert.equal(res.statusCode, 504); assert.equal(res.body.code, 'ML_SERVICE_TIMEOUT');
  });
  await withMl((q, r) => jsonReply(r, 503, { success: false, code: 'MODEL_UNAVAILABLE' }), async () => {
    const res = await runChain(predictChain(FARMER), req(YIELD_BODY));
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'ML_SERVICE_UNAVAILABLE');
  });
  await withMl((q, r) => jsonReply(r, 200, { success: true, data: { prediction: { value: 'x' } } }), async () => {
    const res = await runChain(predictChain(FARMER), req(YIELD_BODY));
    assert.equal(res.statusCode, 502); assert.equal(res.body.code, 'ML_INVALID_RESPONSE');
  });
});

// ---- static wiring checks against the REAL router files ----
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('farmerRoutes: FARMER guard precedes both yield routes; POST validates before the controller', () => {
  const src = read('../src/routes/farmerRoutes.js');
  const guard = src.indexOf("router.use(authenticate, authorize('FARMER'))");
  const get = src.indexOf("router.get('/yield-prediction/options', yieldOptions)");
  const post = src.indexOf("router.post('/yield-prediction', validateYieldPrediction, predictYield)");
  assert.ok(guard !== -1 && get !== -1 && post !== -1, 'route or guard missing / middleware order changed');
  assert.ok(guard < get && guard < post);
  assert.ok(src.includes("router.post('/crop-recommendation', validateCropRecommendation, recommendCrops)"), 'Phase 3 route must remain');
});

test('no yield endpoint is exposed anywhere else', () => {
  assert.doesNotMatch(read('../src/routes/governmentRoutes.js'), /yield/i);
  assert.doesNotMatch(read('../src/routes/authRoutes.js'), /yield/i);
  assert.doesNotMatch(read('../src/app.js'), /yield/i);
});
