import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import ConfirmModal from '../common/ConfirmModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

// Shared shell for both roles. Owns the mobile-drawer state and the logout
// confirmation so Sidebar and the user menu trigger the same flow.
const DashboardLayout = () => {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const requestLogout = useCallback(() => {
    setLogoutError('');
    setNavOpen(false);
    setConfirmOpen(true);
  }, []);

  const handleLogout = async () => {
    setBusy(true);
    setLogoutError('');
    try {
      await logout(); // clears the cookie server-side; ProtectedRoute then redirects to /login
    } catch {
      setLogoutError('Could not log out. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-agri-50">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} onLogout={requestLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onMenuClick={() => setNavOpen(true)} onLogout={requestLogout} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <ConfirmModal
        open={confirmOpen}
        title="Log out?"
        message="You will need to sign in again to access your dashboard."
        confirmLabel="Log out"
        busy={busy}
        error={logoutError}
        onConfirm={handleLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default DashboardLayout;
