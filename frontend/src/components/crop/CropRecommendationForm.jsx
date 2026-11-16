const SOIL_TYPES = [
  { value: 'loamy', label: 'Loamy soil' },
  { value: 'clay', label: 'Clay soil' },
  { value: 'sandy', label: 'Sandy soil' },
  { value: 'silt', label: 'Silty soil' },
  { value: 'black', label: 'Black soil (Regur)' },
  { value: 'alluvial', label: 'Alluvial soil' },
  { value: 'red', label: 'Red soil' },
];

const CropRecommendationForm = ({ values, disabled, onChange, onSubmit, onReset }) => (
  <form onSubmit={onSubmit} className="card flex flex-col gap-6 p-5 sm:p-6" aria-label="Crop recommendation inputs">
    <div>
      <h3 className="text-base font-semibold text-agri-900">Farm details</h3>
      <p className="mt-1 text-sm text-gray-600">
        Enter your village, town, or district and select the main soil type. The system will retrieve climate data automatically.
      </p>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="location" className="text-sm font-semibold text-gray-800">Farm location</label>
        <input
          id="location" name="location" type="text" autoComplete="address-level2"
          className="field" placeholder="e.g. Ghaziabad, Uttar Pradesh"
          value={values.location} onChange={onChange} required minLength={2} maxLength={120}
        />
        <p className="text-xs text-gray-500">Use a village, town, or district name.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="soilType" className="text-sm font-semibold text-gray-800">Soil type</label>
        <select id="soilType" name="soilType" className="field" value={values.soilType} onChange={onChange} required>
          <option value="">Select your soil type</option>
          {SOIL_TYPES.map((soil) => <option key={soil.value} value={soil.value}>{soil.label}</option>)}
        </select>
        <p className="text-xs text-gray-500">If unsure, check your soil report or ask a local agriculture officer.</p>
      </div>
    </div>
    {/* <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Climate values are fetched from a weather service. Soil nutrient and pH values are estimates based on the selected soil category—not a soil test.
    </div> */}
    <div className="flex flex-col-reverse gap-3 border-t border-agri-100 pt-4 sm:flex-row sm:justify-end">
      <button type="button" className="btn-secondary" onClick={onReset} disabled={disabled}>Clear form</button>
      <button type="submit" className="btn-primary" disabled={disabled}>
        {disabled ? 'Fetching climate and finding crops…' : 'Get recommendations'}
      </button>
    </div>
  </form>
);

export default CropRecommendationForm;
