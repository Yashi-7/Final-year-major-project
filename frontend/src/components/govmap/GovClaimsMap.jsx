import { Component, lazy, Suspense, useMemo, useState } from 'react';
import Loading from '../common/Loading.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import { geometryBounds, isValidGeometry } from '../../utils/geo.js';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../config/govMapConfig.js';

const GovLeafletMap = lazy(() => import('./GovLeafletMap.jsx'));

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
        <ErrorState title="The map couldn’t be downloaded" message="Check your internet connection, then reload the page." actionLabel="Reload page" onRetry={() => window.location.reload()} />
      );
    }
    return <ErrorState title="The map couldn’t be displayed" message="Please try again." onRetry={() => { this.setState({ error: null }); this.props.onRetry?.(); }} />;
  }
}

const unionBounds = (list) => {
  if (list.length === 0) return null;
  let south = 90; let north = -90; let west = 180; let east = -180;
  for (const [[s, w], [n, e]] of list) { south = Math.min(south, s); north = Math.max(north, n); west = Math.min(west, w); east = Math.max(east, e); }
  return [[south, west], [north, east]];
};

/**
 * Map of the official's authorized claims. States: loading, no claims at all (empty), claims but none with a
 * usable boundary (empty, with a count), and the map itself. A note always says how many claims aren't shown
 * because they have no recorded boundary, so nothing is silently missing.
 */
const GovClaimsMap = ({ claims, selectedId, onSelect }) => {
  const [attempt, setAttempt] = useState(0);
  const { withGeometry, withoutGeometry, bounds } = useMemo(() => {
    // A second, client-side validity check (defence in depth): the server already validates geometry before
    // sending it, but a claim with a present-but-unusable geometry must still never reach the map layer.
    const withG = claims.filter((c) => c.geometry && isValidGeometry(c.geometry));
    const withoutG = claims.length - withG.length;
    const boundsList = withG.map((c) => geometryBounds(c.geometry)).filter(Boolean);
    return { withGeometry: withG, withoutGeometry: withoutG, bounds: unionBounds(boundsList) };
  }, [claims]);

  if (claims.length === 0) {
    return <EmptyState icon="map" title="No claims to show on the map" description="Claims in your area will appear here once they are registered." />;
  }
  if (withGeometry.length === 0) {
    return (
      <EmptyState icon="map" title="No mapped boundaries yet" description={`${withoutGeometry} claim(s) in your area don’t have a recorded boundary yet, so none can be shown on the map.`} />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <MapErrorBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
        <Suspense fallback={<Loading label="Loading map…" />}>
          <GovLeafletMap
            claims={withGeometry}
            bounds={bounds || [[DEFAULT_MAP_CENTER[0] - 5, DEFAULT_MAP_CENTER[1] - 5], [DEFAULT_MAP_CENTER[0] + 5, DEFAULT_MAP_CENTER[1] + 5]]}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </Suspense>
      </MapErrorBoundary>
      {withoutGeometry > 0 && (
        <p className="text-xs text-gray-500" data-testid="no-boundary-note">
          {withoutGeometry} claim(s) in your area {withoutGeometry === 1 ? "doesn't" : "don't"} have a recorded boundary and {withoutGeometry === 1 ? 'is' : 'are'} not shown on the map.
        </p>
      )}
    </div>
  );
};

export default GovClaimsMap;
