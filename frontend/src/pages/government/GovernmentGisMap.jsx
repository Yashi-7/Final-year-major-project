import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import Icon from '../../components/common/Icon.jsx';
import SourceBadge from '../../components/govdash/SourceBadge.jsx';
import GovMapFilters from '../../components/govmap/GovMapFilters.jsx';
import MapLegend from '../../components/govmap/MapLegend.jsx';
import ClaimPanel from '../../components/govmap/ClaimPanel.jsx';
import GovClaimsMap from '../../components/govmap/GovClaimsMap.jsx';
import { getFilterOptions } from '../../api/govClaimsApi.js';
import { getMapData } from '../../api/govMapApi.js';
import { MAP_EMPTY_FILTERS } from '../../config/govMapConfig.js';

const RowsSkeleton = () => (
  <div role="status" aria-busy="true" aria-label="Loading map" className="card flex h-[60vh] min-h-[360px] animate-pulse items-center justify-center bg-agri-100/50" data-testid="map-skeleton">
    <span className="sr-only">Loading map…</span>
  </div>
);

const GovernmentGisMap = () => {
  const [filters, setFilters] = useState(MAP_EMPTY_FILTERS);
  const [districts, setDistricts] = useState([]);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getFilterOptions({ signal: controller.signal }).then((d) => setDistricts(d.districts || [])).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const dateOrderBad = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo;
    if (dateOrderBad) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    setSelectedId(null);
    getMapData(filters, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ status: 'ready', data, error: null }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', data: null, error }); });
    return () => controller.abort();
  }, [filters, reloadKey]);

  const changeFilter = (name, value) => setFilters((f) => ({ ...f, [name]: value }));
  const clearFilters = () => setFilters(MAP_EMPTY_FILTERS);
  const activeCount = Object.values(filters).filter((v) => v !== '').length;
  const refresh = () => setReloadKey((k) => k + 1);

  const { status, data, error } = state;
  const unassigned = status === 'ready' && data.scope && !data.scope.assigned;
  const containsDemo = status === 'ready' && data.claims.some((c) => c.isDemo);
  const containsOfficial = status === 'ready' && data.claims.some((c) => !c.isDemo);
  const selectedClaim = status === 'ready' ? data.claims.find((c) => c.claimId === selectedId) : null;

  let mapArea;
  if (status === 'loading' && !data) mapArea = <RowsSkeleton />;
  else if (status === 'error') {
    mapArea = error.kind === 'auth' || error.kind === 'no_jurisdiction'
      ? <EmptyState icon="lock" title="You don’t have permission to view the map" description={error.message} badge="No permission" />
      : <ErrorState title="Could not load the map" message={error.message} onRetry={refresh} />;
  } else if (unassigned) {
    mapArea = <EmptyState icon="lock" title="No area assigned to your account yet" description="You can only view claims inside the area assigned to you, and none has been assigned. Please contact the authority that manages official accounts." badge="No data" />;
  } else if (data) {
    mapArea = <GovClaimsMap claims={data.claims} selectedId={selectedId} onSelect={setSelectedId} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Government GIS Map" description="View authorized claims on a map, coloured by status." />

      {data?.scope?.assigned && (
        <div className="flex items-center gap-2 text-sm text-gray-700" data-testid="scope-line">
          <Icon name="shield" className="h-4 w-4 text-agri-600" />
          Your area: <span className="font-semibold text-gray-900">{data.scope.areas.map((a) => a.label).join(' · ')}</span>
        </div>
      )}

      {!unassigned && !(status === 'error' && (error.kind === 'auth' || error.kind === 'no_jurisdiction')) && (
        <GovMapFilters filters={filters} districts={districts} disabled={status === 'loading'} activeCount={activeCount} onChange={changeFilter} onClear={clearFilters} />
      )}

      {status === 'ready' && data.meta?.truncated && (
        <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="truncated-note">
          Showing {data.meta.shown} of {data.meta.total} claims. Narrow the filters (for example by district or status) to see the rest.
        </p>
      )}

      {status === 'ready' && (containsDemo || containsOfficial) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600" data-testid="source-summary">
          {containsOfficial && <SourceBadge source="OFFICIAL" />}
          {containsDemo && <SourceBadge source="DEMO" />}
          {containsDemo && <span>Some or all claims shown are demo data for testing, not official government records.</span>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-3">
          {mapArea}
          <MapLegend />
        </div>
        {selectedClaim && <ClaimPanel claim={selectedClaim} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
};

export default GovernmentGisMap;
