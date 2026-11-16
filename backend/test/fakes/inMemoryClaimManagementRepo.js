// In-memory stand-in for repositories/governmentClaimManagementRepository.js (MongoDB is not available in the sandbox
// where this was written). It uses the REAL composeScoped(), so a missing scope throws exactly as in production, and
// applyTransition is a real compare-and-set on the claim's status, like the atomic findOneAndUpdate.
import { composeScoped } from '../../src/utils/govClaimQuery.js';
import { matches } from './mongoMatch.js';

const clone = (x) => structuredClone(x);

export const createInMemoryClaimManagementRepo = (claims, { users = {}, now = () => new Date() } = {}) => {
  const calls = [];
  const withNames = (c) => {
    const out = clone(c);
    out.statusHistory = (out.statusHistory || []).map((h) => (h.changedBy && users[h.changedBy] ? { ...h, changedBy: { _id: h.changedBy, fullName: users[h.changedBy] } } : h));
    return out;
  };
  const sortBy = (sort) => (a, b) => {
    for (const [field, dir] of Object.entries(sort)) {
      const av = field === '_id' ? a._id : a[field], bv = field === '_id' ? b._id : b[field];
      const cmp = av instanceof Date || bv instanceof Date ? new Date(av) - new Date(bv) : String(av).localeCompare(String(bv));
      if (cmp) return cmp * dir;
    }
    return 0;
  };
  return {
    calls,
    claims,
    async list({ scope, clauses, sort, skip, limit }) {
      const filter = composeScoped(scope, clauses);
      calls.push(['list', filter]);
      const all = claims.filter((c) => matches(c, filter)).sort(sortBy(sort));
      return { items: all.slice(skip, skip + limit).map(clone), total: all.length };
    },
    async findOne({ scope, claimId }) {
      const filter = composeScoped(scope, [{ claimId }]);
      calls.push(['findOne', filter]);
      const c = claims.find((x) => matches(x, filter));
      return c ? withNames(c) : null;
    },
    async distinctDistricts({ scope }) {
      const filter = composeScoped(scope);
      calls.push(['distinct', filter]);
      return [...new Set(claims.filter((c) => matches(c, filter)).map((c) => c.location.district))];
    },
    async mapData({ scope, clauses, limit = 300 }) {
      const filter = composeScoped(scope, clauses);
      calls.push(['mapData', filter]);
      const all = claims.filter((c) => matches(c, filter)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return { items: all.slice(0, limit).map(clone), total: all.length, truncated: all.length > limit };
    },
    async applyTransition({ scope, claimId, expectedStatus, status, rejectionReason, entry }) {
      const filter = composeScoped(scope, [{ claimId }, { status: expectedStatus }]);
      calls.push(['applyTransition', filter]);
      const c = claims.find((x) => matches(x, filter));
      if (!c) return null;                                 // compare-and-set failed
      c.status = status;                                   // status + audit entry change together (one "write")
      if (rejectionReason) c.rejectionReason = rejectionReason;
      c.statusHistory.push(clone(entry));
      c.updatedAt = now();
      return withNames(c);
    },
  };
};
