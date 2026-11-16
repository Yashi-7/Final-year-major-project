// Input contract for Crop Recommendation.
// MUST match ml-service/crop_recommendation/schema.json and
// frontend/src/config/cropRecommendationFields.js — verify with
// `node scripts/check-schema-sync.mjs` from the project root.
export const NUMERIC_FIELDS = [
  { name: 'nitrogen', label: 'Nitrogen (N)', min: 0, max: 300 },
  { name: 'phosphorus', label: 'Phosphorus (P)', min: 0, max: 150 },
  { name: 'potassium', label: 'Potassium (K)', min: 0, max: 300 },
  { name: 'ph', label: 'Soil pH', min: 3, max: 10 },
  { name: 'temperature', label: 'Average temperature', min: 0, max: 50 },
  { name: 'rainfall', label: 'Total rainfall', min: 0, max: 6000 },
  { name: 'humidity', label: 'Average humidity', min: 0, max: 100 },
];

export const SEASONS = ['Kharif', 'Rabi', 'Summer', 'Whole Year', 'Winter', 'Autumn'];
