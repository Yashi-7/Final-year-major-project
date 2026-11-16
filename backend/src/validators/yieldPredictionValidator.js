import { MAX_TEXT_LENGTH, YEAR_MAX, YEAR_MIN, YIELD_FEATURES } from '../config/yieldPredictionSchema.js';

const ALLOWED = new Set(YIELD_FEATURES);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const LABELS = { state: 'State', season: 'Season', crop: 'Crop' };

/**
 * Strict whitelist validation of a yield-prediction request body (dependency-free, unit-testable).
 * - only state, season, crop, year are accepted; anything else (incl. area / production) is rejected
 * - state / season / crop: non-empty text, max 100 chars, no control characters
 * - year: a whole number (or digit string) between YEAR_MIN and YEAR_MAX
 * Category membership (is this state/crop/season combination supported?) is checked by the ML service.
 */
export const validateYieldPredictionInput = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }

  const errors = [];
  const value = {};

  Object.keys(body)
    .filter((key) => !ALLOWED.has(key))
    .forEach((key) => errors.push({ field: key, message: 'Unknown field.' }));

  for (const name of ['state', 'season', 'crop']) {
    const raw = body[name];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      errors.push({ field: name, message: `${LABELS[name]} is required.` });
    } else if (typeof raw !== 'string') {
      errors.push({ field: name, message: `${LABELS[name]} must be text.` });
    } else if (raw.length > MAX_TEXT_LENGTH || CONTROL_CHARS.test(raw)) {
      errors.push({ field: name, message: `${LABELS[name]} is not valid.` });
    } else {
      value[name] = raw.trim();
    }
  }

  const rawYear = body.year;
  if (rawYear === undefined || rawYear === null || (typeof rawYear === 'string' && rawYear.trim() === '')) {
    errors.push({ field: 'year', message: 'Year is required.' });
  } else {
    let year = NaN;
    if (typeof rawYear === 'number' && Number.isInteger(rawYear)) year = rawYear;
    else if (typeof rawYear === 'string' && /^\d{1,9}$/.test(rawYear.trim())) year = Number(rawYear.trim());

    if (!Number.isInteger(year)) errors.push({ field: 'year', message: 'Year must be a whole number.' });
    else if (year < YEAR_MIN || year > YEAR_MAX) {
      errors.push({ field: 'year', message: `Year must be between ${YEAR_MIN} and ${YEAR_MAX}.` });
    } else value.year = year;
  }

  return errors.length ? { valid: false, errors } : { valid: true, value };
};

/** Express middleware wrapper; same 400 shape as the other validators. */
export const validateYieldPrediction = (req, res, next) => {
  const result = validateYieldPredictionInput(req.body);
  if (!result.valid) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: result.errors });
  }
  req.yieldInput = result.value;
  return next();
};
