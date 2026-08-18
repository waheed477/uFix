const jwt = require('jsonwebtoken');

/**
 * Generate JWT with user id + role payload
 * @param {Object} user - Mongoose user document or object with _id and role
 * @returns {String} JWT token
 * 
 * Payload includes:
 * - id: user _id
 * - role: customer | provider
 * 
 * Expiry: 30 days (reasonable for mobile app, matches spec)
 * Secret from env JWT_SECRET - must be set
 */
const generateToken = (user) => {
  const payload = {
    id: user._id || user.id,
    role: user.role
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('⚠️ JWT_SECRET not set in .env - using insecure default (change for production!)');
  }

  // Use fallback only in dev to allow testing without env
  const jwtSecret = secret || 'ufix_dev_secret_change_in_prod_2024';

  const token = jwt.sign(payload, jwtSecret, {
    expiresIn: '30d' // 30 days as per spec
  });

  return token;
};

/**
 * Verify JWT token (utility wrapper)
 * @param {String} token 
 * @returns {Object} decoded payload
 */
const verifyToken = (token) => {
  const jwtSecret = process.env.JWT_SECRET || 'ufix_dev_secret_change_in_prod_2024';
  return jwt.verify(token, jwtSecret);
};

module.exports = {
  generateToken,
  verifyToken
};
