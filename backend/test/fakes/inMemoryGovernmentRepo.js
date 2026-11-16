// In-memory stand-in for repositories/governmentClaimRepository.js (MongoDB is not available in the sandbox where
// this was written). It computes the same rows the aggregation pipelines describe, from an array of claims.
import { matches } from './mongoMatch.js';

export const createInMemoryGovernmentRepo = (claims) => {
  const calls = [];
  return {
    calls,
    async statusMatrix(scopeFilter) {
      calls.push(['statusMatrix', scopeFilter]);
      const groups = new Map();
      for (const c of claims.filter((x) => matches(x, scopeFilter))) {
        const key = JSON.stringify([c.dataSource, c.location.district, c.status]);
        const g = groups.get(key) || { dataSource: c.dataSource, district: c.location.district, status: c.status, count: 0, withBoundary: 0, oldestSubmittedAt: null };
        g.count += 1;
        if (c.geometry && typeof c.geometry === 'object') g.withBoundary += 1;
        if (!g.oldestSubmittedAt || c.submittedAt < g.oldestSubmittedAt) g.oldestSubmittedAt = c.submittedAt;
        groups.set(key, g);
      }
      return [...groups.values()];
    },
    async recentEvents(scopeFilter, dataSource, limit) {
      calls.push(['recentEvents', scopeFilter, dataSource, limit]);
      return claims
        .filter((x) => matches(x, { $and: [scopeFilter, { dataSource }] }))
        .flatMap((c) => c.statusHistory.map((h) => ({
          claimId: c.claimId, district: c.location.district, village: c.location.village,
          status: h.status, changedAt: h.changedAt, note: h.publicNote ?? null,
        })))
        .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt) || a.claimId.localeCompare(b.claimId))
        .slice(0, limit);
    },
  };
};
