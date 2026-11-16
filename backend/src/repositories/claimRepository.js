import Claim from '../models/Claim.js';

/**
 * Farmer-facing claim lookups. This is the ONLY data access used by the farmer FRA endpoints, and it is
 * deliberately tiny:
 *   - every query includes `farmer: <authenticated user id>`, so someone else's claim can never be returned
 *   - only findOne exists: there is no list / search / find-all here (and no such endpoint anywhere)
 *   - inputs must be plain strings, so operator objects such as { $ne: null } cannot reach the query
 */
const isText = (v) => typeof v === 'string' && v.length > 0;

const claimRepository = {
  async findOwnedByClaimId(claimId, farmerId) {
    if (!isText(claimId) || !isText(String(farmerId ?? ''))) return null;
    return Claim.findOne({ claimId, farmer: farmerId }).lean();
  },

  async findOwnedById(id, farmerId) {
    if (!isText(id) || !isText(String(farmerId ?? ''))) return null;
    return Claim.findOne({ _id: id, farmer: farmerId }).lean();
  },
};

export default claimRepository;
