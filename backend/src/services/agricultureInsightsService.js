import fs from 'node:fs';

/**
 * Reference-dataset insights for the government dashboard (crop area shares from the supplied district
 * agriculture dataset). This is HISTORICAL REFERENCE data, not live claim data and not official statistics.
 * The JSON is produced by scripts/build_agriculture_insights.py; if it is missing the dashboard shows
 * "not available" instead of inventing anything.
 *
 * Authorization: insights are only returned for the states in the official's jurisdiction.
 */
const DEFAULT_PATH = new URL('../../data/agriculture-insights.json', import.meta.url);
const isShare = (x) => x && typeof x.name === 'string' && Number.isFinite(x.sharePercent);
const validEntry = (e) => e && Array.isArray(e.topCrops) && e.topCrops.every(isShare) && Array.isArray(e.seasons) && e.seasons.every(isShare);

export const loadInsightsFile = (file = DEFAULT_PATH) => {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || !data.states || !Array.isArray(data.yearRange)) return null;
    return data;
  } catch {
    return null;
  }
};

const pick = (list) => list.map((x) => ({ name: x.name, sharePercent: x.sharePercent }));

/** @param areas normalized areas of the official (see utils/jurisdiction.js) */
export const getAgricultureInsights = (areas, data = loadInsightsFile()) => {
  if (!data) return { available: false, reason: 'The reference dataset summary has not been generated.', items: [] };

  const items = [];
  const seen = new Set();
  for (const area of areas) {
    const stateData = data.states[area.state];
    if (!stateData || !validEntry(stateData)) continue;

    let level = 'state';
    let entry = stateData;
    let label = area.state;
    if (area.district && stateData.districts) {
      const key = Object.keys(stateData.districts).find((d) => d.toLowerCase() === area.district.toLowerCase());
      if (key && validEntry(stateData.districts[key])) {
        level = 'district';
        entry = stateData.districts[key];
        label = `${area.state} › ${area.district}`;
      }
    }
    if (seen.has(label)) continue;
    seen.add(label);
    items.push({ label, level, topCrops: pick(entry.topCrops), seasons: pick(entry.seasons) });
  }

  return {
    available: true,
    yearRange: data.yearRange,
    sourceDataset: data.sourceDataset || null,
    method: data.method || null,
    items: items.slice(0, 4),
  };
};
