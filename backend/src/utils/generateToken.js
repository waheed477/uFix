const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Token utilities - dual-token auth (2026-08-21 Returning-User/Session pass).
 *
 * ACCESS token: short-lived (25 min) - authorizes every API call + socket handshake.
 * REFRESH token: long-lived (30 days) - ONLY usable at POST /api/auth/refresh; carries a
 *   `jti` so the server can look up + revoke the stored (bcrypt-hashed) token record.
 * Both are signed with JWT_SECRET and carry `type: 'access' | 'refresh'` so middleware
 * can hard-reject the wrong kind (a refresh token must NEVER authorize API/socket access).
 */

const ACCESS_TTL = '25m';
const REFRESH_TTL_DAYS = 30;
const REFRESH_TTL = `${REFRESH_TTL_DAYS}d`;
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('⚠️ JWT_SECRET not set in .env - using insecure default (change for production!)');
  }
  return secret || 'ufix_dev_secret_change_in_prod_2024';
};

const basePayload = (user) => ({ id: user._id || user.id, role: user.role });

/** Short-lived API/socket token. */
const generateAccessToken = (user) =>
  jwt.sign({ ...basePayload(user), type: 'access' }, getSecret(), { expiresIn: ACCESS_TTL });

/** Long-lived renewal token. jti = the server-side session record id (revocation handle). */
const generateRefreshToken = (user, jti) =>
  jwt.sign({ ...basePayload(user), type: 'refresh', jti: jti || crypto.randomBytes(16).toString('hex') }, getSecret(), { expiresIn: REFRESH_TTL });

/**
 * Backwards-compat alias kept = ACCESS token now (30d un-typed tokens are gone; the auth
 * middlewares only accept type:'access', so every live flow gets short-lived tokens).
 */
const generateToken = (user) => generateAccessToken(user);

const verifyToken = (token) => jwt.verify(token, getSecret());

module.exports = {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  REFRESH_TTL_MS,
};
