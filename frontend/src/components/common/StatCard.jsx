import Icon from './Icon.jsx';
import Badge from './Badge.jsx';

// Shows a metric. `value` defaults to an em dash so an unconnected metric is
// never mistaken for a real zero.
const StatCard = ({ label, value = '—', icon, badge, hint }) => (
  <div className="card p-5">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      {icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-agri-50 text-agri-600">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
    </div>
    <p className="mt-3 text-3xl font-semibold text-gray-400" aria-label={`${label}: ${value}`}>
      {value}
    </p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {badge && <Badge tone="amber">{badge}</Badge>}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  </div>
);

export default StatCard;
