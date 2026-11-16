import { CLAIM_TYPE_LABELS, STATUS_META } from '../../config/fraConfig.js';
import { DATA_SOURCE_LABELS, SORT_OPTIONS } from '../../config/govClaimsConfig.js';

const Field = ({ id, label, children }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <label htmlFor={id} className="text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
);

const ClaimFilters = ({ filters, options, sortKey, disabled, activeCount, onChange, onSort, onClear }) => {
  const set = (name) => (e) => onChange(name, e.target.value);
  const dateOrderError = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo;

  return (
    <form role="search" aria-label="Filter claims" onSubmit={(e) => e.preventDefault()} className="card flex flex-col gap-4 p-4 sm:p-5" data-testid="claim-filters">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Field id="claim-search" label="Search by claim ID or applicant">
            <input id="claim-search" type="search" autoComplete="off" spellCheck="false" maxLength={100} className="field" placeholder="e.g. FRA-MP-2025 or an applicant name"
              value={filters.search} onChange={set('search')} />
          </Field>
        </div>
        <Field id="claim-status" label="Status">
          <select id="claim-status" className="field" value={filters.status} onChange={set('status')}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </Field>
        <Field id="claim-type" label="Claim type">
          <select id="claim-type" className="field" value={filters.claimType} onChange={set('claimType')}>
            <option value="">All types</option>
            {Object.entries(CLAIM_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field id="claim-district" label="District">
          <select id="claim-district" className="field" value={filters.district} onChange={set('district')}>
            <option value="">All districts in my area</option>
            {(options?.districts || []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field id="claim-source" label="Data">
          <select id="claim-source" className="field" value={filters.dataSource} onChange={set('dataSource')}>
            <option value="">All data</option>
            {Object.entries(DATA_SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field id="claim-date-from" label="Applied from">
          <input id="claim-date-from" type="date" className="field" value={filters.dateFrom} onChange={set('dateFrom')} max={filters.dateTo || undefined} />
        </Field>
        <Field id="claim-date-to" label="Applied to">
          <input id="claim-date-to" type="date" className="field" value={filters.dateTo} onChange={set('dateTo')} min={filters.dateFrom || undefined} />
        </Field>
      </div>
      {dateOrderError && <p role="alert" className="text-xs font-medium text-red-700">“Applied to” must not be before “Applied from”.</p>}

      <div className="flex flex-col gap-3 border-t border-agri-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:w-64">
          <Field id="claim-sort" label="Sort by">
            <select id="claim-sort" className="field" value={sortKey} onChange={(e) => onSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <button type="button" className="btn-secondary" onClick={onClear} disabled={disabled || activeCount === 0} data-testid="clear-filters">
          Clear filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>
    </form>
  );
};

export default ClaimFilters;
