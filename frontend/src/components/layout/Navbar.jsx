import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { NAV_LINKS } from '../../config/navigation.js';
import Icon from '../common/Icon.jsx';
import UserMenu from './UserMenu.jsx';

const Navbar = ({ onMenuClick, onLogout }) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title = (NAV_LINKS[user?.role] || []).find((l) => l.to === pathname)?.label || 'GeoRural';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-agri-100 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-gray-600 hover:bg-agri-50 lg:hidden"
        >
          <Icon name="menu" />
        </button>
        <p className="text-base font-semibold text-gray-800">{title}</p>
      </div>
      <UserMenu onLogout={onLogout} />
    </header>
  );
};

export default Navbar;
