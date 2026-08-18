const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const auth = require('../middleware/auth');

/**
 * Review Routes - Phase 8 Ratings
 * 
 * POST /api/jobs/:jobId/rate - rate other party after job completed
 * GET  /api/jobs/:jobId/reviews - get reviews for job (participants only)
 */

// All routes protected
router.use(auth);

// Rate a job - only works if job completed, only participants, rates other party automatically
router.post('/:jobId/rate', reviewController.rateJob);

// Get reviews for a job - participants only
router.get('/:jobId/reviews', reviewController.getReviewsForJob);

module.exports = router;
