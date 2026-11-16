import { signGrant, verifyGrant } from '../utils/fraGrant.js';
import { toFarmerClaimView } from './fraClaimView.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * Claim verification + retrieval for FARMERS. Framework- and database-free: the repository is injected.
 *
 * SECURITY: `farmerId` must always be the authenticated user's id (req.user._id). It is never read from the
 * request body, query, or URL. Every repository lookup includes it, so a claim that belongs to someone else is
 * indistinguishable from one that does not exist.
 */
export const createFraClaimService = ({
  repository,
  getSecret = () => process.env.JWT_SECRET,
  getTtlSeconds = () => Number.parseInt(process.env.FRA_GRANT_TTL_SECONDS || '', 10) || 600,
  now = () => Date.now(),
}) => ({
  /** Step 1: claimId + owner check. Returns { ok: true, claimId, grant, expiresInSeconds } or { ok: false, reason: 'NOT_FOUND' }. */
  async verify({ claimId, farmerId }) {
    const claim = await repository.findOwnedByClaimId(claimId, farmerId);
    if (!claim) return { ok: false, reason: 'NOT_FOUND' };
    const { token, expiresInSeconds } = signGrant(
      { farmerId, claimObjectId: claim._id, ttlSeconds: getTtlSeconds(), now: now() },
      getSecret()
    );
    return { ok: true, claimId: claim.claimId, grant: token, expiresInSeconds };
  },

  /** Step 2: valid grant for THIS farmer + owner re-check. Returns { ok: true, claim } or { ok: false, reason }. */
  async view({ grant, farmerId }) {
    const result = verifyGrant(grant, { farmerId, now: now() }, getSecret());
    if (!result.ok) return { ok: false, reason: result.reason === 'expired' ? 'EXPIRED' : 'INVALID' };
    if (!OBJECT_ID.test(result.claimObjectId)) return { ok: false, reason: 'INVALID' };

    const claim = await repository.findOwnedById(result.claimObjectId, farmerId);
    if (!claim) return { ok: false, reason: 'NOT_FOUND' };
    return { ok: true, claim: toFarmerClaimView(claim) };
  },
});
