/**
 * Restricts a route to specific roles. Must run after `authenticate`.
 * Usage: router.use(authenticate, authorize('FARMER'))
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this resource.',
    });
  }

  return next();
};

export default authorize;
