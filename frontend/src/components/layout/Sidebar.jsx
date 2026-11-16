import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { NAV_LINKS, ROLE_LABEL } from '../../config/navigation.js';
import Icon from '../common/Icon.jsx';

// Role-based navigation comes from config/navigation.js. Logout is a button
// (not a route) below the links. Static on lg+, slide-in drawer below lg.
const Sidebar = ({ open, onClose, onLogout }) => {
  const { user } = useAuth();
  const links = NAV_LINKS[user?.role] || [];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-agri-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col justify-between bg-agri-800 p-4 text-agri-100 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="mb-8 flex items-center justify-between px-2 pt-1">
            <div>
              <span className="text-xl font-bold text-white">🌾 GeoRural</span>
              <p className="mt-0.5 text-xs text-agri-300">{ROLE_LABEL[user?.role]}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="rounded-lg p-1.5 text-agri-200 hover:bg-agri-700 lg:hidden"
            >
              <Icon name="close" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-agri-300 ${
                    isActive ? 'bg-agri-500 text-white' : 'text-agri-100 hover:bg-agri-700'
                  }`
                }
              >
                <Icon name={link.icon} className="h-[18px] w-[18px]" />
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-agri-100 transition hover:bg-agri-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-agri-300"
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Logout
        </button>
      </aside>
    </>
  );
};

export default Sidebar;
