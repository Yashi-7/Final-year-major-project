import Badge from '../common/Badge.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from './StatusBadge.jsx';
import { CLAIM_TYPE_LABELS, DEMO_LABEL } from '../../config/fraConfig.js';

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const Item = ({ label, children }) => (
  <div className="flex flex-col gap-0.5 border-b border-agri-100 py-2.5 sm:border-b-0">
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="text-sm font-medium text-gray-900">{children || '—'}</dd>
  </div>
);

const ClaimDetailsCard = ({ claim }) => {
  const { applicant, location, jurisdiction } = claim;
  const place = [location.village, location.tehsil].filter(Boolean).join(', ');

  return (
    <article className="card overflow-hidden" aria-label="Claim details">
      {claim.isDemo }

      <div className="flex flex-col gap-3 bg-gradient-to-br from-agri-50 to-agri-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-agri-700">Claim reference ID</p>
          <h3 className="mt-1 font-mono text-xl font-bold tracking-wide text-agri-900 sm:text-2xl" data-testid="claim-id">{claim.claimId}</h3>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Current status</span>
          <StatusBadge status={claim.status} />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {claim.status === 'REJECTED' && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" data-testid="rejection-reason">
            <p className="text-sm font-semibold text-red-800">Reason for rejection</p>
            <p className="mt-1 text-sm text-red-700">{claim.rejectionReason || 'No reason has been recorded.'}</p>
          </div>
        )}

        <dl className="grid gap-x-6 sm:grid-cols-2">
          <Item label="Claim type">{CLAIM_TYPE_LABELS[claim.claimType] || claim.claimType}</Item>
          <Item label="Claimed area">{location.claimedAreaHectares != null ? `${location.claimedAreaHectares} hectares` : null}</Item>
          <Item label="Applicant">{applicant.fullName}</Item>
          <Item label="Village / tehsil">{place || applicant.village}</Item>
          <Item label="Gram Panchayat">{location.gramPanchayat}</Item>
          <Item label="District, state">{[location.district, location.state].filter(Boolean).join(', ')}</Item>
          <Item label="Gram Sabha">{jurisdiction.gramSabha}</Item>
          <Item label="Sub-divisional committee">{jurisdiction.subDivisionalCommittee}</Item>
          <Item label="District committee">{jurisdiction.districtCommittee}</Item>
          <Item label="Application date">{formatDate(claim.submittedAt)}</Item>
          <Item label="Last updated">{formatDate(claim.updatedAt)}</Item>
        </dl>
      </div>
    </article>
  );
};

export default ClaimDetailsCard;
