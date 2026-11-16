const Block = ({ className = '' }) => <div className={`animate-pulse rounded-2xl bg-agri-100/70 ${className}`} />;

/** Loading placeholder that matches the dashboard layout. */
const DashboardSkeleton = () => (
  <div role="status" aria-busy="true" aria-label="Loading dashboard" className="flex flex-col gap-6" data-testid="dashboard-skeleton">
    <Block className="h-32" />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Block key={i} className="h-28" />)}</div>
    <div className="grid gap-4 lg:grid-cols-3"><Block className="h-64 lg:col-span-2" /><Block className="h-64" /></div>
    <span className="sr-only">Loading dashboard…</span>
  </div>
);

export default DashboardSkeleton;
