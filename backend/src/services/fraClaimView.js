import { validateGeoJsonGeometry } from '../utils/fraClaimRules.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v : null);

/**
 * The ONLY shape in which a claim leaves the server for a farmer. It is built field by field (a whitelist),
 * so internal or future fields (farmer id, _id, changedBy, internal notes, ...) can never leak by accident.
 */
export const toFarmerClaimView = (claim) => {
  const c = typeof claim?.toObject === 'function' ? claim.toObject() : claim;
  const history = Array.isArray(c.statusHistory) ? [...c.statusHistory] : [];
  history.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

  const geometryOk = c.geometry && validateGeoJsonGeometry(c.geometry).valid;
  const l = c.location || {};
  const j = c.jurisdiction || {};

  return {
    claimId: c.claimId,
    claimType: c.claimType,
    status: c.status,
    rejectionReason: c.status === 'REJECTED' ? str(c.rejectionReason) : null,
    submittedAt: iso(c.submittedAt),
    updatedAt: iso(c.updatedAt),
    applicant: { fullName: str(c.applicant?.fullName), village: str(c.applicant?.village) },
    location: {
      state: str(l.state), district: str(l.district), tehsil: str(l.tehsil), village: str(l.village),
      gramPanchayat: str(l.gramPanchayat),
      claimedAreaHectares: Number.isFinite(l.claimedAreaHectares) ? l.claimedAreaHectares : null,
    },
    jurisdiction: {
      gramSabha: str(j.gramSabha), subDivisionalCommittee: str(j.subDivisionalCommittee), districtCommittee: str(j.districtCommittee),
    },
    statusHistory: history.map((h) => ({ status: h.status, changedAt: iso(h.changedAt), note: str(h.publicNote) })),
    geometry: geometryOk ? { type: c.geometry.type, coordinates: c.geometry.coordinates } : null,
    dataSource: c.dataSource,
    isDemo: c.dataSource === 'DEMO',
  };
};
