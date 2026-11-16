/**
 * Access-control + end-to-end behaviour of POST /api/farmer/crop-recommendation.
 *
 * Express itself is not installed in the sandbox this was written in, so the request is pushed
 * through the same middleware sequence the router uses (see the wiring test at the bottom, which
 * checks the real router file). `authenticate` is stubbed to attach a user (it needs MongoDB);
 * `authorize`, the validator, the controller, the service and the ML client are the real modules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import authorize from '../src/middleware/roleMiddleware.js';
import errorHandler from '../src/middleware/errorHandler.js';
import { validateCropRecommendation } from '../src/validators/cropRecommendationValidator.js';
import { recommendCrops } from '../src/controllers/cropRecommendationController.js';
import { FLASK_OK, VALID_BODY, jsonReply, mockRes, runChain, startMockMl } from './helpers.js';

const authAs = (user) => (req, res, next) => {
  if (!user) return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
  req.user = user;
  return next();
};
const chain = (user) => [authAs(user), authorize('FARMER'), validateCropRecommendation, recommendCrops];
const req = (body) => ({ body, headers: {}, cookies: {} });

const withMl = async (handler, fn) => {
  const mock = await startMockMl(handler);
  process.env.ML_SERVICE_URL = mock.url;
  try { await fn(mock); } finally { delete process.env.ML_SERVICE_URL; delete process.env.ML_SERVICE_TIMEOUT_MS; await mock.close(); }
};
const ok = (r, res) => jsonReply(res, 200, FLASK_OK);

test('FARMER + valid input -> 200 with consistent response shape', () =>
  withMl(ok, async (mock) => {
    const res = await runChain(chain({ role: 'FARMER' }), req(VALID_BODY));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.message, 'string');
    assert.deepEqual(res.body.data.recommendations.map((r) => [r.rank, r.crop, r.slug]), [
      [1, 'Wheat', 'wheat'], [2, 'Barley', 'barley'], [3, 'Rapeseed & Mustard', 'rapeseed-mustard'],
    ]);
    assert.equal(JSON.stringify(res.body).includes('score'), false);
    assert.equal(JSON.stringify(res.body).includes('probability'), false);
    assert.equal(mock.requests.length, 1);
  }));

test('unauthenticated -> 401, ML service never called', () =>
  withMl(ok, async (mock) => {
    const res = await runChain(chain(null), req(VALID_BODY));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(mock.requests.length, 0);
  }));

test('GOVERNMENT_OFFICIAL -> 403, ML service never called (even with a valid body)', () =>
  withMl(ok, async (mock) => {
    const res = await runChain(chain({ role: 'GOVERNMENT_OFFICIAL' }), req(VALID_BODY));
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(mock.requests.length, 0);
  }));

test('government official with an INVALID body still gets 403, not 400 (authz runs before validation)', async () => {
  const res = await runChain(chain({ role: 'GOVERNMENT_OFFICIAL' }), req({}));
  assert.equal(res.statusCode, 403);
});

test('FARMER + invalid input -> 400 with field errors, ML service never called', () =>
  withMl(ok, async (mock) => {
    const res = await runChain(chain({ role: 'FARMER' }), req({ ...VALID_BODY, ph: 42, season: 'Monsoon', extra: 1 }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation failed');
    assert.deepEqual(res.body.errors.map((e) => e.field).sort(), ['extra', 'ph', 'season']);
    assert.equal(mock.requests.length, 0);
  }));

test('FARMER + ML down -> 503 friendly error, no internals leaked', async () => {
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:1';
  try {
    const res = await runChain(chain({ role: 'FARMER' }), req(VALID_BODY));
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'ML_SERVICE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(res.body), /127\.0\.0\.1|ECONN|stack/i);
  } finally { delete process.env.ML_SERVICE_URL; }
});

test('FARMER + ML timeout -> 504', () =>
  withMl((r, res) => setTimeout(() => jsonReply(res, 200, FLASK_OK), 800), async () => {
    process.env.ML_SERVICE_TIMEOUT_MS = '100';
    const res = await runChain(chain({ role: 'FARMER' }), req(VALID_BODY));
    assert.equal(res.statusCode, 504);
    assert.equal(res.body.code, 'ML_SERVICE_TIMEOUT');
  }));

test('FARMER + ML returns garbage -> 502', () =>
  withMl((r, res) => jsonReply(res, 200, { success: true, data: { recommendations: 'nope' } }), async () => {
    const res = await runChain(chain({ role: 'FARMER' }), req(VALID_BODY));
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, 'ML_INVALID_RESPONSE');
  }));

test('errorHandler honours library status codes (malformed JSON -> 400, not 500)', () => {
  const res = mockRes();
  errorHandler(Object.assign(new Error('Unexpected token'), { status: 400 }), {}, res, () => {});
  assert.equal(res.statusCode, 400);
  const res2 = mockRes();
  errorHandler(new Error('boom'), {}, res2, () => {});
  assert.equal(res2.statusCode, 500);
});

// ---- static wiring checks against the REAL router files (Express can't be loaded here) ----
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('farmerRoutes: authenticate + authorize("FARMER") precede the crop-recommendation route, which validates before the controller', () => {
  const src = read('../src/routes/farmerRoutes.js');
  const guard = src.indexOf("router.use(authenticate, authorize('FARMER'))");
  const route = src.indexOf("router.post('/crop-recommendation', validateCropRecommendation, recommendCrops)");
  assert.ok(guard !== -1, 'router-level FARMER guard missing');
  assert.ok(route !== -1, 'crop-recommendation route missing or middleware order changed');
  assert.ok(guard < route, 'guard must come before the route');
});

test('governmentRoutes exposes no crop-recommendation endpoint', () => {
  assert.doesNotMatch(read('../src/routes/governmentRoutes.js'), /crop-recommendation|recommendCrops/);
});

test('app.js mounts farmer routes under /api/farmer and nothing else serves crop-recommendation', () => {
  const app = read('../src/app.js');
  assert.match(app, /app\.use\('\/api\/farmer', farmerRoutes\)/);
  assert.doesNotMatch(app, /crop-recommendation/);
});
