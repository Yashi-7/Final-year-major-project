// Short-lived "verification grant" issued after a farmer proves ownership of a claim reference ID.
//
// It is a compact signed token:  base64url(JSON payload) + '.' + base64url(HMAC-SHA256)
//  - bound to ONE farmer (fid) and ONE claim (cid); useless for anyone else or for any other claim
//  - purpose-tagged and signed with a key DERIVED from JWT_SECRET, so a login token can never be replayed as a
//    grant (or the reverse)
//  - expires quickly (default 10 minutes); the page keeps it in memory only
// A grant only says "ownership was verified a moment ago". The claim endpoint still re-checks ownership in the
// database on every request, so a grant on its own never exposes data.
import { createHmac, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'fra-claim-view';
const b64 = (buf) => Buffer.from(buf).toString('base64url');

const deriveKey = (secret) => {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('FRA verification is not configured correctly.');
  return createHmac('sha256', secret).update('geo-rural:fra-claim-grant:v1').digest();
};

const sign = (payloadB64, key) => createHmac('sha256', key).update(payloadB64).digest();

export const signGrant = ({ farmerId, claimObjectId, ttlSeconds = 600, now = Date.now() }, secret) => {
  const key = deriveKey(secret);
  const iat = Math.floor(now / 1000);
  const payload = b64(JSON.stringify({ v: 1, p: PURPOSE, fid: String(farmerId), cid: String(claimObjectId), iat, exp: iat + ttlSeconds }));
  return { token: `${payload}.${b64(sign(payload, key))}`, expiresInSeconds: ttlSeconds };
};

/**
 * Returns { ok: true, claimObjectId } or { ok: false, reason } where reason is
 * 'malformed' | 'signature' | 'purpose' | 'expired' | 'wrong_farmer'.
 */
export const verifyGrant = (token, { farmerId, now = Date.now() }, secret) => {
  const key = deriveKey(secret);
  if (typeof token !== 'string' || token.length > 1000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, reason: 'malformed' };
  }
  const [payloadB64, sigB64] = token.split('.');
  const expected = sign(payloadB64, key);
  const given = Buffer.from(sigB64, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };

  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  if (payload?.v !== 1 || payload.p !== PURPOSE || typeof payload.fid !== 'string' || typeof payload.cid !== 'string') {
    return { ok: false, reason: 'purpose' };
  }
  if (!Number.isInteger(payload.exp) || Math.floor(now / 1000) >= payload.exp) return { ok: false, reason: 'expired' };
  if (payload.fid !== String(farmerId)) return { ok: false, reason: 'wrong_farmer' };
  return { ok: true, claimObjectId: payload.cid };
};
