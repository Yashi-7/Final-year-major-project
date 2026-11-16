import Badge from '../common/Badge.jsx';

// Titled card used for dashboard sections whose data is not connected yet.
const PlaceholderPanel = ({ title, description, badge = 'No data connected', className = '', children }) => (
  <section className={`card p-5 ${className}`}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-gray-600">{description}</p>}
      </div>
      <Badge tone="amber">{badge}</Badge>
    </div>
    {children}
  </section>
);

export default PlaceholderPanel;
