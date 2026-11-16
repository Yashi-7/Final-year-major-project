import { getFromMlService, MlServiceError, postToMlService } from './mlClient.js';

const invalid = (detail) =>
  new MlServiceError('ML_INVALID_RESPONSE', 502, 'The prediction service returned an unexpected response.', detail);

const SLUG = /^[a-z0-9-]{1,100}$/;
const isText = (v, max = 100) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Validates and rebuilds the Flask prediction response from whitelisted fields only. */
export const normalizePrediction = (body) => {
  const data = body?.success === true ? body.data : null;
  const value = data?.prediction?.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) {
    throw invalid('Invalid prediction value');
  }
  const i = data.inputs;
  if (!isPlainObject(i) || !isText(i.state) || !isText(i.season) || !isText(i.crop) || !isText(i.cropLabel)
      || !Number.isInteger(i.year) || typeof i.cropSlug !== 'string' || !SLUG.test(i.cropSlug)) {
    throw invalid('Invalid inputs echo');
  }
  const notice = typeof data.notice === 'string' && data.notice.length <= 400 ? data.notice : null;
  const dataNote = typeof data.dataNote === 'string' && data.dataNote.length <= 800 ? data.dataNote : null;
  return {
    prediction: { value },
    inputs: { state: i.state, season: i.season, crop: i.crop, year: i.year, cropLabel: i.cropLabel, cropSlug: i.cropSlug },
    notice,
    dataNote,
  };
};

/** Validates and rebuilds the Flask options response (form choices). */
export const normalizeOptions = (body) => {
  const d = body?.success === true ? body.data : null;
  if (!d || !isPlainObject(d.years) || !Array.isArray(d.states) || !isPlainObject(d.seasonsByState)
      || !isPlainObject(d.cropsByStateSeason) || !isPlainObject(d.cropLabels)) {
    throw invalid('Missing options fields');
  }
  const { min, max, trainedMin, trainedMax } = d.years;
  const scaleBreakYear = Number.isInteger(d.years.scaleBreakYear) ? d.years.scaleBreakYear : null;
  if (![min, max, trainedMin, trainedMax].every(Number.isInteger)) throw invalid('Invalid year range');
  if (d.states.length < 1 || d.states.length > 200 || !d.states.every((s) => isText(s))) throw invalid('Invalid states');

  const seasonsByState = {};
  const cropsByStateSeason = {};
  for (const state of d.states) {
    const seasons = d.seasonsByState[state];
    const cropMap = d.cropsByStateSeason[state];
    if (!Array.isArray(seasons) || !seasons.every((s) => isText(s)) || !isPlainObject(cropMap)) throw invalid(`Invalid seasons for ${state}`);
    seasonsByState[state] = seasons;
    const inner = {};
    for (const season of seasons) {
      const crops = cropMap[season];
      if (!Array.isArray(crops) || crops.length === 0 || !crops.every((c) => isText(c) && isText(d.cropLabels[c]))) {
        throw invalid(`Invalid crops for ${state}/${season}`);
      }
      inner[season] = crops;
    }
    cropsByStateSeason[state] = inner;
  }
  const used = new Set(Object.values(cropsByStateSeason).flatMap((m) => Object.values(m).flat()));
  const cropLabels = Object.fromEntries([...used].map((c) => [c, d.cropLabels[c]]));

  return { years: { min, max, trainedMin, trainedMax, scaleBreakYear }, states: d.states, seasonsByState, cropsByStateSeason, cropLabels };
};

export const getYieldPrediction = async (validatedInput, options) =>
  normalizePrediction(await postToMlService('/yield-prediction/predict', validatedInput, { ...options, passthroughValidation: true }));

export const getYieldOptions = async (options) =>
  normalizeOptions(await getFromMlService('/yield-prediction/options', options));
