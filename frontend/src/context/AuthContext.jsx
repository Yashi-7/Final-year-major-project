import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restores session on page load/refresh by asking the backend who the
  // current JWT cookie belongs to (the cookie itself is not readable by JS).
  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data } = await axiosClient.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // A background API call came back 401 while a session was active (the JWT expired, was
  // revoked, or the account no longer exists). Clear the stale user so every ProtectedRoute
  // re-evaluates immediately, and send the person to a fresh login rather than leaving them on
  // a page that will keep failing. Uses React Router's navigate (no full page reload).
  useEffect(() => {
    const onSessionExpired = () => {
      setUser((current) => {
        if (!current) return current; // already logged out; nothing to do, and avoid a redirect loop
        navigate('/login?sessionExpired=1', { replace: true });
        return null;
      });
    };
    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => window.removeEventListener('auth:session-expired', onSessionExpired);
  }, [navigate]);

  const login = async ({ email, password }) => {
    const { data } = await axiosClient.post('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  };

  const register = async ({ fullName, email, password, role }) => {
    const { data } = await axiosClient.post('/auth/register', { fullName, email, password, role });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await axiosClient.post('/auth/logout');
    setUser(null);
  };

  // Only fullName is editable; the backend ignores/rejects everything else.
  const updateProfile = async ({ fullName }) => {
    const { data } = await axiosClient.patch('/auth/me', { fullName });
    setUser(data.user);
    return data.user;
  };

  const value = { user, loading, login, register, logout, updateProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
