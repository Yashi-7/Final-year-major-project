// Inline (in-layout) loading indicator. The full-screen LoadingSpinner is still
// used for auth/session restore.
const Loading = ({ label = 'Loading…' }) => (
  <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-gray-600">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-agri-200 border-t-agri-600" />
    {label}
  </div>
);

export default Loading;
