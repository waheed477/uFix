const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');

/**
 * Message Routes - Phase 7 Chat System
 * 
 * GET /api/jobs/:jobId/messages - protected, only job's customer or provider can access
 * Returns messages sorted oldest-first
 * This endpoint is for loading chat history when opening chat screen
 * Actual sending happens via Socket.io (chat:send), not REST - avoids redundant REST+socket double-path
 * Design decision documented in project_context.md
 */

// All routes protected
router.use(auth);

// Get chat history for a job
router.get('/:jobId/messages', messageController.getMessages);

module.exports = router;
