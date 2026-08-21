const mongoose = require('mongoose');

/**
 * RefreshToken model (2026-08-21 Returning-User/Session pass).
 *
 * One document per active login session (device). Storing the bcrypt HASH of the token
 * (not the token itself) means a DB leak doesn't hand out usable sessions, while the
 * document's existence/expiry make refresh tokens actually REVOCABLE server-side
 * (logout deletes the doc; JWT expiry alone couldn't do that).
 *
 * Multi-device: many docs per user - logging in elsewhere never invalidates existing
 * sessions (no forced single-session, per product decision).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Random id embedded in the JWT - lets /refresh find THIS session record directly
    },
    tokenHash: {
      type: String,
      required: true,
      // bcrypt hash of the full refresh token string
    },
    device: {
      type: String,
      maxlength: 120,
      // Optional label (e.g. "Chrome on Windows") for a future "manage sessions" screen
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index - MongoDB auto-purges dead sessions
    },
    revokedAt: {
      type: Date,
      default: null,
      // soft-revocation marker (logout also deletes; belt-and-suspenders)
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
