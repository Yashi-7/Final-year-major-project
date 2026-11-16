import axiosClient from './axiosClient.js';
import { toFriendlyGovError } from './govClaimsApi.js';

const toQuery = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') q.set(k, String(v).trim()); });
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** GET /api/government/claims/map. The backend enforces the official's role and jurisdiction on every call. */
export const getMapData = async (filters, { signal } = {}) => {
  try {
    const res = await axiosClient.get(`/government/claims/map${toQuery(filters)}`, { signal });
    if (!res.data?.success || !Array.isArray(res.data.data?.claims)) throw new Error('unexpected response');
    return res.data.data;
  } catch (err) {
    if (err instanceof Error && err.message === 'unexpected response') throw err;
    throw toFriendlyGovError(err);
  }
};
