const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

/**
 * Notification Routes - Phase 8 Notification Persistence
 * 
 * GET    /api/notifications              - get current user's notifications, newest-first, paginated, includes unreadCount
 * PATCH  /api/notifications/:id/read     - mark one as read (only if belongs to requester)
 * PATCH  /api/notifications/read-all     - mark all of requester's notifications as read
 */

// All routes protected
router.use(auth);

// Get notifications - newest-first, paginated, includes unreadCount
router.get('/', notificationController.getNotifications);

// Mark all as read - must be before /:id/read to avoid conflict with "read-all" being treated as id
router.patch('/read-all', notificationController.markAllAsRead);

// Mark one as read
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
