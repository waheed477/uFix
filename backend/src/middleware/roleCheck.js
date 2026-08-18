/**
 * Role-based access control middleware
 * Reusable function that restricts routes to specific roles
 * Usage: roleCheck('provider') or roleCheck('customer', 'provider')
 * 
 * Must be used AFTER auth middleware (so req.user exists)
 */

const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required before role check'
        });
      }

      // Flatten if array passed
      // Supports roleCheck('provider') or roleCheck(['customer','provider'])
      const roles = allowedRoles.flat();

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          status: 'error',
          message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
          requiredRoles: roles,
          yourRole: req.user.role
        });
      }

      next();
    } catch (error) {
      console.error('roleCheck error:', error.message);
      return res.status(403).json({
        status: 'error',
        message: 'Role check failed'
      });
    }
  };
};

module.exports = roleCheck;
