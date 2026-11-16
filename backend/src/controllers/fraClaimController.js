const NOT_FOUND_MESSAGE = "We couldn't find a claim with that reference ID linked to your account.";

/**
 * HTTP layer for farmer FRA Monitoring. Runs after authenticate + authorize('FARMER') + validation,
 * so req.user is a FARMER and req.fraInput is validated. The farmer id ALWAYS comes from req.user.
 */
export const createFraClaimController = ({ service, limiter, logger = console }) => {
  const noStore = (res) => res.set('Cache-Control', 'no-store');

  const verify = async (req, res, next) => {
    try {
      noStore(res);
      const farmerId = String(req.user._id);

      const gate = limiter.check(farmerId);
      if (gate.blocked) {
        res.set('Retry-After', String(gate.retryAfterSeconds));
        return res.status(429).json({
          success: false, code: 'FRA_TOO_MANY_ATTEMPTS',
          message: 'Too many unsuccessful attempts. Please wait a few minutes and try again.',
          // Also in the body: a cross-origin browser cannot read the Retry-After header unless CORS exposes it.
          retryAfterSeconds: gate.retryAfterSeconds,
        });
      }

      const result = await service.verify({ claimId: req.fraInput.claimId, farmerId });
      if (!result.ok) {
        limiter.fail(farmerId);
        logger.warn(`[fra] reference ID not verified for user ${farmerId}`); // the ID itself is not logged
        // Identical response for "does not exist" and "belongs to someone else".
        return res.status(404).json({ success: false, code: 'FRA_CLAIM_NOT_FOUND', message: NOT_FOUND_MESSAGE });
      }
      return res.status(200).json({
        success: true,
        message: 'Reference ID verified',
        data: { claimId: result.claimId, grant: result.grant, expiresInSeconds: result.expiresInSeconds },
      });
    } catch (error) {
      return next(error);
    }
  };

  const view = async (req, res, next) => {
    try {
      noStore(res);
      const result = await service.view({ grant: req.fraInput.grant, farmerId: String(req.user._id) });
      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') {
          return res.status(404).json({ success: false, code: 'FRA_CLAIM_NOT_FOUND', message: NOT_FOUND_MESSAGE });
        }
        const expired = result.reason === 'EXPIRED';
        return res.status(403).json({
          success: false,
          code: expired ? 'FRA_VERIFICATION_EXPIRED' : 'FRA_VERIFICATION_INVALID',
          message: expired
            ? 'Your verification has expired. Please enter your reference ID again.'
            : 'Please verify your claim reference ID first.',
        });
      }
      return res.status(200).json({ success: true, message: 'Claim details', data: { claim: result.claim } });
    } catch (error) {
      return next(error);
    }
  };

  return { verify, view };
};
