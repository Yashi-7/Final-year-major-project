import express from 'express';
import authenticate from '../middleware/authMiddleware.js';
import authorize from '../middleware/roleMiddleware.js';
import { validateCropRecommendation } from '../validators/cropRecommendationValidator.js';
import { recommendCrops } from '../controllers/cropRecommendationController.js';
import { validateYieldPrediction } from '../validators/yieldPredictionValidator.js';
import { predictYield, yieldOptions } from '../controllers/yieldPredictionController.js';
import fraClaimRoutes from './fraClaimRoutes.js';

const router = express.Router();

// Every route below requires a valid session AND the FARMER role.
// A GOVERNMENT_OFFICIAL hitting these routes receives 403, regardless of
// what the frontend does.
router.use(authenticate, authorize('FARMER'));

router.get('/dashboard', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Farmer dashboard shell',
    data: {
      welcomeName: req.user.fullName,
      role: req.user.role,
      // Phase 1 placeholder only. Crop Recommendation, Yield Prediction,
      // and FRA Monitoring data are wired up in later phases.
      modules: [],
    },
  });
});

// Crop Recommendation (Phase 3). Order matters: the router-level authenticate + authorize('FARMER')
// above runs first, so unauthenticated callers get 401 and Government Officials get 403 before
// any validation or ML call happens. Then strict validation, then the Flask call.
router.post('/crop-recommendation', validateCropRecommendation, recommendCrops);

// Yield Prediction (Phase 4). Same protection as above: the router-level FARMER guard runs first.
router.get('/yield-prediction/options', yieldOptions);
router.post('/yield-prediction', validateYieldPrediction, predictYield);

// FRA Monitoring (Phase 5): reference-ID verification + the farmer's own claim. Same FARMER guard as above.
router.use('/fra', fraClaimRoutes);

export default router;
