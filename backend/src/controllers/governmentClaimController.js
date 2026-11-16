const NOT_FOUND = { success: false, code: 'CLAIM_NOT_FOUND', message: 'Claim not found.' };

/**
 * HTTP layer for government claim management. Runs after authenticate + authorize('GOVERNMENT_OFFICIAL') + validation.
 * The official (and therefore the jurisdiction) is ALWAYS req.user. Query values arrive only through the validators.
 */
export const createGovernmentClaimController = ({ service, logger = console }) => {
  const noStore = (res) => res.set('Cache-Control', 'no-store');

  const denied = (res, result) => {
    switch (result.reason) {
      case 'NO_JURISDICTION':
        return res.status(403).json({ success: false, code: 'NO_JURISDICTION', message: 'No area is assigned to your account, so you cannot access claims.' });
      case 'NOT_FOUND':
        return res.status(404).json(NOT_FOUND);
      case 'VALIDATION':
        return res.status(400).json({ success: false, message: 'Validation failed', errors: result.errors });
      case 'INVALID_TRANSITION':
        return res.status(409).json({ success: false, code: 'CLAIM_INVALID_TRANSITION', message: 'That action is not available for the claim\'s current status.', currentStatus: result.currentStatus, allowedActions: result.allowedActions });
      case 'STATE_CHANGED':
        return res.status(409).json({ success: false, code: 'CLAIM_STATE_CHANGED', message: 'This claim was changed by someone else. Please review its current status and try again.', currentStatus: result.currentStatus });
      default:
        return null;
    }
  };

  return {
    list: async (req, res, next) => {
      try {
        noStore(res);
        const data = await service.list({ user: req.user, query: req.govQuery });
        return res.status(200).json({ success: true, message: 'Claims', data });
      } catch (error) { return next(error); }
    },

    filters: async (req, res, next) => {
      try {
        noStore(res);
        return res.status(200).json({ success: true, message: 'Claim filters', data: await service.filterOptions({ user: req.user }) });
      } catch (error) { return next(error); }
    },

    map: async (req, res, next) => {
      try {
        noStore(res);
        const data = await service.mapData({ user: req.user, query: req.govQuery });
        return res.status(200).json({ success: true, message: 'Map data', data });
      } catch (error) { return next(error); }
    },

    detail: async (req, res, next) => {
      try {
        noStore(res);
        const result = await service.getClaim({ user: req.user, claimId: req.claimId });
        if (!result.ok) return denied(res, result);
        return res.status(200).json({ success: true, message: 'Claim details', data: { claim: result.claim } });
      } catch (error) { return next(error); }
    },

    action: async (req, res, next) => {
      try {
        noStore(res);
        const result = await service.performAction({ user: req.user, claimId: req.claimId, input: req.actionInput });
        if (!result.ok) return denied(res, result);
        // Audit trail on the server log too: who, what, which claim (no free text).
        logger.info?.(`[claims] ${req.actionInput.action} on ${req.claimId} by official ${String(req.user._id)}`);
        return res.status(200).json({ success: true, message: 'Claim updated', data: { claim: result.claim } });
      } catch (error) { return next(error); }
    },
  };
};
