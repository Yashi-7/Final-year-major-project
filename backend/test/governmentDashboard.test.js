/**
 * Government dashboard: authorization, jurisdiction filtering, aggregation logic and data-source labelling.
 * Express and MongoDB are not available in the sandbox this was written in, so requests go through the same
 * middleware sequence the router uses (real authorize('GOVERNMENT_OFFICIAL'), real controller, real service, real
 * jurisdiction filter), with `authenticate` stubbed and an in-memory repository standing in for MongoDB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import authorize from '../src/middleware/roleMiddleware.js';
import { createGovernmentDashboardController } from '../src/controllers/governmentDashboardController.js';
import { createGovernmentDashboardService } from '../src/services/governmentDashboardService.js';
import { getAgricultureInsights, loadInsightsFile } from '../src/services/agricultureInsightsService.js';
import { recentEventsPipeline, statusMatrixPipeline } from '../src/repositories/governmentClaimPipelines.js';
import { buildClaimScopeFilter, normalizeAreas } from '../src/utils/jurisdiction.js';
import { buildDemoClaims } from '../src/seed/demoFraClaims.js';
import { createInMemoryGovernmentRepo } from './fakes/inMemoryGovernmentRepo.js';
import { runChain } from './helpers.js';

const NOW = Date.UTC(2026, 0, 1);
const official = (areas, id = 'g1') => ({ _id: id, role: 'GOVERNMENT_OFFICIAL', jurisdiction: { areas } });
const MP = official([{ state: 'Madhya Pradesh' }], 'mp');
const BALAGHAT = official([{ state: 'Madhya Pradesh', district: 'Balaghat' }], 'bal');
const ODISHA = official([{ state: 'Odisha' }], 'od');
const ASSAM = official([{ state: 'Assam' }], 'as');
const NONE = official([], 'none');
const FARMER = { _id: 'f1', role: 'FARMER' };

const setup = ({ extraClaims = [], insights } = {}) => {
  const claims = [...buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW }), ...extraClaims];
  const repo = createInMemoryGovernmentRepo(claims);
  const service = createGovernmentDashboardService({ repository: repo, now: () => NOW, ...(insights ? { getInsights: insights } : {}) });
  const ctrl = createGovernmentDashboardController({ service });
  const authAs = (user) => (req, res, next) => {
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    req.user = user;
    return next();
  };
  const call = (user, extra = {}) => runChain([authAs(user), authorize('GOVERNMENT_OFFICIAL'), ctrl.summary], { body: {}, query: {}, params: {}, ...extra });
  return { repo, call, claims };
};
const view = (res, source) => res.body.data.views.find((v) => v.source === source);

// ------------------------------------------------------------------ access
test('GOVERNMENT_OFFICIAL gets 200 with the summary shape and no-store caching', async () => {
  const s = setup();
  const res = await s.call(MP);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(res.body.data).sort(), ['defaultSource', 'generatedAt', 'insights', 'scope', 'views']);
});

test('FARMER is denied (403) and nothing is queried', async () => {
  const s = setup();
  const res = await s.call(FARMER);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, undefined);
  assert.equal(s.repo.calls.length, 0);
});

test('anonymous is denied (401) and nothing is queried', async () => {
  const s = setup();
  const res = await s.call(null);
  assert.equal(res.statusCode, 401);
  assert.equal(s.repo.calls.length, 0);
});

// ------------------------------------------------------------------ jurisdiction filtering
test('state-wide official (Madhya Pradesh): exactly the 8 MP demo claims, correct totals by status', async () => {
  const v = view(await setup().call(MP), 'DEMO');
  assert.deepEqual(v.totals.byStatus, { APPLICATION_RECEIVED: 1, PENDING: 1, UNDER_REVIEW: 2, FORWARDED: 1, APPROVED: 2, REJECTED: 1 });
  assert.equal(v.totals.total, 8);
  assert.equal(v.totals.pending, 1);
  assert.equal(v.totals.underReview, 2);
  assert.equal(v.totals.approved, 2);
  assert.equal(v.totals.rejected, 1);
  assert.equal(v.totals.requiringAction, 4);      // received + pending + under review
  assert.equal(Object.values(v.totals.byStatus).reduce((a, b) => a + b, 0), v.totals.total, 'status counts add up');
});

test('district-level official (Balaghat) sees only Balaghat claims; another district\'s claims are absent', async () => {
  const res = await setup().call(BALAGHAT);
  const v = view(res, 'DEMO');
  assert.equal(v.totals.total, 5);
  assert.deepEqual(v.districts.map((d) => d.district), ['Balaghat']);
  assert.equal(JSON.stringify(res.body).includes('Mandla'), false);
  assert.equal(JSON.stringify(res.body).includes('Odisha'), false);
  assert.ok(res.body.data.recentActivity === undefined);
  assert.ok(v.recentActivity.every((e) => e.district === 'Balaghat'));
});

test('a different state\'s official (Odisha) sees only Odisha; MP data never appears', async () => {
  const res = await setup().call(ODISHA);
  const v = view(res, 'DEMO');
  assert.equal(v.totals.total, 1);
  assert.equal(v.totals.byStatus.PENDING, 1);
  const text = JSON.stringify(res.body);
  for (const leak of ['Madhya Pradesh', 'Balaghat', 'Mandla', 'DEMO01', 'DEMO02', 'DEMO05', 'Chhattisgarh']) assert.equal(text.includes(leak), false, leak);
  assert.deepEqual(v.recentActivity.map((e) => e.claimId), ['FRA-OD-2025-DEMO04', 'FRA-OD-2025-DEMO04']);
});

test('SCOPE CANNOT BE WIDENED from the request: query, params and body are ignored', async () => {
  const s = setup();
  const res = await s.call(BALAGHAT, {
    query: { state: 'Odisha', district: 'Koraput', scope: 'all', jurisdiction: '*' },
    params: { state: 'Odisha' },
    body: { jurisdiction: { areas: [{ state: 'Odisha' }] }, areas: [{ state: 'Odisha' }] },
  });
  assert.equal(view(res, 'DEMO').totals.total, 5);
  const expected = buildClaimScopeFilter(normalizeAreas(BALAGHAT.jurisdiction.areas));
  assert.deepEqual(s.repo.calls[0][1], expected, 'the filter is built only from the logged-in official\'s stored jurisdiction');
  assert.equal(JSON.stringify(res.body).includes('Odisha'), false);
});

test('every repository call carries the scope filter (statusMatrix and recentEvents)', async () => {
  const s = setup();
  await s.call(MP);
  const expected = buildClaimScopeFilter(normalizeAreas(MP.jurisdiction.areas));
  assert.ok(s.repo.calls.length >= 2);
  for (const call of s.repo.calls) assert.deepEqual(call[1], expected);
});

test('multi-area official gets the union of both areas', async () => {
  const both = official([{ state: 'Odisha' }, { state: 'Chhattisgarh' }], 'multi');
  const v = view(await setup().call(both), 'DEMO');
  assert.equal(v.totals.total, 2);
  assert.deepEqual(v.districts.map((d) => d.district).sort(), ['Bastar', 'Koraput']);
});

// ------------------------------------------------------------------ empty states
test('NO AREA ASSIGNED: 200 with an explicit unassigned scope, no data, and the database is never queried', async () => {
  const s = setup();
  for (const user of [NONE, official(undefined, 'x'), official([{ state: '' }], 'y'), { _id: 'z', role: 'GOVERNMENT_OFFICIAL' }]) {
    const res = await s.call(user);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.scope.assigned, false);
    assert.deepEqual(res.body.data.scope.areas, []);
    assert.deepEqual(res.body.data.views, []);
    assert.equal(res.body.data.defaultSource, null);
    assert.deepEqual(res.body.data.insights.items, []);
  }
  assert.equal(s.repo.calls.length, 0);
});

test('AREA ASSIGNED BUT NO CLAIMS (Assam): assigned scope, zero views, no invented numbers', async () => {
  const res = await setup().call(ASSAM);
  assert.equal(res.body.data.scope.assigned, true);
  assert.equal(res.body.data.scope.areas[0].label, 'Assam');
  assert.deepEqual(res.body.data.views, []);
  assert.equal(res.body.data.defaultSource, null);
});

// ------------------------------------------------------------------ aggregation content
test('district workload, boundaries and oldest open claim', async () => {
  const v = view(await setup().call(MP), 'DEMO');
  assert.deepEqual(v.districts, [
    { district: 'Balaghat', total: 5, requiringAction: 2 },
    { district: 'Mandla', total: 3, requiringAction: 2 },
  ]);
  assert.equal(v.districtCount, 2);
  assert.deepEqual(v.boundaries, { withBoundary: 6, withoutBoundary: 2, total: 8 });
  assert.equal(v.oldestOpenClaimDays, 75);       // DEMO08 was received 75 days before NOW and is still under review
});

test('recent activity: newest first, at most 8, only workflow facts', async () => {
  const v = view(await setup().call(MP), 'DEMO');
  assert.equal(v.recentActivity.length, 8);
  assert.deepEqual(v.recentActivity.slice(0, 5).map((e) => e.claimId.slice(-6)), ['DEMO09', 'DEMO06', 'DEMO08', 'DEMO10', 'DEMO07']);
  const dates = v.recentActivity.map((e) => e.changedAt);
  assert.deepEqual([...dates].sort().reverse(), dates);
  for (const e of v.recentActivity) assert.deepEqual(Object.keys(e).sort(), ['changedAt', 'claimId', 'district', 'note', 'status', 'village']);
});

test('nothing personal or internal is in the response (no applicants, owners, geometry, committees, history authors)', async () => {
  const claims = buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW });
  claims[0].statusHistory[0].changedBy = 'officer-77';
  const s = setup();
  s.claims.find((c) => c.claimId.endsWith('DEMO01')).statusHistory[0].changedBy = 'officer-77';
  const text = JSON.stringify((await s.call(MP)).body);
  for (const forbidden of ['Demo Applicant', 'applicant', '"farmer"', 'officer-77', 'changedBy', 'coordinates', 'geometry', 'Demo Gram Sabha', 'Demo SDLC', '"_id"', 'password', 'email']) {
    assert.equal(text.includes(forbidden), false, `response leaked ${forbidden}`);
  }
});

// ------------------------------------------------------------------ real vs demo separation
test('DEMO and OFFICIAL data are NEVER mixed: separate views, official first, labelled', async () => {
  const demo = buildDemoClaims({ farmerOneId: 'A', farmerTwoId: 'B', now: NOW }).find((c) => c.claimId.endsWith('DEMO01'));
  const officialClaims = [
    { ...demo, claimId: 'FRA-MP-2025-REAL01', dataSource: 'OFFICIAL', status: 'APPROVED', rejectionReason: null,
      statusHistory: [{ status: 'APPROVED', changedAt: new Date(NOW - 86400000), publicNote: 'Approved.' }] },
  ];
  const res = await setup({ extraClaims: officialClaims }).call(MP);
  assert.deepEqual(res.body.data.views.map((v) => v.source), ['OFFICIAL', 'DEMO']);
  assert.equal(res.body.data.defaultSource, 'OFFICIAL');
  const off = view(res, 'OFFICIAL'); const dem = view(res, 'DEMO');
  assert.equal(off.label, 'Connected data');
  assert.equal(dem.label, 'Demo / Illustrative Data');
  assert.equal(off.totals.total, 1);
  assert.equal(off.totals.approved, 1);
  assert.equal(dem.totals.total, 8, 'demo totals do not include the official claim');
  assert.ok(off.recentActivity.every((e) => e.claimId === 'FRA-MP-2025-REAL01'));
  assert.ok(dem.recentActivity.every((e) => !e.claimId.includes('REAL')));
});

test('only demo claims exist -> a single DEMO view labelled "Demo / Illustrative Data" and default source DEMO', async () => {
  const res = await setup().call(MP);
  assert.deepEqual(res.body.data.views.map((v) => v.source), ['DEMO']);
  assert.equal(res.body.data.defaultSource, 'DEMO');
  assert.equal(res.body.data.views[0].label, 'Demo / Illustrative Data');
});

test('malformed repository rows are ignored rather than trusted', async () => {
  const bad = {
    async statusMatrix() { return [{ dataSource: 'DEMO', district: 'X', status: 'PENDING', count: 2, withBoundary: 0 }, { dataSource: 'FAKE', status: 'PENDING', count: 9 },
      { dataSource: 'DEMO', status: 'NOPE', count: 3 }, { dataSource: 'DEMO', status: 'PENDING', count: -4 }, { dataSource: 'DEMO', status: 'PENDING', count: 'many' }, null]; },
    async recentEvents() { return null; },
  };
  const service = createGovernmentDashboardService({ repository: bad, now: () => NOW });
  const data = await service.getSummary({ user: MP });
  assert.equal(data.views[0].totals.total, 2);
  assert.deepEqual(data.views[0].recentActivity, []);
});

// ------------------------------------------------------------------ reference insights
const FIXTURE = {
  yearRange: [2015, 2019], sourceDataset: 'x.csv', method: 'm',
  states: {
    'Madhya Pradesh': { topCrops: [{ name: 'Wheat', sharePercent: 27.4 }], seasons: [{ name: 'Kharif', sharePercent: 50 }],
      districts: { BALAGHAT: { topCrops: [{ name: 'Rice', sharePercent: 65 }], seasons: [{ name: 'Kharif', sharePercent: 70 }] } } },
    Odisha: { topCrops: [{ name: 'Rice', sharePercent: 60 }], seasons: [{ name: 'Kharif', sharePercent: 80 }] },
    Broken: { topCrops: 'oops', seasons: [] },
  },
};

test('insights: limited to the official\'s own states; district level used when the dataset has it (case-insensitive)', () => {
  const state = getAgricultureInsights(normalizeAreas([{ state: 'Madhya Pradesh' }]), FIXTURE);
  assert.equal(state.available, true);
  assert.deepEqual(state.items.map((i) => [i.label, i.level, i.topCrops[0].name]), [['Madhya Pradesh', 'state', 'Wheat']]);
  const district = getAgricultureInsights(normalizeAreas([{ state: 'Madhya Pradesh', district: 'Balaghat' }]), FIXTURE);
  assert.deepEqual(district.items.map((i) => [i.label, i.level, i.topCrops[0].name]), [['Madhya Pradesh › Balaghat', 'district', 'Rice']]);
  const unknownDistrict = getAgricultureInsights(normalizeAreas([{ state: 'Madhya Pradesh', district: 'Nowhere' }]), FIXTURE);
  assert.equal(unknownDistrict.items[0].level, 'state', 'falls back to the state when the district is not in the dataset');
  const other = getAgricultureInsights(normalizeAreas([{ state: 'Odisha' }]), FIXTURE);
  assert.equal(JSON.stringify(other).includes('Wheat'), false, 'no Madhya Pradesh data for an Odisha official');
});

test('insights: unknown or malformed states are skipped; no data file -> explicit "not available"', () => {
  assert.deepEqual(getAgricultureInsights(normalizeAreas([{ state: 'Atlantis' }, { state: 'Broken' }]), FIXTURE).items, []);
  const missing = getAgricultureInsights(normalizeAreas([{ state: 'Odisha' }]), null);
  assert.equal(missing.available, false);
  assert.deepEqual(missing.items, []);
  assert.equal(loadInsightsFile(new URL('file:///definitely/not/here.json')), null);
  const tmp = path.join(fs.mkdtempSync('/tmp/ins-'), 'bad.json');
  fs.writeFileSync(tmp, '{not json');
  assert.equal(loadInsightsFile(tmp), null);
});

test('the shipped insights file loads, has a year range, and covers the demo states', () => {
  const data = loadInsightsFile();
  assert.ok(data, 'backend/data/agriculture-insights.json must exist (npm/py script builds it)');
  assert.deepEqual(data.yearRange, [2015, 2019]);
  for (const s of ['Madhya Pradesh', 'Odisha', 'Chhattisgarh']) assert.ok(data.states[s].topCrops.length > 0, s);
  const shares = data.states['Madhya Pradesh'].seasons.reduce((n, x) => n + x.sharePercent, 0);
  assert.ok(Math.abs(shares - 100) < 0.6, `season shares should add to ~100, got ${shares}`);
  const out = getAgricultureInsights(normalizeAreas([{ state: 'Madhya Pradesh', district: 'Balaghat' }]));
  assert.equal(out.items[0].level, 'district');
});

// ------------------------------------------------------------------ pipelines
test('pipelines: the jurisdiction $match is always the first stage; only whitelisted fields leave', () => {
  const filter = buildClaimScopeFilter(normalizeAreas([{ state: 'Madhya Pradesh' }]));
  const p1 = statusMatrixPipeline(filter);
  assert.deepEqual(p1[0], { $match: filter });
  const p2 = recentEventsPipeline(filter, 'DEMO', 8);
  assert.deepEqual(p2[0], { $match: { $and: [filter, { dataSource: 'DEMO' }] } });
  for (const stage of [...p1, ...p2]) {
    for (const banned of ['$lookup', '$out', '$merge', '$graphLookup', '$unionWith']) assert.equal(banned in stage, false, banned);
  }
  const finalProject = (p) => p[p.length - 1].$project;
  assert.deepEqual(Object.keys(finalProject(p1)).sort(), ['_id', 'count', 'dataSource', 'district', 'oldestSubmittedAt', 'status', 'withBoundary']);
  assert.deepEqual(Object.keys(finalProject(p2)).sort(), ['changedAt', 'claimId', 'district', 'note', 'status', 'village', '_id'].sort());
  const text = JSON.stringify([p1, p2]);
  for (const banned of ['applicant', '"farmer"', 'changedBy', '"geometry":1', 'jurisdiction']) assert.equal(text.includes(banned), false, banned);
  assert.equal(p2.find((s) => s.$limit).$limit, 8);
});

// ------------------------------------------------------------------ static checks on the REAL source files
const SRC = path.resolve(new URL('../src', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('wiring: the government guard precedes the summary route; farmers have no route to it', () => {
  const gov = read('routes/governmentRoutes.js');
  const guard = gov.indexOf("router.use(authenticate, authorize('GOVERNMENT_OFFICIAL'))");
  const route = gov.indexOf("router.get('/dashboard/summary', dashboard.summary)");
  assert.ok(guard !== -1 && route !== -1 && guard < route);
  assert.doesNotMatch(code('routes/farmerRoutes.js'), /governmentDashboard|dashboard\/summary/);
  assert.doesNotMatch(code('routes/authRoutes.js'), /governmentDashboard|dashboard\/summary/);
  assert.match(gov, /app\.use|router\./);   // sanity
  assert.match(read('app.js'), /app\.use\('\/api\/government', governmentRoutes\)/);
});

test('the dashboard controller never reads the request for scope (no query, params or body)', () => {
  const ctrl = code('controllers/governmentDashboardController.js');
  assert.doesNotMatch(ctrl, /req\.(query|params|body)/);
  assert.match(ctrl, /user: req\.user/);
});

test('repository is aggregate-only and read-only', () => {
  const repo = code('repositories/governmentClaimRepository.js');
  assert.deepEqual(repo.match(/Claim\.\w+\(/g), ['Claim.aggregate(', 'Claim.aggregate(']);
  assert.doesNotMatch(repo, /\.(find|findOne|save|update|delete|insert|create|remove)\w*\(/);
});

test('jurisdiction cannot be set through registration or profile updates', () => {
  const auth = code('controllers/authController.js');
  assert.match(auth, /const \{ fullName, email, password, role \} = req\.body;/);
  assert.doesNotMatch(auth, /jurisdiction/i);
  assert.doesNotMatch(code('validators/authValidators.js'), /jurisdiction/i);
  assert.doesNotMatch(code('routes/authRoutes.js'), /jurisdiction/i);
});

test('User model: jurisdiction defaults to none, is only for government officials, and needs a district for a tehsil', () => {
  const model = read('models/User.js');
  assert.match(model, /areas: \{ type: \[areaSchema\], default: \[\] \}/);
  assert.match(model, /Only government officials can have a jurisdiction/);
  assert.match(model, /A tehsil requires a district/);
  assert.doesNotMatch(model.slice(model.indexOf('toSafeObject')), /jurisdiction/, 'auth responses are unchanged');
});

test('only the two roles exist; no admin role or route was introduced', () => {
  assert.match(read('models/User.js'), /USER_ROLES = \['FARMER', 'GOVERNMENT_OFFICIAL'\]/);
  for (const f of fs.readdirSync(path.join(SRC, 'routes'))) assert.doesNotMatch(code(`routes/${f}`), /admin/i, f);
});
