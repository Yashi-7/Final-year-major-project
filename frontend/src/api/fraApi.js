import axiosClient from './axiosClient.js';

/**
 * Farmer-only FRA Monitoring API (the backend enforces the FARMER role and ownership).
 *   POST /farmer/fra/verify {claimId} -> short-lived grant when the ID belongs to the logged-in farmer
 *   POST /farmer/fra/claim  {grant}   -> that one claim
 * The grant is used immediately and never stored.
 */
export class FraError extends Error {
  constructor(message, { kind = 'unknown', fieldError = '' } = {}) {
    super(message);
    this.name = 'FraError';
    this.kind = kind; // 'validation' | 'not_found' | 'rate_limited' | 'expired' | 'auth' | 'service' | 'network' | 'unknown'
    this.fieldError = fieldError;
  }
}

export const toFriendlyFraError = (err) => {
  const status = err.response?.status;
  const data = err.response?.data;

  if (!err.response) {
    return new FraError('Could not reach the server. Check your internet connection and try again.', { kind: 'network' });
  }
  if (status === 400) {
    const msg = data?.errors?.find((e) => e.field === 'claimId')?.message || 'Please check the reference ID and try again.';
    return new FraError(msg, { kind: 'validation', fieldError: msg });
  }
  if (status === 401) return new FraError('Your session has expired. Please log in again.', { kind: 'auth' });
  if (status === 403 && (data?.code === 'FRA_VERIFICATION_EXPIRED' || data?.code === 'FRA_VERIFICATION_INVALID')) {
    return new FraError('Your verification expired. Please enter your reference ID again.', { kind: 'expired' });
  }
  if (status === 403) return new FraError('Your account does not have access to FRA Monitoring.', { kind: 'auth' });
  if (status === 404) {
    return new FraError(
      'We couldn’t find a claim with that reference ID linked to your account. Check the ID, or ask your Gram Sarpanch or the registration desk.',
      { kind: 'not_found' }
    );
  }
  if (status === 429) {
    const seconds = Number(data?.retryAfterSeconds ?? err.response.headers?.['retry-after']);
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Please try again in about ${Math.ceil(seconds / 60)} minute(s).` : ' Please try again in a few minutes.';
    return new FraError(`Too many unsuccessful attempts.${wait}`, { kind: 'rate_limited' });
  }
  if (status >= 500) return new FraError('We couldn’t load your claim right now. Please try again in a moment.', { kind: 'service' });
  return new FraError('Something went wrong. Please try again.');
};

const call = async (url, body, signal) => {
  try {
    return (await axiosClient.post(url, body, { signal })).data;
  } catch (err) {
    throw toFriendlyFraError(err);
  }
};

/** Verifies the reference ID for the logged-in farmer, then fetches that claim. Resolves to the claim object. */
export const lookUpClaim = async (claimId, { signal } = {}) => {
  const verified = await call('/farmer/fra/verify', { claimId }, signal);
  if (!verified?.success || typeof verified.data?.grant !== 'string') {
    throw new FraError('We received an unexpected response. Please try again.', { kind: 'service' });
  }
  const viewed = await call('/farmer/fra/claim', { grant: verified.data.grant }, signal);
  if (!viewed?.success || !viewed.data?.claim?.claimId) {
    throw new FraError('We received an unexpected response. Please try again.', { kind: 'service' });
  }
  return viewed.data.claim;
};
