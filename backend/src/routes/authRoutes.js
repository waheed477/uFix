const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { otpSendPhone, otpSendIp, otpVerifyPhone, googleAuth } = require('../middleware/rateLimit');

/**
 * Auth Routes - Phase 1
 * 
 * POST   /api/auth/google          - Google Sign-In
 * POST   /api/auth/phone/send-otp  - Send OTP to phone
 * POST   /api/auth/phone/verify-otp - Verify OTP & get JWT
 * GET    /api/auth/me              - Get current user (protected)
 */

// Google Sign-In
// Rate-limited (2026-08-26 hardening): 20/15min per IP
router.post('/google', googleAuth, authController.googleAuth);

// Phone OTP - send
// Rate-limited: IP 10/15min AND 3/10min per phone (OTP spam/brute-force guard)
router.post('/phone/send-otp', otpSendIp, otpSendPhone, authController.sendOtp);

// Phone OTP - verify
// Rate-limited: 5/10min per phone (6-digit OTP brute-force guard)
router.post('/phone/verify-otp', otpVerifyPhone, authController.verifyOtp);

// Session management (2026-08-21): refresh is PUBLIC (its own token IS the credential);
// logout revokes the presented refresh session server-side (idempotent)
router.post('/refresh', authController.refreshSession);
router.post('/logout', authController.logout);

// Get current user - protected
router.get('/me', auth, authController.getMe);

module.exports = router;
