import Claim from '../models/Claim.js';
import { recentEventsPipeline, statusMatrixPipeline } from './governmentClaimPipelines.js';

/**
 * Read-only, aggregate-only access for the government dashboard. Callers pass the jurisdiction filter built from
 * the authenticated official's record; it is the first stage of each pipeline (see governmentClaimPipelines.js).
 * No method returns whole claim documents.
 */
const governmentClaimRepository = {
  statusMatrix: (scopeFilter) => Claim.aggregate(statusMatrixPipeline(scopeFilter)),
  recentEvents: (scopeFilter, dataSource, limit) => Claim.aggregate(recentEventsPipeline(scopeFilter, dataSource, limit)),
};

export default governmentClaimRepository;
