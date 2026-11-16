import { CLAIM_ID_PATTERN, normalizeClaimId } from '../utils/fraClaimRules.js';

const bad = (res, errors) => res.status(400).json({ success: false, message: 'Validation failed', errors });

/**
 * POST /fra/verify body: exactly { claimId: string }. Non-strings (e.g. { "$ne": null } objects) are rejected
 * before any database query, and the ID must match the reference-ID format.
 */
export const validateFraVerify = (req, res, next) => {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return bad(res, [{ field: 'body', message: 'Request body must be a JSON object.' }]);
  }
  const errors = Object.keys(body).filter((k) => k !== 'claimId').map((k) => ({ field: k, message: 'Unknown field.' }));

  if (typeof body.claimId !== 'string' || body.claimId.trim() === '') {
    errors.push({ field: 'claimId', message: 'Claim reference ID is required.' });
  } else if (body.claimId.length > 40 || !CLAIM_ID_PATTERN.test(normalizeClaimId(body.claimId))) {
    errors.push({ field: 'claimId', message: 'Enter the reference ID in the format FRA-XX-YYYY-XXXXXX.' });
  }
  if (errors.length) return bad(res, errors);

  req.fraInput = { claimId: normalizeClaimId(body.claimId) };
  return next();
};

/** POST /fra/claim body: exactly { grant: string }. */
export const validateFraView = (req, res, next) => {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return bad(res, [{ field: 'body', message: 'Request body must be a JSON object.' }]);
  }
  const errors = Object.keys(body).filter((k) => k !== 'grant').map((k) => ({ field: k, message: 'Unknown field.' }));
  if (typeof body.grant !== 'string' || body.grant.length === 0 || body.grant.length > 1000) {
    errors.push({ field: 'grant', message: 'A verification grant is required. Please verify your reference ID first.' });
  }
  if (errors.length) return bad(res, errors);

  req.fraInput = { grant: body.grant };
  return next();
};
