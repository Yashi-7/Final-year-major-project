/**
 * GET /api/government/dashboard/summary
 * Runs after authenticate + authorize('GOVERNMENT_OFFICIAL'). The scope comes ONLY from req.user (the logged-in
 * official's stored jurisdiction). Query strings, params and bodies are deliberately never read, so a caller
 * cannot widen their own scope.
 */
export const createGovernmentDashboardController = ({ service }) => ({
  summary: async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const data = await service.getSummary({ user: req.user });
      return res.status(200).json({ success: true, message: 'Government dashboard summary', data });
    } catch (error) {
      return next(error);
    }
  },
});
