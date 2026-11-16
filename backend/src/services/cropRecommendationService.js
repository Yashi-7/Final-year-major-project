import { MlServiceError, postToMlService } from './mlClient.js';

const ML_PATH = '/crop-recommendation/predict';
const SLUG = /^[a-z0-9-]{1,80}$/;

const invalid = (detail) =>
  new MlServiceError('ML_INVALID_RESPONSE', 502, 'The recommendation service returned an unexpected response.', detail);

/**
 * Checks the shape of the Flask response and rebuilds it from whitelisted fields,
 * so nothing unexpected (scores, internals) can be passed through to the browser.
 */
export const normalizeMlResponse = (body) => {
  if (!body || body.success !== true || !body.data || !Array.isArray(body.data.recommendations)) {
    throw invalid('Missing data.recommendations');
  }
  const list = body.data.recommendations;
  if (list.length < 1 || list.length > 10) throw invalid('Unexpected number of recommendations');

  const recommendations = list.map((item, index) => {
    const crop = typeof item?.crop === 'string' ? item.crop.trim() : '';
    if (!crop || crop.length > 80) throw invalid(`Invalid crop at index ${index}`);
    if (typeof item.slug !== 'string' || !SLUG.test(item.slug)) throw invalid(`Invalid slug at index ${index}`);
    return { rank: index + 1, crop, slug: item.slug };
  });

  const notice = typeof body.data.notice === 'string' && body.data.notice.length <= 300 ? body.data.notice : null;
  return { recommendations, notice };
};

/** Forwards already-validated input to Flask and returns { recommendations, notice }. */
export const getCropRecommendations = async (validatedInput, options) =>
  normalizeMlResponse(await postToMlService(ML_PATH, validatedInput, options));
