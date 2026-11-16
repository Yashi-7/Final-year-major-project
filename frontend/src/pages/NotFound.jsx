import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-agri-50 px-4 text-center">
    <h1 className="text-3xl font-bold text-gray-800">404 — Page Not Found</h1>
    <p className="max-w-sm text-sm text-gray-500">
      The page you&apos;re looking for doesn&apos;t exist.
    </p>
    <Link to="/login" className="mt-2 font-semibold text-agri-600 hover:underline">
      Back to Login
    </Link>
  </div>
);

export default NotFound;
