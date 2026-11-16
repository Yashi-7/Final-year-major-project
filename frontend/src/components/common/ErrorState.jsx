import Icon from './Icon.jsx';

const ErrorState = ({ title = 'Something went wrong', message, onRetry, actionLabel = 'Try again' }) => (
  <div
    role="alert"
    className="flex flex-col items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center"
  >
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-500">
      <Icon name="alert" className="h-5 w-5" />
    </span>
    <h3 className="text-sm font-semibold text-red-800">{title}</h3>
    {message && <p className="max-w-sm text-sm text-red-700">{message}</p>}
    {onRetry && (
      <button type="button" onClick={onRetry} className="btn-secondary mt-2">
        {actionLabel}
      </button>
    )}
  </div>
);

export default ErrorState;
