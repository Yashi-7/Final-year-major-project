// FRA Monitoring display configuration.
// CLAIM_ID_PATTERN and the status list MUST match backend/src/utils/fraClaimRules.js
// (verify: `node scripts/check-schema-sync.mjs`).
export const CLAIM_ID_PATTERN = /^FRA-[A-Z]{2}-\d{4}-[A-Z0-9]{6}$/;
export const CLAIM_ID_EXAMPLE = 'FRA-MP-2025-A7K2QX';

export const CLAIM_STATUSES = ['APPLICATION_RECEIVED', 'PENDING', 'UNDER_REVIEW', 'FORWARDED', 'APPROVED', 'REJECTED'];

export const STATUS_META = {
  APPLICATION_RECEIVED: { label: 'Application received', badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  UNDER_REVIEW: { label: 'Under review', badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  FORWARDED: { label: 'Forwarded', badge: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  APPROVED: { label: 'Approved', badge: 'bg-agri-100 text-agri-700', dot: 'bg-agri-500' },
  REJECTED: { label: 'Rejected', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
};

export const CLAIM_TYPE_LABELS = {
  IFR: 'Individual Forest Rights (IFR)',
  CR: 'Community Rights (CR)',
  CFR: 'Community Forest Resource Rights (CFR)',
};

export const DEMO_LABEL = 'Demo / Illustrative Data';
