const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

/**
 * Offer Routes - Phase 4
 * 
 * PATCH /api/offers/:id/accept - customer accepts an offer
 */

// All routes protected
router.use(auth);

// Accept offer - customer only
router.patch('/:id/accept', roleCheck('customer'), offerController.acceptOffer);

// Decline a single pending offer - customer only (request stays open)
router.patch('/:id/decline', roleCheck('customer'), offerController.declineOffer);

module.exports = router;
