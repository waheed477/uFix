const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

/**
 * Auth Routes - Phase 1
 * 
 * POST   /api/auth/google          - Google Sign-In
 * POST   /api/auth/phone/send-otp  - Send OTP to phone
 * POST   /api/auth/phone/verify-otp - Verify OTP & get JWT
 * GET    /api/auth/me              - Get current user (protected)
 */

// Google Sign-In
router.post('/google', authController.googleAuth);

// Phone OTP - send
router.post('/phone/send-otp', authController.sendOtp);

// Phone OTP - verify
router.post('/phone/verify-otp', authController.verifyOtp);

// Session management (2026-08-21): refresh is PUBLIC (its own token IS the credential);
// logout revokes the presented refresh session server-side (idempotent)
router.post('/refresh', authController.refreshSession);
router.post('/logout', authController.logout);

// Get current user - protected
router.get('/me', auth, authController.getMe);

module.exports = router;
