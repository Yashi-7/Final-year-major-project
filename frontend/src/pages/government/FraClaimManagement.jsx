import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import Icon from '../../components/common/Icon.jsx';
import ClaimFilters from '../../components/govclaims/ClaimFilters.jsx';
import ClaimsTable from '../../components/govclaims/ClaimsTable.jsx';
import Pagination from '../../components/govclaims/Pagination.jsx';
import ClaimDrawer from '../../components/govclaims/ClaimDrawer.jsx';
import { EMPTY_FILTERS, SEARCH_DEBOUNCE_MS, SORT_OPTIONS } from '../../config/govClaimsConfig.js';
import { getFilterOptions, listClaims } from '../../api/govClaimsApi.js';

const RowsSkeleton = () => (
  <div role="status" aria-busy="true" aria-label="Loading claims" className="flex flex-col gap-2 p-4" data-testid="table-skeleton">
    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-agri-100/70" />)}
    <span className="sr-only">Loading claims…</span>
  </div>
);

const FraClaimManagement = () => {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');           // debounced copy of filters.search
  const [sortKey, setSortKey] = useState(SORT_OPTIONS[0].key);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [options, setOptions] = useState(null);
  const [list, setList] = useState({ status: 'loading', data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState(null);
  const triggerRef = useRef(null);

  // Filter choices (districts inside my area). Not essential: the list still works if this fails.
  useEffect(() => {
    const controller = new AbortController();
    getFilterOptions({ signal: controller.signal }).then(setOptions).catch(() => {});
    return () => controller.abort();
  }, []);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(filters.search.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Server-side page of claims. The server decides which claims this official may see.
  useEffect(() => {
    const dateOrderBad = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo;
    if (dateOrderBad) return undefined;
    const controller = new AbortController();
    const sort = SORT_OPTIONS.find((o) => o.key === sortKey) || SORT_OPTIONS[0];
    setList((l) => ({ ...l, status: 'loading', error: null }));
    listClaims(
      { page, limit, q: search, status: filters.status, claimType: filters.claimType, district: filters.district, dataSource: filters.dataSource, dateFrom: filters.dateFrom, dateTo: filters.dateTo, sort: sort.sort, order: sort.order },
      { signal: controller.signal }
    )
      .then((data) => { if (!controller.signal.aborted) setList({ status: 'ready', data, error: null }); })
      .catch((error) => { if (!controller.signal.aborted) setList({ status: 'error', data: null, error }); });
    return () => controller.abort();
  }, [page, limit, search, filters.status, filters.claimType, filters.district, filters.dataSource, filters.dateFrom, filters.dateTo, sortKey, reloadKey]);

  const changeFilter = (name, value) => {
    setFilters((f) => ({ ...f, [name]: value }));
    if (name !== 'search') setPage(1);
  };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setSearch(''); setPage(1); };
  const activeCount = Object.values(filters).filter((v) => v !== '').length;

  const openClaim = useCallback((claimId, trigger) => { triggerRef.current = trigger; setOpenId(claimId); }, []);
  const closeClaim = useCallback(() => { setOpenId(null); setTimeout(() => triggerRef.current?.focus?.(), 0); }, []);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const { status, data, error } = list;
  const unassigned = status === 'ready' && data.scope && !data.scope.assigned;

  let body;
  if (status === 'loading' && !data) body = <RowsSkeleton />;
  else if (status === 'error') {
    body = error.kind === 'auth' || error.kind === 'no_jurisdiction'
      ? <EmptyState icon="lock" title="You don’t have permission to view claims" description={error.message} badge="No permission" />
      : <ErrorState title="Could not load claims" message={error.message} onRetry={refresh} />;
  } else if (unassigned) {
    body = <EmptyState icon="lock" title="No area assigned to your account yet" description="You can only manage claims inside the area assigned to you, and none has been assigned. No claims are shown. Please contact the authority that manages official accounts." badge="No data" />;
  } else if (data && data.pagination.total === 0) {
    body = activeCount > 0
      ? <div className="flex flex-col items-center gap-3"><EmptyState icon="search" title="No claims match your filters" description="Try changing or clearing the filters." /><button type="button" className="btn-secondary" onClick={clearFilters}>Clear filters</button></div>
      : <EmptyState icon="file" title="No claims in your area yet" description="Claims will be listed here once they are registered for your area." badge="No data" />;
  } else if (data) {
    body = (
      <div className={status === 'loading' ? 'opacity-60' : ''} aria-busy={status === 'loading'}>
        <ClaimsTable items={data.items} onOpen={openClaim} />
        <Pagination pagination={data.pagination} disabled={status === 'loading'} onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="FRA Claim Management" description="Search, review and process FRA claims inside your assigned area." />

      {data?.scope?.assigned && (
        <div className="flex items-center gap-2 text-sm text-gray-700" data-testid="scope-line">
          <Icon name="shield" className="h-4 w-4 text-agri-600" />
          Your area: <span className="font-semibold text-gray-900">{data.scope.areas.map((a) => a.label).join(' · ')}</span>
        </div>
      )}

      {!unassigned && !(status === 'error' && (error.kind === 'auth' || error.kind === 'no_jurisdiction')) && (
        <ClaimFilters filters={filters} options={options} sortKey={sortKey} disabled={status === 'loading'} activeCount={activeCount}
          onChange={changeFilter} onSort={(k) => { setSortKey(k); setPage(1); }} onClear={clearFilters} />
      )}

      <section className="card overflow-hidden" aria-label="Claims" data-testid="claims-card">{body}</section>

      {openId && <ClaimDrawer claimId={openId} onClose={closeClaim} onChanged={refresh} />}
    </div>
  );
};

export default FraClaimManagement;
