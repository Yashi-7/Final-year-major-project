import { getCropRecommendations } from '../services/cropRecommendationService.js';
import { MlServiceError } from '../services/mlClient.js';

/**
 * POST /api/farmer/crop-recommendation
 * Runs after authenticate + authorize('FARMER') + validateCropRecommendation,
 * so req.cropInput is always a validated, whitelisted object.
 */
export const recommendCrops = async (req, res, next) => {
  try {
    const { recommendations, notice } = await getCropRecommendations(req.cropInput);
    return res.status(200).json({
      success: true,
      message: 'Crop recommendations generated',
      data: { recommendations, notice },
    });
  } catch (error) {
    if (error instanceof MlServiceError) {
      console.error(`[crop-recommendation] ${error.code}: ${error.message}`);
      return res.status(error.status).json({ success: false, code: error.code, message: error.publicMessage });
    }
    return next(error);
  }
};
