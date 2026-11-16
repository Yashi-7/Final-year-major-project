import express from 'express';
import claimRepository from '../repositories/claimRepository.js';
import { createFraClaimService } from '../services/fraClaimService.js';
import { createFraClaimController } from '../controllers/fraClaimController.js';
import { createFailureLimiter } from '../utils/failureLimiter.js';
import { validateFraVerify, validateFraView } from '../validators/fraValidators.js';

const envInt = (name, fallback) => {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const controller = createFraClaimController({
  service: createFraClaimService({ repository: claimRepository }),
  limiter: createFailureLimiter({
    max: envInt('FRA_VERIFY_MAX_FAILURES', 8),
    windowMs: envInt('FRA_VERIFY_WINDOW_MINUTES', 15) * 60 * 1000,
  }),
});

// Mounted by farmerRoutes.js AFTER its router-level authenticate + authorize('FARMER') guard.
// These are the only FRA endpoints; there is intentionally no list / search / "all claims" route.
const router = express.Router();
router.post('/verify', validateFraVerify, controller.verify);
router.post('/claim', validateFraView, controller.view);

export default router;
