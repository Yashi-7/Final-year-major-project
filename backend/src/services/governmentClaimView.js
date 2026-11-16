import { validateGeoJsonGeometry } from '../utils/fraClaimRules.js';
import { getAllowedActions, WORKFLOW_ACTIONS } from '../utils/claimWorkflow.js';

const validGeometry = (g) => (g && validateGeoJsonGeometry(g).valid ? { type: g.type, coordinates: g.coordinates } : null);

const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v : null);
const plain = (c) => (typeof c?.toObject === 'function' ? c.toObject() : c);

/**
 * One claim for the GIS map. Deliberately minimal: no applicant name, no jurisdiction/committee metadata, no
 * owner (farmer) id, no _id, no history. `geometry` is null unless it passes validation again here (defence in
 * depth: even a bad value stored in the database is never sent to the browser).
 */
export const toGovernmentMapItem = (claim) => {
  const c = plain(claim);
  return {
    claimId: c.claimId,
    claimType: c.claimType,
    status: c.status,
    state: str(c.location?.state),
    district: str(c.location?.district),
    tehsil: str(c.location?.tehsil),
    village: str(c.location?.village),
    submittedAt: iso(c.submittedAt),
    updatedAt: iso(c.updatedAt),
    dataSource: c.dataSource,
    isDemo: c.dataSource === 'DEMO',
    geometry: validGeometry(c.geometry),
  };
};

/** One row of the claim table. Whitelisted: no owner (farmer) id, no _id, no history. */
export const toGovernmentListItem = (claim) => {
  const c = plain(claim);
  return {
    claimId: c.claimId,
    applicantName: str(c.applicant?.fullName),
    applicantVillage: str(c.applicant?.village),
    claimType: c.claimType,
    state: str(c.location?.state),
    district: str(c.location?.district),
    village: str(c.location?.village),
    status: c.status,
    submittedAt: iso(c.submittedAt),
    updatedAt: iso(c.updatedAt),
    dataSource: c.dataSource,
    isDemo: c.dataSource === 'DEMO',
  };
};

// Only the official's display name is exposed for who acted (never email, id or role).
const actorName = (changedBy) => (changedBy && typeof changedBy === 'object' && typeof changedBy.fullName === 'string' ? changedBy.fullName : null);

/**
 * Full claim detail for an official inside the claim's jurisdiction, including the audit trail and the actions the
 * workflow currently allows. The farmer's identity and the map geometry (authorized here) are handled deliberately:
 * the farmer id is never sent; geometry is sent only if it is valid.
 */
export const toGovernmentClaimDetail = (claim) => {
  const c = plain(claim);
  const history = [...(Array.isArray(c.statusHistory) ? c.statusHistory : [])].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
  const l = c.location || {};
  const j = c.jurisdiction || {};
  return {
    ...toGovernmentListItem(c),
    tehsil: str(l.tehsil),
    gramPanchayat: str(l.gramPanchayat),
    claimedAreaHectares: Number.isFinite(l.claimedAreaHectares) ? l.claimedAreaHectares : null,
    jurisdiction: { gramSabha: str(j.gramSabha), subDivisionalCommittee: str(j.subDivisionalCommittee), districtCommittee: str(j.districtCommittee) },
    rejectionReason: c.status === 'REJECTED' ? str(c.rejectionReason) : null,
    geometry: c.geometry && validateGeoJsonGeometry(c.geometry).valid ? { type: c.geometry.type, coordinates: c.geometry.coordinates } : null,
    allowedActions: getAllowedActions(c.status),
    statusHistory: history.map((h) => ({
      status: h.status,
      previousStatus: h.previousStatus || null,
      action: h.action || null,
      actionLabel: h.action && WORKFLOW_ACTIONS[h.action] ? WORKFLOW_ACTIONS[h.action].label : null,
      remarks: str(h.remarks),
      rejectionReason: str(h.rejectionReason),
      changedAt: iso(h.changedAt),
      changedByName: actorName(h.changedBy),
      recordedByOfficial: Boolean(h.changedBy),
      note: str(h.publicNote),
    })),
  };
};
