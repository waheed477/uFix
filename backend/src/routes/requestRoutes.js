const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const offerController = require('../controllers/offerController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

/**
 * Request Routes - Phase 4 Core Business Logic
 * 
 * POST   /api/requests              - customer creates request (customer-only)
 * GET    /api/requests/nearby       - provider views nearby pending requests (provider-only) - merges Phase 3 temp route
 * GET    /api/requests/my           - customer views own requests (customer-only)
 * GET    /api/requests/:id          - get single request with offers (owner or provider who offered)
 * PATCH  /api/requests/:id/cancel   - customer cancels own pending request (customer-only)
 * 
 * Offer nested routes:
 * POST   /api/requests/:id/offers   - provider submits offer (provider-only, verified, online)
 * GET    /api/requests/:id/offers   - customer views offers on own request
 */

// All routes protected
router.use(auth);

// Create request - customer only
router.post('/', roleCheck('customer'), requestController.createRequest);

// Nearby requests for providers - provider only (replaces Phase 3 temporary GET /api/locations/nearby-providers)
router.get('/nearby', roleCheck('provider'), requestController.getNearbyRequests);

// My requests - customer only (must be before /:id to avoid conflict with "my" as id)
router.get('/my', roleCheck('customer'), requestController.getMyRequests);

// Offers on a request
// POST /api/requests/:id/offers - provider submits offer
router.post('/:id/offers', roleCheck('provider'), offerController.createOffer);

// GET /api/requests/:id/offers - customer views offers
router.get('/:id/offers', offerController.getOffersForRequest);

// Get single request - any auth but controller checks ownership/offered
router.get('/:id', requestController.getRequestById);

// Direct accept - customer directly books a provider with price from profile (new provider discovery model)
// POST /api/requests/:id/direct-accept {providerId} - customer directly accepts specific provider without waiting for offers
router.post('/:id/direct-accept', roleCheck('customer'), requestController.directAccept);

// Cancel request - customer only
router.patch('/:id/cancel', roleCheck('customer'), requestController.cancelRequest);

module.exports = router;
