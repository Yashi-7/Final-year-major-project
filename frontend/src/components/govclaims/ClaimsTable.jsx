import Badge from '../common/Badge.jsx';
import StatusBadge from '../fra/StatusBadge.jsx';
import { formatDate } from '../fra/ClaimDetailsCard.jsx';
import { CLAIM_TYPE_LABELS, DEMO_LABEL } from '../../config/fraConfig.js';

const TH = ({ children, className = '' }) => (
  <th scope="col" className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>{children}</th>
);

const ClaimsTable = ({ items, onOpen }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-agri-100 text-sm" aria-label="Claims in your area" data-testid="claims-table">
      <thead className="bg-agri-50/60">
        <tr>
          <TH>Claim ID</TH>
          <TH>Applicant</TH>
          <TH className="hidden md:table-cell">Claim type</TH>
          <TH className="hidden sm:table-cell">District</TH>
          <TH>Status</TH>
          <TH className="hidden lg:table-cell">Last updated</TH>
          <TH><span className="sr-only">Action</span></TH>
        </tr>
      </thead>
      <tbody className="divide-y divide-agri-100 bg-white">
        {items.map((c) => (
          <tr key={c.claimId} data-testid="claim-row" data-claim-id={c.claimId} className="hover:bg-agri-50/40">
            <td className="whitespace-nowrap px-4 py-3">
              <span className="font-mono text-sm font-semibold text-agri-900">{c.claimId}</span>
              {c.isDemo && <div className="mt-1"><Badge tone="amber">{DEMO_LABEL}</Badge></div>}
            </td>
            <td className="px-4 py-3">
              <div className="font-medium text-gray-900">{c.applicantName || '—'}</div>
              {c.applicantVillage && <div className="text-xs text-gray-500">{c.applicantVillage}</div>}
            </td>
            <td className="hidden px-4 py-3 md:table-cell" title={CLAIM_TYPE_LABELS[c.claimType]}>{c.claimType}</td>
            <td className="hidden px-4 py-3 sm:table-cell">{c.district || '—'}</td>
            <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={c.status} /></td>
            <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 lg:table-cell">{formatDate(c.updatedAt)}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right">
              <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={(e) => onOpen(c.claimId, e.currentTarget)} aria-label={`View claim ${c.claimId}`}>
                View
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ClaimsTable;
