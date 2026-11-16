import { NUMERIC_FIELDS, SEASONS } from '../config/cropRecommendationFields.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;

const formatNumber = (n) => n.toLocaleString('en-IN');

/** Validates one field. Returns an error message, or '' when the value is fine. */
export const validateField = (name, rawValue) => {
  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

  if (name === 'season') {
    if (!value) return 'Please choose a season.';
    return SEASONS.some((s) => s.value === value) ? '' : 'Please choose a season from the list.';
  }

  const field = NUMERIC_FIELDS.find((f) => f.name === name);
  if (!field) return '';
  if (value === '' || value === undefined || value === null) return `Please enter ${field.label.toLowerCase()}.`;
  if (!DECIMAL.test(String(value))) return 'Enter a number, for example 6.5 (digits and one decimal point only).';
  const num = Number(value);
  if (num < field.min || num > field.max) {
    return `Enter a value between ${formatNumber(field.min)} and ${formatNumber(field.max)}.`;
  }
  return '';
};

/** Returns { errors: {field: message}, isValid }. */
export const validateForm = (values) => {
  const errors = {};
  [...NUMERIC_FIELDS.map((f) => f.name), 'season'].forEach((name) => {
    const message = validateField(name, values[name]);
    if (message) errors[name] = message;
  });
  return { errors, isValid: Object.keys(errors).length === 0 };
};

/** Builds the API payload: numbers for numeric fields, season string. Call only after validateForm. */
export const toPayload = (values) => ({
  ...Object.fromEntries(NUMERIC_FIELDS.map((f) => [f.name, Number(String(values[f.name]).trim())])),
  season: values.season,
});
