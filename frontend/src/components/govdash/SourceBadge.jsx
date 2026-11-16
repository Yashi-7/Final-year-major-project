import Badge from '../common/Badge.jsx';
import { SOURCE_INFO } from '../../config/govDashboardConfig.js';

/** OFFICIAL -> "Connected data", DEMO -> "Demo / Illustrative Data", REFERENCE -> historical reference dataset. */
const SourceBadge = ({ source, children }) => {
  if (source === 'REFERENCE') {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
        {children || 'Reference dataset'}
      </span>
    );
  }
  const info = SOURCE_INFO[source];
  return info ? <Badge tone={info.tone}>{info.label}</Badge> : null;
};

export default SourceBadge;
