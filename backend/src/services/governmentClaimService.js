import { CLAIM_STATUSES, CLAIM_TYPES, DATA_SOURCES } from '../utils/fraClaimRules.js';
import { buildClaimScopeFilter, describeArea, normalizeAreas } from '../utils/jurisdiction.js';
import { buildListClauses, buildSort } from '../utils/govClaimQuery.js';
import { getAllowedActions, resolveTransition } from '../utils/claimWorkflow.js';
import { toGovernmentClaimDetail, toGovernmentListItem, toGovernmentMapItem } from './governmentClaimView.js';

/**
 * Government claim management. Framework- and database-free (repository and clock are injected).
 *
 * SECURITY: the ONLY identity input is the authenticated user. The jurisdiction filter comes from that user's stored
 * record and is passed to every repository call. A user without a jurisdiction can read and change nothing.
 * Result objects use { ok: true, ... } or { ok: false, reason } and the controller turns reasons into HTTP statuses.
 */
export const createGovernmentClaimService = ({ repository, now = () => Date.now() }) => {
  const resolveScope = (user) => {
    const areas = normalizeAreas(user?.jurisdiction?.areas);
    return { areas, filter: buildClaimScopeFilter(areas) };
  };
  const scopeInfo = (areas) => ({ assigned: areas.length > 0, areas: areas.map((a) => ({ ...a, label: describeArea(a) })) });

  return {
    async list({ user, query }) {
      const { areas, filter } = resolveScope(user);
      const pagination = { page: query.page, limit: query.limit, total: 0, totalPages: 0 };
      if (!filter) return { scope: scopeInfo(areas), items: [], pagination };

      const { items, total } = await repository.list({
        scope: filter,
        clauses: buildListClauses(query),
        sort: buildSort(query),
        skip: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      return {
        scope: scopeInfo(areas),
        items: items.map(toGovernmentListItem),
        pagination: { ...pagination, total, totalPages: Math.ceil(total / query.limit) },
      };
    },

    /**
     * Claims for the GIS map: same jurisdiction scoping and filters as list(), but a smaller field set and a hard
     * result cap instead of pagination (a map draws everything in view rather than one page at a time).
     */
    async mapData({ user, query }) {
      const { areas, filter } = resolveScope(user);
      if (!filter) return { scope: scopeInfo(areas), claims: [], meta: { total: 0, shown: 0, withGeometry: 0, withoutGeometry: 0, truncated: false } };

      const { items, total, truncated } = await repository.mapData({ scope: filter, clauses: buildListClauses(query) });
      const claims = items.map(toGovernmentMapItem);
      const withGeometry = claims.filter((c) => c.geometry !== null).length;
      return {
        scope: scopeInfo(areas),
        claims,
        meta: { total, shown: claims.length, withGeometry, withoutGeometry: claims.length - withGeometry, truncated },
      };
    },

    /** Choices for the filter controls, taken from the official's own scope only. */
    async filterOptions({ user }) {
      const { areas, filter } = resolveScope(user);
      const districts = filter ? (await repository.distinctDistricts({ scope: filter })).filter((d) => typeof d === 'string' && d).sort((a, b) => a.localeCompare(b)) : [];
      return { scope: scopeInfo(areas), districts, statuses: CLAIM_STATUSES, claimTypes: CLAIM_TYPES, dataSources: DATA_SOURCES };
    },

    async getClaim({ user, claimId }) {
      const { filter } = resolveScope(user);
      if (!filter) return { ok: false, reason: 'NO_JURISDICTION' };
      const claim = await repository.findOne({ scope: filter, claimId });
      // Not found and "outside your jurisdiction" are the same answer.
      if (!claim) return { ok: false, reason: 'NOT_FOUND' };
      return { ok: true, claim: toGovernmentClaimDetail(claim) };
    },

    async performAction({ user, claimId, input }) {
      const { filter } = resolveScope(user);
      if (!filter) return { ok: false, reason: 'NO_JURISDICTION' };

      const claim = await repository.findOne({ scope: filter, claimId });
      if (!claim) return { ok: false, reason: 'NOT_FOUND' };

      // The official must be acting on the state they saw.
      if (claim.status !== input.expectedStatus) return { ok: false, reason: 'STATE_CHANGED', currentStatus: claim.status };

      const t = resolveTransition(claim.status, input.action);
      if (!t.ok) {
        if (t.reason === 'UNKNOWN_ACTION') return { ok: false, reason: 'VALIDATION', errors: [{ field: 'action', message: 'Unknown action.' }] };
        return { ok: false, reason: 'INVALID_TRANSITION', currentStatus: claim.status, allowedActions: getAllowedActions(claim.status) };
      }
      const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null;
      if (t.requiresReason && !reason) return { ok: false, reason: 'VALIDATION', errors: [{ field: 'reason', message: 'A reason is required to reject a claim.' }] };
      if (!t.requiresReason && reason) return { ok: false, reason: 'VALIDATION', errors: [{ field: 'reason', message: 'A reason can only be given when rejecting a claim.' }] };

      const entry = {
        status: t.toStatus,
        previousStatus: claim.status,
        action: input.action,
        remarks: input.remarks || null,
        rejectionReason: reason,
        changedBy: user._id,
        changedAt: new Date(now()),
        publicNote: null,
      };
      const updated = await repository.applyTransition({
        scope: filter, claimId, expectedStatus: claim.status, status: t.toStatus, rejectionReason: reason, entry,
      });
      if (!updated) return { ok: false, reason: 'STATE_CHANGED', currentStatus: null };
      return { ok: true, claim: toGovernmentClaimDetail(updated) };
    },
  };
};
