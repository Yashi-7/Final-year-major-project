import { Link } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import Badge from '../common/Badge.jsx';

const FeatureCard = ({ icon, title, description, to, status }) => (
  <Link
    to={to}
    className="card group flex flex-col gap-3 p-5 transition hover:border-agri-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-agri-600"
  >
    <div className="flex items-start justify-between gap-2">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-agri-100 text-agri-700">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      {status && <Badge tone="amber">{status}</Badge>}
    </div>
    <div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </div>
    <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-agri-600 group-hover:text-agri-700">
      Open {title}
      <Icon name="arrow" className="h-4 w-4" />
    </span>
  </Link>
);

export default FeatureCard;
