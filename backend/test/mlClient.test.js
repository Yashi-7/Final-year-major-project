import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { MlServiceError } from '../src/services/mlClient.js';
import { getCropRecommendations, normalizeMlResponse } from '../src/services/cropRecommendationService.js';
import { FLASK_OK, VALID_BODY, jsonReply, startMockMl } from './helpers.js';

const withMl = async (handler, fn, env = {}) => {
  const mock = await startMockMl(handler);
  const saved = { ...process.env };
  process.env.ML_SERVICE_URL = mock.url;
  Object.assign(process.env, env);
  try { await fn(mock); } finally {
    for (const k of ['ML_SERVICE_URL', 'ML_SERVICE_TIMEOUT_MS', 'ML_SERVICE_API_KEY']) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    await mock.close();
  }
};

const rejectsWith = async (promise, code, status) => {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof MlServiceError, `expected MlServiceError, got ${err}`);
    assert.equal(err.code, code);
    assert.equal(err.status, status);
    assert.doesNotMatch(err.publicMessage, /127\.0\.0\.1|localhost|ECONN|stack/i, 'public message must not leak internals');
    return true;
  });
};

test('success: forwards validated input to the right Flask path and returns whitelisted output', () =>
  withMl((req, res) => jsonReply(res, 200, FLASK_OK), async (mock) => {
    const out = await getCropRecommendations(VALID_BODY);
    assert.deepEqual(out.recommendations.map((r) => r.crop), ['Wheat', 'Barley', 'Rapeseed & Mustard']);
    for (const r of out.recommendations) assert.deepEqual(Object.keys(r).sort(), ['crop', 'rank', 'slug']);
    assert.equal(out.notice, null);
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].method, 'POST');
    assert.equal(mock.requests[0].url, '/crop-recommendation/predict');
    assert.deepEqual(JSON.parse(mock.requests[0].body), VALID_BODY);
  }));

test('sends X-Internal-Api-Key only when configured', async () => {
  await withMl((req, res) => jsonReply(res, 200, FLASK_OK), async (mock) => {
    await getCropRecommendations(VALID_BODY);
    assert.equal(mock.requests[0].headers['x-internal-api-key'], undefined);
  });
  await withMl((req, res) => jsonReply(res, 200, FLASK_OK), async (mock) => {
    await getCropRecommendations(VALID_BODY);
    assert.equal(mock.requests[0].headers['x-internal-api-key'], 'k3y');
  }, { ML_SERVICE_API_KEY: 'k3y' });
});

test('passes through a short notice string', () =>
  withMl((req, res) => jsonReply(res, 200, { ...FLASK_OK, data: { ...FLASK_OK.data, notice: 'Take care.' } }), async () => {
    assert.equal((await getCropRecommendations(VALID_BODY)).notice, 'Take care.');
  }));

test('ML service down (connection refused) -> 503 ML_SERVICE_UNAVAILABLE', async () => {
  const srv = net.createServer(); // grab a free port, then close it so nothing listens
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${port}`;
  try { await rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_UNAVAILABLE', 503); }
  finally { delete process.env.ML_SERVICE_URL; }
});

test('ML service too slow -> 504 ML_SERVICE_TIMEOUT', () =>
  withMl((req, res) => setTimeout(() => jsonReply(res, 200, FLASK_OK), 1500), async () => {
    const t0 = Date.now();
    await rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_TIMEOUT', 504);
    assert.ok(Date.now() - t0 < 1200, 'must abort at the configured timeout, not wait for the reply');
  }, { ML_SERVICE_TIMEOUT_MS: '150' }));

test('Flask 503 (model not loaded) -> 503 ML_SERVICE_UNAVAILABLE', () =>
  withMl((req, res) => jsonReply(res, 503, { success: false, code: 'MODEL_UNAVAILABLE' }), () =>
    rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_UNAVAILABLE', 503)));

test('Flask 500 -> 502 ML_SERVICE_ERROR', () =>
  withMl((req, res) => jsonReply(res, 500, '<html>Traceback ...</html>'), () =>
    rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_ERROR', 502)));

test('Flask 400 / 401 (contract or key mismatch) -> 502, not blamed on the farmer', async () => {
  for (const status of [400, 401]) {
    await withMl((req, res) => jsonReply(res, status, { success: false }), () =>
      rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_ERROR', 502));
  }
});

test('non-JSON 200 -> 502 ML_INVALID_RESPONSE', () =>
  withMl((req, res) => jsonReply(res, 200, 'not json'), () =>
    rejectsWith(getCropRecommendations(VALID_BODY), 'ML_INVALID_RESPONSE', 502)));

test('redirects are refused', () =>
  withMl((req, res) => { res.writeHead(302, { Location: 'http://example.com/' }); res.end(); }, () =>
    rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_UNAVAILABLE', 503)));

test('oversized response body is refused', () =>
  withMl((req, res) => jsonReply(res, 200, JSON.stringify({ pad: 'x'.repeat(70000) })), () =>
    rejectsWith(getCropRecommendations(VALID_BODY), 'ML_INVALID_RESPONSE', 502)));

test('invalid ML_SERVICE_URL -> 500 ML_SERVICE_MISCONFIGURED', async () => {
  process.env.ML_SERVICE_URL = 'ftp://nope';
  try { await rejectsWith(getCropRecommendations(VALID_BODY), 'ML_SERVICE_MISCONFIGURED', 500); }
  finally { delete process.env.ML_SERVICE_URL; }
});

test('normalizeMlResponse rejects malformed shapes', () => {
  const bad = [
    null, {}, { success: false }, { success: true }, { success: true, data: {} },
    { success: true, data: { recommendations: [] } },
    { success: true, data: { recommendations: [{ crop: '', slug: 'a' }] } },
    { success: true, data: { recommendations: [{ crop: 'Rice', slug: '../etc/passwd' }] } },
    { success: true, data: { recommendations: [{ crop: 'Rice', slug: 'Rice' }] } },
    { success: true, data: { recommendations: [{ crop: 'Rice' }] } },
    { success: true, data: { recommendations: Array(11).fill({ crop: 'Rice', slug: 'rice' }) } },
  ];
  for (const b of bad) {
    assert.throws(() => normalizeMlResponse(b), (e) => e instanceof MlServiceError && e.code === 'ML_INVALID_RESPONSE', JSON.stringify(b));
  }
});
