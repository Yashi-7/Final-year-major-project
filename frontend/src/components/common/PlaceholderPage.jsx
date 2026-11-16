import PageHeader from './PageHeader.jsx';
import EmptyState from './EmptyState.jsx';

/**
 * Generic placeholder for modules that are routed and access-controlled
 * but not yet functionally implemented (Crop Recommendation, Yield Prediction,
 * FRA Monitoring, FRA Claim Management, Government GIS Map).
 */
const PlaceholderPage = ({ title, description, phaseNote, icon = 'clock' }) => (
  <div className="flex flex-col gap-6">
    <PageHeader title={title} description={description} />
    <EmptyState
      icon={icon}
      title="This module will be implemented in a future phase."
      description={phaseNote}
      badge="Not yet available"
      className="py-16"
    />
  </div>
);

export default PlaceholderPage;
