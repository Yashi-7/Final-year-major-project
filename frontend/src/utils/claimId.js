import { CLAIM_ID_EXAMPLE, CLAIM_ID_PATTERN } from '../config/fraConfig.js';

/** Trim and upper-case what the farmer typed. */
export const normalizeClaimId = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

/** Returns an error message, or '' when the ID looks right. (The server verifies it for real.) */
export const validateClaimIdInput = (value) => {
  const id = normalizeClaimId(value);
  if (!id) return 'Please enter your claim reference ID.';
  if (!CLAIM_ID_PATTERN.test(id)) {
    return `That doesn’t look like a reference ID. It should look like ${CLAIM_ID_EXAMPLE}.`;
  }
  return '';
};
