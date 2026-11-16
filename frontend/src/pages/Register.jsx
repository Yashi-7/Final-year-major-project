import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'FARMER' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await register(form);
      if (user.role === 'FARMER') {
        navigate('/farmer/dashboard', { replace: true });
      } else if (user.role === 'GOVERNMENT_OFFICIAL') {
        navigate('/government/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-agri-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h2 className="mb-1 text-2xl font-bold text-agri-700">Create your account</h2>
        <p className="mb-6 text-sm text-gray-500">Register as a Farmer or Government Official</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              name="fullName"
              required
              value={form.fullName}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-agri-500 focus:outline-none focus:ring-1 focus:ring-agri-500"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-agri-500 focus:outline-none focus:ring-1 focus:ring-agri-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              required
              minLength={8}
              value={form.password}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-agri-500 focus:outline-none focus:ring-1 focus:ring-agri-500"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium text-gray-700">
              I am a
            </label>
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-agri-500 focus:outline-none focus:ring-1 focus:ring-agri-500"
            >
              <option value="FARMER">Farmer</option>
              <option value="GOVERNMENT_OFFICIAL">Government Official</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-agri-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-agri-700 disabled:opacity-60"
          >
            {submitting ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-agri-600 hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
