/**
 * Opt-in end-to-end test: Node validation + ML client -> REAL Flask service -> REAL model.
 * Run with:  RUN_FLASK_INTEGRATION=1 npm test          (needs ml-service deps installed)
 * Optional:  PYTHON=python3  (interpreter that has the ml-service requirements)
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import authorize from '../src/middleware/roleMiddleware.js';
import { validateCropRecommendation } from '../src/validators/cropRecommendationValidator.js';
import { recommendCrops } from '../src/controllers/cropRecommendationController.js';
import { validateYieldPrediction } from '../src/validators/yieldPredictionValidator.js';
import { predictYield, yieldOptions } from '../src/controllers/yieldPredictionController.js';
import { VALID_BODY, YIELD_BODY, runChain } from './helpers.js';

const enabled = process.env.RUN_FLASK_INTEGRATION === '1';
let flask;
let flaskNoYieldModel;

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const waitReady = async (url) => {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${url}/crop-recommendation/ready`)).ok) return; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Flask did not become ready');
};

const startFlask = async (extraEnv = {}) => {
  const port = await freePort();
  const cwd = fileURLToPath(new URL('../../ml-service/', import.meta.url));
  const proc = spawn(process.env.PYTHON || 'python3', ['app.py'], {
    cwd, env: { ...process.env, ML_SERVICE_PORT: String(port), FLASK_DEBUG: 'false', ...extraEnv }, stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${url}/health`)).ok) return { proc, url }; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('Flask did not start');
};

before(async () => {
  if (!enabled) return;
  const main = await startFlask();
  flask = main.proc;
  process.env.ML_SERVICE_URL = main.url;
  await waitReady(main.url);
  // A second service whose yield model files are missing (crop model still fine).
  const noYield = await startFlask({ YIELD_MODEL_DIR: '/nonexistent/yield-model' });
  flaskNoYieldModel = noYield;
});

after(() => { flask?.kill(); flaskNoYieldModel?.proc.kill(); delete process.env.ML_SERVICE_URL; });

const chain = (role) => [(req, res, next) => { req.user = { role }; return next(); }, authorize('FARMER'), validateCropRecommendation, recommendCrops];

test('real Flask + real model: FARMER gets 3 crops', { skip: !enabled }, async () => {
  const res = await runChain(chain('FARMER'), { body: VALID_BODY });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.recommendations.length, 3);
  console.log('    recommendations:', res.body.data.recommendations.map((r) => r.crop).join(', '));
});

test('real Flask + real model: GOVERNMENT_OFFICIAL is blocked before reaching Flask', { skip: !enabled }, async () => {
  const res = await runChain(chain('GOVERNMENT_OFFICIAL'), { body: VALID_BODY });
  assert.equal(res.statusCode, 403);
});

const yieldChain = (role) => [(req, res, next) => { req.user = { role }; return next(); }, authorize('FARMER'), validateYieldPrediction, predictYield];
const optionsChain = (role) => [(req, res, next) => { req.user = { role }; return next(); }, authorize('FARMER'), yieldOptions];

test('real Flask + real yield model: FARMER gets a numeric prediction that echoes the four inputs', { skip: !enabled }, async () => {
  const res = await runChain(yieldChain('FARMER'), { body: YIELD_BODY });
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.data.prediction.value, 'number');
  assert.ok(res.body.data.prediction.value > 0);
  assert.deepEqual({ ...res.body.data.inputs, cropLabel: undefined, cropSlug: undefined }, { ...YIELD_BODY, cropLabel: undefined, cropSlug: undefined });
  console.log('    predicted yield value:', res.body.data.prediction.value);
});

test('real Flask: options come from the model and drive valid predictions', { skip: !enabled }, async () => {
  const opts = await runChain(optionsChain('FARMER'), { body: undefined });
  assert.equal(opts.statusCode, 200);
  assert.equal(opts.body.data.states.length, 30);
  const state = opts.body.data.states[0];
  const season = opts.body.data.seasonsByState[state][0];
  const crop = opts.body.data.cropsByStateSeason[state][season][0];
  const res = await runChain(yieldChain('FARMER'), { body: { state, season, crop, year: 2018 } });
  assert.equal(res.statusCode, 200);
});

test('real Flask: unsupported combination -> 400 pointing at crop; unknown state -> 400', { skip: !enabled }, async () => {
  const a = await runChain(yieldChain('FARMER'), { body: { ...YIELD_BODY, crop: 'Coconut' } });
  assert.equal(a.statusCode, 400);
  assert.deepEqual(a.body.errors.map((e) => e.field), ['crop']);
  const b = await runChain(yieldChain('FARMER'), { body: { ...YIELD_BODY, state: 'Atlantis' } });
  assert.equal(b.statusCode, 400);
  assert.deepEqual(b.body.errors.map((e) => e.field), ['state']);
});

test('real Flask: GOVERNMENT_OFFICIAL blocked on yield endpoints', { skip: !enabled }, async () => {
  assert.equal((await runChain(yieldChain('GOVERNMENT_OFFICIAL'), { body: YIELD_BODY })).statusCode, 403);
  assert.equal((await runChain(optionsChain('GOVERNMENT_OFFICIAL'), {})).statusCode, 403);
});

test('real Flask with MISSING yield model files -> friendly 503 on predict and options; crop model unaffected', { skip: !enabled }, async () => {
  const saved = process.env.ML_SERVICE_URL;
  process.env.ML_SERVICE_URL = flaskNoYieldModel.url;
  try {
    const p = await runChain(yieldChain('FARMER'), { body: YIELD_BODY });
    assert.equal(p.statusCode, 503);
    assert.equal(p.body.code, 'ML_SERVICE_UNAVAILABLE');
    assert.equal(p.body.data, undefined);
    assert.equal((await runChain(optionsChain('FARMER'), {})).statusCode, 503);
    assert.equal((await runChain(chain('FARMER'), { body: VALID_BODY })).statusCode, 200);
  } finally { process.env.ML_SERVICE_URL = saved; }
});

test('real Flask: killing the service yields a friendly 503', { skip: !enabled }, async () => {
  flask.kill();
  await new Promise((r) => setTimeout(r, 500));
  const res = await runChain(chain('FARMER'), { body: VALID_BODY });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'ML_SERVICE_UNAVAILABLE');
});
