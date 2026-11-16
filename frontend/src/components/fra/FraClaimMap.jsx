import { Component, lazy, Suspense, useState } from 'react';
import Loading from '../common/Loading.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import { geometryBounds } from '../../utils/geo.js';

const LeafletMap = lazy(() => import('./LeafletMap.jsx'));

// True when the map's code could not be downloaded (network problem, or a new version was deployed).
// A failed dynamic import is cached by React.lazy and by the browser, so retrying in place cannot work: only a reload can.
const isDownloadFailure = (error) =>
  /dynamically imported module|importing a module script|loading chunk|loading css chunk/i.test(`${error?.name} ${error?.message}`);

class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (isDownloadFailure(error)) {
      return (
        <ErrorState
          title="The map couldn’t be downloaded"
          message="Check your internet connection, then reload the page. Your claim details above are unaffected, but you will need to enter your reference ID again."
          actionLabel="Reload page"
          onRetry={() => window.location.reload()}
        />
      );
    }
    return (
      <ErrorState
        title="The map couldn’t be displayed"
        message="Your claim details above are unaffected. Please try again."
        onRetry={() => { this.setState({ error: null }); this.props.onRetry?.(); }}
      />
    );
  }
}

/**
 * Shows ONLY the authorized claim's boundary. States: no boundary recorded (empty), unusable boundary (error),
 * loading, map failure (error with retry), or the map.
 */
const FraClaimMap = ({ geometry, claimId }) => {
  const [attempt, setAttempt] = useState(0);

  if (!geometry) {
    return (
      <EmptyState
        icon="map"
        title="No boundary recorded yet"
        description="A map boundary for this claim has not been added yet. It will appear here once it is recorded."
      />
    );
  }

  const bounds = geometryBounds(geometry);
  if (!bounds) {
    return (
      <ErrorState
        title="Boundary can’t be displayed"
        message="The boundary saved for this claim is not in a usable format. Please contact your Gram Sarpanch or the registration desk."
      />
    );
  }

  return (
    <MapErrorBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
      <Suspense fallback={<Loading label="Loading map…" />}>
        <LeafletMap geometry={geometry} bounds={bounds} claimId={claimId} />
      </Suspense>
    </MapErrorBoundary>
  );
};

export default FraClaimMap;
