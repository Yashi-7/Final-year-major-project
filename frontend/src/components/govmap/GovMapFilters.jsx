
import { CLAIM_TYPE_LABELS, STATUS_META } from '../../config/govMapConfig.js';

const Field = ({ id, label, children }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <label htmlFor={id} className="text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
);

/** Filter controls for the map. Every change is sent straight to the server; there is no client-side filtering. */
const GovMapFilters = ({ filters, districts, disabled, activeCount, onChange, onClear }) => {
  const set = (name) => (e) => onChange(name, e.target.value);
  const dateOrderError = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo;

  return (
    <form role="search" aria-label="Filter map claims" onSubmit={(e) => e.preventDefault()} className="card flex flex-col gap-3 p-4" data-testid="map-filters">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="map-status" label="Status">
          <select id="map-status" className="field" value={filters.status} onChange={set('status')}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </Field>
        <Field id="map-type" label="Claim type">
          <select id="map-type" className="field" value={filters.claimType} onChange={set('claimType')}>
            <option value="">All types</option>
            {Object.entries(CLAIM_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field id="map-district" label="District">
          <select id="map-district" className="field" value={filters.district} onChange={set('district')}>
            <option value="">All districts in my area</option>
            {(districts || []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field id="map-date-from" label="Applied from">
          <input id="map-date-from" type="date" className="field" value={filters.dateFrom} onChange={set('dateFrom')} max={filters.dateTo || undefined} />
        </Field>
        <Field id="map-date-to" label="Applied to">
          <input id="map-date-to" type="date" className="field" value={filters.dateTo} onChange={set('dateTo')} min={filters.dateFrom || undefined} />
        </Field>
      </div>
      {dateOrderError && <p role="alert" className="text-xs font-medium text-red-700">“Applied to” must not be before “Applied from”.</p>}
      <div className="flex justify-end">
        <button type="button" className="btn-secondary" onClick={onClear} disabled={disabled || activeCount === 0} data-testid="map-clear-filters">
          Clear filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>
    </form>
  );
};

export default GovMapFilters;
