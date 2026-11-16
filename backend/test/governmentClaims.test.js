/**
 * Government claim management: authorization, jurisdiction boundaries, pagination/filters, workflow transitions,
 * audit trail and farmer privacy.
 *
 * Express and MongoDB are not available in the sandbox this was written in. Requests are pushed through the same
 * middleware sequence the router uses (real authorize('GOVERNMENT_OFFICIAL'), real validators, real controller, real
 * service, real jurisdiction filter, real workflow). `authenticate` is stubbed and an in-memory repository stands in for
 * MongoDB: it uses the real scope composer and a real compare-and-set for the atomic transition.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import authorize from '../src/middleware/roleMiddleware.js';
import { parseActionInput, parseListQuery, validateActionBody, validateClaimIdParam, validateListQuery } from '../src/validators/govClaimValidators.js';
import { createGovernmentClaimController } from '../src/controllers/governmentClaimController.js';
import { createGovernmentClaimService } from '../src/services/governmentClaimService.js';
import { createFraClaimService } from '../src/services/fraClaimService.js';
import { buildListClauses, buildSort, composeScoped, escapeRegex } from '../src/utils/govClaimQuery.js';
import { WORKFLOW_TRANSITIONS, getAllowedActions } from '../src/utils/claimWorkflow.js';
import { CLAIM_STATUSES, checkClaimConsistency } from '../src/utils/fraClaimRules.js';
import { buildClaimScopeFilter, normalizeAreas } from '../src/utils/jurisdiction.js';
import { buildDemoClaims } from '../src/seed/demoFraClaims.js';
import { createInMemoryClaimManagementRepo } from './fakes/inMemoryClaimManagementRepo.js';
import { matches } from './fakes/mongoMatch.js';
import { runChain } from './helpers.js';

const NOW = Date.UTC(2026, 0, 1);
const officialUser = (areas, id) => ({ _id: id, fullName: `Official ${id}`, role: 'GOVERNMENT_OFFICIAL', jurisdiction: { areas } });
const MP = officialUser([{ state: 'Madhya Pradesh' }], 'off-mp');
const MP2 = officialUser([{ state: 'Madhya Pradesh' }], 'off-mp2');
const BALAGHAT = officialUser([{ state: 'Madhya Pradesh', district: 'Balaghat' }], 'off-bal');
const ODISHA = officialUser([{ state: 'Odisha' }], 'off-od');
const NONE = officialUser([], 'off-none');
const FARMER_A = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'FARMER' };
const FARMER_B = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'FARMER' };
// seed IDs: DEMO02, DEMO03 and DEMO10 were submitted in 2024
const id = (n) => ({ '02': 'FRA-MP-2024-DEMO02', '03': 'FRA-MP-2024-DEMO03', '10': 'FRA-MP-2024-DEMO10' }[n] || `FRA-MP-2025-DEMO${n}`);

const setup = () => {
  const claims = buildDemoClaims({ farmerOneId: FARMER_A._id, farmerTwoId: FARMER_B._id, now: NOW })
    .map((c, i) => ({ ...c, _id: String(i + 1).padStart(24, '0'), updatedAt: new Date(NOW - (10 - i) * 86400000) }));
  const users = Object.fromEntries([MP, MP2, BALAGHAT, ODISHA].map((u) => [u._id, u.fullName]));
  const repo = createInMemoryClaimManagementRepo(claims, { users, now: () => new Date(NOW + 1000) });
  const service = createGovernmentClaimService({ repository: repo, now: () => NOW + 1000 });
  const ctrl = createGovernmentClaimController({ service, logger: { info() {} } });
  const authAs = (user) => (req, res, next) => {
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    req.user = user;
    return next();
  };
  const guard = (user) => [authAs(user), authorize('GOVERNMENT_OFFICIAL')];
  const api = {
    list: (user, query = {}) => runChain([...guard(user), validateListQuery, ctrl.list], { query, params: {}, body: {} }),
    filters: (user) => runChain([...guard(user), ctrl.filters], { query: {}, params: {}, body: {} }),
    detail: (user, claimId) => runChain([...guard(user), validateClaimIdParam, ctrl.detail], { query: {}, params: { claimId }, body: {} }),
    act: (user, claimId, body) => runChain([...guard(user), validateClaimIdParam, validateActionBody, ctrl.action], { query: {}, params: { claimId }, body }),
  };
  const byId = (claimId) => claims.find((c) => c.claimId === claimId);
  return { claims, repo, service, api, byId };
};
const forceStatus = (claim, status) => { claim.status = status; claim.statusHistory[claim.statusHistory.length - 1].status = status; if (status !== 'REJECTED') claim.rejectionReason = null; };

// ================================================================== query parameter validation
test('list query: defaults, and a valid full query is parsed', () => {
  const r = parseListQuery({});
  assert.deepEqual(r.value, { page: 1, limit: 10, search: undefined, status: undefined, claimType: undefined, district: undefined, dateFrom: undefined, dateTo: undefined, dataSource: undefined, sort: 'updatedAt', order: 'desc' });
  const full = parseListQuery({ page: '2', limit: '25', q: ' demo ', status: 'PENDING', claimType: 'IFR', district: 'Balaghat', dateFrom: '2025-01-01', dateTo: '2025-12-31', dataSource: 'DEMO', sort: 'claimId', order: 'asc' });
  assert.equal(full.valid, true);
  assert.deepEqual(full.value, { page: 2, limit: 25, search: 'demo', status: 'PENDING', claimType: 'IFR', district: 'Balaghat', dateFrom: '2025-01-01', dateTo: '2025-12-31', dataSource: 'DEMO', sort: 'claimId', order: 'asc' });
});

test('list query: bad pagination, enums, dates and injection-style values are rejected', () => {
  const bad = {
    page: ['0', '-1', '1.5', 'abc', '1e3', '100001', '9999999'], limit: ['0', '51', '-5', 'ten', '1000'],
    status: ['pending', 'DONE', "PENDING'", '$ne'], claimType: ['ifr', 'XYZ'], dataSource: ['real', 'demo'], sort: ['password', '_id', 'farmer'], order: ['up', 'ASC'],
    dateFrom: ['2025-13-01', '2025-02-30', '01/02/2025', '2025-1-1', 'yesterday'], q: ['x'.repeat(101), 'a\u0000b'], district: ['x'.repeat(101), 'a\nb'],
  };
  for (const [key, values] of Object.entries(bad)) for (const v of values) assert.equal(parseListQuery({ [key]: v }).valid, false, `${key}=${JSON.stringify(v)}`);
  for (const q of [{ status: ['PENDING', 'APPROVED'] }, { status: { $ne: 'X' } }, { q: { $regex: '.*' } }, { page: ['1', '2'] }, { district: { $ne: null } }]) {
    assert.equal(parseListQuery(q).valid, false, JSON.stringify(q));
  }
  assert.equal(parseListQuery({ dateFrom: '2025-06-01', dateTo: '2025-01-01' }).valid, false, 'range must not be reversed');
  assert.deepEqual(parseListQuery({ farmer: 'x', scope: 'all', jurisdiction: '*', $where: '1' }).errors.map((e) => e.field), ['farmer', 'scope', 'jurisdiction', '$where']);
});

test('list query: blank values count as "not set"; limit 50 is the maximum', () => {
  assert.equal(parseListQuery({ status: '', q: '   ', district: '' }).valid, true);
  assert.equal(parseListQuery({ limit: '50' }).value.limit, 50);
  assert.equal(parseListQuery({ limit: '51' }).valid, false);
});

test('claimId param: must look like a reference ID; lower case is normalised', async () => {
  const s = setup();
  for (const bad of ['abc', '', 'FRA-MP-2025', '../etc/passwd', '{"$ne":1}', 'FRA-MP-2025-DEMO01; DROP', 'x'.repeat(50)]) {
    const r = await s.api.detail(MP, bad);
    assert.equal(r.statusCode, 400, bad);
  }
  assert.equal((await s.api.detail(MP, id('01').toLowerCase())).statusCode, 200);
});

test('action body: exact fields, action names only, reason rules, length limits', () => {
  const ok = { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW' };
  assert.equal(parseActionInput(ok).valid, true);
  assert.deepEqual(parseActionInput({ ...ok, remarks: '  fine  ' }).value, { ...ok, remarks: 'fine', reason: null });
  for (const bodyBad of [undefined, null, 'x', [], {}, { ...ok, status: 'APPROVED' }, { ...ok, farmer: 'x' }, { ...ok, changedBy: 'x' }, { ...ok, action: 'APPROVED' },
    { ...ok, action: 'approve' }, { ...ok, action: null }, { ...ok, expectedStatus: 'DONE' }, { action: 'APPROVE' }, { ...ok, remarks: 5 }, { ...ok, remarks: 'x'.repeat(1001) },
    { ...ok, reason: 'not allowed here' }, { action: 'REJECT', expectedStatus: 'UNDER_REVIEW' }, { action: 'REJECT', expectedStatus: 'UNDER_REVIEW', reason: '   ' },
    { action: 'REJECT', expectedStatus: 'UNDER_REVIEW', reason: 5 }, { action: 'REJECT', expectedStatus: 'UNDER_REVIEW', reason: 'x'.repeat(1001) }]) {
    assert.equal(parseActionInput(bodyBad).valid, false, JSON.stringify(bodyBad)?.slice(0, 60));
  }
  assert.equal(parseActionInput({ action: 'REJECT', expectedStatus: 'UNDER_REVIEW', reason: 'Incomplete evidence' }).valid, true);
});

// ================================================================== query building
test('search text is escaped: it is a literal string, never a pattern', () => {
  assert.equal(escapeRegex('a.b*c(d)[e]^$'), 'a\\.b\\*c\\(d\\)\\[e\\]\\^\\$');
  const s = setup();
  const clauses = buildListClauses({ search: '.*' });
  assert.deepEqual(clauses[0].$or[0], { claimId: { $regex: '\\.\\*', $options: 'i' } });
  assert.equal(s.claims.filter((c) => matches(c, { $and: clauses })).length, 0, '".*" must not match everything');
});

test('composeScoped puts the jurisdiction first and refuses to run without one', () => {
  const scope = buildClaimScopeFilter(normalizeAreas([{ state: 'Odisha' }]));
  assert.deepEqual(composeScoped(scope, [{ status: 'PENDING' }]), { $and: [scope, { status: 'PENDING' }] });
  for (const missing of [null, undefined, {}, [], 'x', 0]) assert.throws(() => composeScoped(missing), /jurisdiction filter is required/);
});

test('sort is allow-listed with a stable tie-breaker', () => {
  assert.deepEqual(buildSort({}), { updatedAt: -1, _id: -1 });
  assert.deepEqual(buildSort({ sort: 'claimId', order: 'asc' }), { claimId: 1, _id: 1 });
  assert.deepEqual(buildSort({ sort: 'password', order: 'asc' }), { updatedAt: 1, _id: 1 });
});

// ================================================================== authorization
test('AUTHORIZED: government official can list claims (200) and gets only their jurisdiction', async () => {
  const s = setup();
  const res = await s.api.list(MP);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.body.data.pagination.total, 8);
  assert.equal(res.body.data.items.length, 8);
  assert.equal(res.body.data.scope.assigned, true);
});

test('FARMER is denied (403) on list, filters, detail and actions; nothing is queried', async () => {
  const s = setup();
  assert.equal((await s.api.list(FARMER_A)).statusCode, 403);
  assert.equal((await s.api.filters(FARMER_A)).statusCode, 403);
  assert.equal((await s.api.detail(FARMER_A, id('01'))).statusCode, 403);          // FARMER_A owns DEMO01
  assert.equal((await s.api.act(FARMER_A, id('01'), { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW' })).statusCode, 403);
  assert.equal(s.repo.calls.length, 0);
  assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW', 'a farmer cannot change their own claim');
});

test('anonymous is denied (401) on every endpoint; nothing is queried', async () => {
  const s = setup();
  assert.equal((await s.api.list(null)).statusCode, 401);
  assert.equal((await s.api.filters(null)).statusCode, 401);
  assert.equal((await s.api.detail(null, id('01'))).statusCode, 401);
  assert.equal((await s.api.act(null, id('01'), { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW' })).statusCode, 401);
  assert.equal(s.repo.calls.length, 0);
});

test('an official with NO area assigned: list is empty with assigned=false; detail and actions are 403; nothing changes', async () => {
  const s = setup();
  const list = await s.api.list(NONE);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.data.scope.assigned, false);
  assert.deepEqual(list.body.data.items, []);
  assert.equal((await s.api.detail(NONE, id('01'))).statusCode, 403);
  assert.equal((await s.api.detail(NONE, id('01'))).body.code, 'NO_JURISDICTION');
  assert.equal((await s.api.act(NONE, id('01'), { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW' })).statusCode, 403);
  assert.deepEqual((await s.api.filters(NONE)).body.data.districts, []);
  assert.equal(s.repo.calls.length, 0);
});

// ================================================================== jurisdiction boundaries
test('BOUNDARY: another state\'s official cannot list, open or act on claims outside their area', async () => {
  const s = setup();
  const list = await s.api.list(ODISHA);
  assert.equal(list.body.data.pagination.total, 1);
  assert.deepEqual(list.body.data.items.map((i) => i.claimId), ['FRA-OD-2025-DEMO04']);
  assert.equal(JSON.stringify(list.body).includes('Madhya Pradesh'), false);
  const foreign = await s.api.detail(ODISHA, id('01'));
  const missing = await s.api.detail(ODISHA, 'FRA-MP-2025-ZZZZZ9');
  assert.equal(foreign.statusCode, 404);
  assert.deepEqual(foreign.body, missing.body, 'out-of-jurisdiction and nonexistent are indistinguishable');
  const act = await s.api.act(ODISHA, id('01'), { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW' });
  assert.equal(act.statusCode, 404);
  assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW');
  assert.equal(s.byId(id('01')).statusHistory.length, 3, 'no history added');
});

test('BOUNDARY: a district official cannot see the same state\'s other district (Mandla) by any route or filter', async () => {
  const s = setup();
  assert.equal((await s.api.list(BALAGHAT)).body.data.pagination.total, 5);
  for (const query of [{ district: 'Mandla' }, { q: 'DEMO07' }, { q: 'Demo Applicant Three' }, { q: 'Demo Gram Four' }, { status: 'PENDING', district: 'Mandla' }]) {
    const r = await s.api.list(BALAGHAT, query);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.data.items.filter((i) => i.district === 'Mandla').length, 0, JSON.stringify(query));
  }
  assert.equal((await s.api.list(BALAGHAT, { district: 'Mandla' })).body.data.pagination.total, 0);
  assert.equal((await s.api.detail(BALAGHAT, id('07'))).statusCode, 404);
  assert.equal((await s.api.act(BALAGHAT, id('07'), { action: 'START_REVIEW', expectedStatus: 'PENDING' })).statusCode, 404);
  assert.equal(s.byId(id('07')).status, 'PENDING');
  assert.deepEqual((await s.api.filters(BALAGHAT)).body.data.districts, ['Balaghat']);
});

test('BOUNDARY: the scope cannot be widened through query parameters or body', async () => {
  const s = setup();
  for (const query of [{ state: 'Odisha' }, { scope: 'all' }, { jurisdiction: '*' }, { farmer: 'x' }]) assert.equal((await s.api.list(BALAGHAT, query)).statusCode, 400);
  const withBody = await runChain([...[(rq, rs, nx) => { rq.user = BALAGHAT; return nx(); }, authorize('GOVERNMENT_OFFICIAL')], validateListQuery, createGovernmentClaimController({ service: s.service }).list], { query: {}, params: {}, body: { areas: [{ state: 'Odisha' }] } });
  assert.equal(withBody.body.data.pagination.total, 5);
});

test('every repository call carries the official\'s scope filter first', async () => {
  const s = setup();
  await s.api.list(MP, { status: 'PENDING', q: 'x' }); await s.api.filters(MP); await s.api.detail(MP, id('01'));
  await s.api.act(MP, id('06'), { action: 'ACCEPT_FOR_PROCESSING', expectedStatus: 'APPLICATION_RECEIVED' });
  const scope = buildClaimScopeFilter(normalizeAreas(MP.jurisdiction.areas));
  assert.ok(s.repo.calls.length >= 5);
  for (const [, filter] of s.repo.calls) assert.deepEqual(filter.$and[0], scope);
});

// ================================================================== list content, pagination, filters
const idsOf = (res) => res.body.data.items.map((i) => i.claimId.slice(-6));

test('pagination is server-side: page size, totals, page 2, past-the-end page, stable order', async () => {
  const s = setup();
  const p1 = await s.api.list(MP, { limit: '3', page: '1', sort: 'claimId', order: 'asc' });
  const p2 = await s.api.list(MP, { limit: '3', page: '2', sort: 'claimId', order: 'asc' });
  const p3 = await s.api.list(MP, { limit: '3', page: '3', sort: 'claimId', order: 'asc' });
  const p4 = await s.api.list(MP, { limit: '3', page: '4', sort: 'claimId', order: 'asc' });
  assert.deepEqual(p1.body.data.pagination, { page: 1, limit: 3, total: 8, totalPages: 3 });
  assert.equal(p1.body.data.items.length, 3); assert.equal(p2.body.data.items.length, 3); assert.equal(p3.body.data.items.length, 2);
  assert.equal(p4.body.data.items.length, 0); assert.equal(p4.body.data.pagination.total, 8);
  const all = [p1, p2, p3].flatMap((p) => p.body.data.items.map((i) => i.claimId));
  assert.deepEqual(all, [...all].sort(), 'claimId ascending across pages');
  assert.equal(new Set(all).size, 8, 'no duplicates or gaps between pages');
});

test('default order is most recently updated first', async () => {
  const s = setup();
  const dates = (await s.api.list(MP)).body.data.items.map((i) => i.updatedAt);
  assert.deepEqual([...dates].sort().reverse(), dates);
});

test('row fields: exactly what the table needs; no farmer id, no _id, no history, no geometry', async () => {
  const s = setup();
  const item = (await s.api.list(MP, { q: 'DEMO01' })).body.data.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['applicantName', 'applicantVillage', 'claimId', 'claimType', 'dataSource', 'district', 'isDemo', 'state', 'status', 'submittedAt', 'updatedAt', 'village']);
  assert.equal(item.applicantName, 'Demo Applicant One');
  assert.equal(item.isDemo, true);
  const text = JSON.stringify((await s.api.list(MP)).body);
  for (const forbidden of [FARMER_A._id, FARMER_B._id, '"farmer"', '"_id"', 'statusHistory', 'coordinates', 'changedBy', 'remarks']) assert.equal(text.includes(forbidden), false, forbidden);
});

test('search: by claim ID (partial, any case) and by permitted applicant information', async () => {
  const s = setup();
  assert.deepEqual(idsOf(await s.api.list(MP, { q: 'demo09' })), ['DEMO09']);
  assert.deepEqual(idsOf(await s.api.list(MP, { q: 'fra-mp-2024' })).sort(), ['DEMO02', 'DEMO03', 'DEMO10']);
  assert.deepEqual(idsOf(await s.api.list(MP, { q: 'applicant three' })), ['DEMO07']);
  assert.deepEqual(idsOf(await s.api.list(MP, { q: 'Demo Gram Four' })).sort(), ['DEMO07', 'DEMO10']);
  assert.equal((await s.api.list(MP, { q: 'no such person' })).body.data.pagination.total, 0);
  assert.equal((await s.api.list(MP, { q: '.*' })).body.data.pagination.total, 0);
  assert.equal((await s.api.list(MP, { q: '(' })).statusCode, 200, 'regex metacharacters cannot break the query');
});

test('filters: status, claim type, district, data source, and application-date range (inclusive)', async () => {
  const s = setup();
  assert.deepEqual(idsOf(await s.api.list(MP, { status: 'UNDER_REVIEW' })).sort(), ['DEMO01', 'DEMO08']);
  assert.deepEqual(idsOf(await s.api.list(MP, { claimType: 'CR' })).sort(), ['DEMO06', 'DEMO09']);
  assert.deepEqual(idsOf(await s.api.list(MP, { district: 'Mandla' })).sort(), ['DEMO07', 'DEMO08', 'DEMO10']);
  assert.deepEqual(idsOf(await s.api.list(MP, { district: 'Mandla', status: 'APPROVED' })), ['DEMO10']);
  assert.equal((await s.api.list(MP, { dataSource: 'OFFICIAL' })).body.data.pagination.total, 0);
  assert.equal((await s.api.list(MP, { dataSource: 'DEMO' })).body.data.pagination.total, 8);
  // application dates (NOW = 2026-01-01): DEMO06 3 days before (2025-12-29), DEMO07 25 days (2025-12-07), DEMO01 60 days,
  // DEMO03 300 days (2025-03-07), DEMO02 400 days (2024-11-27), DEMO10 500 days (2024-08-19)
  assert.deepEqual(idsOf(await s.api.list(MP, { dateFrom: '2025-12-29', dateTo: '2025-12-29' })), ['DEMO06']);
  assert.deepEqual(idsOf(await s.api.list(MP, { dateFrom: '2025-12-01' })).sort(), ['DEMO06', 'DEMO07']);
  assert.deepEqual(idsOf(await s.api.list(MP, { dateTo: '2024-12-31' })).sort(), ['DEMO02', 'DEMO10']);
  assert.deepEqual(idsOf(await s.api.list(MP, { dateFrom: '2025-03-07', dateTo: '2025-03-07' })), ['DEMO03'], 'both ends are inclusive');
  assert.equal((await s.api.list(MP, { dateFrom: '2030-01-01' })).body.data.pagination.total, 0);
});

test('filter options come only from the official\'s own scope', async () => {
  const s = setup();
  const mp = (await s.api.filters(MP)).body.data;
  assert.deepEqual(mp.districts, ['Balaghat', 'Mandla']);
  assert.deepEqual(mp.statuses, CLAIM_STATUSES);
  assert.deepEqual((await s.api.filters(ODISHA)).body.data.districts, ['Koraput']);
});

// ================================================================== detail
test('detail: full claim, allowed actions, audit history; no farmer identity', async () => {
  const s = setup();
  const res = await s.api.detail(MP, id('01'));
  assert.equal(res.statusCode, 200);
  const c = res.body.data.claim;
  assert.equal(c.claimId, id('01'));
  assert.equal(c.status, 'UNDER_REVIEW');
  assert.equal(c.isDemo, true);
  assert.equal(c.geometry.type, 'Polygon');
  assert.deepEqual(c.allowedActions.map((a) => a.action), ['FORWARD', 'APPROVE', 'REJECT']);
  assert.equal(c.statusHistory.length, 3);
  const text = JSON.stringify(res.body);
  for (const forbidden of [FARMER_A._id, '"farmer"', '"_id"']) assert.equal(text.includes(forbidden), false, forbidden);
});

// ================================================================== workflow: valid transitions
const ROUTES = { APPLICATION_RECEIVED: id('06'), PENDING: id('07'), UNDER_REVIEW: id('01'), FORWARDED: id('09') };

test('EVERY valid transition succeeds, with the right new status and a complete audit entry', async () => {
  assert.equal(WORKFLOW_TRANSITIONS.length, 8);
  for (const [action, from, to] of WORKFLOW_TRANSITIONS) {
    const s = setup();
    const claimId = ROUTES[from];
    forceStatus(s.byId(claimId), from);
    const before = s.byId(claimId).statusHistory.length;
    const body = { action, expectedStatus: from, remarks: `remarks for ${action}`, ...(action === 'REJECT' ? { reason: 'Evidence was incomplete.' } : {}) };
    const res = await s.api.act(MP, claimId, body);
    assert.equal(res.statusCode, 200, `${action} from ${from}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.data.claim.status, to, `${action} from ${from}`);
    assert.equal(s.byId(claimId).status, to);

    // audit entry
    const claim = s.byId(claimId);
    assert.equal(claim.statusHistory.length, before + 1, 'exactly one history entry appended');
    const e = claim.statusHistory[claim.statusHistory.length - 1];
    assert.equal(e.status, to); assert.equal(e.previousStatus, from); assert.equal(e.action, action);
    assert.equal(e.remarks, `remarks for ${action}`);
    assert.equal(e.rejectionReason, action === 'REJECT' ? 'Evidence was incomplete.' : null);
    assert.equal(e.changedBy, MP._id);
    assert.equal(new Date(e.changedAt).getTime(), NOW + 1000);
    // the stored claim stays internally consistent
    assert.deepEqual(checkClaimConsistency(claim), [], `${action} from ${from}`);
    // the response shows the audit entry, the actor's name and the NEXT allowed actions
    const last = res.body.data.claim.statusHistory.at(-1);
    assert.equal(last.changedByName, MP.fullName);
    assert.equal(last.actionLabel.length > 0, true);
    assert.deepEqual(res.body.data.claim.allowedActions, getAllowedActions(to));
  }
});

test('reject with a reason: claim becomes REJECTED, reason stored on the claim and in the audit entry', async () => {
  const s = setup();
  const res = await s.api.act(MP, id('01'), { action: 'REJECT', expectedStatus: 'UNDER_REVIEW', reason: '  Occupation before the cut-off date was not shown.  ' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.claim.status, 'REJECTED');
  assert.equal(res.body.data.claim.rejectionReason, 'Occupation before the cut-off date was not shown.');
  assert.equal(s.byId(id('01')).rejectionReason, 'Occupation before the cut-off date was not shown.');
  assert.deepEqual(res.body.data.claim.allowedActions, [], 'terminal');
});

test('remarks are optional and are stored when given', async () => {
  const s = setup();
  const noRemarks = await s.api.act(MP, id('07'), { action: 'START_REVIEW', expectedStatus: 'PENDING' });
  assert.equal(noRemarks.statusCode, 200);
  assert.equal(s.byId(id('07')).statusHistory.at(-1).remarks, null);
});

test('a full journey through the workflow: RECEIVED -> PENDING -> REVIEW -> FORWARDED -> REVIEW -> APPROVED', async () => {
  const s = setup();
  const claimId = id('06');
  const steps = [['ACCEPT_FOR_PROCESSING', 'APPLICATION_RECEIVED', 'PENDING'], ['START_REVIEW', 'PENDING', 'UNDER_REVIEW'], ['FORWARD', 'UNDER_REVIEW', 'FORWARDED'],
    ['RETURN_FOR_REVIEW', 'FORWARDED', 'UNDER_REVIEW'], ['APPROVE', 'UNDER_REVIEW', 'APPROVED']];
  for (const [action, from, to] of steps) {
    const res = await s.api.act(MP, claimId, { action, expectedStatus: from });
    assert.equal(res.statusCode, 200, action);
    assert.equal(res.body.data.claim.status, to);
  }
  const history = s.byId(claimId).statusHistory;
  assert.deepEqual(history.slice(-5).map((h) => `${h.previousStatus}>${h.status}`), steps.map(([, f, t]) => `${f}>${t}`));
  assert.deepEqual(checkClaimConsistency(s.byId(claimId)), []);
});

// ================================================================== workflow: invalid transitions
test('EVERY invalid (status, action) pair is refused with 409, the claim is unchanged and no audit entry is written', async () => {
  const valid = new Set(WORKFLOW_TRANSITIONS.map((t) => `${t[0]}|${t[1]}`));
  const actions = [...new Set(WORKFLOW_TRANSITIONS.map((t) => t[0]))];
  let checked = 0;
  for (const status of CLAIM_STATUSES) {
    for (const action of actions) {
      if (valid.has(`${action}|${status}`)) continue;
      const s = setup();
      const claim = s.claims.find((c) => c.claimId === (ROUTES[status] || (status === 'APPROVED' ? id('02') : id('03'))));
      forceStatus(claim, status);
      if (status === 'REJECTED') claim.rejectionReason = 'x';
      const snapshot = JSON.stringify(claim);
      const res = await s.api.act(MP, claim.claimId, { action, expectedStatus: status, ...(action === 'REJECT' ? { reason: 'because' } : {}) });
      assert.equal(res.statusCode, 409, `${action} from ${status}`);
      assert.equal(res.body.code, 'CLAIM_INVALID_TRANSITION');
      assert.equal(res.body.currentStatus, status);
      assert.deepEqual(res.body.allowedActions, getAllowedActions(status));
      assert.equal(JSON.stringify(claim), snapshot, `${action} from ${status} must not change anything`);
      checked += 1;
    }
  }
  assert.equal(checked, 28);
});

test('terminal claims (APPROVED, REJECTED) cannot be changed by any action', async () => {
  const s = setup();
  for (const [claimId, status] of [[id('02'), 'APPROVED'], [id('03'), 'REJECTED']]) {
    for (const action of ['APPROVE', 'START_REVIEW', 'RETURN_FOR_REVIEW']) {
      assert.equal((await s.api.act(MP, claimId, { action, expectedStatus: status })).statusCode, 409);
    }
    assert.equal(s.byId(claimId).status, status);
  }
});

test('the client cannot choose a status: status fields and status names as actions are 400 and change nothing', async () => {
  const s = setup();
  for (const body of [{ action: 'APPROVE', expectedStatus: 'UNDER_REVIEW', status: 'APPROVED' }, { action: 'APPROVED', expectedStatus: 'UNDER_REVIEW' },
    { status: 'APPROVED', expectedStatus: 'UNDER_REVIEW' }, { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW', changedBy: 'someone-else' }, { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW', statusHistory: [] }]) {
    assert.equal((await s.api.act(MP, id('01'), body)).statusCode, 400, JSON.stringify(body));
  }
  assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW');
  assert.equal(s.byId(id('01')).statusHistory.length, 3);
  assert.ok(!s.repo.calls.some((c) => c[0] === 'applyTransition'));
});

test('the actor recorded in the audit entry is the logged-in official, never a client-supplied value', async () => {
  const s = setup();
  await s.api.act(MP2, id('06'), { action: 'ACCEPT_FOR_PROCESSING', expectedStatus: 'APPLICATION_RECEIVED' });
  assert.equal(s.byId(id('06')).statusHistory.at(-1).changedBy, MP2._id);
});

// ================================================================== reject requires a reason
test('REJECT without a reason (missing, empty, whitespace, null) is 400 with a field error and changes nothing', async () => {
  for (const reason of [undefined, null, '', '   ', '\n\t']) {
    const s = setup();
    const res = await s.api.act(MP, id('01'), { action: 'REJECT', expectedStatus: 'UNDER_REVIEW', ...(reason === undefined ? {} : { reason }) });
    assert.equal(res.statusCode, 400, JSON.stringify(reason));
    assert.deepEqual(res.body.errors, [{ field: 'reason', message: 'A reason is required to reject a claim.' }]);
    assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW');
    assert.equal(s.byId(id('01')).statusHistory.length, 3);
  }
});

test('the service itself also refuses a rejection without a reason (defence in depth, no validator in front)', async () => {
  const s = setup();
  const r = await s.service.performAction({ user: MP, claimId: id('01'), input: { action: 'REJECT', expectedStatus: 'UNDER_REVIEW', remarks: null, reason: null } });
  assert.deepEqual(r, { ok: false, reason: 'VALIDATION', errors: [{ field: 'reason', message: 'A reason is required to reject a claim.' }] });
  assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW');
});

test('a reason is refused on non-reject actions', async () => {
  const s = setup();
  const res = await s.api.act(MP, id('01'), { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW', reason: 'nope' });
  assert.equal(res.statusCode, 400);
  assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW');
});

// ================================================================== concurrency / atomicity
test('acting on a stale screen is refused: expectedStatus must equal the current status (409 CLAIM_STATE_CHANGED)', async () => {
  const s = setup();
  const res = await s.api.act(MP, id('01'), { action: 'APPROVE', expectedStatus: 'FORWARDED' });   // really UNDER_REVIEW
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'CLAIM_STATE_CHANGED');
  assert.equal(res.body.currentStatus, 'UNDER_REVIEW');
  assert.equal(s.byId(id('01')).status, 'UNDER_REVIEW');
});

test('two officials acting at the same time: exactly one wins, the other gets CLAIM_STATE_CHANGED, one audit entry', async () => {
  const s = setup();
  const body = { action: 'FORWARD', expectedStatus: 'UNDER_REVIEW' };
  const [a, b] = await Promise.all([s.api.act(MP, id('01'), body), s.api.act(MP2, id('01'), { ...body, action: 'APPROVE' })]);
  const codes = [a.statusCode, b.statusCode].sort();
  assert.deepEqual(codes, [200, 409], 'one success, one conflict');
  assert.equal(s.byId(id('01')).statusHistory.length, 4, 'exactly one audit entry was added');
  assert.deepEqual(checkClaimConsistency(s.byId(id('01'))), []);
});

test('the atomic update is compare-and-set on status, claim ID and jurisdiction (checked on the filter the repository receives)', async () => {
  const s = setup();
  await s.api.act(MP, id('06'), { action: 'ACCEPT_FOR_PROCESSING', expectedStatus: 'APPLICATION_RECEIVED' });
  const call = s.repo.calls.find((c) => c[0] === 'applyTransition');
  const scope = buildClaimScopeFilter(normalizeAreas(MP.jurisdiction.areas));
  assert.deepEqual(call[1], { $and: [scope, { claimId: id('06') }, { status: 'APPLICATION_RECEIVED' }] });
});

test('history is append-only: earlier entries are untouched by a transition', async () => {
  const s = setup();
  const before = JSON.stringify(s.byId(id('01')).statusHistory);
  await s.api.act(MP, id('01'), { action: 'FORWARD', expectedStatus: 'UNDER_REVIEW' });
  assert.equal(JSON.stringify(s.byId(id('01')).statusHistory.slice(0, 3)), before);
});

// ================================================================== farmer privacy stays intact
const farmerService = (s) => createFraClaimService({
  repository: {
    async findOwnedByClaimId(claimId, farmerId) { return s.claims.find((c) => c.claimId === claimId && String(c.farmer) === String(farmerId)) || null; },
    async findOwnedById(cid, farmerId) { return s.claims.find((c) => String(c._id) === String(cid) && String(c.farmer) === String(farmerId)) || null; },
  },
  getSecret: () => 'test-secret-that-is-long-enough-123456', now: () => NOW,
});
const farmerSees = async (svc, farmer, claimId) => {
  const v = await svc.verify({ claimId, farmerId: farmer._id });
  return v.ok ? svc.view({ grant: v.grant, farmerId: farmer._id }) : v;
};

test('FARMER VIEW after workflow actions: own claim shows the new status; internal audit data never appears', async () => {
  const s = setup();
  await s.api.act(MP, id('01'), { action: 'FORWARD', expectedStatus: 'UNDER_REVIEW', remarks: 'INTERNAL: applicant has a land dispute' });
  await s.api.act(MP, id('01'), { action: 'REJECT', expectedStatus: 'FORWARDED', remarks: 'INTERNAL: confirm with the range officer', reason: 'Evidence of occupation was not provided.' });

  const svc = farmerService(s);
  const res = await farmerSees(svc, FARMER_A, id('01'));
  assert.equal(res.ok, true);
  const claim = res.claim;
  assert.equal(claim.status, 'REJECTED');
  assert.equal(claim.rejectionReason, 'Evidence of occupation was not provided.', 'the applicant does see the rejection reason');
  assert.deepEqual(claim.statusHistory.map((h) => h.status), ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW', 'FORWARDED', 'REJECTED']);
  for (const h of claim.statusHistory) assert.deepEqual(Object.keys(h).sort(), ['changedAt', 'note', 'status'], 'farmer history entries carry only status, date and public note');

  const text = JSON.stringify(res);
  for (const forbidden of ['INTERNAL', 'land dispute', 'range officer', 'remarks', 'previousStatus', 'action', 'changedBy', 'off-mp', 'Official off-mp', 'REJECT"', 'FORWARD"']) {
    assert.equal(text.includes(forbidden), false, `farmer view leaked ${forbidden}`);
  }
});

test('FARMER VIEW: a farmer still cannot open another farmer\'s claim, before or after workflow changes', async () => {
  const s = setup();
  const svc = farmerService(s);
  await s.api.act(MP, id('01'), { action: 'APPROVE', expectedStatus: 'UNDER_REVIEW' });
  const other = await farmerSees(svc, FARMER_B, id('01'));       // DEMO01 belongs to farmer A
  assert.deepEqual(other, { ok: false, reason: 'NOT_FOUND' });
  const nonexistent = await farmerSees(svc, FARMER_B, 'FRA-MP-2025-ZZZZZ9');
  assert.deepEqual(other, nonexistent);
  assert.equal((await farmerSees(svc, FARMER_A, id('01'))).claim.status, 'APPROVED');
});

test('FARMER VIEW: a non-rejected claim never shows a rejection reason even if an audit entry has one', async () => {
  const s = setup();
  s.byId(id('01')).statusHistory.at(-1).rejectionReason = 'stale';
  const res = await farmerSees(farmerService(s), FARMER_A, id('01'));
  assert.equal(res.claim.rejectionReason, null);
});

// ================================================================== static checks on the REAL source files
const SRC = path.resolve(new URL('../src', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('wiring: claims routes are mounted after the government guard; exactly five routes (list, filters, map, detail, actions), no delete/put/patch', () => {
  const gov = read('routes/governmentRoutes.js');
  const guard = gov.indexOf("router.use(authenticate, authorize('GOVERNMENT_OFFICIAL'))");
  const mount = gov.indexOf("router.use('/claims', governmentClaimRoutes)");
  assert.ok(guard !== -1 && mount !== -1 && guard < mount);
  const routes = [...code('routes/governmentClaimRoutes.js').matchAll(/router\.(get|post|put|patch|delete|all|use)\(\s*'([^']*)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  assert.deepEqual(routes, ['GET /filters', 'GET /map', 'GET /', 'GET /:claimId', 'POST /:claimId/actions']);
  assert.ok(routes.indexOf('GET /filters') < routes.indexOf('GET /:claimId'), '/filters must be registered before /:claimId');
  assert.ok(routes.indexOf('GET /map') < routes.indexOf('GET /:claimId'), '/map must be registered before /:claimId');
  assert.ok(code('routes/governmentClaimRoutes.js').includes("router.post('/:claimId/actions', validateClaimIdParam, validateActionBody, controller.action)"));
  assert.ok(code('routes/governmentClaimRoutes.js').includes("router.get('/', validateListQuery, controller.list)"));
});

test('farmer routes and auth routes know nothing about government claim management', () => {
  for (const f of ['routes/farmerRoutes.js', 'routes/fraClaimRoutes.js', 'routes/authRoutes.js']) {
    assert.doesNotMatch(code(f), /governmentClaim|govClaim|claims\/filters/, f);
  }
  assert.doesNotMatch(code('routes/fraClaimRoutes.js'), /actions|transition/i);
});

test('repository: every method builds its filter with composeScoped; no unscoped Claim query; no delete', () => {
  const repo = code('repositories/governmentClaimManagementRepository.js');
  const queries = repo.match(/Claim\.\w+\(/g) || [];
  assert.deepEqual(queries, ['Claim.find(', 'Claim.countDocuments(', 'Claim.findOne(', 'Claim.distinct(', 'Claim.find(', 'Claim.countDocuments(', 'Claim.findOneAndUpdate(']);
  assert.equal((repo.match(/composeScoped\(/g) || []).length, 5, 'list, findOne, distinct, map, applyTransition');
  assert.equal((repo.match(/const filter = composeScoped\(/g) || []).length, 3, 'list, map, applyTransition are built with composeScoped');
  assert.doesNotMatch(repo, /Claim\.(deleteOne|deleteMany|updateMany|remove|insertMany|create)\(/);
  for (const line of repo.split('\n').filter((l) => /Claim\.(find|countDocuments|findOne|distinct|findOneAndUpdate)\(/.test(l))) {
    assert.match(line, /\(filter[,)]|composeScoped\(/, `unscoped query: ${line.trim()}`);
  }
  assert.match(repo, /findOneAndUpdate\(filter, \{ \$set, \$push: \{ statusHistory: entry \} \}/);
  assert.match(repo, /composeScoped\(scope, \[\{ claimId \}, \{ status: expectedStatus \}\]\)/);
});

test('controller derives the official from req.user only, and the service never reads scope from the request', () => {
  const ctrl = code('controllers/governmentClaimController.js');
  assert.doesNotMatch(ctrl, /req\.(query|body|params)\.(user|official|jurisdiction|scope|areas|changedBy|status)/);
  assert.match(ctrl, /user: req\.user/);
  assert.doesNotMatch(code('services/governmentClaimService.js'), /req\./);
  assert.match(code('services/governmentClaimService.js'), /changedBy: user\._id/);
});

test('model: audit fields exist on history entries; no admin role or route was introduced', () => {
  const model = read('models/Claim.js');
  for (const field of ['previousStatus', 'action', 'remarks', 'rejectionReason', 'changedBy', 'changedAt']) assert.match(model.slice(model.indexOf('statusHistorySchema')), new RegExp(field));
  assert.match(read('models/User.js'), /USER_ROLES = \['FARMER', 'GOVERNMENT_OFFICIAL'\]/);
  for (const f of fs.readdirSync(path.join(SRC, 'routes'))) assert.doesNotMatch(code(`routes/${f}`), /admin/i, f);
});

test('the farmer view whitelist copies exactly status, changedAt and publicNote from history entries', () => {
  const view = code('services/fraClaimView.js');
  assert.match(view, /statusHistory: history\.map\(\(h\) => \(\{ status: h\.status, changedAt: iso\(h\.changedAt\), note: str\(h\.publicNote\) \}\)\)/);
});
