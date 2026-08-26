/**
 * Rate Limiting (2026-08-26, Security Hardening Task 1)
 *
 * Protects auth endpoints from OTP spam / brute-force + provides a general API safety net.
 * Friendly JSON 429s - never a raw HTML error page.
 *
 * TEST/DEV BYPASS: all limiters are skipped when RATE_LIMIT_DISABLED === 'true' OR
 * NODE_ENV === 'test'. dev-inmemory.js sets RATE_LIMIT_DISABLED=true so the regression
 * battery (hundreds of rapid requests) is unaffected. This is a TEST/localhost-only switch;
 * production never sets it. security-hardening.js still verifies the REAL 429 behavior on
 * a separately-spawned production-mode server with limits ENABLED.
 */
const rateLimit = require('express-rate-limit');

const DISABLED = () => process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === 'true';

const tooMany = (message, retryAfterMinutes) => (req, res) => {
  res.status(429).json({
    status: 'error',
    message,
    ...(retryAfterMinutes ? { retryAfterMinutes } : {}),
  });
};

const build = (opts) => rateLimit({
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  skip: () => DISABLED(),
  ...opts,
});

/* SPECIFIC AUTH LIMITERS (mounted on routes in authRoutes.js) */

// POST /auth/phone/send-otp - per-phone: max 3 OTPs / 10 min (stops SMS spam to one victim)
const otpSendPhone = build({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => `phone:${String(req.body?.phone || 'unknown').trim()}`,
  handler: tooMany('Too many OTP requests for this phone number. Please try again in a few minutes.', 10),
});

// POST /auth/phone/send-otp - per-IP: max 10 / 15 min (stops hammering random numbers)
const otpSendIp = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  handler: tooMany('Too many attempts, please try again in a few minutes', 15),
});

// POST /auth/phone/verify-otp - per-phone: max 5 attempts / 10 min (OTP brute-force guard)
const otpVerifyPhone = build({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `phone:${String(req.body?.phone || 'unknown').trim()}`,
  handler: tooMany('Too many OTP attempts for this phone number. Please request a new code in a few minutes.', 10),
});

// POST /auth/google - per-IP: max 20 / 15 min
const googleAuth = build({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: tooMany('Too many attempts, please try again in a few minutes', 15),
});

/* GENERAL BASELINE: max 100 req/min/IP across ALL /api/* (mounted in server.js) */
const apiBaseline = build({
  windowMs: 60 * 1000,
  limit: 100,
  handler: tooMany('Too many requests, please slow down and try again shortly', 1),
});

module.exports = { otpSendPhone, otpSendIp, otpVerifyPhone, googleAuth, apiBaseline };
