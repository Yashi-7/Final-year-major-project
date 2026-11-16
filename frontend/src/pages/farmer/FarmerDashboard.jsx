import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import Loading from '../../components/common/Loading.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import WelcomeBanner from '../../components/dashboard/WelcomeBanner.jsx';
import FeatureCard from '../../components/dashboard/FeatureCard.jsx';

const FEATURES = [
  {
    icon: 'sprout',
    title: 'Crop Recommendation',
    description: 'Get guidance on which crops suit your land and season.',
    to: '/farmer/crop-recommendation',
  },
  {
    icon: 'trend',
    title: 'Yield Prediction',
    description: 'Estimate the expected yield for your crop before the season ends.',
    to: '/farmer/yield-prediction',
  },
  {
    icon: 'shield',
    title: 'FRA Monitoring',
    description: 'Follow the status of Forest Rights Act claims linked to your land.',
    to: '/farmer/fra-monitoring',
  },
];

const FarmerDashboard = () => {
  const { user } = useAuth();
  // Real call to the FARMER-only endpoint: exercises backend role checks and
  // gives the page genuine loading / error states.
  const { loading, error, retry } = useFetch('/farmer/dashboard');

  if (loading) return <Loading label="Loading your dashboard…" />;
  if (error) return <ErrorState title="Could not load your dashboard" message={error} onRetry={retry} />;

  return (
    <div className="flex flex-col gap-8">
      <WelcomeBanner
        name={user?.fullName}
        roleLabel="Farmer"
        message="Your tools for crop planning, yield estimates and forest-rights tracking will live here."
      />

      <section className="flex flex-col gap-4">
        <PageHeader title="Your tools" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.to} {...f} status="" />
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <EmptyState
          icon="activity"
          title="No recommendations or predictions yet"
          description="Results from Crop Recommendation and Yield Prediction will appear here once those modules are live."
        />
        <EmptyState
          icon="file"
          title="Your FRA claims are private"
          description="Open FRA Monitoring and enter the reference ID you received in person to view your own claim."
        />
      </section>
    </div>
  );
};

export default FarmerDashboard;
