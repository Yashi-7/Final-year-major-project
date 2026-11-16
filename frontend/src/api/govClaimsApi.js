import axiosClient from './axiosClient.js';

/**
 * Government claim management API. The backend enforces the GOVERNMENT_OFFICIAL role and the official's
 * jurisdiction on every call; the browser never sends (or can change) which claims it may see.
 */
export class GovClaimsError extends Error {
  constructor(message, { kind = 'unknown', code = '', fieldErrors = {}, currentStatus = null } = {}) {
    super(message);
    this.name = 'GovClaimsError';
    this.kind = kind; // 'validation' | 'no_jurisdiction' | 'auth' | 'not_found' | 'conflict' | 'service' | 'network' | 'unknown'
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.currentStatus = currentStatus;
  }
}

export const toFriendlyGovError = (err) => {
  const status = err.response?.status;
  const data = err.response?.data;
  if (!err.response) return new GovClaimsError('Could not reach the server. Check your internet connection and try again.', { kind: 'network' });
  if (status === 400) {
    const fieldErrors = {};
    (data?.errors || []).forEach((e) => { if (e.field && !fieldErrors[e.field]) fieldErrors[e.field] = e.message; });
    const first = data?.errors?.[0]?.message;
    return new GovClaimsError(first || 'Please check your entries and try again.', { kind: 'validation', fieldErrors });
  }
  if (status === 401) return new GovClaimsError('Your session has expired. Please log in again.', { kind: 'auth' });
  if (status === 403 && data?.code === 'NO_JURISDICTION') {
    return new GovClaimsError('No area is assigned to your account, so you cannot access claims.', { kind: 'no_jurisdiction', code: data.code });
  }
  if (status === 403) return new GovClaimsError('Your account does not have permission to manage FRA claims.', { kind: 'auth' });
  if (status === 404) return new GovClaimsError('This claim was not found in your area.', { kind: 'not_found' });
  if (status === 409) {
    return new GovClaimsError(data?.message || 'This claim was changed by someone else. Please review its current status.', {
      kind: 'conflict', code: data?.code || '', currentStatus: data?.currentStatus || null,
    });
  }
  if (status >= 500) return new GovClaimsError('Something went wrong on our side. Please try again in a moment.', { kind: 'service' });
  return new GovClaimsError('Something went wrong. Please try again.');
};

const request = async (fn) => {
  try { return (await fn()).data; } catch (err) { throw toFriendlyGovError(err); }
};

const toQuery = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') q.set(k, String(v).trim()); });
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const listClaims = (params, { signal } = {}) =>
  request(() => axiosClient.get(`/government/claims${toQuery(params)}`, { signal })).then((d) => d.data);

export const getFilterOptions = ({ signal } = {}) =>
  request(() => axiosClient.get('/government/claims/filters', { signal })).then((d) => d.data);

export const getClaim = (claimId, { signal } = {}) =>
  request(() => axiosClient.get(`/government/claims/${encodeURIComponent(claimId)}`, { signal })).then((d) => d.data.claim);

/** body: { action, expectedStatus, remarks?, reason? }. The server derives the new status from the action. */
export const performClaimAction = (claimId, body) =>
  request(() => axiosClient.post(`/government/claims/${encodeURIComponent(claimId)}/actions`, body)).then((d) => d.data.claim);
