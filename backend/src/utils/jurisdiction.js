// Jurisdiction rules for GOVERNMENT_OFFICIAL users (the only two roles are FARMER and GOVERNMENT_OFFICIAL).
//
// An official's jurisdiction is a list of AREAS:  { state, district?, tehsil? }
//   - { state }                    -> every claim in that state
//   - { state, district }          -> every claim in that district
//   - { state, district, tehsil }  -> every claim in that tehsil
// More levels (block, village, ...) or finer roles can be added here without touching callers.
//
// DENY BY DEFAULT: no jurisdiction, an empty list, or a malformed area grants access to NOTHING.
// The scope is always derived from the AUTHENTICATED USER's stored record, never from the request.

const MAX_LEN = 100;

// Only plain, non-empty strings count. Anything else (objects such as { $ne: null }, numbers, arrays) becomes ''
// and therefore invalidates the area, so no query operator can ever reach the database through this path.
const clean = (v) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= MAX_LEN ? v.trim() : '');

const asPlain = (a) => (a && typeof a.toObject === 'function' ? a.toObject() : a);

/** Returns a de-duplicated list of VALID areas as { state, district|null, tehsil|null }. Invalid areas are dropped. */
export const normalizeAreas = (rawAreas) => {
  if (!Array.isArray(rawAreas)) return [];
  const seen = new Set();
  const areas = [];
  for (const raw of rawAreas) {
    const a = asPlain(raw);
    const state = clean(a?.state);
    const district = clean(a?.district);
    const tehsil = clean(a?.tehsil);
    if (!state) continue;                   // an area must at least name a state
    if (tehsil && !district) continue;      // hierarchy: a tehsil needs its district
    const key = `${state}|${district}|${tehsil}`;
    if (seen.has(key)) continue;
    seen.add(key);
    areas.push({ state, district: district || null, tehsil: tehsil || null });
  }
  return areas;
};

/**
 * MongoDB filter that matches only claims inside the given areas (exact, case-sensitive string matches on
 * location.state / location.district / location.tehsil). Returns null when there are no valid areas, and callers
 * MUST then return no data without querying.
 */
export const buildClaimScopeFilter = (areas) => {
  if (!Array.isArray(areas) || areas.length === 0) return null;
  return {
    $or: areas.map((a) => ({
      'location.state': a.state,
      ...(a.district ? { 'location.district': a.district } : {}),
      ...(a.tehsil ? { 'location.tehsil': a.tehsil } : {}),
    })),
  };
};

/** Human-readable label, e.g. "Madhya Pradesh", "Madhya Pradesh > Balaghat". */
export const describeArea = (a) => [a.state, a.district, a.tehsil].filter(Boolean).join(' › ');

/** True when the user may see any claim at all. */
export const hasJurisdiction = (user) => normalizeAreas(user?.jurisdiction?.areas).length > 0;

/**
 * For the operator script: build ONE area from command-line style values. Returns { area } or { error }.
 * Uses the same rules as normalizeAreas, so what the script writes is exactly what the dashboard will accept.
 */
export const buildAreaFromInput = ({ state, district, tehsil }) => {
  const [area] = normalizeAreas([{ state, district, tehsil }]);
  if (!area) return { error: 'A state is required (and a tehsil needs its district).' };
  return { area };
};
