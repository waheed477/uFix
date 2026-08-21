const { verifyToken } = require('../utils/generateToken');
const User = require('../models/User');

/**
 * Socket.io Authentication Middleware - Phase 5
 * Verifies JWT from handshake.auth.token (Socket.io v4 standard)
 * Reuses same JWT secret and logic as HTTP auth middleware
 * 
 * Client should connect with:
 * const socket = io('http://localhost:5000', {
 *   auth: { token: 'Bearer_JWT_OR_JUST_JWT' }
 * });
 * Or: { auth: { token: jwt } }
 */

const authSocketMiddleware = async (socket, next) => {
  try {
    // Try to get token from handshake.auth.token or handshake.query.token (fallback)
    // Socket.io clients typically send via auth object
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      console.warn(`❌ Socket connection rejected - no token provided (socket ${socket.id})`);
      return next(new Error('Authentication error: No token provided'));
    }

    // Allow "Bearer <token>" format or just "<token>"
    if (token.startsWith('Bearer ')) {
      token = token.split(' ')[1];
    }

    if (!token) {
      return next(new Error('Authentication error: Invalid token format'));
    }

    // Verify JWT using same logic as HTTP
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired'));
      }
      return next(new Error('Authentication error: Invalid token'));
    }

    // Dual-token enforcement (2026-08-21): sockets authenticate with ACCESS tokens only.
    if (decoded.type !== 'access') {
      return next(new Error('Authentication error: Access token required'));
    }

    // Ensure user still exists in DB
    const user = await User.findById(decoded.id).select('name role phone isOnline isVerified');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    // Attach user info to socket object
    socket.user = {
      id: user._id.toString(),
      _id: user._id,
      role: user.role,
      name: user.name,
      phone: user.phone
    };
    socket.userDoc = user; // optional full doc

    next();
  } catch (error) {
    console.error('Socket auth middleware error:', error.message);
    next(new Error('Authentication error: Internal error'));
  }
};

module.exports = authSocketMiddleware;
