import { Link } from 'react-router-dom';
import EmptyState from '../common/EmptyState.jsx';
import StatusBadge from '../fra/StatusBadge.jsx';
import { formatDate } from '../fra/ClaimDetailsCard.jsx';

const RecentActivity = ({ items }) => {
  if (!items?.length) {
    return <EmptyState icon="activity" title="No recent activity" description="Status changes on claims in your area will be listed here." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-agri-100" aria-label="Recent workflow activity">
        {items.map((e, i) => (
          <li key={`${e.claimId}-${e.status}-${e.changedAt}-${i}`} className="flex flex-col gap-1 py-3 first:pt-0" data-testid="activity-item">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-agri-900">{e.claimId}</span>
              <StatusBadge status={e.status} />
            </div>
            <p className="text-xs text-gray-500">
              {[e.village, e.district].filter(Boolean).join(', ') || 'Location not recorded'} · {formatDate(e.changedAt)}
            </p>
            {e.note && <p className="text-sm text-gray-700">{e.note}</p>}
          </li>
        ))}
      </ul>
      <Link to="/government/fra-claim-management" className="text-sm font-medium text-agri-700 hover:underline">
        Open FRA Claim Management (available in a later phase) →
      </Link>
    </div>
  );
};

export default RecentActivity;
