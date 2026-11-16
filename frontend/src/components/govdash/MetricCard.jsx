import Icon from '../common/Icon.jsx';

const nf = new Intl.NumberFormat('en-IN');

const MetricCard = ({ label, value, icon, hint, emphasis = false, testId }) => (
  <div className={`card p-5 ${emphasis ? 'border-agri-300 bg-agri-50/60 ring-1 ring-agri-200' : ''}`} data-testid={testId}>
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-agri-50 text-agri-600">
        <Icon name={icon} className="h-5 w-5" />
      </span>
    </div>
    <p className="mt-3 text-3xl font-semibold text-agri-800" aria-label={`${label}: ${value}`} data-testid="metric-value">
      {nf.format(value)}
    </p>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

export default MetricCard;
