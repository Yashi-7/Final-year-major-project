import { Link } from 'react-router-dom';
import Badge from '../common/Badge.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../fra/StatusBadge.jsx';
import { formatDate } from '../fra/ClaimDetailsCard.jsx';
import { CLAIM_TYPE_LABELS, DEMO_LABEL } from '../../config/fraConfig.js';

const Item = ({ label, children }) => (
  <div className="flex flex-col gap-0.5 py-1.5">
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="text-sm font-medium text-gray-900">{children || '—'}</dd>
  </div>
);

/**
 * Side panel shown when a claim on the map is clicked. Only the fields authorized for the map are available
 * (see backend toGovernmentMapItem): no applicant name, no committee metadata.
 */
const ClaimPanel = ({ claim, onClose }) => (
  <aside className="card flex flex-col gap-3 p-4" role="region" aria-label={`Details for claim ${claim.claimId}`} data-testid="claim-panel">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-agri-700">Claim</p>
        <h4 className="font-mono text-base font-bold text-agri-900" data-testid="panel-claim-id">{claim.claimId}</h4>
      </div>
      <button type="button" onClick={onClose} className="btn-secondary !px-2 !py-1 text-xs" aria-label="Close claim panel">Close</button>
    </div>

    {claim.isDemo && (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="panel-demo-badge">
        <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p><Badge tone="amber">{DEMO_LABEL}</Badge> This is a demo record for testing.</p>
      </div>
    )}

    <StatusBadge status={claim.status} />

    <dl>
      <Item label="Claim type">{CLAIM_TYPE_LABELS[claim.claimType] || claim.claimType}</Item>
      <Item label="Location">{[claim.village, claim.tehsil, claim.district, claim.state].filter(Boolean).join(', ')}</Item>
      <Item label="Last updated">{formatDate(claim.updatedAt)}</Item>
    </dl>

    <Link to={`/government/fra-claim-management?claimId=${encodeURIComponent(claim.claimId)}`} className="btn-primary justify-center" data-testid="panel-open-in-management">
      Open in Claim Management
    </Link>
  </aside>
);

export default ClaimPanel;
