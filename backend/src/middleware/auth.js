const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware
 * Verifies JWT from Authorization header (Bearer token)
 * Attaches decoded user to req.user
 * Returns 401 if missing/invalid
 */

const auth = async (req, res, next) => {
  try {
    // Check Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided. Please include Authorization: Bearer <token> header'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token format. Use Bearer <token>'
      });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET || 'ufix_dev_secret_change_in_prod_2024';
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          message: 'Token expired. Please login again.'
        });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token. Please login again.'
        });
      }
      throw err;
    }

    // Dual-token enforcement (2026-08-21): ONLY access-type tokens authorize API calls.
    // A refresh token presented here is rejected so it can never act as an API credential.
    if (decoded.type !== 'access') {
      return res.status(401).json({
        status: 'error',
        message: 'Access token required (use /api/auth/refresh to renew a session).',
        code: 'ACCESS_TOKEN_REQUIRED'
      });
    }

    // Find user from DB (ensure user still exists & attach full user)
    const user = await User.findById(decoded.id).select('-__v');

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found for this token. Please login again.'
      });
    }

    // Attach user info to request
    req.user = {
      id: user._id,
      _id: user._id, // for convenience
      role: user.role,
      phone: user.phone,
      email: user.email,
      name: user.name
    };
    req.userDoc = user; // full doc if needed in controller

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({
      status: 'error',
      message: 'Authentication failed',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = auth;
