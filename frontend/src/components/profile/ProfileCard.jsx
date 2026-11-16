import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABEL } from '../../config/navigation.js';
import PageHeader from '../common/PageHeader.jsx';
import Badge from '../common/Badge.jsx';

const formatDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-6">
    <dt className="w-40 shrink-0 text-sm text-gray-500">{label}</dt>
    <dd className="text-sm font-medium text-gray-900">{children}</dd>
  </div>
);

// Shared by both roles. Only fullName is editable; email and role are read-only
// and the password (hash or otherwise) is never shown.
const ProfileCard = () => {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const startEdit = () => {
    setFullName(user?.fullName || '');
    setError('');
    setSaved(false);
    setEditing(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setError('Name must be between 2 and 100 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateProfile({ fullName: trimmed });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.errors?.[0]?.message || err.response?.data?.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const memberSince = formatDate(user?.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" description="Your account details." />

      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-agri-600 text-xl font-semibold text-white">
            {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
          </span>
          <div>
            <p className="text-lg font-semibold text-gray-900">{user?.fullName}</p>
            <Badge tone="green">{ROLE_LABEL[user?.role]}</Badge>
          </div>
        </div>

        {saved && (
          <p role="status" className="mb-3 rounded-xl bg-agri-50 px-3 py-2 text-sm text-agri-700">
            Profile updated.
          </p>
        )}

        <dl className="divide-y divide-agri-100">
          <Row label="Full name">
            {editing ? (
              <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-2">
                <label htmlFor="fullName" className="sr-only">
                  Full name
                </label>
                <input
                  id="fullName"
                  className="field"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
                {error && (
                  <p role="alert" className="text-sm text-red-600">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn-secondary" disabled={saving} onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <span className="flex items-center gap-3">
                {user?.fullName}
                <button type="button" onClick={startEdit} className="text-sm font-semibold text-agri-600 hover:underline">
                  Edit
                </button>
              </span>
            )}
          </Row>
          <Row label="Email">{user?.email}</Row>
          <Row label="Role">{ROLE_LABEL[user?.role]}</Row>
          <Row label="Member since">{memberSince || 'Not available'}</Row>
        </dl>
        <p className="mt-4 text-xs text-gray-500">Email and role can&apos;t be changed here.</p>
      </section>
    </div>
  );
};

export default ProfileCard;
