import axios from 'axios';

// withCredentials: true so the httpOnly JWT cookie set by the backend
// is sent with every request (required for the cross-port dev setup).
const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Endpoints where a 401 is an EXPECTED, normal outcome (checking whether a session exists,
// or a login/register attempt itself failing) rather than an active session going stale.
// Those must not trigger the "your session expired" flow below.
const SESSION_CHECK_EXEMPT = ['/auth/me', '/auth/login', '/auth/register'];

// When any OTHER authenticated call gets a 401 (the JWT expired, was invalidated, or the
// account no longer exists), tell the rest of the app so it can clear the stale session and
// send the person back to /login, instead of leaving them stuck on a dead page. AuthContext
// listens for this event; see its 'auth:session-expired' handler.
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isExempt = SESSION_CHECK_EXEMPT.some((path) => url.includes(path));
    if (error.response?.status === 401 && !isExempt) {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
