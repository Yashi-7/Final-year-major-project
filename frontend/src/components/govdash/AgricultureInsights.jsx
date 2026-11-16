import EmptyState from '../common/EmptyState.jsx';
import SourceBadge from './SourceBadge.jsx';

const Bar = ({ name, share }) => (
  <li className="flex flex-col gap-1" data-testid="crop-row">
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-gray-800">{name}</span>
      <span className="tabular-nums text-xs text-gray-600">{share}%</span>
    </div>
    <div className="h-2 rounded-full bg-agri-100" aria-hidden="true"><div className="h-2 rounded-full bg-agri-500" style={{ width: `${Math.min(100, share)}%` }} /></div>
  </li>
);

/**
 * Operational agriculture context for the official's own area, from the supplied district agriculture dataset.
 * It is HISTORICAL REFERENCE data (share of recorded crop area), not live data and not claim data.
 */
const AgricultureInsights = ({ insights }) => {
  if (!insights?.available) {
    return <EmptyState icon="inbox" title="Reference data not available" description="The agriculture reference summary has not been generated, so nothing is shown here." />;
  }
  if (!insights.items.length) {
    return <EmptyState icon="inbox" title="No reference data for your area" description="The reference dataset has no entry for the area assigned to you." />;
  }
  const [from, to] = insights.yearRange;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {insights.items.map((item) => (
          <section key={item.label} className="rounded-xl border border-agri-100 p-4" aria-label={`Agriculture context for ${item.label}`} data-testid="insight-item">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-agri-900">{item.label}</h4>
              <span className="text-xs text-gray-500">{item.level === 'district' ? 'District level' : 'State level'}</span>
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Top crops by share of cropped area</p>
            <ul className="flex flex-col gap-2">{item.topCrops.map((c) => <Bar key={c.name} name={c.name} share={c.sharePercent} />)}</ul>
            <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">Area by season</p>
            <ul className="flex flex-wrap gap-2">
              {item.seasons.map((s) => (
                <li key={s.name} className="rounded-full bg-agri-50 px-3 py-1 text-xs text-agri-800">{s.name} <span className="font-semibold">{s.sharePercent}%</span></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500" data-testid="insight-footnote">
        <SourceBadge source="REFERENCE">Reference dataset {from}–{to}</SourceBadge>
        Historical shares of recorded crop area from the supplied district agriculture dataset. Not live data and not FRA claim data.
      </p>
    </div>
  );
};

export default AgricultureInsights;
