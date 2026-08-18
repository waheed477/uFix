const mongoose = require('mongoose');

/**
 * OTP Model - Simple Phone OTP system (chosen for minimal external setup)
 * 
 * WHY simple OTP instead of Firebase/Twilio?
 * - Zero external credentials needed to get started
 * - Perfect for portfolio/Phase 1 testing
 * - Production can later swap to Twilio/Firebase by replacing send logic
 * - OTP is logged to console in dev mode for easy testing
 * 
 * Flow:
 * 1. POST /api/auth/phone/send-otp { phone } -> generates 6-digit code, saves with 5-min expiry
 * 2. Console logs OTP (dev) -> in prod would send via SMS
 * 3. POST /api/auth/phone/verify-otp { phone, otp } -> checks expiry & matches, then issues JWT
 * 
 * TODO Phase 1+: Replace console.log with real SMS provider when credentials provided
 */

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  otp: {
    type: String,
    required: true,
    // In production we would hash this with bcrypt; 
    // For Phase 1 we store plain + log for dev convenience
    // HASHED version can be added: store hash, compare via bcrypt
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
  },
  attempts: {
    type: Number,
    default: 0,
    // To prevent brute force - lock after 5 attempts
  },
  verified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // TTL index will auto-delete expired docs (MongoDB)
  }
}, {
  timestamps: true
});

// TTL index - auto remove after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Also index for faster lookup of latest OTP per phone
otpSchema.index({ phone: 1, createdAt: -1 });

// Method to check if OTP is expired
otpSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

const Otp = mongoose.model('Otp', otpSchema);

module.exports = Otp;
