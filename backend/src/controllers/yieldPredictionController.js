import { getYieldOptions, getYieldPrediction } from '../services/yieldPredictionService.js';
import { MlServiceError, MlValidationError } from '../services/mlClient.js';

const respondWithError = (error, res, next) => {
  if (error instanceof MlValidationError) {
    // The ML service knows which categories the model supports; its field errors are the farmer's to fix.
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.errors });
  }
  if (error instanceof MlServiceError) {
    console.error(`[yield-prediction] ${error.code}: ${error.message}`);
    return res.status(error.status).json({ success: false, code: error.code, message: error.publicMessage });
  }
  return next(error);
};

/** GET /api/farmer/yield-prediction/options : choices for the form, taken from the trained model's metadata. */
export const yieldOptions = async (req, res, next) => {
  try {
    const data = await getYieldOptions();
    return res.status(200).json({ success: true, message: 'Yield prediction options', data });
  } catch (error) {
    return respondWithError(error, res, next);
  }
};

/** POST /api/farmer/yield-prediction : runs after authenticate + authorize('FARMER') + validation. */
export const predictYield = async (req, res, next) => {
  try {
    const data = await getYieldPrediction(req.yieldInput);
    return res.status(200).json({ success: true, message: 'Yield prediction generated', data });
  } catch (error) {
    return respondWithError(error, res, next);
  }
};
