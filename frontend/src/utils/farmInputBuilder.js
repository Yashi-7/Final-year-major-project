const SOIL_ESTIMATES = {
  // Approximate priors only. These are not measurements and should be replaced by a soil test when available.
  loamy:    { nitrogen: 90, phosphorus: 40, potassium: 40, ph: 6.8 },
  clay:     { nitrogen: 100, phosphorus: 35, potassium: 55, ph: 7.2 },
  sandy:    { nitrogen: 35, phosphorus: 25, potassium: 25, ph: 6.2 },
  silt:     { nitrogen: 80, phosphorus: 38, potassium: 35, ph: 6.7 },
  black:    { nitrogen: 95, phosphorus: 30, potassium: 60, ph: 7.8 },
  alluvial: { nitrogen: 75, phosphorus: 42, potassium: 38, ph: 7.1 },
  red:      { nitrogen: 45, phosphorus: 22, potassium: 28, ph: 6.0 },
};

const SEASON_BY_MONTH = {
  1: 'Rabi', 2: 'Rabi', 3: 'Summer', 4: 'Summer', 5: 'Summer',
  6: 'Kharif', 7: 'Kharif', 8: 'Kharif', 9: 'Kharif',
  10: 'Rabi', 11: 'Rabi', 12: 'Rabi',
};

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
  return response.json();
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Resolves the farmer's location and fetches historical daily climate data.
 * Soil nutrients/pH are explicitly approximate soil-category estimates, not measurements.
 */
export async function buildCropModelInput({ location, soilType }) {
  const cleanLocation = String(location || '').trim();
  if (cleanLocation.length < 2) throw new Error('Enter a village, town, or district for your farm.');
  if (!SOIL_ESTIMATES[soilType]) throw new Error('Please select a soil type.');

  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.search = new URLSearchParams({ name: cleanLocation, count: '5', language: 'en', format: 'json' }).toString();
  const geocoding = await getJson(geocodeUrl.toString());
  if (!geocoding.results?.length) throw new Error('We could not find that location. Try entering the district and state, for example “Meerut, Uttar Pradesh”.');

  // Prefer an India result where possible, otherwise use the closest name match.
  const place = geocoding.results.find((item) => item.country_code === 'IN') || geocoding.results[0];

  // Archive data is delayed by a few days. Use the latest completed, likely available day.
  const end = new Date();
  end.setDate(end.getDate() - 5);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  const archiveUrl = new URL('https://archive-api.open-meteo.com/v1/archive');
  archiveUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    start_date: dateString(start),
    end_date: dateString(end),
    daily: 'temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean',
    timezone: 'auto',
  }).toString();

  let climate;
  try {
    const archive = await getJson(archiveUrl.toString());
    const daily = archive.daily || {};
    const temperature = average(daily.temperature_2m_mean || []);
    const humidity = average(daily.relative_humidity_2m_mean || []);
    const rainfallValues = (daily.precipitation_sum || []).filter(Number.isFinite);
    const rainfall = rainfallValues.length ? rainfallValues.reduce((sum, value) => sum + value, 0) : null;
    if (temperature === null || rainfall === null || humidity === null) {
      throw new Error('Historical climate data is incomplete for this location.');
    }
    climate = { temperature, rainfall, humidity };
  } catch (archiveError) {
    // Use current/short-range climate only as a transparent fallback, never silently label it annual.
    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,relative_humidity_2m',
      daily: 'temperature_2m_mean,precipitation_sum',
      forecast_days: '7',
      timezone: 'auto',
    }).toString();
    try {
      const forecast = await getJson(forecastUrl.toString());
      const temp = Number(forecast.current?.temperature_2m);
      const humidity = Number(forecast.current?.relative_humidity_2m);
      const rainValues = (forecast.daily?.precipitation_sum || []).filter(Number.isFinite);
      const tempValues = (forecast.daily?.temperature_2m_mean || []).filter(Number.isFinite);
      if (!Number.isFinite(temp) || !Number.isFinite(humidity) || !rainValues.length || !tempValues.length) throw archiveError;
      // Forecast totals are not annual rainfall. Keep the model input within a reasonable scale,
      // but disclose that a historical annual total was unavailable.
      climate = {
        temperature: average(tempValues),
        rainfall: Math.max(250, Math.min(5000, rainValues.reduce((sum, value) => sum + value, 0) * 52)),
        humidity,
        fallback: true,
      };
    } catch {
      throw new Error('Could not retrieve climate data for this location. Check your internet connection and try again.');
    }
  }

  const soil = SOIL_ESTIMATES[soilType];
  const month = new Date().getMonth() + 1;
  return {
    nitrogen: soil.nitrogen,
    phosphorus: soil.phosphorus,
    potassium: soil.potassium,
    ph: soil.ph,
    temperature: Math.max(0, Math.min(50, Number(climate.temperature.toFixed(1)))),
    rainfall: Math.max(0, Math.min(6000, Number(climate.rainfall.toFixed(1)))),
    humidity: Math.max(0, Math.min(100, Number(climate.humidity.toFixed(1)))),
    season: SEASON_BY_MONTH[month],
    locationLabel: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    soilLabel: soilType,
    notice: climate.fallback
      ? 'Historical annual climate data was unavailable. Short-range forecast values were used to estimate the rainfall input; results are less reliable.'
      : 'Soil NPK and pH are estimates for the selected soil category, not lab measurements. Recommendations should be verified with a soil test or local agriculture officer.',
  };
}
