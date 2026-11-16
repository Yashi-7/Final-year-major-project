/**
 * Farmer FRA Monitoring: privacy + access tests.
 *
 * Express and MongoDB are not available in the sandbox this was written in, so requests are pushed through the same
 * middleware sequence the router uses: real authorize('FARMER'), real validators, real controller, real service,
 * real grant signing, real limiter and real response serializer. Only `authenticate` (needs MongoDB) is stubbed, and the
 * repository is an in-memory store that applies the SAME filter semantics as claimRepository.js (claimId AND farmer).
 * Mongoose itself is exercised by the manual test steps in the README.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import authorize from '../src/middleware/roleMiddleware.js';
import { validateFraVerify, validateFraView } from '../src/validators/fraValidators.js';
import { createFraClaimController } from '../src/controllers/fraClaimController.js';
import { createFraClaimService } from '../src/services/fraClaimService.js';
import { createFailureLimiter } from '../src/utils/failureLimiter.js';
import { buildDemoClaims } from '../src/seed/demoFraClaims.js';
import { runChain } from './helpers.js';

const SECRET = 'test-secret-that-is-long-enough-123456';
const FARMER_A = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'FARMER' };
const FARMER_B = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'FARMER' };
const GOV = { _id: 'cccccccccccccccccccccccc', role: 'GOVERNMENT_OFFICIAL' };
const A_ID = 'FRA-MP-2025-DEMO01';       // Farmer A: UNDER_REVIEW, Polygon
const A_REJECTED = 'FRA-MP-2024-DEMO03'; // Farmer A: REJECTED
const A_NO_GEO = 'FRA-MP-2025-DEMO06';   // Farmer A: no boundary
const B_ID = 'FRA-OD-2025-DEMO04';       // Farmer B

const setup = ({ max = 8, clock = { t: 1_800_000_000_000 } } = {}) => {
  const store = buildDemoClaims({ farmerOneId: FARMER_A._id, farmerTwoId: FARMER_B._id, now: clock.t })
    .map((c, i) => ({ ...c, _id: String(i + 1).padStart(24, '0'), updatedAt: new Date(clock.t) }));
  const calls = [];
  const repository = {
    async findOwnedByClaimId(claimId, farmerId) {
      calls.push(['byClaimId', claimId, String(farmerId)]);
      return store.find((c) => c.claimId === claimId && String(c.farmer) === String(farmerId)) || null;
    },
    async findOwnedById(id, farmerId) {
      calls.push(['byId', id, String(farmerId)]);
      return store.find((c) => String(c._id) === String(id) && String(c.farmer) === String(farmerId)) || null;
    },
  };
  const service = createFraClaimService({ repository, getSecret: () => SECRET, now: () => clock.t });
  const limiter = createFailureLimiter({ max, windowMs: 15 * 60 * 1000, now: () => clock.t });
  const logs = [];
  const ctrl = createFraClaimController({ service, limiter, logger: { warn: (m) => logs.push(m) } });
  const authAs = (user) => (req, res, next) => {
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    req.user = user;
    return next();
  };
  const verify = (user, body) => runChain([authAs(user), authorize('FARMER'), validateFraVerify, ctrl.verify], { body });
  const view = (user, body) => runChain([authAs(user), authorize('FARMER'), validateFraView, ctrl.view], { body });
  const openClaim = async (user, claimId) => {
    const v = await verify(user, { claimId });
    return v.statusCode === 200 ? view(user, { grant: v.body.data.grant }) : v;
  };
  return { store, calls, logs, clock, verify, view, openClaim };
};

// ------------------------------------------------------------------ own claim
test('farmer verifies their own reference ID and then views their own claim', async () => {
  const s = setup();
  const v = await s.verify(FARMER_A, { claimId: A_ID });
  assert.equal(v.statusCode, 200);
  assert.equal(v.body.success, true);
  assert.equal(v.body.data.claimId, A_ID);
  assert.equal(typeof v.body.data.grant, 'string');
  assert.equal(v.headers['cache-control'], 'no-store');

  const r = await s.view(FARMER_A, { grant: v.body.data.grant });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  const c = r.body.data.claim;
  assert.equal(c.claimId, A_ID);
  assert.equal(c.status, 'UNDER_REVIEW');
  assert.equal(c.claimType, 'IFR');
  assert.equal(c.isDemo, true);
  assert.equal(c.dataSource, 'DEMO');
  assert.equal(c.rejectionReason, null);
  assert.equal(c.applicant.fullName, 'Demo Applicant One');
  assert.equal(c.location.district, 'Balaghat');
  assert.deepEqual(c.statusHistory.map((h) => h.status), ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW']);
  assert.equal(c.geometry.type, 'Polygon');
});

test('IDs are accepted case-insensitively and with surrounding spaces', async () => {
  const s = setup();
  assert.equal((await s.verify(FARMER_A, { claimId: `  ${A_ID.toLowerCase()} ` })).statusCode, 200);
});

test('REJECTED claim shows its reason; other statuses never do', async () => {
  const s = setup();
  const rejected = (await s.openClaim(FARMER_A, A_REJECTED)).body.data.claim;
  assert.equal(rejected.status, 'REJECTED');
  assert.match(rejected.rejectionReason, /Demo reason/);
  // Even if a stale reason were stored on a non-rejected claim, the serializer must not expose it.
  s.store.find((c) => c.claimId === A_ID).rejectionReason = 'stale internal text';
  assert.equal((await s.openClaim(FARMER_A, A_ID)).body.data.claim.rejectionReason, null);
});

test('a claim without a boundary is returned with geometry null', async () => {
  const s = setup();
  assert.equal((await s.openClaim(FARMER_A, A_NO_GEO)).body.data.claim.geometry, null);
});

test('invalid geometry stored in the database is never sent to the browser', async () => {
  const s = setup();
  s.store.find((c) => c.claimId === A_ID).geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] };
  assert.equal((await s.openClaim(FARMER_A, A_ID)).body.data.claim.geometry, null);
});

// ------------------------------------------------------------------ privacy
test('PRIVACY: farmer B cannot verify farmer A\'s reference ID (404, no grant, no data)', async () => {
  const s = setup();
  const res = await s.verify(FARMER_B, { claimId: A_ID });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'FRA_CLAIM_NOT_FOUND');
  assert.equal(res.body.data, undefined);
  assert.doesNotMatch(JSON.stringify(res.body), /grant|Demo Applicant|Balaghat|UNDER_REVIEW/);
});

test('PRIVACY: "someone else\'s ID" and "nonexistent ID" get byte-identical responses', async () => {
  const s = setup();
  const others = await s.verify(FARMER_B, { claimId: A_ID });
  const missing = await s.verify(FARMER_B, { claimId: 'FRA-MP-2025-ZZZZZ9' });
  assert.equal(others.statusCode, missing.statusCode);
  assert.deepEqual(others.body, missing.body);
});

test('PRIVACY: the owner used in the lookup is always the authenticated user, never the request', async () => {
  const s = setup();
  await s.verify(FARMER_B, { claimId: A_ID });
  await s.openClaim(FARMER_A, A_ID);
  for (const [, , farmerId] of s.calls) assert.ok([FARMER_A._id, FARMER_B._id].includes(farmerId));
  assert.deepEqual(s.calls[0], ['byClaimId', A_ID, FARMER_B._id]);
  assert.deepEqual(s.calls[1], ['byClaimId', A_ID, FARMER_A._id]);
});

test('PRIVACY: identifiers supplied by the client are rejected, not trusted', async () => {
  const s = setup();
  for (const extra of [{ farmer: FARMER_A._id }, { farmerId: FARMER_A._id }, { userId: FARMER_A._id }, { _id: 'x' }, { owner: FARMER_A._id }]) {
    const res = await s.verify(FARMER_B, { claimId: A_ID, ...extra });
    assert.equal(res.statusCode, 400, JSON.stringify(extra));
    assert.equal(res.body.errors[0].message, 'Unknown field.');
  }
  assert.equal(s.calls.length, 0, 'the repository must not be queried for rejected input');
});

test('PRIVACY: a verification grant of farmer A is useless to farmer B', async () => {
  const s = setup();
  const grantA = (await s.verify(FARMER_A, { claimId: A_ID })).body.data.grant;
  const res = await s.view(FARMER_B, { grant: grantA });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FRA_VERIFICATION_INVALID');
  assert.equal(res.body.data, undefined);
  assert.equal(s.calls.filter((c) => c[0] === 'byId').length, 0, 'must not even query with a foreign grant');
});

test('PRIVACY: ownership is re-checked when viewing (claim reassigned after verification -> 404)', async () => {
  const s = setup();
  const grantA = (await s.verify(FARMER_A, { claimId: A_ID })).body.data.grant;
  s.store.find((c) => c.claimId === A_ID).farmer = FARMER_B._id;
  const res = await s.view(FARMER_A, { grant: grantA });
  assert.equal(res.statusCode, 404);
});

test('PRIVACY: nothing beyond the one claim leaks (no other claim IDs, owners, internal ids or history authors)', async () => {
  const s = setup();
  s.store.find((c) => c.claimId === A_ID).statusHistory[0].changedBy = 'official-99';
  s.store.find((c) => c.claimId === A_ID).internalNotes = 'secret officer remark';
  const text = JSON.stringify((await s.openClaim(FARMER_A, A_ID)).body);
  for (const forbidden of ['DEMO02', 'DEMO03', 'DEMO04', 'DEMO05', 'DEMO06', FARMER_A._id, FARMER_B._id, 'changedBy', 'official-99', 'secret officer', '"_id"', '"farmer"', 'internalNotes', 'publicNote']) {
    assert.equal(text.includes(forbidden), false, `response leaked ${forbidden}`);
  }
  assert.equal((text.match(/FRA-[A-Z]{2}-\d{4}-\w{6}/g) || []).every((id) => id === A_ID), true);
});

test('a farmer with no claims sees nothing and no listing exists', async () => {
  const s = setup();
  const nobody = { _id: 'dddddddddddddddddddddddd', role: 'FARMER' };
  const res = await s.verify(nobody, { claimId: A_ID });
  assert.equal(res.statusCode, 404);
});

// ------------------------------------------------------------------ invalid / hostile IDs
test('invalid claim IDs are rejected with 400 before any database lookup', async () => {
  const s = setup();
  const hostile = ['', '   ', 'abc', 'FRA-MP-2025-ABC', 'FRA-MP-2025-ABCDEFG', 'FRA-M-2025-ABCDEF', 'FRA-MP-25-ABCDEF', 'FRA-MP-2025-ABC!EF',
    'x'.repeat(500), 'FRA-MP-2025-DEMO01\nFRA-MP-2025-DEMO04', '.*', '{"$ne":null}', 5, true, null, undefined, [A_ID], { $ne: null }, { $gt: '' }, { $regex: '.*' }];
  for (const claimId of hostile) {
    const res = await s.verify(FARMER_A, { claimId });
    assert.equal(res.statusCode, 400, JSON.stringify(claimId)?.slice(0, 40));
    assert.equal(res.body.success, false);
    assert.equal(res.body.errors[0].field, 'claimId');
  }
  assert.equal(s.calls.length, 0);
});

test('malformed bodies are rejected', async () => {
  const s = setup();
  for (const body of [undefined, null, 'x', 5, [], [{ claimId: A_ID }]]) assert.equal((await s.verify(FARMER_A, body)).statusCode, 400);
  for (const body of [undefined, null, {}, { grant: '' }, { grant: 5 }, { grant: { $ne: 1 } }, { grant: 'x'.repeat(1001) }, { grant: 'a.b', extra: 1 }]) {
    assert.equal((await s.view(FARMER_A, body)).statusCode, 400, JSON.stringify(body)?.slice(0, 40));
  }
});

test('well-formed but nonexistent ID -> 404 and the ID is not written to the logs', async () => {
  const s = setup();
  const res = await s.verify(FARMER_A, { claimId: 'FRA-MP-2025-ZZZZZ9' });
  assert.equal(res.statusCode, 404);
  assert.equal(s.logs.length, 1);
  assert.doesNotMatch(s.logs[0], /ZZZZZ9/);
});

// ------------------------------------------------------------------ grants
test('forged, tampered, malformed and expired grants are refused with 403', async () => {
  const s = setup();
  const grant = (await s.verify(FARMER_A, { claimId: A_ID })).body.data.grant;
  const [p, sig] = grant.split('.');
  for (const bad of [`${p}.${sig.slice(0, -3)}abc`, `x${p}.${sig}`, 'aaaa.bbbb', 'not-a-grant', `${p}.`]) {
    const res = await s.view(FARMER_A, { grant: bad });
    assert.equal(res.statusCode, 403, bad.slice(0, 20));
    assert.equal(res.body.code, 'FRA_VERIFICATION_INVALID');
  }
  s.clock.t += 601_000;
  const expired = await s.view(FARMER_A, { grant });
  assert.equal(expired.statusCode, 403);
  assert.equal(expired.body.code, 'FRA_VERIFICATION_EXPIRED');
});

// ------------------------------------------------------------------ auth
test('unauthenticated -> 401 on both endpoints, repository untouched', async () => {
  const s = setup();
  assert.equal((await s.verify(null, { claimId: A_ID })).statusCode, 401);
  assert.equal((await s.view(null, { grant: 'x.y' })).statusCode, 401);
  assert.equal(s.calls.length, 0);
});

test('GOVERNMENT_OFFICIAL -> 403 on both endpoints, repository untouched, even with a valid-looking request', async () => {
  const s = setup();
  const grantA = (await s.verify(FARMER_A, { claimId: A_ID })).body.data.grant;
  s.calls.length = 0;
  assert.equal((await s.verify(GOV, { claimId: A_ID })).statusCode, 403);
  assert.equal((await s.view(GOV, { grant: grantA })).statusCode, 403);
  assert.equal((await s.verify(GOV, {})).statusCode, 403, 'role is checked before validation');
  assert.equal(s.calls.length, 0);
});

// ------------------------------------------------------------------ brute force
test('guessing is rate limited per farmer: 429 after repeated failures, even for a valid ID; successes do not reset it', async () => {
  const s = setup({ max: 3 });
  for (let i = 0; i < 3; i += 1) assert.equal((await s.verify(FARMER_B, { claimId: `FRA-MP-2025-GUESS${i}` })).statusCode, 404);
  // interleaving a valid ID must not reset the counter
  assert.equal((await s.verify(FARMER_B, { claimId: B_ID })).statusCode, 429);
  const blocked = await s.verify(FARMER_B, { claimId: A_ID });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, 'FRA_TOO_MANY_ATTEMPTS');
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.ok(blocked.body.retryAfterSeconds > 0, 'wait time is also in the JSON body (cross-origin browsers cannot read the header)');
  // another farmer is unaffected
  assert.equal((await s.verify(FARMER_A, { claimId: A_ID })).statusCode, 200);
  // window passes -> allowed again
  s.clock.t += 16 * 60 * 1000;
  assert.equal((await s.verify(FARMER_B, { claimId: B_ID })).statusCode, 200);
});

test('successful lookups alone never trigger the limiter', async () => {
  const s = setup({ max: 2 });
  for (let i = 0; i < 10; i += 1) assert.equal((await s.verify(FARMER_A, { claimId: A_ID })).statusCode, 200);
});

// ------------------------------------------------------------------ static checks on the real source files
const SRC = path.resolve(new URL('../src', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('wiring: FARMER guard precedes the /fra routes; fra router exposes exactly two POST routes and nothing else', () => {
  const farmer = read('routes/farmerRoutes.js');
  const guard = farmer.indexOf("router.use(authenticate, authorize('FARMER'))");
  const mount = farmer.indexOf("router.use('/fra', fraClaimRoutes)");
  assert.ok(guard !== -1 && mount !== -1 && guard < mount);

  const fra = read('routes/fraClaimRoutes.js');
  const routeCalls = fra.match(/router\.(get|post|put|patch|delete|all|use)\(/g) || [];
  assert.deepEqual(routeCalls, ['router.post(', 'router.post(']);
  assert.ok(fra.includes("router.post('/verify', validateFraVerify, controller.verify)"));
  assert.ok(fra.includes("router.post('/claim', validateFraView, controller.view)"));
});

test('no all-claims / list / government claim endpoints exist anywhere', () => {
  const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // ignore comments
  // Government routes may expose ONLY the dashboard shell and the aggregate-only summary (Phase 6):
  // no per-claim, list, search or detail route may be added without this test being consciously changed.
  const govRoutes = [...code('routes/governmentRoutes.js').matchAll(/router\.(get|post|put|patch|delete|all|use)\(\s*'([^']*)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  // Phase 7 adds the jurisdiction-scoped claim management router at /claims; its four routes are pinned in governmentClaims.test.js.
  assert.deepEqual(govRoutes, ['GET /dashboard', 'GET /dashboard/summary', 'USE /claims']);
  assert.doesNotMatch(code('routes/authRoutes.js'), /claim|\bfra\b/i);
  assert.doesNotMatch(code('app.js'), /claim|\bfra\b/i);
  // Farmer-facing code never uses list-style Claim queries. (The government repositories are scope-enforced and checked
  // separately in governmentDashboard.test.js and governmentClaims.test.js.)
  const offenders = walk(SRC).filter((f) => !f.endsWith('governmentClaimRepository.js') && !f.endsWith('governmentClaimManagementRepository.js') && /Claim\.(find|aggregate|countDocuments|distinct)\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('repository: both queries filter by the owning farmer; only findOne is used', () => {
  const repo = read('repositories/claimRepository.js');
  const queries = repo.match(/Claim\.\w+\([^)]*\)/g) || [];
  assert.equal(queries.length, 2);
  for (const q of queries) { assert.match(q, /^Claim\.findOne\(/); assert.match(q, /farmer: farmerId/); }
  assert.doesNotMatch(repo, /\.find\(|findById\(|aggregate/);
});

test('model: dataSource is required with no default; farmer is required', () => {
  const model = read('models/Claim.js');
  const ds = model.slice(model.indexOf('dataSource:'));
  assert.match(ds.split('\n')[0], /required: true/);
  assert.doesNotMatch(ds.split('\n')[0], /default/);
  assert.match(model, /farmer: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'User', required: true/);
});

test('controller derives the farmer from req.user only', () => {
  const ctrl = read('controllers/fraClaimController.js');
  assert.match(ctrl, /String\(req\.user\._id\)/);
  assert.doesNotMatch(ctrl, /req\.(body|query|params)\.(farmer|user)/i);
});
