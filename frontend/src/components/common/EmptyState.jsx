import Icon from './Icon.jsx';
import Badge from './Badge.jsx';

const EmptyState = ({ icon = 'inbox', title, description, badge, action, className = '' }) => (
  <div
    className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-agri-200 bg-agri-50/50 px-6 py-10 text-center ${className}`}
  >
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-agri-500 shadow-card">
      <Icon name={icon} className="h-5 w-5" />
    </span>
    <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
    {description && <p className="max-w-sm text-sm text-gray-600">{description}</p>}
    {badge && <Badge tone="amber">{badge}</Badge>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EmptyState;
