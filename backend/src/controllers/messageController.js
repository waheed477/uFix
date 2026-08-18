const Job = require('../models/Job');
const Message = require('../models/Message');
const { adaptMessageForFrontend } = require('../utils/responseAdapters');

/**
 * Message Controller - Phase 7 Chat System
 * Handles REST history endpoint - sending is via Socket.io
 */

/**
 * @route GET /api/jobs/:jobId/messages
 * @desc Get chat history for a job - protected, only job's customer or provider
 * @access Private
 * 
 * Design Decision: REST for history, Socket for sending (real-time)
 * - History: When user opens chat screen, load past messages via REST GET
 * - Sending: Actual send happens via Socket.io chat:send event (real-time, avoids redundant REST+socket double-path)
 * - This is efficient and avoids duplicate logic - REST only reads, socket only writes (plus emits)
 * - Documented in project_context.md
 * 
 * Query params (optional, for future pagination):
 * - before: ISO date string or timestamp - return messages before this date (cursor pagination)
 * - limit: number - max messages to return (default 100, max 200)
 * For Phase 7 scale (<20 users), simple full-history return is acceptable, but we support basic pagination
 */
const getMessages = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { before, limit } = req.query;

    // Check job exists
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Access check: only customer or provider can access
    const userId = req.user.id.toString();
    const isCustomer = job.customer.toString() === userId;
    const isProvider = job.provider.toString() === userId;

    if (!isCustomer && !isProvider) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only job participants can view chat history.'
      });
    }

    // Build query
    const query = { job: jobId };

    // Optional before cursor for pagination
    if (before) {
      let beforeDate;
      // Try parse as timestamp number or ISO string
      if (!isNaN(before)) {
        // timestamp number or string number
        beforeDate = new Date(parseInt(before));
      } else {
        beforeDate = new Date(before);
      }

      if (!isNaN(beforeDate.getTime())) {
        query.createdAt = { $lt: beforeDate };
      }
    }

    // Limit handling
    let parsedLimit = 100; // default
    if (limit) {
      const l = parseInt(limit);
      if (!isNaN(l) && l > 0) {
        parsedLimit = Math.min(l, 200); // max 200
      }
    }

    // Fetch messages sorted oldest-first (for chat UI, oldest at top, newest at bottom)
    const messages = await Message.find(query)
      .populate('sender', 'name phone role profilePicture')
      .sort({ createdAt: 1 })
      .limit(parsedLimit);

    // Adapt for frontend
    const adapted = messages.map(m => adaptMessageForFrontend(m, { currentUserId: userId }));

    return res.status(200).json({
      status: 'success',
      jobId,
      count: adapted.length,
      messages: adapted,
      // Also include raw backend for debugging
      _backend: {
        job: job._id,
        count: messages.length,
        sort: 'oldest-first (createdAt asc)',
        pagination: {
          before: before || null,
          limit: parsedLimit,
          note: 'For Phase 7 scale (<20 users), full-history return is acceptable. For larger scale, use before cursor + limit for pagination.'
        }
      },
      designDecision: 'REST for history (GET when opening chat screen), Socket.io for sending (chat:send) to avoid redundant REST+socket double-path'
    });

  } catch (error) {
    console.error('GetMessages error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get messages',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  getMessages
};
