// Input contract for Yield Prediction.
// MUST match ml-service/yield_prediction/schema.json and frontend/src/config/yieldPredictionFields.js
// (verify: `node scripts/check-schema-sync.mjs`).
// State / season / crop membership is NOT duplicated here: the ML service owns the list of categories the
// trained model supports and answers with a validation error for anything else.
// Production and area are deliberately not accepted (yield = production / area, so they would leak the target).
export const YIELD_FEATURES = ['state', 'season', 'crop', 'year'];
export const YEAR_MIN = 1997;
export const YEAR_MAX = 2030;
export const MAX_TEXT_LENGTH = 100;
