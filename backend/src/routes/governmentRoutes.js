import express from 'express';
import authenticate from '../middleware/authMiddleware.js';
import authorize from '../middleware/roleMiddleware.js';
import governmentClaimRepository from '../repositories/governmentClaimRepository.js';
import { createGovernmentDashboardService } from '../services/governmentDashboardService.js';
import { createGovernmentDashboardController } from '../controllers/governmentDashboardController.js';
import governmentClaimRoutes from './governmentClaimRoutes.js';

const router = express.Router();

// Every route below requires a valid session AND the GOVERNMENT_OFFICIAL role.
// A FARMER hitting these routes receives 403, regardless of what the
// frontend does.
router.use(authenticate, authorize('GOVERNMENT_OFFICIAL'));

router.get('/dashboard', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Government dashboard shell',
    data: {
      welcomeName: req.user.fullName,
      role: req.user.role,
      // Phase 1 placeholder only. Claim management, GIS mapping, and
      // agriculture intelligence data are wired up in later phases.
      modules: [],
    },
  });
});

// Phase 6: dashboard summary, limited to the claims inside the logged-in official's jurisdiction.
// No query parameters are read; the scope is derived from req.user only.
const dashboard = createGovernmentDashboardController({
  service: createGovernmentDashboardService({ repository: governmentClaimRepository }),
});
router.get('/dashboard/summary', dashboard.summary);

// Phase 7: claim management (list, details, workflow actions), always limited to the official's jurisdiction.
router.use('/claims', governmentClaimRoutes);

export default router;
