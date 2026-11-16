import express from 'express';
import governmentClaimManagementRepository from '../repositories/governmentClaimManagementRepository.js';
import { createGovernmentClaimService } from '../services/governmentClaimService.js';
import { createGovernmentClaimController } from '../controllers/governmentClaimController.js';
import { validateActionBody, validateClaimIdParam, validateListQuery, validateMapQuery } from '../validators/govClaimValidators.js';

const controller = createGovernmentClaimController({
  service: createGovernmentClaimService({ repository: governmentClaimManagementRepository }),
});

// Mounted by governmentRoutes.js AFTER its router-level authenticate + authorize('GOVERNMENT_OFFICIAL') guard.
// There is no delete route and no status-edit route: a claim's status can only change through /actions.
const router = express.Router();
router.get('/filters', controller.filters);                                                   // must stay above /:claimId
router.get('/map', validateMapQuery, controller.map);                                          // must stay above /:claimId
router.get('/', validateListQuery, controller.list);
router.get('/:claimId', validateClaimIdParam, controller.detail);
router.post('/:claimId/actions', validateClaimIdParam, validateActionBody, controller.action);

export default router;
