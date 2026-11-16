import EmptyState from '../common/EmptyState.jsx';

/** Claims per district, with the part that still needs action. Computed from claims in the official's own area. */
const DistrictWorkload = ({ districts, districtCount }) => {
  if (!districts?.length) return <EmptyState icon="inbox" title="No district data" description="There are no claims to break down by district." />;
  const max = Math.max(...districts.map((d) => d.total), 1);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3" aria-label="Claims by district">
        {districts.map((d) => (
          <li key={d.district} data-testid="district-row" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-gray-900">{d.district}</span>
              <span className="text-xs text-gray-600"><span className="font-semibold text-agri-800">{d.requiringAction}</span> need action · {d.total} total</span>
            </div>
            <div className="h-2.5 rounded-full bg-agri-100" aria-hidden="true">
              <div className="h-2.5 rounded-full bg-agri-300" style={{ width: `${(d.total / max) * 100}%` }}>
                <div className="h-2.5 rounded-full bg-agri-600" style={{ width: `${d.total ? (d.requiringAction / d.total) * 100 : 0}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {districtCount > districts.length && <p className="text-xs text-gray-500">Showing {districts.length} of {districtCount} districts with the most claims needing action.</p>}
    </div>
  );
};

export default DistrictWorkload;
