const PageHeader = ({ title, description, actions }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-agri-900">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-gray-600">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
