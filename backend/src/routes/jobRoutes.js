const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

/**
 * Job Routes - Phase 6 Job Lifecycle & Contact Unlock + Phase 8 Order History
 * 
 * GET    /api/jobs/my/active   - get current user's active job (both roles) - must be before /:id
 * GET    /api/jobs/history     - get order history (both roles, filter by status) - Phase 8 NEW
 * GET    /api/jobs/:id         - get job details with contact unlock (only participants)
 * PATCH  /api/jobs/:id/status  - advance status (provider-only, forward only, emits job:statusUpdate)
 */

// All routes protected
router.use(auth);

// Active job for current user - both roles, must be before /:id to avoid conflict
router.get('/my/active', jobController.getMyActiveJob);

// Order history - both roles, must be before /:id as well (history is not an id)
router.get('/history', jobController.getOrderHistory);

// Get job by id - protected, only participants (checked in controller)
router.get('/:id', jobController.getJobById);

// Update status - provider only (role check + controller checks participant)
router.patch('/:id/status', roleCheck('provider'), jobController.updateJobStatus);

module.exports = router;
