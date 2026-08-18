const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { uploadProfilePicture } = require('../middleware/upload');

/**
 * User Profile Routes - Phase 2 + Phase 3
 * 
 * GET    /api/users/profile              - get own full profile (protected)
 * PATCH  /api/users/profile              - update name, city, profilePicture URL (protected, any role)
 * POST   /api/users/profile/picture      - upload/replace profile picture (protected, multipart)
 * PATCH  /api/users/location             - update current coordinates (protected, any role) - NEW Phase 3
 */

// All routes protected
router.use(auth);

// Get own profile - full data
router.get('/profile', userController.getOwnProfile);

// Update profile - name, city, profilePicture URL
router.patch('/profile', userController.updateProfile);

// Upload profile picture - multipart form-data
router.post('/profile/picture', uploadProfilePicture, userController.uploadProfilePicture);

// Update location - Phase 3 geospatial
router.patch('/location', userController.updateLocation);

module.exports = router;
