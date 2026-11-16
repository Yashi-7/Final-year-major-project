import { YIELD_FIELDS } from '../../config/yieldPredictionFields.js';

const Shell = ({ name, helper, error, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={name} className="text-sm font-semibold text-gray-800">{YIELD_FIELDS[name].label}</label>
    {children}
    <p id={`${name}-help`} className="text-xs text-gray-500">{helper}</p>
    {error && <p id={`${name}-error`} className="text-xs font-medium text-red-700">{error}</p>}
  </div>
);

const fieldClass = (error) => `field ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : ''}`;
const aria = (name, error) => ({
  'aria-invalid': error ? 'true' : 'false',
  'aria-describedby': error ? `${name}-help ${name}-error` : `${name}-help`,
  'aria-required': 'true',
});

/**
 * Cascading form: State -> Season -> Crop, then Year. Every choice list comes from `options`
 * (the trained model's metadata); nothing about states or crops is hardcoded here.
 */
const YieldPredictionForm = ({ options, values, errors, disabled, onChange, onBlur, onSubmit, onReset }) => {
  const seasons = values.state ? options.seasonsByState[values.state] || [] : [];
  const crops = values.state && values.season ? options.cropsByStateSeason[values.state]?.[values.season] || [] : [];

  return (
    <form onSubmit={onSubmit} noValidate className="card flex flex-col gap-5 p-5 sm:p-6" aria-label="Yield prediction inputs">
      <fieldset disabled={disabled} className="flex flex-col gap-5">
        <Shell name="state" helper={YIELD_FIELDS.state.helper} error={errors.state}>
          <select id="state" name="state" className={fieldClass(errors.state)} value={values.state} onChange={onChange} onBlur={onBlur} {...aria('state', errors.state)}>
            <option value="">Select a state</option>
            {options.states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Shell>

        <Shell name="season" helper={values.state ? YIELD_FIELDS.season.helper : 'Choose a state first.'} error={errors.season}>
          <select id="season" name="season" className={fieldClass(errors.season)} value={values.season} onChange={onChange} onBlur={onBlur} disabled={!values.state} {...aria('season', errors.season)}>
            <option value="">Select a season</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Shell>

        <Shell name="crop" helper={values.season ? YIELD_FIELDS.crop.helper : 'Choose a state and season first.'} error={errors.crop}>
          <select id="crop" name="crop" className={fieldClass(errors.crop)} value={values.crop} onChange={onChange} onBlur={onBlur} disabled={!values.season} {...aria('crop', errors.crop)}>
            <option value="">Select a crop</option>
            {crops.map((c) => <option key={c} value={c}>{options.cropLabels[c] || c}</option>)}
          </select>
        </Shell>

        <Shell name="year" helper={`Enter a year between ${options.years.min} and ${options.years.max}.`} error={errors.year}>
          <input
            id="year" name="year" type="text" inputMode="numeric" autoComplete="off"
            className={fieldClass(errors.year)} placeholder="e.g. 2024"
            value={values.year} onChange={onChange} onBlur={onBlur} {...aria('year', errors.year)}
          />
        </Shell>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-agri-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onReset} disabled={disabled}>Clear form</button>
        <button type="submit" className="btn-primary" disabled={disabled}>
          {disabled ? 'Predicting…' : 'Predict yield'}
        </button>
      </div>
    </form>
  );
};

export default YieldPredictionForm;
