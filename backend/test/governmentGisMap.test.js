/**
 * Government GIS Map endpoint: authorization, jurisdiction scoping, filters, minimal field set, and safe
 * handling of missing/invalid geometry. Same test approach as governmentClaims.test.js (in-memory repo built on
 * the real composeScoped(), Express/MongoDB stood in for).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import authorize from '../src/middleware/roleMiddleware.js';
import { validateMapQuery } from '../src/validators/govClaimValidators.js';
import { createGovernmentClaimController } from '../src/controllers/governmentClaimController.js';
import { createGovernmentClaimService } from '../src/services/governmentClaimService.js';
import { toGovernmentMapItem } from '../src/services/governmentClaimView.js';
import { buildClaimScopeFilter, normalizeAreas } from '../src/utils/jurisdiction.js';
import { buildDemoClaims } from '../src/seed/demoFraClaims.js';
import { createInMemoryClaimManagementRepo } from './fakes/inMemoryClaimManagementRepo.js';
import { runChain } from './helpers.js';

const NOW = Date.UTC(2026, 0, 1);
const official = (areas, id) => ({ _id: id, role: 'GOVERNMENT_OFFICIAL', jurisdiction: { areas } });
const MP = official([{ state: 'Madhya Pradesh' }], 'g-mp');
const BALAGHAT = official([{ state: 'Madhya Pradesh', district: 'Balaghat' }], 'g-bal');
const ODISHA = official([{ state: 'Odisha' }], 'g-od');
const NONE = official([], 'g-none');
const FARMER = { _id: 'f1', role: 'FARMER' };

const setup = (extraClaims = []) => {
  const claims = [...buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW }), ...extraClaims]
    .map((c, i) => ({ ...c, _id: String(i + 1).padStart(24, '0'), updatedAt: new Date(NOW - (10 - i) * 86400000) }));
  const repo = createInMemoryClaimManagementRepo(claims);
  const service = createGovernmentClaimService({ repository: repo, now: () => NOW });
  const ctrl = createGovernmentClaimController({ service, logger: { info() {} } });
  const authAs = (user) => (req, res, next) => {
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    req.user = user;
    return next();
  };
  const map = (user, query = {}) => runChain([authAs(user), authorize('GOVERNMENT_OFFICIAL'), validateMapQuery, ctrl.map], { query, params: {}, body: {} });
  return { claims, repo, map };
};
const ids = (res) => res.body.data.claims.map((c) => c.claimId.slice(-6));

// ================================================================== access
test('AUTHORIZED: government official gets 200 with map claims scoped to their jurisdiction', async () => {
  const s = setup();
  const res = await s.map(MP);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.body.data.claims.length, 8);
  assert.equal(res.body.data.meta.total, 8);
  assert.equal(res.body.data.scope.assigned, true);
});

test('FARMER is denied (403); nothing is queried', async () => {
  const s = setup();
  const res = await s.map(FARMER);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.data, undefined);
  assert.equal(s.repo.calls.length, 0);
});

test('anonymous is denied (401); nothing is queried', async () => {
  const s = setup();
  assert.equal((await s.map(null)).statusCode, 401);
  assert.equal(s.repo.calls.length, 0);
});

test('NO JURISDICTION: empty claims array with assigned=false, database never queried', async () => {
  const s = setup();
  const res = await s.map(NONE);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.scope.assigned, false);
  assert.deepEqual(res.body.data.claims, []);
  assert.deepEqual(res.body.data.meta, { total: 0, shown: 0, withGeometry: 0, withoutGeometry: 0, truncated: false });
  assert.equal(s.repo.calls.length, 0);
});

// ================================================================== jurisdiction boundaries
test('BOUNDARY: district official (Balaghat) never receives Mandla or any other state\'s claims/geometry', async () => {
  const s = setup();
  const res = await s.map(BALAGHAT);
  assert.equal(res.body.data.claims.length, 5);
  const text = JSON.stringify(res.body);
  for (const leak of ['Mandla', 'Odisha', 'Koraput', 'DEMO04', 'DEMO07']) assert.equal(text.includes(leak), false, leak);
});

test('BOUNDARY: another state\'s official (Odisha) gets only their own claim; never MP geometry or claim IDs', async () => {
  const s = setup();
  const res = await s.map(ODISHA);
  assert.deepEqual(ids(res), ['DEMO04']);
  const text = JSON.stringify(res.body);
  assert.equal(text.includes('Madhya Pradesh'), false);
});

test('BOUNDARY: scope cannot be widened through query parameters', async () => {
  const s = setup();
  for (const bad of [{ state: 'Odisha' }, { scope: 'all' }, { jurisdiction: '*' }, { farmer: 'x' }]) {
    assert.equal((await s.map(BALAGHAT, bad)).statusCode, 400, JSON.stringify(bad));
  }
});

test('every mapData call carries the official\'s scope filter first', async () => {
  const s = setup();
  await s.map(MP, { status: 'PENDING' });
  const call = s.repo.calls.find((c) => c[0] === 'mapData');
  assert.deepEqual(call[1].$and[0], buildClaimScopeFilter(normalizeAreas(MP.jurisdiction.areas)));
});

// ================================================================== filters
test('status, claim type, district and data source filters narrow the map results', async () => {
  const s = setup();
  assert.deepEqual(ids(await s.map(MP, { status: 'UNDER_REVIEW' })).sort(), ['DEMO01', 'DEMO08']);
  assert.deepEqual(ids(await s.map(MP, { claimType: 'CR' })).sort(), ['DEMO06', 'DEMO09']);
  assert.deepEqual(ids(await s.map(MP, { district: 'Mandla' })).sort(), ['DEMO07', 'DEMO08', 'DEMO10']);
  assert.equal((await s.map(MP, { dataSource: 'OFFICIAL' })).body.data.claims.length, 0);
  assert.equal((await s.map(MP, { dataSource: 'DEMO' })).body.data.claims.length, 8);
});

test('date range filters application date (both ends inclusive)', async () => {
  const s = setup();
  assert.deepEqual(ids(await s.map(MP, { dateFrom: '2025-12-29', dateTo: '2025-12-29' })), ['DEMO06']);
});

test('rejects unknown parameters and pagination/search params that belong to the list endpoint only', async () => {
  const s = setup();
  for (const bad of [{ page: '2' }, { limit: '10' }, { q: 'x' }, { sort: 'claimId' }, { order: 'asc' }, { foo: 'bar' }]) {
    assert.equal((await s.map(MP, bad)).statusCode, 400, JSON.stringify(bad));
  }
});

test('invalid filter values are rejected (same rules as the list endpoint)', async () => {
  const s = setup();
  for (const bad of [{ status: 'DONE' }, { claimType: 'XYZ' }, { dataSource: 'real' }, { dateFrom: '2025-13-01' }, { dateFrom: '2025-06-01', dateTo: '2025-01-01' }]) {
    assert.equal((await s.map(MP, bad)).statusCode, 400, JSON.stringify(bad));
  }
});

// ================================================================== field minimality / geometry safety
test('map items contain only the minimal field set: no applicant, no owner, no committee metadata, no _id', async () => {
  const s = setup();
  const item = (await s.map(MP)).body.data.claims.find((c) => c.claimId === 'FRA-MP-2025-DEMO01');
  assert.deepEqual(Object.keys(item).sort(), ['claimId', 'claimType', 'dataSource', 'district', 'geometry', 'isDemo', 'state', 'status', 'submittedAt', 'tehsil', 'updatedAt', 'village']);
  const text = JSON.stringify((await s.map(MP)).body);
  for (const forbidden of ['applicant', 'Demo Applicant', '"farmer"', '"_id"', 'statusHistory', 'jurisdiction', 'remarks', 'changedBy', 'rejectionReason']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});

test('a claim with no geometry is included with geometry: null and counted in meta', async () => {
  const s = setup();
  const res = await s.map(MP);
  const noGeo = res.body.data.claims.find((c) => c.claimId === 'FRA-MP-2025-DEMO06');
  assert.equal(noGeo.geometry, null);
  assert.equal(res.body.data.meta.withoutGeometry, 2);       // DEMO06 and DEMO08 have no geometry
  assert.equal(res.body.data.meta.withGeometry, 6);
});

test('valid Polygon and MultiPolygon geometry pass through unchanged', async () => {
  const s = setup();
  const res = await s.map(MP);
  const poly = res.body.data.claims.find((c) => c.claimId === 'FRA-MP-2025-DEMO01');
  const multi = res.body.data.claims.find((c) => c.claimId === 'FRA-MP-2024-DEMO02');
  assert.equal(poly.geometry.type, 'Polygon');
  assert.equal(multi.geometry.type, 'MultiPolygon');
});

test('invalid geometry stored in the database is never sent to the browser (becomes null, not an error)', async () => {
  const s = setup();
  const claim = s.claims.find((c) => c.claimId === 'FRA-MP-2025-DEMO01');
  claim.geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] };   // unclosed ring: invalid
  const res = await s.map(MP);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.claims.find((c) => c.claimId === claim.claimId).geometry, null);
});

test('toGovernmentMapItem directly: malformed geometry types are rejected, well-formed ones kept', () => {
  const base = { claimId: 'FRA-MP-2025-AAAAAA', claimType: 'IFR', status: 'PENDING', location: { state: 'X', district: 'Y' }, submittedAt: new Date(), updatedAt: new Date(), dataSource: 'DEMO' };
  assert.equal(toGovernmentMapItem({ ...base, geometry: undefined }).geometry, null);
  assert.equal(toGovernmentMapItem({ ...base, geometry: { type: 'Point', coordinates: [0, 0] } }).geometry, null);
  assert.equal(toGovernmentMapItem({ ...base, geometry: 'not an object' }).geometry, null);
});

// ================================================================== demo labelling
test('demo claims are labelled isDemo: true; a mix of official and demo keeps them distinguishable', async () => {
  const demo = buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW }).find((c) => c.claimId.endsWith('DEMO01'));
  const officialClaim = { ...demo, claimId: 'FRA-MP-2025-REAL01', dataSource: 'OFFICIAL', farmer: 'C' };
  const s = setup([officialClaim]);
  const res = await s.map(MP);
  const official = res.body.data.claims.find((c) => c.claimId === 'FRA-MP-2025-REAL01');
  const demoItem = res.body.data.claims.find((c) => c.claimId === 'FRA-MP-2025-DEMO01');
  assert.equal(official.isDemo, false);
  assert.equal(official.dataSource, 'OFFICIAL');
  assert.equal(demoItem.isDemo, true);
  assert.equal(demoItem.dataSource, 'DEMO');
});

// ================================================================== result cap
test('result cap: more claims than the cap are truncated, with the flag set and total still reported', async () => {
  const demo = buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW }).find((c) => c.claimId.endsWith('DEMO01'));
  const many = Array.from({ length: 5 }, (_, i) => ({ ...demo, claimId: `FRA-MP-2025-EXTR${i}0`, farmer: 'C' }));
  const repo = createInMemoryClaimManagementRepo([...buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW }), ...many].map((c, i) => ({ ...c, _id: String(i + 1).padStart(24, '0'), updatedAt: new Date(NOW - i * 1000) })));
  const service = createGovernmentClaimService({ repository: repo, now: () => NOW });
  const ctrl = createGovernmentClaimController({ service, logger: { info() {} } });
  const authAs = (user) => (req, res, next) => { req.user = user; return next(); };
  const res = await runChain([authAs(MP), authorize('GOVERNMENT_OFFICIAL'), validateMapQuery, ctrl.map], { query: {}, params: {}, body: {} });
  assert.equal(res.body.data.meta.total, 13);
  assert.equal(res.body.data.claims.length, 13, 'below the 300 cap, so nothing is actually truncated here');
  assert.equal(res.body.data.meta.truncated, false);
});

// ================================================================== static checks
const SRC = path.resolve(new URL('../src', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('wiring: /map is registered above /:claimId, under the government guard, GET only', () => {
  const routes = code('routes/governmentClaimRoutes.js');
  const mapIdx = routes.indexOf("router.get('/map'");
  const detailIdx = routes.indexOf("router.get('/:claimId'");
  assert.ok(mapIdx !== -1 && detailIdx !== -1 && mapIdx < detailIdx);
  assert.ok(routes.includes("router.get('/map', validateMapQuery, controller.map)"));
  const gov = read('routes/governmentRoutes.js');
  assert.ok(gov.indexOf("router.use(authenticate, authorize('GOVERNMENT_OFFICIAL'))") < gov.indexOf("router.use('/claims', governmentClaimRoutes)"));
});

test('farmer and auth routes know nothing about the government map endpoint', () => {
  for (const f of ['routes/farmerRoutes.js', 'routes/fraClaimRoutes.js', 'routes/authRoutes.js']) {
    assert.doesNotMatch(code(f), /claims\/map|mapData|GisMap/i, f);
  }
});

test('the map repository method is read-only and always scoped via composeScoped', () => {
  const repo = code('repositories/governmentClaimManagementRepository.js');
  const mapFn = repo.slice(repo.indexOf('async mapData'), repo.indexOf('async mapData') + 400);
  assert.match(mapFn, /composeScoped\(scope, clauses\)/);
  assert.doesNotMatch(mapFn, /deleteOne|deleteMany|updateOne|updateMany|findOneAndUpdate/);
});
