import { STATUS_META } from '../../config/fraConfig.js';

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status, badge: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`} data-testid="status-badge">
      {meta.label}
    </span>
  );
};

export default StatusBadge;
