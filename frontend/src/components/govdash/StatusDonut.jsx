import { CLAIM_STATUSES, STATUS_META } from '../../config/fraConfig.js';
import { STATUS_COLORS } from '../../config/govDashboardConfig.js';

const R = 42;
const C = 2 * Math.PI * R;

/**
 * Claim-status distribution as an accessible SVG donut plus a legend with counts and percentages.
 * (Plain SVG instead of a charting library: nothing to install, and the numbers are also present as text.)
 */
const StatusDonut = ({ byStatus, total }) => {
  const rows = CLAIM_STATUSES.map((s) => ({ status: s, count: byStatus[s] || 0 }));
  const pct = (n) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const summary = total > 0
    ? `Claim status distribution, ${total} claims: ${rows.map((r) => `${STATUS_META[r.status].label} ${r.count}`).join(', ')}.`
    : 'No claims to chart.';

  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0" role="img" aria-label={summary} data-testid="status-donut">
        <g transform="rotate(-90 60 60)" fill="none" strokeWidth="16">
          <circle cx="60" cy="60" r={R} stroke="#eef5ea" />
          {total > 0 && rows.filter((r) => r.count > 0).map((r) => {
            const len = (r.count / total) * C;
            const seg = (
              <circle
                key={r.status} cx="60" cy="60" r={R} stroke={STATUS_COLORS[r.status]}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                data-testid="donut-segment" data-status={r.status} data-count={r.count}
              />
            );
            offset += len;
            return seg;
          })}
        </g>
        <text x="60" y="61" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f3616" aria-hidden="true">{total}</text>
        <text x="60" y="75" textAnchor="middle" fontSize="8" fill="#6b7280" aria-hidden="true">claims</text>
      </svg>

      <ul className="grid w-full gap-2 text-sm" aria-label="Claim status legend">
        {rows.map((r) => (
          <li key={r.status} className="flex items-center justify-between gap-3" data-testid="legend-row" data-status={r.status}>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[r.status] }} aria-hidden="true" />
              <span className="text-gray-800">{STATUS_META[r.status].label}</span>
            </span>
            <span className="tabular-nums text-gray-600">
              <span className="font-semibold text-gray-900" data-testid="legend-count">{r.count}</span>
              <span className="ml-2 text-xs">{pct(r.count)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StatusDonut;
