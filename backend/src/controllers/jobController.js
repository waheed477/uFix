const Job = require('../models/Job');
const Request = require('../models/Request');
const { adaptJobForFrontend, adaptJobStatusPayload } = require('../utils/responseAdapters');
const { createNotification } = require('../utils/notify');

/**
 * Job Controller - Phase 6 Job Lifecycle & Contact Unlock
 */

const VALID_STATUS_SEQUENCE = ['on_the_way', 'arrived', 'in_progress', 'completed'];
const STATUS_ORDER = {
  'on_the_way': 0,
  'arrived': 1,
  'in_progress': 2,
  'completed': 3
};

/**
 * @route GET /api/jobs/:id
 * @desc Get job full details - only customer or provider can view
 * CONTACT UNLOCK: Since Job only exists after acceptance, phone numbers ALWAYS included
 * @access Private
 */
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    const job = await Job.findById(id)
      .populate('customer', 'name phone city profilePicture rating reviews')
      .populate('provider', 'name phone city profilePicture rating reviews category yearsExperience')
      .populate('request', 'category description location address status')
      .populate('offer', 'visitingCharge etaMinutes status');

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Access check: only customer or provider can view
    const userId = req.user.id.toString();
    const isCustomer = job.customer._id.toString() === userId;
    const isProvider = job.provider._id.toString() === userId;

    if (!isCustomer && !isProvider) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only job participants can view this job.'
      });
    }

    // Contact unlock - both parties phone included since job exists after acceptance
    // Confirm matches product spec: "accept hote hi phone number unlock"
    const adapted = adaptJobForFrontend(job);

    return res.status(200).json({
      status: 'success',
      job: {
        id: job._id,
        request: job.request,
        customer: {
          id: job.customer._id,
          name: job.customer.name,
          phone: job.customer.phone, // unlocked
          city: job.customer.city,
          profilePicture: job.customer.profilePicture,
          rating: job.customer.rating,
          reviews: job.customer.reviews
        },
        provider: {
          id: job.provider._id,
          name: job.provider.name,
          phone: job.provider.phone, // unlocked
          city: job.provider.city,
          profilePicture: job.provider.profilePicture,
          rating: job.provider.rating,
          reviews: job.provider.reviews,
          category: job.provider.category,
          yearsExperience: job.provider.yearsExperience
        },
        offer: {
          id: job.offer._id,
          visitingCharge: job.offer.visitingCharge,
          etaMinutes: job.offer.etaMinutes,
          // Frontend compatible
          etaMin: job.offer.etaMinutes,
          status: job.offer.status
        },
        status: job.status,
        statusHistory: job.statusHistory,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        contactUnlocked: true, // explicit flag
        contactUnlockNote: 'Phone numbers unlocked at acceptance (Job creation time) - per product spec'
      },
      // Frontend adapted shape for Phase 9 integration
      frontend: adapted
    });

  } catch (error) {
    console.error('GetJobById error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get job',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/jobs/:id/status
 * @desc Advance job status - provider-only, forward only, no skipping, no backward
 * @body { status: on_the_way|arrived|in_progress|completed }
 * @access Private - provider only (only provider drives timeline)
 */
const updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({
        status: 'error',
        message: 'Status is required',
        validStatuses: VALID_STATUS_SEQUENCE,
        currentSequence: 'on_the_way → arrived → in_progress → completed'
      });
    }

    if (!VALID_STATUS_SEQUENCE.includes(newStatus)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid status. Must be one of: ${VALID_STATUS_SEQUENCE.join(', ')}`,
        validStatuses: VALID_STATUS_SEQUENCE
      });
    }

    const job = await Job.findById(id)
      .populate('customer')
      .populate('provider')
      .populate('request');

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Role check: only provider can advance status
    if (job.provider._id.toString() !== req.user.id.toString()) {
      // Also check role from token - must be provider
      if (req.user.role !== 'provider') {
        return res.status(403).json({
          status: 'error',
          message: 'Only provider can advance job status. Customer cannot drive timeline.',
          yourRole: req.user.role
        });
      }
      // If provider role but not the job's provider
      if (job.provider._id.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Only the job provider can advance status.'
        });
      }
    }

    // Additional role check: ensure provider role (even if somehow customer is provider? but role check above)
    // Actually if provider role but different provider, already blocked. If customer role, blocked earlier by role = provider check
    // Let's double-check: if user is customer trying to advance, block
    if (req.user.role === 'customer') {
      return res.status(403).json({
        status: 'error',
        message: 'Customer cannot advance job status. Only provider drives the timeline.',
        note: 'Frontend timeline: provider advances on_the_way → arrived → in_progress → completed'
      });
    }

    const currentStatus = job.status;
    const currentOrder = STATUS_ORDER[currentStatus];
    const newOrder = STATUS_ORDER[newStatus];

    if (newOrder === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid new status'
      });
    }

    // Prevent backward
    if (newOrder < currentOrder) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot move status backward. Current: ${currentStatus}, attempted: ${newStatus}`,
        currentStatus,
        attempted: newStatus,
        rule: 'Status can only move forward'
      });
    }

    // Prevent skipping
    if (newOrder > currentOrder + 1) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot skip status stages. Current: ${currentStatus}, attempted: ${newStatus}. Must go in sequence: on_the_way → arrived → in_progress → completed`,
        currentStatus,
        attempted: newStatus,
        expectedNext: VALID_STATUS_SEQUENCE[currentOrder + 1],
        fullSequence: VALID_STATUS_SEQUENCE
      });
    }

    // Same status - idempotent, return success but no change
    if (newOrder === currentOrder) {
      return res.status(200).json({
        status: 'success',
        message: `Job already in status ${newStatus}`,
        job: {
          id: job._id,
          status: job.status,
          statusHistory: job.statusHistory
        }
      });
    }

    // Valid forward transition: update status, push to history
    job.status = newStatus;
    job.statusHistory.push({ status: newStatus, timestamp: new Date() });

    if (newStatus === 'completed') {
      job.completedAt = new Date();

      // Update linked Request status to completed too (keep in sync at completion)
      try {
        await Request.findByIdAndUpdate(job.request, { status: 'completed' });
        if (process.env.NODE_ENV !== 'production') {
          console.log(`✅ Request ${job.request} marked completed when Job ${job._id} completed`);
        }
      } catch (reqErr) {
        console.error('Failed to update Request status to completed:', reqErr.message);
        // Don't fail job update if request update fails
      }
    }

    await job.save();

    // --- Socket.io: Emit job:statusUpdate to both customer and provider (Phase 6) ---
    // --- Notification Persistence: Notify both parties of status change (Phase 8) ---
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = adaptJobStatusPayload(job);

        // Emit to both customer and provider rooms
        io.to(`user:${job.customer._id}`).emit('job:statusUpdate', payload);
        io.to(`user:${job.provider._id}`).emit('job:statusUpdate', payload);

        if (process.env.NODE_ENV !== 'production') {
          console.log(`📤 job:statusUpdate emitted to customer user:${job.customer._id} and provider user:${job.provider._id} - new status: ${newStatus}`);
        }
      }

      // Notification persistence for both parties
      try {
        const statusMessages = {
          'on_the_way': 'Provider is on the way',
          'arrived': 'Provider has arrived',
          'in_progress': 'Work is in progress',
          'completed': 'Job completed'
        };
        const statusTitle = statusMessages[newStatus] || `Job status: ${newStatus}`;

        await createNotification({
          userId: job.customer._id,
          type: 'job_status_update',
          title: statusTitle,
          body: `Your ${job.request?.category || 'service'} job is now ${newStatus.replace('_', ' ')}`,
          relatedId: job._id
        });

        await createNotification({
          userId: job.provider._id,
          type: 'job_status_update',
          title: statusTitle,
          body: `Job status updated to ${newStatus.replace('_', ' ')}`,
          relatedId: job._id
        });
      } catch (notifyErr) {
        console.error('Notification creation for job:statusUpdate failed:', notifyErr.message);
      }
    } catch (socketErr) {
      console.error('Socket emit job:statusUpdate failed:', socketErr.message);
    }

    const adapted = adaptJobForFrontend(job);

    return res.status(200).json({
      status: 'success',
      message: `Job status updated to ${newStatus}`,
      job: {
        id: job._id,
        status: job.status,
        statusHistory: job.statusHistory,
        completedAt: job.completedAt,
        request: job.request,
        customer: job.customer._id,
        provider: job.provider._id
      },
      // Frontend adapted for Phase 9
      frontend: adapted,
      socketEmitted: true,
      socketEvent: 'job:statusUpdate'
    });

  } catch (error) {
    console.error('UpdateJobStatus error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update job status',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/jobs/my/active
 * @desc Get current user's active (non-completed) job if exists - works for both roles
 * @access Private
 */
const getMyActiveJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query;
    if (userRole === 'customer') {
      query = { customer: userId, status: { $ne: 'completed' } };
    } else if (userRole === 'provider') {
      query = { provider: userId, status: { $ne: 'completed' } };
    } else {
      // Fallback: check both
      query = {
        $or: [{ customer: userId }, { provider: userId }],
        status: { $ne: 'completed' }
      };
    }

    // Find most recent active (or on_the_way, arrived, in_progress)
    const job = await Job.findOne(query)
      .populate('customer', 'name phone city profilePicture')
      .populate('provider', 'name phone city profilePicture category rating')
      .populate('request', 'category description location address status')
      .populate('offer', 'visitingCharge etaMinutes')
      .sort({ createdAt: -1 });

    if (!job) {
      return res.status(404).json({
        status: 'success',
        message: 'No active job found',
        job: null
      });
    }

    const adapted = adaptJobForFrontend(job);

    return res.status(200).json({
      status: 'success',
      job: {
        id: job._id,
        request: job.request,
        customer: {
          id: job.customer._id,
          name: job.customer.name,
          phone: job.customer.phone,
          city: job.customer.city
        },
        provider: {
          id: job.provider._id,
          name: job.provider.name,
          phone: job.provider.phone,
          category: job.provider.category
        },
        offer: {
          id: job.offer._id,
          visitingCharge: job.offer.visitingCharge,
          etaMinutes: job.offer.etaMinutes
        },
        status: job.status,
        statusHistory: job.statusHistory,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      },
      frontend: adapted
    });

  } catch (error) {
    console.error('GetMyActiveJob error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get active job',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/jobs/history
 * @desc Get past jobs (completed) and optionally cancelled requests
 * @access Private, both roles
 * 
 * Design Decision for cancelled Requests:
 * - Frontend Order History screen spec in frontend_context.md mentions "All/Completed/Cancelled" filter
 * - Cancelled Requests never become Jobs (they stay as Request with status cancelled)
 * - Options:
 *   A) Return only Jobs (completed) and let frontend merge two queries (Jobs + Requests my?status=cancelled) frontend-side
 *   B) Return merged list of both completed Jobs and cancelled Requests in single endpoint
 * - Decision: Option B implemented here - single endpoint returns both, with type discriminator and unified sorting newest-first
 * - Why? More user-friendly, matches frontend expectation of single All/Completed/Cancelled filter endpoint, reduces frontend complexity
 * - For provider role, cancelled filter will be empty (only customer can cancel pending request), but we still support it
 * - Pagination: ?page, ?limit default 20, sorted newest-first by completedAt/createdAt
 * - Status param: ?status=all|completed|cancelled
 *   - all: both completed jobs and cancelled requests merged, sorted newest-first
 *   - completed: only completed jobs
 *   - cancelled: only cancelled requests (customer's cancelled requests)
 */
const getOrderHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status = 'all', page = 1, limit = 20 } = req.query;

    const validStatuses = ['all', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`,
        validStatuses
      });
    }

    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    let completedJobs = [];
    let cancelledRequests = [];
    let totalCompleted = 0;
    let totalCancelled = 0;

    // Fetch completed jobs if status is all or completed
    if (status === 'all' || status === 'completed') {
      const jobQuery = {
        $or: [{ customer: userId }, { provider: userId }],
        status: 'completed'
      };

      totalCompleted = await Job.countDocuments(jobQuery);

      // For all filter, we need to fetch with pagination after merging? 
      // Simplest: fetch all completed jobs (or paginated separately) and cancelled requests, then merge and sort
      // For accurate pagination with merged list, we'd need more complex logic, but for MVP we fetch separately and merge
      // For status=completed only, we can paginate correctly
      if (status === 'completed') {
        completedJobs = await Job.find(jobQuery)
          .populate('customer', 'name phone city profilePicture')
          .populate('provider', 'name phone city profilePicture category rating')
          .populate('request', 'category description location address')
          .populate('offer', 'visitingCharge etaMinutes')
          .sort({ completedAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit);
      } else {
        // For all, fetch all completed jobs without pagination yet, will paginate after merge
        // But limit to reasonable number to avoid huge memory - for Phase 8 scale <20 users, okay to fetch all
        completedJobs = await Job.find(jobQuery)
          .populate('customer', 'name phone city profilePicture')
          .populate('provider', 'name phone city profilePicture category rating')
          .populate('request', 'category description location address')
          .populate('offer', 'visitingCharge etaMinutes')
          .sort({ completedAt: -1, createdAt: -1 });
      }
    }

    // Fetch cancelled requests if status is all or cancelled
    if (status === 'all' || status === 'cancelled') {
      // Only customer can have cancelled requests (customer cancels own pending request)
      // But we allow both roles to query, for provider it will just be empty
      const cancelQuery = {
        customer: userId,
        status: 'cancelled'
      };

      totalCancelled = await Request.countDocuments(cancelQuery);

      if (status === 'cancelled') {
        cancelledRequests = await Request.find(cancelQuery)
          .populate('customer', 'name phone city')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit);
      } else {
        // For all, fetch all cancelled without pagination yet
        cancelledRequests = await Request.find(cancelQuery)
          .populate('customer', 'name phone city')
          .sort({ createdAt: -1 });
      }
    }

    let combined = [];
    let total = 0;

    if (status === 'completed') {
      combined = completedJobs.map(job => ({
        type: 'job',
        id: job._id,
        status: job.status, // completed
        category: job.request ? job.request.category : job.category,
        description: job.request ? job.request.description : '',
        location: job.request ? job.request.location : null,
        address: job.request ? job.request.address : '',
        customer: job.customer,
        provider: job.provider,
        offer: job.offer,
        request: job.request,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt,
        // For sorting
        sortDate: job.completedAt || job.updatedAt || job.createdAt
      }));
      total = totalCompleted;
    } else if (status === 'cancelled') {
      combined = cancelledRequests.map(req => ({
        type: 'request',
        id: req._id,
        status: req.status, // cancelled
        cancelledReason: req.cancelledReason || null, // 'customer' vs 'expired' (Part 2)
        category: req.category,
        description: req.description,
        location: req.location,
        address: req.address,
        customer: req.customer,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        sortDate: req.updatedAt || req.createdAt
      }));
      total = totalCancelled;
    } else { // all
      const jobsMapped = completedJobs.map(job => ({
        type: 'job',
        id: job._id,
        status: job.status,
        category: job.request ? job.request.category : job.category,
        description: job.request ? job.request.description : '',
        location: job.request ? job.request.location : null,
        address: job.request ? job.request.address : '',
        customer: job.customer,
        provider: job.provider,
        offer: job.offer,
        request: job.request,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt,
        sortDate: job.completedAt || job.updatedAt || job.createdAt
      }));

      const cancelledMapped = cancelledRequests.map(req => ({
        type: 'request',
        id: req._id,
        status: req.status,
        cancelledReason: req.cancelledReason || null,
        category: req.category,
        description: req.description,
        location: req.location,
        address: req.address,
        customer: req.customer,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        sortDate: req.updatedAt || req.createdAt
      }));

      combined = [...jobsMapped, ...cancelledMapped].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
      total = combined.length;

      // Paginate merged list
      combined = combined.slice(skip, skip + parsedLimit);
    }

    // Adapt for frontend if needed - using same adapter for jobs, simple mapping for cancelled requests
    const adapted = combined.map(item => {
      if (item.type === 'job') {
        // Find original job doc for adapter
        const originalJob = completedJobs.find(j => j._id.toString() === item.id.toString()) || item;
        // If originalJob is already mapped, try to get full doc
        // For simplicity, return item as is plus frontend adapted if available
        return {
          ...item,
          frontend: {
            id: item.id.toString(),
            category: item.category,
            description: item.description,
            status: item.status === 'completed' ? 'completed' : item.status,
            address: item.address,
            createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
            completedAt: item.completedAt ? new Date(item.completedAt).getTime() : undefined,
            type: 'job'
          }
        };
      } else {
        return {
          ...item,
          frontend: {
            id: item.id.toString(),
            category: item.category,
            description: item.description,
            status: 'cancelled',
            cancelledReason: item.cancelledReason || null,
            address: item.address,
            createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
            type: 'request',
            statusOriginal: 'cancelled'
          }
        };
      }
    });

    return res.status(200).json({
      status: 'success',
      filter: status,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      },
      count: adapted.length,
      history: adapted,
      designDecision: {
        cancelledRequestsHandling: 'Option B chosen: single endpoint returns both completed Jobs and cancelled Requests merged, sorted newest-first. Cancelled Requests never become Jobs, so to support All/Completed/Cancelled filter from frontend_context.md Order History screen, we merge both types. For provider role, cancelled will be empty (only customer can cancel). Alternative Option A (frontend merges two queries) would be more complex for frontend.',
        sorting: 'Newest-first by completedAt (for jobs) or updatedAt/createdAt (for cancelled requests)',
        pagination: 'For status=all, we fetch all then merge+sort then slice (okay for <20 users scale). For status=completed or cancelled alone, we use DB-level skip/limit for efficiency.'
      }
    });

  } catch (error) {
    console.error('GetOrderHistory error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get order history',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  getJobById,
  updateJobStatus,
  getMyActiveJob,
  getOrderHistory
};
