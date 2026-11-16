import axiosClient from './axiosClient.js';

/**
 * POST /api/farmer/crop-recommendation (FARMER-only; the backend enforces the role).
 * Resolves to { recommendations: [{rank, crop, slug}], notice }.
 * Rejects with a CropRecommendationError carrying a farmer-friendly message.
 */
export class CropRecommendationError extends Error {
  constructor(message, { fieldErrors = {}, kind = 'unknown' } = {}) {
    super(message);
    this.name = 'CropRecommendationError';
    this.fieldErrors = fieldErrors; // {fieldName: message} when the server rejected specific inputs
    this.kind = kind; // 'validation' | 'auth' | 'service' | 'network' | 'unknown'
  }
}

export const toFriendlyError = (err) => {
  const status = err.response?.status;
  const data = err.response?.data;

  if (!err.response) {
    return new CropRecommendationError('Could not reach the server. Check your internet connection and try again.', { kind: 'network' });
  }
  if (status === 400 && Array.isArray(data?.errors)) {
    const fieldErrors = {};
    data.errors.forEach((e) => { if (e.field && !fieldErrors[e.field]) fieldErrors[e.field] = e.message; });
    return new CropRecommendationError('Some of your entries need attention. Please check the highlighted fields.', { fieldErrors, kind: 'validation' });
  }
  if (status === 401) {
    return new CropRecommendationError('Your session has expired. Please log in again.', { kind: 'auth' });
  }
  if (status === 403) {
    return new CropRecommendationError('Your account does not have access to Crop Recommendation.', { kind: 'auth' });
  }
  if (status >= 500) {
    return new CropRecommendationError(
      data?.message || 'We could not generate recommendations right now. Please try again in a moment.',
      { kind: 'service' }
    );
  }
  return new CropRecommendationError('Something went wrong. Please try again.');
};

export const requestCropRecommendation = async (payload, { signal } = {}) => {
  try {
    const res = await axiosClient.post('/farmer/crop-recommendation', payload, { signal });
    const data = res.data?.data;
    if (!res.data?.success || !Array.isArray(data?.recommendations)) {
      throw new CropRecommendationError('We received an unexpected response. Please try again.', { kind: 'service' });
    }
    return { recommendations: data.recommendations, notice: data.notice || null };
  } catch (err) {
    if (err instanceof CropRecommendationError) throw err;
    throw toFriendlyError(err);
  }
};
