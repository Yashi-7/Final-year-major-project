import { YEAR_MAX, YEAR_MIN } from '../config/yieldPredictionFields.js';

const WHOLE_NUMBER = /^\d{1,9}$/;

/**
 * Validates one field. `options` is the payload from /yield-prediction/options (may be null while loading).
 * Returns an error message or '' when fine.
 */
export const validateYieldField = (name, rawValue, values = {}, options = null) => {
  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

  if (name === 'year') {
    if (value === '' || value === undefined || value === null) return 'Please enter a year.';
    if (!WHOLE_NUMBER.test(String(value))) return 'Enter the year as a whole number, for example 2024.';
    const year = Number(value);
    const min = options?.years?.min ?? YEAR_MIN;
    const max = options?.years?.max ?? YEAR_MAX;
    return year < min || year > max ? `Enter a year between ${min} and ${max}.` : '';
  }

  const requiredMessage = { state: 'Please choose a state.', season: 'Please choose a season.', crop: 'Please choose a crop.' }[name];
  if (!requiredMessage) return '';
  if (!value) return requiredMessage;
  if (!options) return '';

  if (name === 'state') return options.states.includes(value) ? '' : 'Please choose a state from the list.';
  if (name === 'season') {
    return options.seasonsByState?.[values.state]?.includes(value) ? '' : 'Please choose a season from the list.';
  }
  return options.cropsByStateSeason?.[values.state]?.[values.season]?.includes(value)
    ? ''
    : 'Please choose a crop from the list.';
};

/** Returns { errors, isValid }. */
export const validateYieldForm = (values, options) => {
  const errors = {};
  ['state', 'season', 'crop', 'year'].forEach((name) => {
    const message = validateYieldField(name, values[name], values, options);
    if (message) errors[name] = message;
  });
  return { errors, isValid: Object.keys(errors).length === 0 };
};

/** API payload: exactly the four model features. Call only after validateYieldForm. */
export const toYieldPayload = (values) => ({
  state: values.state,
  season: values.season,
  crop: values.crop,
  year: Number(String(values.year).trim()),
});
