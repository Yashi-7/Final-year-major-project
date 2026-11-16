/** Titled card. `badge` tells the viewer what kind of data the section shows (connected / demo / reference). */
const DashboardSection = ({ title, description, badge, className = '', testId, children }) => (
  <section className={`card p-5 ${className}`} aria-label={title} data-testid={testId}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-gray-600">{description}</p>}
      </div>
      {badge}
    </div>
    {children}
  </section>
);

export default DashboardSection;
