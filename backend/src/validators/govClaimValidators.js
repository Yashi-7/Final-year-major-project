import { CLAIM_ID_PATTERN, CLAIM_STATUSES, CLAIM_TYPES, DATA_SOURCES, normalizeClaimId } from '../utils/fraClaimRules.js';
import { REASON_MAX, REMARKS_MAX, WORKFLOW_ACTION_NAMES, isKnownAction } from '../utils/claimWorkflow.js';

const bad = (res, errors) => res.status(400).json({ success: false, message: 'Validation failed', errors });
const CONTROL = /[\u0000-\u001f\u007f]/;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const LIST_KEYS = ['page', 'limit', 'q', 'status', 'claimType', 'district', 'dateFrom', 'dateTo', 'dataSource', 'sort', 'order'];
const MAP_KEYS = ['status', 'claimType', 'district', 'dateFrom', 'dateTo', 'dataSource'];
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 10;
const SORTS = ['updatedAt', 'submittedAt', 'claimId'];

const validDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Strict parsing of GET /claims query parameters. Unknown parameters, repeated parameters (arrays), nested objects
 * (e.g. status[$ne]=x) and out-of-range values are rejected. Empty values are treated as "not set".
 * Result: req.govQuery = { page, limit, search, status, claimType, district, dateFrom, dateTo, dataSource, sort, order }
 */
export const parseListQuery = (query) => {
  const errors = [];
  const raw = isPlainObject(query) ? query : {};
  for (const key of Object.keys(raw)) if (!LIST_KEYS.includes(key)) errors.push({ field: key, message: 'Unknown parameter.' });

  const get = (key) => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') { errors.push({ field: key, message: 'Must be a single text value.' }); return undefined; }
    const t = v.trim();
    return t === '' ? undefined : t;
  };
  const oneOf = (key, allowed) => {
    const v = get(key);
    if (v !== undefined && !allowed.includes(v)) { errors.push({ field: key, message: `Must be one of: ${allowed.join(', ')}.` }); return undefined; }
    return v;
  };
  const text = (key, max) => {
    const v = get(key);
    if (v !== undefined && (v.length > max || CONTROL.test(v))) { errors.push({ field: key, message: `Must be at most ${max} characters without control characters.` }); return undefined; }
    return v;
  };
  const int = (key, min, max, dflt) => {
    const v = get(key);
    if (v === undefined) return dflt;
    if (!/^\d{1,6}$/.test(v) || Number(v) < min || Number(v) > max) { errors.push({ field: key, message: `Must be a whole number from ${min} to ${max}.` }); return dflt; }
    return Number(v);
  };

  const dateFrom = get('dateFrom');
  const dateTo = get('dateTo');
  if (dateFrom !== undefined && !validDay(dateFrom)) errors.push({ field: 'dateFrom', message: 'Must be a valid date like 2025-01-31.' });
  if (dateTo !== undefined && !validDay(dateTo)) errors.push({ field: 'dateTo', message: 'Must be a valid date like 2025-01-31.' });
  if (dateFrom && dateTo && validDay(dateFrom) && validDay(dateTo) && dateFrom > dateTo) errors.push({ field: 'dateTo', message: 'Must not be before dateFrom.' });

  const parsed = {
    page: int('page', 1, 100000, 1),
    limit: int('limit', 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    search: text('q', 100),
    status: oneOf('status', CLAIM_STATUSES),
    claimType: oneOf('claimType', CLAIM_TYPES),
    district: text('district', 100),
    dateFrom, dateTo,
    dataSource: oneOf('dataSource', DATA_SOURCES),
    sort: oneOf('sort', SORTS) || 'updatedAt',
    order: oneOf('order', ['asc', 'desc']) || 'desc',
  };
  return errors.length ? { valid: false, errors } : { valid: true, value: parsed };
};

/**
 * Strict parsing of GET /claims/map query parameters: the same filters as the list endpoint (status, claimType,
 * district, dataSource, dateFrom/dateTo) but no page, limit, q or sort — a map is not paginated or sorted.
 * Result: req.govQuery = { status, claimType, district, dateFrom, dateTo, dataSource }
 */
export const parseMapQuery = (query) => {
  const errors = [];
  const raw = isPlainObject(query) ? query : {};
  for (const key of Object.keys(raw)) if (!MAP_KEYS.includes(key)) errors.push({ field: key, message: 'Unknown parameter.' });

  const get = (key) => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') { errors.push({ field: key, message: 'Must be a single text value.' }); return undefined; }
    const t = v.trim();
    return t === '' ? undefined : t;
  };
  const oneOf = (key, allowed) => {
    const v = get(key);
    if (v !== undefined && !allowed.includes(v)) { errors.push({ field: key, message: `Must be one of: ${allowed.join(', ')}.` }); return undefined; }
    return v;
  };
  const text = (key, max) => {
    const v = get(key);
    if (v !== undefined && (v.length > max || CONTROL.test(v))) { errors.push({ field: key, message: `Must be at most ${max} characters without control characters.` }); return undefined; }
    return v;
  };

  const dateFrom = get('dateFrom');
  const dateTo = get('dateTo');
  if (dateFrom !== undefined && !validDay(dateFrom)) errors.push({ field: 'dateFrom', message: 'Must be a valid date like 2025-01-31.' });
  if (dateTo !== undefined && !validDay(dateTo)) errors.push({ field: 'dateTo', message: 'Must be a valid date like 2025-01-31.' });
  if (dateFrom && dateTo && validDay(dateFrom) && validDay(dateTo) && dateFrom > dateTo) errors.push({ field: 'dateTo', message: 'Must not be before dateFrom.' });

  const parsed = {
    status: oneOf('status', CLAIM_STATUSES),
    claimType: oneOf('claimType', CLAIM_TYPES),
    district: text('district', 100),
    dateFrom, dateTo,
    dataSource: oneOf('dataSource', DATA_SOURCES),
  };
  return errors.length ? { valid: false, errors } : { valid: true, value: parsed };
};

export const validateMapQuery = (req, res, next) => {
  const r = parseMapQuery(req.query);
  if (!r.valid) return bad(res, r.errors);
  req.govQuery = r.value;
  return next();
};

export const validateListQuery = (req, res, next) => {
  const r = parseListQuery(req.query);
  if (!r.valid) return bad(res, r.errors);
  req.govQuery = r.value;
  return next();
};

/** :claimId must look like a claim reference ID (this also rules out operator objects and odd strings). */
export const validateClaimIdParam = (req, res, next) => {
  const raw = req.params?.claimId;
  const id = normalizeClaimId(raw);
  if (typeof raw !== 'string' || raw.length > 40 || !CLAIM_ID_PATTERN.test(id)) {
    return bad(res, [{ field: 'claimId', message: 'Enter the reference ID in the format FRA-XX-YYYY-XXXXXX.' }]);
  }
  req.claimId = id;
  return next();
};

/**
 * POST /claims/:claimId/actions body: exactly { action, expectedStatus, remarks?, reason? }.
 * The client names an ACTION; it can never send a status to be set. A reason is required to REJECT and is refused
 * for every other action.
 */
export const parseActionInput = (body) => {
  if (!isPlainObject(body)) return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  const errors = Object.keys(body).filter((k) => !['action', 'expectedStatus', 'remarks', 'reason'].includes(k)).map((k) => ({ field: k, message: 'Unknown field.' }));

  if (typeof body.action !== 'string' || !isKnownAction(body.action)) errors.push({ field: 'action', message: `Action must be one of: ${WORKFLOW_ACTION_NAMES.join(', ')}.` });
  if (typeof body.expectedStatus !== 'string' || !CLAIM_STATUSES.includes(body.expectedStatus)) errors.push({ field: 'expectedStatus', message: 'expectedStatus must be the claim\'s current status.' });

  const optionalText = (key, max, label) => {
    const v = body[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') { errors.push({ field: key, message: `${label} must be text.` }); return null; }
    const t = v.trim();
    if (t.length > max) { errors.push({ field: key, message: `${label} must be at most ${max} characters.` }); return null; }
    return t === '' ? null : t;
  };
  const remarks = optionalText('remarks', REMARKS_MAX, 'Remarks');
  const reason = optionalText('reason', REASON_MAX, 'Reason');

  if (body.action === 'REJECT' && !reason && !errors.some((e) => e.field === 'reason')) errors.push({ field: 'reason', message: 'A reason is required to reject a claim.' });
  if (typeof body.action === 'string' && isKnownAction(body.action) && body.action !== 'REJECT' && reason) errors.push({ field: 'reason', message: 'A reason can only be given when rejecting a claim.' });

  return errors.length ? { valid: false, errors } : { valid: true, value: { action: body.action, expectedStatus: body.expectedStatus, remarks, reason } };
};

export const validateActionBody = (req, res, next) => {
  const r = parseActionInput(req.body);
  if (!r.valid) return bad(res, r.errors);
  req.actionInput = r.value;
  return next();
};
