import { STATUS_META } from '../../config/fraConfig.js';

const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—';

const Label = ({ children }) => <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{children}</span>;

/** Complete audit trail for officials: what changed, who did it, when, and the internal remarks / reason given. */
const AuditTimeline = ({ history }) => {
  if (!history?.length) return <p className="text-sm text-gray-600">No history recorded.</p>;
  const last = history.length - 1;
  return (
    <ol className="relative flex flex-col gap-5 border-l-2 border-agri-100 pl-6" aria-label="Claim history" data-testid="audit-timeline">
      {history.map((h, i) => {
        const meta = STATUS_META[h.status] || { label: h.status, dot: 'bg-gray-400' };
        const prev = h.previousStatus ? STATUS_META[h.previousStatus]?.label || h.previousStatus : null;
        return (
          <li key={`${h.status}-${h.changedAt}-${i}`} className="relative" data-testid="audit-entry" aria-current={i === last ? 'step' : undefined}>
            <span aria-hidden="true" className={`absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-white ${meta.dot} ${i === last ? 'ring-4 ring-agri-200' : ''}`} />
            <p className="text-sm font-semibold text-gray-900">
              {h.actionLabel || meta.label}
              {i === last && <span className="ml-2 rounded-full bg-agri-100 px-2 py-0.5 text-[11px] font-semibold text-agri-700">Current</span>}
            </p>
            {prev && <p className="text-xs text-gray-600" data-testid="audit-transition">{prev} → {meta.label}</p>}
            <p className="text-xs text-gray-500">
              {formatDateTime(h.changedAt)}
              {h.changedByName ? <> · by <span className="font-medium text-gray-700" data-testid="audit-actor">{h.changedByName}</span></>
                : h.recordedByOfficial ? ' · by an official' : ''}
            </p>
            {h.rejectionReason && (
              <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="audit-reason"><Label>Reason (shown to the applicant)</Label><br />{h.rejectionReason}</p>
            )}
            {h.remarks && (
              <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700" data-testid="audit-remarks"><Label>Internal remarks (officials only)</Label><br />{h.remarks}</p>
            )}
            {h.note && <p className="mt-1 text-sm text-gray-700"><Label>Note</Label><br />{h.note}</p>}
          </li>
        );
      })}
    </ol>
  );
};

export default AuditTimeline;
