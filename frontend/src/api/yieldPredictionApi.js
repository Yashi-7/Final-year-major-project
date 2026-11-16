import axiosClient from './axiosClient.js';

/**
 * Farmer-only Yield Prediction API (the backend enforces the FARMER role).
 * Errors are converted to YieldPredictionError with a farmer-friendly message.
 */
export class YieldPredictionError extends Error {
  constructor(message, { fieldErrors = {}, kind = 'unknown' } = {}) {
    super(message);
    this.name = 'YieldPredictionError';
    this.fieldErrors = fieldErrors; // { fieldName: message } for rejected inputs
    this.kind = kind; // 'validation' | 'auth' | 'service' | 'network' | 'unknown'
  }
}

export const toFriendlyYieldError = (err) => {
  const status = err.response?.status;
  const data = err.response?.data;

  if (!err.response) {
    return new YieldPredictionError('Could not reach the server. Check your internet connection and try again.', { kind: 'network' });
  }
  if (status === 400 && Array.isArray(data?.errors)) {
    const fieldErrors = {};
    data.errors.forEach((e) => { if (e.field && !fieldErrors[e.field]) fieldErrors[e.field] = e.message; });
    return new YieldPredictionError('Some of your choices need attention. Please check the highlighted fields.', { fieldErrors, kind: 'validation' });
  }
  if (status === 401) return new YieldPredictionError('Your session has expired. Please log in again.', { kind: 'auth' });
  if (status === 403) return new YieldPredictionError('Your account does not have access to Yield Prediction.', { kind: 'auth' });
  if (status >= 500) {
    return new YieldPredictionError(
      data?.message || 'We could not generate a prediction right now. Please try again in a moment.',
      { kind: 'service' }
    );
  }
  return new YieldPredictionError('Something went wrong. Please try again.');
};

/** Resolves to { prediction: { value }, inputs, notice, dataNote }. */
export const requestYieldPrediction = async (payload, { signal } = {}) => {
  try {
    const res = await axiosClient.post('/farmer/yield-prediction', payload, { signal });
    const data = res.data?.data;
    if (!res.data?.success || typeof data?.prediction?.value !== 'number' || !data?.inputs) {
      throw new YieldPredictionError('We received an unexpected response. Please try again.', { kind: 'service' });
    }
    return { prediction: data.prediction, inputs: data.inputs, notice: data.notice || null, dataNote: data.dataNote || null };
  } catch (err) {
    if (err instanceof YieldPredictionError) throw err;
    throw toFriendlyYieldError(err);
  }
};
