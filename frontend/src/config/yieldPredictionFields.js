// Form definition for Yield Prediction.
// YEAR_MIN / YEAR_MAX MUST match backend/src/config/yieldPredictionSchema.js and
// ml-service/yield_prediction/schema.json (verify: `node scripts/check-schema-sync.mjs`).
// The state / season / crop choices are NOT listed here: they are loaded from the trained model's own metadata
// via GET /api/farmer/yield-prediction/options, so the form can only offer what the model supports.
// Area and production are deliberately not inputs (yield = production / area, so they would leak the answer).

export const YEAR_MIN = 1997;
export const YEAR_MAX = 2030;

export const YIELD_FIELDS = {
  state: { label: 'State', helper: 'Choose the state where you will grow the crop.' },
  season: { label: 'Season', helper: 'Only seasons with data for the chosen state are listed.' },
  crop: { label: 'Crop', helper: 'Only crops with data for the chosen state and season are listed.' },
  year: { label: 'Year', helper: `Enter a year between ${YEAR_MIN} and ${YEAR_MAX}.` },
};

export const EMPTY_YIELD_FORM = { state: '', season: '', crop: '', year: '' };
