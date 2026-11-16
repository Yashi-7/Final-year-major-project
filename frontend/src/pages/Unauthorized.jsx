import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME, ROLE_LABEL } from '../config/navigation.js';
import Icon from '../components/common/Icon.jsx';

const Unauthorized = () => {
  const { user } = useAuth();
  const home = user ? ROLE_HOME[user.role] : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-agri-50 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-agri-600 shadow-card">
        <Icon name="lock" className="h-6 w-6" />
      </span>
      <h1 className="text-2xl font-semibold text-agri-900">You don&apos;t have access to this page</h1>
      <p className="max-w-md text-sm text-gray-600">
        {user
          ? `This page isn't available to ${ROLE_LABEL[user.role]} accounts. You can return to your own dashboard.`
          : 'Please log in with an account that has permission to view this page.'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {home && (
          <Link to={home} className="btn-primary">
            Go to my dashboard
          </Link>
        )}
        {!user && (
          <Link to="/login" className="btn-primary">
            Back to Login
          </Link>
        )}
      </div>
    </div>
  );
};

export default Unauthorized;
