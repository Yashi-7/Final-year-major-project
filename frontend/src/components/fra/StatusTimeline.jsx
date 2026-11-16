import { STATUS_META } from '../../config/fraConfig.js';
import { formatDate } from './ClaimDetailsCard.jsx';

/** Timeline built only from the claim's recorded status history (oldest first). Nothing is invented. */
const StatusTimeline = ({ history }) => {
  if (!history?.length) {
    return <p className="text-sm text-gray-600">No status updates have been recorded yet.</p>;
  }
  const lastIndex = history.length - 1;

  return (
    <ol className="relative flex flex-col gap-5 border-l-2 border-agri-100 pl-6" aria-label="Status history">
      {history.map((h, i) => {
        const meta = STATUS_META[h.status] || { label: h.status, dot: 'bg-gray-400' };
        const current = i === lastIndex;
        return (
          <li key={`${h.status}-${h.changedAt}-${i}`} className="relative" aria-current={current ? 'step' : undefined}>
            <span
              aria-hidden="true"
              className={`absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-white ${meta.dot} ${current ? 'ring-4 ring-agri-200' : ''}`}
            />
            <div className="flex flex-wrap items-baseline gap-x-3">
              <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
              {current && <span className="rounded-full bg-agri-100 px-2 py-0.5 text-[11px] font-semibold text-agri-700">Current</span>}
            </div>
            <p className="text-xs text-gray-500">{formatDate(h.changedAt)}</p>
            {h.note && <p className="mt-1 text-sm text-gray-700">{h.note}</p>}
          </li>
        );
      })}
    </ol>
  );
};

export default StatusTimeline;
