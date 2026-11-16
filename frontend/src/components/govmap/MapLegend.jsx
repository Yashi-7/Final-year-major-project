import { STATUS_META, STATUS_COLORS } from '../../config/govMapConfig.js';
import { CLAIM_STATUSES } from '../../config/fraConfig.js';

/** Always-visible key for the status colours used on the map. */
const MapLegend = () => (
  <div className="card p-3" aria-label="Map legend" data-testid="map-legend">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Legend</p>
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {CLAIM_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-xs text-gray-700" data-testid="legend-item" data-status={status}>
          <span className="h-3 w-3 shrink-0 rounded-full border border-white shadow" style={{ backgroundColor: STATUS_COLORS[status] }} aria-hidden="true" />
          {STATUS_META[status].label}
        </li>
      ))}
    </ul>
  </div>
);

export default MapLegend;
