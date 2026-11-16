// Form definition for Crop Recommendation.
// name / min / max / seasons MUST match backend/src/config/cropRecommendationSchema.js and
// ml-service/crop_recommendation/schema.json (verify: `node scripts/check-schema-sync.mjs`).
// Labels, helper text and placeholders are UI copy only. Placeholders are examples, not defaults,
// and this file contains no crop names: recommendations only ever come from the ML service.

export const NUMERIC_FIELDS = [
  {
    name: 'nitrogen',
    label: 'Nitrogen (N)',
    unit: '',
    min: 0,
    max: 300,
    placeholder: 'e.g. 80',
    helper: 'Nitrogen level of your soil, from a soil test report. Typical values: 50–150.',
  },
  {
    name: 'phosphorus',
    label: 'Phosphorus (P)',
    unit: '',
    min: 0,
    max: 150,
    placeholder: 'e.g. 40',
    helper: 'Phosphorus level of your soil, from a soil test report. Typical values: 15–55.',
  },
  {
    name: 'potassium',
    label: 'Potassium (K)',
    unit: '',
    min: 0,
    max: 300,
    placeholder: 'e.g. 30',
    helper: 'Potassium level of your soil, from a soil test report. Typical values: 20–50.',
  },
  {
    name: 'ph',
    label: 'Soil pH',
    unit: '',
    min: 3,
    max: 10,
    placeholder: 'e.g. 6.8',
    helper: 'How acidic or alkaline the soil is. 7 is neutral, lower is acidic, higher is alkaline. Typical values: 5.5–8.',
  },
  {
    name: 'temperature',
    label: 'Average temperature',
    unit: '°C',
    min: 0,
    max: 50,
    placeholder: 'e.g. 25',
    helper: 'Average yearly temperature where you farm, in °C. Typical values: 6–29.',
  },
  {
    name: 'rainfall',
    label: 'Total rainfall',
    unit: 'mm',
    min: 0,
    max: 6000,
    placeholder: 'e.g. 1100',
    helper: 'Total rainfall in a year where you farm, in millimetres (mm). Typical values: 250–5,000.',
  },
  {
    name: 'humidity',
    label: 'Average humidity',
    unit: '%',
    min: 0,
    max: 100,
    placeholder: 'e.g. 62',
    helper: 'Average yearly relative humidity where you farm, in %. Typical values: 35–85.',
  },
];

export const SEASONS = [
  { value: 'Kharif', hint: 'Monsoon season crops, sown around June–July.' },
  { value: 'Rabi', hint: 'Winter season crops, sown around October–December.' },
  { value: 'Summer', hint: 'Short crops grown in the hot months, roughly March–June.' },
  { value: 'Whole Year', hint: 'Crops that grow across the year or several seasons, such as sugarcane or banana.' },
  { value: 'Winter', hint: 'Used mainly in eastern states such as Odisha, Bihar, West Bengal and Assam.' },
  { value: 'Autumn', hint: 'Used mainly in eastern states such as Odisha, Bihar, West Bengal and Assam.' },
];

export const EMPTY_FORM = {
  ...Object.fromEntries(NUMERIC_FIELDS.map((f) => [f.name, ''])),
  season: '',
};
