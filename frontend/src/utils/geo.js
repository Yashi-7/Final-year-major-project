// GeoJSON helpers for the claim map. The server already validates geometry before sending it; this is a second,
// defensive check so a bad boundary shows a clear message instead of breaking the map.
// Must agree with backend/src/utils/fraClaimRules.js (checked by `node scripts/check-schema-sync.mjs`).

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPosition = (p) =>
  Array.isArray(p) && p.length >= 2 && p.length <= 3 && p.every(isNum) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;

const validRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isPosition)) return false;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1];
};
const validPolygon = (rings) => Array.isArray(rings) && rings.length >= 1 && rings.every(validRing);

export const isValidGeometry = (g) => {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
  if (g.type === 'Polygon') return validPolygon(g.coordinates);
  if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) && g.coordinates.length >= 1 && g.coordinates.every(validPolygon);
  return false;
};

const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/** Bounding box as [[south, west], [north, east]] (Leaflet's [lat, lng] order), or null for invalid geometry. */
export const geometryBounds = (g) => {
  if (!isValidGeometry(g)) return null;
  let south = 90; let north = -90; let west = 180; let east = -180;
  polygons(g).forEach((rings) => rings.forEach((ring) => ring.forEach(([lng, lat]) => {
    south = Math.min(south, lat); north = Math.max(north, lat);
    west = Math.min(west, lng); east = Math.max(east, lng);
  })));
  return [[south, west], [north, east]];
};
