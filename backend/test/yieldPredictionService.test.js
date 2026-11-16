import test from 'node:test';
import assert from 'node:assert/strict';
import { MlServiceError } from '../src/services/mlClient.js';
import { getYieldOptions, getYieldPrediction, normalizeOptions, normalizePrediction } from '../src/services/yieldPredictionService.js';
import { YIELD_BODY, YIELD_OK, YIELD_OPTIONS_OK, jsonReply, startMockMl } from './helpers.js';

const withMl = async (handler, fn, env = {}) => {
  const mock = await startMockMl(handler);
  process.env.ML_SERVICE_URL = mock.url;
  Object.assign(process.env, env);
  try { await fn(mock); } finally {
    for (const k of ['ML_SERVICE_URL', 'ML_SERVICE_TIMEOUT_MS', 'ML_SERVICE_API_KEY']) delete process.env[k];
    await mock.close();
  }
};
const isMl = (code, status) => (e) => e instanceof MlServiceError && e.code === code && e.status === status;

test('prediction: forwards the four features and returns whitelisted output only', () =>
  withMl((q, r) => jsonReply(r, 200, YIELD_OK), async (mock) => {
    const out = await getYieldPrediction(YIELD_BODY);
    assert.deepEqual(out, {
      prediction: { value: 4.87 },
      inputs: { ...YIELD_BODY, cropLabel: 'Wheat', cropSlug: 'wheat' },
      notice: null,
      dataNote: 'Values are on the dataset scale; no unit is shown.',
    });
    const txt = JSON.stringify(out);
    assert.doesNotMatch(txt, /confidence|debug|area|trees/);
    assert.equal(mock.requests[0].method, 'POST');
    assert.equal(mock.requests[0].url, '/yield-prediction/predict');
    assert.deepEqual(JSON.parse(mock.requests[0].body), YIELD_BODY);
  }));

test('options: GET to the right path, unused crop labels dropped', () =>
  withMl((q, r) => jsonReply(r, 200, YIELD_OPTIONS_OK), async (mock) => {
    const out = await getYieldOptions();
    assert.equal(mock.requests[0].method, 'GET');
    assert.equal(mock.requests[0].url, '/yield-prediction/options');
    assert.equal(mock.requests[0].body, '');
    assert.deepEqual(Object.keys(out.cropLabels).sort(), ['Coconut', 'Wheat']);
    assert.deepEqual(out.states, ['Punjab', 'Kerala']);
  }));

test('Flask validation error (unsupported combination) is passed through as a validation error', () =>
  withMl((q, r) => jsonReply(r, 400, { success: false, code: 'VALIDATION_ERROR', errors: [{ field: 'crop', message: 'No data for this crop in the selected state and season.', extra: 'x' }] }), async () => {
    await assert.rejects(getYieldPrediction(YIELD_BODY), (e) => {
      assert.equal(e.status, 400);
      assert.deepEqual(e.errors, [{ field: 'crop', message: 'No data for this crop in the selected state and season.' }]);
      return true;
    });
  }));

test('a 400 without the validation shape is NOT passed through (502)', () =>
  withMl((q, r) => jsonReply(r, 400, { success: false, message: 'weird' }), () =>
    assert.rejects(getYieldPrediction(YIELD_BODY), isMl('ML_SERVICE_ERROR', 502))));

test('failure mapping: 503 / 500 / bad JSON / timeout', async () => {
  await withMl((q, r) => jsonReply(r, 503, { code: 'MODEL_UNAVAILABLE' }), () => assert.rejects(getYieldPrediction(YIELD_BODY), isMl('ML_SERVICE_UNAVAILABLE', 503)));
  await withMl((q, r) => jsonReply(r, 500, 'boom'), () => assert.rejects(getYieldPrediction(YIELD_BODY), isMl('ML_SERVICE_ERROR', 502)));
  await withMl((q, r) => jsonReply(r, 200, 'nope'), () => assert.rejects(getYieldPrediction(YIELD_BODY), isMl('ML_INVALID_RESPONSE', 502)));
  await withMl((q, r) => setTimeout(() => jsonReply(r, 200, YIELD_OK), 1200), () => assert.rejects(getYieldPrediction(YIELD_BODY), isMl('ML_SERVICE_TIMEOUT', 504)), { ML_SERVICE_TIMEOUT_MS: '120' });
});

test('normalizePrediction rejects malformed / unsafe responses', () => {
  const ok = YIELD_OK.data;
  const bad = [
    null, {}, { success: false },
    { success: true, data: { ...ok, prediction: { value: 'abc' } } },
    { success: true, data: { ...ok, prediction: { value: -1 } } },
    { success: true, data: { ...ok, prediction: { value: null } } },
    { success: true, data: { ...ok, prediction: { value: Infinity } } },
    { success: true, data: { ...ok, inputs: { ...ok.inputs, cropSlug: '../x' } } },
    { success: true, data: { ...ok, inputs: { ...ok.inputs, year: '2015' } } },
    { success: true, data: { ...ok, inputs: null } },
  ];
  for (const b of bad) assert.throws(() => normalizePrediction(b), isMl('ML_INVALID_RESPONSE', 502), JSON.stringify(b));
});

test('normalizeOptions rejects malformed responses', () => {
  const ok = YIELD_OPTIONS_OK.data;
  const bad = [
    null, { success: true }, { success: true, data: { ...ok, states: [] } },
    { success: true, data: { ...ok, years: { min: 1997 } } },
    { success: true, data: { ...ok, cropsByStateSeason: { Punjab: { Rabi: [] }, Kerala: ok.cropsByStateSeason.Kerala } } },
    { success: true, data: { ...ok, cropLabels: {} } },
  ];
  for (const b of bad) assert.throws(() => normalizeOptions(b), isMl('ML_INVALID_RESPONSE', 502));
});
