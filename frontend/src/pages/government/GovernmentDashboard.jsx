import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import ErrorState from '../../components/common/ErrorState.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Icon from '../../components/common/Icon.jsx';
import WelcomeBanner from '../../components/dashboard/WelcomeBanner.jsx';
import DashboardSkeleton from '../../components/govdash/DashboardSkeleton.jsx';
import DashboardSection from '../../components/govdash/DashboardSection.jsx';
import MetricCard from '../../components/govdash/MetricCard.jsx';
import SourceBadge from '../../components/govdash/SourceBadge.jsx';
import StatusDonut from '../../components/govdash/StatusDonut.jsx';
import RecentActivity from '../../components/govdash/RecentActivity.jsx';
import DistrictWorkload from '../../components/govdash/DistrictWorkload.jsx';
import MapPreviewCard from '../../components/govdash/MapPreviewCard.jsx';
import AgricultureInsights from '../../components/govdash/AgricultureInsights.jsx';
import { REQUIRING_ACTION_HINT, SOURCE_INFO } from '../../config/govDashboardConfig.js';

const Welcome = ({ name }) => (
  <WelcomeBanner name={name} roleLabel="Government Official" message="A monitoring overview of FRA claims in your area and agriculture operations." />
);

const ScopeBar = ({ scope, views, active, onSelect }) => (
  <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="scope-bar">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-agri-50 text-agri-600"><Icon name="shield" className="h-4 w-4" /></span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Your area of responsibility</p>
        <p className="text-sm font-semibold text-gray-900" data-testid="scope-label">{scope.areas.map((a) => a.label).join(' · ')}</p>
      </div>
    </div>
    {views.length > 1 && (
      <div role="group" aria-label="Data source" className="inline-flex rounded-xl bg-agri-50 p-1">
        {views.map((v) => (
          <button
            key={v.source} type="button" onClick={() => onSelect(v.source)} aria-pressed={active === v.source} data-testid={`source-${v.source}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${active === v.source ? 'bg-white text-agri-800 shadow-card' : 'text-gray-600 hover:text-agri-800'}`}
          >
            {v.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

const GovernmentDashboard = () => {
  const { user } = useAuth();
  // GET /api/government/dashboard/summary: GOVERNMENT_OFFICIAL only; the server decides which claims are included.
  const { data, loading, error, retry } = useFetch('/government/dashboard/summary');
  const [selected, setSelected] = useState(null);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState title="Could not load the dashboard" message={error} onRetry={retry} />;

  const summary = data?.data;
  if (!summary) return <ErrorState title="Could not load the dashboard" message="We received an unexpected response." onRetry={retry} />;

  const { scope, views, insights } = summary;

  // No jurisdiction assigned: deny by default. Nothing is shown, and nothing is invented.
  if (!scope.assigned) {
    return (
      <div className="flex flex-col gap-6">
        <Welcome name={user?.fullName} />
        <EmptyState
          icon="lock"
          title="No area assigned to your account yet"
          description="You can only see claims inside the area assigned to you, and none has been assigned. No claims are shown. Please contact the authority that manages official accounts to have an area assigned."
          badge="No data"
        />
      </div>
    );
  }

  const activeSource = views.some((v) => v.source === selected) ? selected : summary.defaultSource;
  const view = views.find((v) => v.source === activeSource) || null;
  const badge = view ? <SourceBadge source={view.source} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <Welcome name={user?.fullName} />
      <ScopeBar scope={scope} views={views} active={activeSource} onSelect={setSelected} />

      {!view ? (
        <EmptyState
          icon="file"
          title="No claims in your area yet"
          description="There are no claims recorded for your area, so there is nothing to summarise. Numbers will appear here once claims are registered."
          badge="No data"
        />
      ) : (
        <>
          {/* <div
            role="note" data-testid="source-note"
            className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${view.source === 'DEMO' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-agri-200 bg-agri-50 text-agri-900'}`}
          >
            <Icon name={view.source === 'DEMO' ? 'alert' : 'check'} className="mt-0.5 h-5 w-5 shrink-0" />
            <p><span className="font-semibold">{SOURCE_INFO[view.source].label}.</span> {SOURCE_INFO[view.source].note}</p>
          </div> */}

          <section aria-label="Claim summary" className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6" data-testid="summary-cards">
            <MetricCard testId="card-total" label="Total authorized claims" value={view.totals.total} icon="file" hint="Claims in your area" />
            <MetricCard testId="card-pending" label="Pending claims" value={view.totals.pending} icon="clock" hint="Status: Pending" />
            <MetricCard testId="card-review" label="Claims under review" value={view.totals.underReview} icon="search" hint="Status: Under review" />
            <MetricCard testId="card-approved" label="Approved claims" value={view.totals.approved} icon="check" hint="Status: Approved" />
            <MetricCard testId="card-rejected" label="Rejected claims" value={view.totals.rejected} icon="alert" hint="Status: Rejected" />
            <MetricCard testId="card-action" label="Claims requiring action" value={view.totals.requiringAction} icon="activity" hint={REQUIRING_ACTION_HINT} emphasis />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <DashboardSection title="Claim status overview" description="How claims in your area are distributed by status."  className="lg:col-span-2" testId="section-status">
              <StatusDonut byStatus={view.totals.byStatus} total={view.totals.total} />
            </DashboardSection>
            <DashboardSection title="Map overview" description="Preview of the future Government GIS Map."  testId="section-map">
              <MapPreviewCard boundaries={view.boundaries} />
            </DashboardSection>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <DashboardSection title="Recent workflow activity" description="Latest status changes on claims in your area."  className="lg:col-span-2" testId="section-activity">
              <RecentActivity items={view.recentActivity} />
            </DashboardSection>
            <DashboardSection title="Workload by district" description="Where claims are waiting."  testId="section-workload">
              <DistrictWorkload districts={view.districts} districtCount={view.districtCount} />
              {view.oldestOpenClaimDays !== null && (
                <p className="mt-4 rounded-xl bg-agri-50 px-3 py-2 text-xs text-agri-900" data-testid="oldest-open">
                  Oldest claim still needing action: <span className="font-semibold">{view.oldestOpenClaimDays} days</span> since application.
                </p>
              )}
            </DashboardSection>
          </div>
        </>
      )}

      <DashboardSection
        title="Operational agriculture insights"
        description="Agriculture context for your area from the reference dataset."
        badge={<SourceBadge source="REFERENCE" />}
        testId="section-insights"
      >
        <AgricultureInsights insights={insights} />
      </DashboardSection>
    </div>
  );
};

export default GovernmentDashboard;
