// Pure rules for FRA claims (no database, no framework) so they can be unit-tested and reused by the
// Mongoose model, the seed data and the future government workflow.
import { randomInt } from 'node:crypto';
import { WORKFLOW_ACTIONS } from './claimWorkflow.js';

export const CLAIM_STATUSES = ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW', 'FORWARDED', 'APPROVED', 'REJECTED'];
// Claims an official still has to act on: received, pending, or under review (not yet forwarded or decided).
export const REQUIRES_ACTION_STATUSES = ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW'];

// FRA 2006 categories: Individual Forest Rights, Community Rights, Community Forest Resource rights.
export const CLAIM_TYPES = ['IFR', 'CR', 'CFR'];
// No default anywhere: whoever creates a claim must say whether it is demo or official data.
export const DATA_SOURCES = ['DEMO', 'OFFICIAL'];

// e.g. FRA-MP-2025-A7K2QX  (state code, year, 6-character random part)
// MUST match frontend/src/config/fraConfig.js (verify: node scripts/check-schema-sync.mjs).
export const CLAIM_ID_PATTERN = /^FRA-[A-Z]{2}-\d{4}-[A-Z0-9]{6}$/;

// Generated IDs avoid look-alike characters (I, L, O, 0, 1) so they are easy to read out and write down.
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** For the future authorized-registration workflow. ~1 billion possible suffixes per state/year. */
export const generateClaimId = (stateCode, year = new Date().getFullYear(), rand = randomInt) => {
  if (typeof stateCode !== 'string' || !/^[A-Z]{2}$/.test(stateCode)) throw new Error('stateCode must be two capital letters');
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error('year must be a four-digit year');
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += ID_ALPHABET[rand(ID_ALPHABET.length)];
  return `FRA-${stateCode}-${year}-${suffix}`;
};

/** Trim + upper-case. Anything that is not a string becomes '' (and then fails the pattern). */
export const normalizeClaimId = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');
export const isValidClaimId = (value) => CLAIM_ID_PATTERN.test(value);

// ---------------------------------------------------------------- GeoJSON
const MAX_VERTICES = 20000;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPosition = (p) =>
  Array.isArray(p) && p.length >= 2 && p.length <= 3 && p.every(isNum) &&
  p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;   // GeoJSON order: [longitude, latitude]

const ringError = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return 'a ring needs at least 4 positions';
  if (!ring.every(isPosition)) return 'invalid coordinate (expected [longitude, latitude] within range)';
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? null : 'a ring must be closed (first = last position)';
};

const polygonError = (rings) => {
  if (!Array.isArray(rings) || rings.length < 1) return 'a polygon needs at least one ring';
  for (const ring of rings) {
    const err = ringError(ring);
    if (err) return err;
  }
  return null;
};

const countVertices = (g) =>
  (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((n, poly) => n + poly.reduce((m, r) => m + r.length, 0), 0);

/**
 * Validates a GeoJSON Polygon or MultiPolygon geometry. Returns { valid: true } or { valid: false, error }.
 * (Checks structure and ranges; it does not test for self-intersection.)
 */
export const validateGeoJsonGeometry = (geometry) => {
  if (geometry === null || typeof geometry !== 'object' || Array.isArray(geometry)) {
    return { valid: false, error: 'geometry must be an object' };
  }
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return { valid: false, error: 'geometry.type must be Polygon or MultiPolygon' };
  }
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polys) || polys.length < 1) return { valid: false, error: 'geometry.coordinates is missing' };
  if (geometry.type === 'MultiPolygon' && !polys.every(Array.isArray)) return { valid: false, error: 'invalid MultiPolygon' };
  for (const poly of polys) {
    const err = polygonError(poly);
    if (err) return { valid: false, error: err };
  }
  if (countVertices(geometry) > MAX_VERTICES) return { valid: false, error: 'geometry has too many vertices' };
  return { valid: true };
};

// ---------------------------------------------------------------- consistency
const validDate = (d) => d instanceof Date ? !Number.isNaN(d.getTime()) : typeof d === 'string' && !Number.isNaN(Date.parse(d));

/**
 * Cross-field rules a claim must satisfy. Returns a list of problems (empty = consistent).
 *  - status is one of CLAIM_STATUSES and equals the latest status-history entry
 *  - history is non-empty and chronological
 *  - rejectionReason is required exactly when status is REJECTED
 *  - dataSource is DEMO or OFFICIAL
 */
export const checkClaimConsistency = (claim) => {
  const problems = [];
  if (!CLAIM_STATUSES.includes(claim.status)) problems.push('status is not a valid status');
  if (!DATA_SOURCES.includes(claim.dataSource)) problems.push('dataSource must be DEMO or OFFICIAL');

  const history = Array.isArray(claim.statusHistory) ? claim.statusHistory : [];
  if (history.length === 0) problems.push('statusHistory must contain at least one entry');
  history.forEach((h, i) => {
    if (!CLAIM_STATUSES.includes(h?.status)) problems.push(`statusHistory[${i}].status is not valid`);
    if (!validDate(h?.changedAt)) problems.push(`statusHistory[${i}].changedAt is not a valid date`);
    if (i > 0 && validDate(h?.changedAt) && validDate(history[i - 1]?.changedAt) &&
        new Date(h.changedAt) < new Date(history[i - 1].changedAt)) {
      problems.push('statusHistory must be in chronological order');
    }
  });
  // Entries written by the workflow must describe an edge that exists in the transition map.
  history.forEach((h, i) => {
    if (!h?.action) return;
    const def = WORKFLOW_ACTIONS[h.action];
    if (!def) problems.push(`statusHistory[${i}].action is not a known action`);
    else if (def.to !== h.status || !def.from.includes(h.previousStatus)) problems.push(`statusHistory[${i}] does not follow the workflow`);
  });
  if (history.length > 0 && history[history.length - 1]?.status !== claim.status) {
    problems.push('status must equal the latest statusHistory entry');
  }

  const reason = typeof claim.rejectionReason === 'string' ? claim.rejectionReason.trim() : '';
  if (claim.status === 'REJECTED' && !reason) problems.push('rejectionReason is required when status is REJECTED');
  if (claim.status !== 'REJECTED' && reason) problems.push('rejectionReason must be empty unless status is REJECTED');
  return problems;
};
