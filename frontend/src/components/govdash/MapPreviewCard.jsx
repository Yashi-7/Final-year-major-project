import { Link } from 'react-router-dom';
import Icon from '../common/Icon.jsx';

/**
 * Placeholder for the future Government GIS Map. It shows only COUNTS of claims that have a recorded boundary
 * (no geometry is sent to the dashboard). The picture is decorative.
 */
const MapPreviewCard = ({ boundaries }) => {
  const { withBoundary, withoutBoundary, total } = boundaries;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl border border-dashed border-agri-200 bg-agri-50" aria-hidden="true">
        <svg viewBox="0 0 300 130" className="h-32 w-full" preserveAspectRatio="xMidYMid slice">
          <path d="M0 90 C60 60 110 110 170 80 S260 60 300 85 L300 130 L0 130Z" fill="#c2e0b6" opacity=".6" />
          <path d="M0 105 C70 85 120 125 190 100 S270 90 300 105 L300 130 L0 130Z" fill="#9bcb8b" opacity=".6" />
          <path d="M70 55 L105 40 L130 62 L98 78Z" fill="#63ad57" opacity=".7" stroke="#1c5c25" strokeWidth="1.5" />
          <path d="M190 35 L225 28 L238 52 L205 60Z" fill="#63ad57" opacity=".7" stroke="#1c5c25" strokeWidth="1.5" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-agri-800 shadow-card">
            <Icon name="map" className="h-4 w-4" /> Map preview (placeholder)
          </span>
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="boundary-counts">
        <div className="rounded-xl bg-agri-50 px-3 py-2">
          <dt className="text-xs text-gray-500">With a recorded boundary</dt>
          <dd className="text-lg font-semibold text-agri-800" data-testid="with-boundary">{withBoundary}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <dt className="text-xs text-gray-500">No boundary yet</dt>
          <dd className="text-lg font-semibold text-gray-700" data-testid="without-boundary">{withoutBoundary}</dd>
        </div>
      </dl>
      <p className="text-xs text-gray-500">
        {withBoundary} of {total} claims in your area have a boundary recorded. The interactive Government GIS Map is added in a later phase.
      </p>
      <Link to="/government/gis-map" className="text-sm font-medium text-agri-700 hover:underline">Go to Government GIS Map →</Link>
    </div>
  );
};

export default MapPreviewCard;
