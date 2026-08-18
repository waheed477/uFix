const express = require('express');
const router = express.Router();
const providerController = require('../controllers/providerController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { uploadVerificationDocument } = require('../middleware/upload');

/**
 * Provider Routes - Phase 2
 * 
 * PATCH  /api/providers/setup                  - set category, radiusKm, yearsExperience (provider-only)
 * POST   /api/providers/document               - upload verification doc (provider-only, pending)
 * GET    /api/providers/verification-status    - check verification status (provider-only)
 * PATCH  /api/providers/:id/verify             - temporary manual approval (admin secret or open with warning)
 */

// Specific routes must come before :id route to avoid conflict

// Setup - provider only
router.patch('/setup', auth, roleCheck('provider'), providerController.setupProvider);

// Document upload - provider only
router.post('/document', auth, roleCheck('provider'), uploadVerificationDocument, providerController.uploadDocument);

// Verification status - provider only
router.get('/verification-status', auth, roleCheck('provider'), providerController.getVerificationStatus);

// NEW: Available providers by city (for customer) - city-based filtering
// GET /api/providers/available?city=Lahore&category=plumber
router.get('/available', auth, providerController.getAvailableProviders);

// DEV ONLY auto-verify - no admin secret needed, for local testing ease
// POST /api/providers/dev/verify-me - auto-verifies current provider in dev mode
router.post('/dev/verify-me', auth, roleCheck('provider'), providerController.devAutoVerify);

// Temporary verify route - for testing/manual approval
// Note: this is insecure in Phase 2, needs real admin auth later. 
// Protected by ADMIN_SECRET header if set, otherwise open with warning
router.patch('/:id/verify', auth, providerController.verifyProvider);

module.exports = router;
