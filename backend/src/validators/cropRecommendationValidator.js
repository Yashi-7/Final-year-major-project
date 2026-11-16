import { NUMERIC_FIELDS, SEASONS } from '../config/cropRecommendationSchema.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const ALLOWED = new Set([...NUMERIC_FIELDS.map((f) => f.name), 'season']);

/**
 * Strict whitelist validation of a crop-recommendation request body.
 * Pure function (no framework dependency) so it is unit-testable on its own.
 *
 * - rejects non-object bodies and any field not in the schema
 * - accepts finite numbers or plain decimal strings ("6.5"); rejects booleans, arrays,
 *   objects, "", "1e3", NaN and Infinity
 * - enforces the min/max range of each field and the season enum
 *
 * Returns { valid: true, value } with a fresh object of numbers + season,
 * or { valid: false, errors: [{ field, message }] }.
 */
export const validateCropRecommendationInput = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const errors = [];
  const value = {};

  Object.keys(body)
    .filter((key) => !ALLOWED.has(key))
    .forEach((key) => errors.push({ field: key, message: 'Unknown field.' }));

  for (const { name, label, min, max } of NUMERIC_FIELDS) {
    const raw = body[name];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      errors.push({ field: name, message: `${label} is required.` });
      continue;
    }

    let num;
    if (typeof raw === 'number') num = raw;
    else if (typeof raw === 'string' && DECIMAL.test(raw.trim())) num = Number(raw.trim());
    else num = NaN;

    if (!Number.isFinite(num)) {
      errors.push({ field: name, message: `${label} must be a number.` });
    } else if (num < min || num > max) {
      errors.push({ field: name, message: `${label} must be between ${min} and ${max}.` });
    } else {
      value[name] = num;
    }
  }

  const season = body.season;
  if (season === undefined || season === null || (typeof season === 'string' && season.trim() === '')) {
    errors.push({ field: 'season', message: 'Season is required.' });
  } else if (typeof season !== 'string' || !SEASONS.includes(season)) {
    errors.push({ field: 'season', message: `Season must be one of: ${SEASONS.join(', ')}.` });
  } else {
    value.season = season;
  }

  return errors.length ? { valid: false, errors } : { valid: true, value };
};

/** Express middleware wrapper. Same 400 shape as the existing `validate` middleware. */
export const validateCropRecommendation = (req, res, next) => {
  const result = validateCropRecommendationInput(req.body);
  if (!result.valid) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: result.errors });
  }
  req.cropInput = result.value; // only whitelisted, validated fields travel any further
  return next();
};
