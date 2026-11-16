import Claim from '../models/Claim.js';
import { composeScoped } from '../utils/govClaimQuery.js';

/**
 * Government claim management data access. EVERY method takes the official's jurisdiction filter (`scope`) and
 * builds its filter through composeScoped(), which throws if the scope is missing. Nothing here can return,
 * count or modify a claim outside the jurisdiction, and there is no "find all" or delete.
 */
const LIST_FIELDS = 'claimId applicant.fullName applicant.village claimType location.state location.district location.village status submittedAt updatedAt dataSource';
// Map fields are deliberately narrower than the list: no applicant name/village (not needed to show a boundary or
// a popup), no committee/jurisdiction metadata. Only geometry (validated again in the service) is added.
const MAP_FIELDS = 'claimId claimType location.state location.district location.village location.tehsil status submittedAt updatedAt dataSource geometry';
export const MAP_RESULT_CAP = 300;
const withActorNames = { path: 'statusHistory.changedBy', select: 'fullName' };

const governmentClaimManagementRepository = {
  async list({ scope, clauses, sort, skip, limit }) {
    const filter = composeScoped(scope, clauses);
    const [items, total] = await Promise.all([
      Claim.find(filter).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
      Claim.countDocuments(filter),
    ]);
    return { items, total };
  },

  findOne({ scope, claimId }) {
    return Claim.findOne(composeScoped(scope, [{ claimId }])).populate(withActorNames).lean();
  },

  distinctDistricts({ scope }) {
    return Claim.distinct('location.district', composeScoped(scope));
  },

  /** Capped, field-limited claims for the map. `limit` must be <= MAP_RESULT_CAP; the caller decides ordering needs. */
  async mapData({ scope, clauses, limit = MAP_RESULT_CAP }) {
    const filter = composeScoped(scope, clauses);
    const cappedLimit = Math.min(limit, MAP_RESULT_CAP);
    const [items, total] = await Promise.all([
      Claim.find(filter).select(MAP_FIELDS).sort({ updatedAt: -1, _id: -1 }).limit(cappedLimit + 1).lean(),
      Claim.countDocuments(filter),
    ]);
    return { items: items.slice(0, cappedLimit), total, truncated: items.length > cappedLimit };
  },

  /**
   * ATOMIC single-document update: status change + audit entry in ONE write, guarded by a compare-and-set on the
   * status the caller saw (plus claimId and jurisdiction). Returns the updated claim, or null if nothing matched
   * (someone else changed the claim first, or it is outside the scope).
   */
  applyTransition({ scope, claimId, expectedStatus, status, rejectionReason, entry }) {
    const filter = composeScoped(scope, [{ claimId }, { status: expectedStatus }]);
    const $set = { status, ...(rejectionReason ? { rejectionReason } : {}) };
    return Claim.findOneAndUpdate(filter, { $set, $push: { statusHistory: entry } }, { new: true }).populate(withActorNames).lean();
  },
};

export default governmentClaimManagementRepository;
