const { verifyToken } = require('../utils/jwt');
const { ApiError } = require('./error');

function normalizeRoleName(roleName) {
  const normalized = String(roleName || 'USER').toUpperCase();
  if (normalized === 'ROLE_ADMIN' || normalized === 'ADMIN') return 'ADMIN';
  if (normalized === 'ROLE_USER' || normalized === 'USER') return 'USER';
  return normalized.replace(/^ROLE_/, '');
}

/**
 * Authentication / authorization middleware factory.
 *
 *   authMiddleware()                      -> requires a valid token
 *   authMiddleware({ optional: true })    -> attaches user if a token is present
 *   authMiddleware({ role: 'ADMIN' })     -> requires ADMIN (or any admin)
 */
function authMiddleware(options = {}) {
  return (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      if (options.optional) {
        req.userId = null;
        req.userRole = null;
        return next();
      }
      return next(ApiError.unauthorized('Unauthorized: missing token'));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      if (options.optional) {
        req.userId = null;
        req.userRole = null;
        return next();
      }
      return next(ApiError.unauthorized('Unauthorized: invalid or expired token'));
    }

    req.userId = decoded.userId ?? decoded.id ?? decoded.sub ?? null;
    req.userRole = normalizeRoleName(decoded.role || decoded.roleName);

    if (options.role) {
      const requiredRole = normalizeRoleName(options.role);
      if (req.userRole !== requiredRole && req.userRole !== 'ADMIN') {
        return next(ApiError.forbidden('Forbidden: insufficient permissions'));
      }
    }

    return next();
  };
}

module.exports = { authMiddleware, normalizeRoleName };
