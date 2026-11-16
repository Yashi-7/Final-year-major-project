import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABEL, ROLE_PROFILE } from '../../config/navigation.js';
import Icon from '../common/Icon.jsx';

const UserMenu = ({ onLogout }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-agri-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-agri-600"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-agri-600 text-sm font-semibold text-white">
          {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight text-gray-800">{user?.fullName}</span>
          <span className="block text-xs text-gray-500">{ROLE_LABEL[user?.role]}</span>
        </span>
        <Icon name="chevron" className="hidden h-4 w-4 text-gray-400 sm:block" />
      </button>

      {open && (
        <div role="menu" className="card absolute right-0 z-20 mt-2 w-64 p-2">
          <div className="border-b border-agri-100 px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-gray-800">{user?.fullName}</p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>
          <Link
            to={ROLE_PROFILE[user?.role]}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-agri-50"
          >
            <Icon name="user" className="h-4 w-4" /> Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-agri-50"
          >
            <Icon name="logout" className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
