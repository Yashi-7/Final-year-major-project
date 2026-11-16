import { useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * The ONLY file that imports Leaflet. It is loaded lazily (see FraClaimMap.jsx), so a map problem can never
 * break the rest of the page. It draws just the one claim boundary it is given; no markers, no other layers.
 */
const LeafletMap = ({ geometry, bounds, claimId }) => {
  const [tilesFailed, setTilesFailed] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="isolate overflow-hidden rounded-xl border border-agri-100" role="region" aria-label={`Map showing the boundary of claim ${claimId}`}>
        <MapContainer bounds={bounds} boundsOptions={{ padding: [28, 28] }} scrollWheelZoom={false} className="z-0 h-72 w-full sm:h-96">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setTilesFailed(true), tileload: () => setTilesFailed(false) }}
          />
          <GeoJSON
            key={claimId}
            data={geometry}
            style={{ color: '#1c5c25', weight: 2, fillColor: '#63ad57', fillOpacity: 0.35 }}
          />
        </MapContainer>
      </div>
      {tilesFailed && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The map background couldn’t be loaded (you may be offline). The claim boundary is still shown.
        </p>
      )}
    </div>
  );
};

export default LeafletMap;
