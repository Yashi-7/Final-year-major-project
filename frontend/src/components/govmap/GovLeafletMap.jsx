import { useMemo, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { STATUS_COLORS } from '../../config/govMapConfig.js';

/**
 * The ONLY file that imports Leaflet for the government map (lazily loaded via GovClaimsMap.jsx, so a map
 * problem can never break the rest of the page). Draws one GeoJSON layer per claim that has geometry, coloured
 * by status; clicking a shape selects that claim (the side panel is rendered by the parent).
 */
const GovLeafletMap = ({ claims, bounds, selectedId, onSelect }) => {
  const [tilesFailed, setTilesFailed] = useState(false);
  const withGeometry = useMemo(() => claims.filter((c) => c.geometry), [claims]);

  const styleFor = (claim) => {
    const color = STATUS_COLORS[claim.status] || '#6b7280';
    const selected = claim.claimId === selectedId;
    return { color, weight: selected ? 4 : 2, fillColor: color, fillOpacity: selected ? 0.5 : 0.3 };
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="isolate overflow-hidden rounded-xl border border-agri-100" role="region" aria-label="Map of authorized claims">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [32, 32] }} scrollWheelZoom className="z-0 h-[60vh] min-h-[360px] w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setTilesFailed(true), tileload: () => setTilesFailed(false) }}
          />
          {withGeometry.map((claim) => (
            <GeoJSON
              key={claim.claimId}
              data={claim.geometry}
              style={styleFor(claim)}
              eventHandlers={{ click: () => onSelect(claim.claimId) }}
              // react-leaflet's GeoJSON renders no DOM node of its own in production, so these two are inert
              // pass-through props there; they exist only so a test harness can identify which shape is which.
              data-claim-id={claim.claimId}
              data-status={claim.status}
            />
          ))}
        </MapContainer>
      </div>
      {tilesFailed && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The map background couldn’t be loaded (you may be offline). Claim boundaries are still shown.
        </p>
      )}
    </div>
  );
};

export default GovLeafletMap;
