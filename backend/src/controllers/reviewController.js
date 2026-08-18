const Job = require('../models/Job');
const Review = require('../models/Review');
const User = require('../models/User');

/**
 * Review Controller - Phase 8 Ratings & Order History
 * Handles rating after job completion, updates User average rating via aggregation
 * 
 * Approach for rating recalculation: Aggregation ($avg, $count) - chosen for accuracy
 * Why aggregation over incremental math?
 * - Incremental math (newAvg = (oldAvg*oldCount + newRating)/(oldCount+1)) can drift due to
 *   floating point errors, and gets complex if we later allow review updates/deletes
 * - Aggregation always computes exact average from DB, slightly more expensive but safe
 *   for small scale (<20 users) and ensures correctness
 * - For high scale, we could use incremental + periodic recalc job, but not needed for MVP
 * - Documented in project_context.md
 */

/**
 * @route POST /api/jobs/:jobId/rate
 * @desc Rate the other party after job completion
 * @body { rating: 1-5 integer, comment?: optional max 500 }
 * @access Private, only job participants, only if job status completed
 */
const rateJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { rating, comment } = req.body;

    // Validate rating
    if (rating === undefined || rating === null) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating is required (1-5 integer)'
      });
    }

    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be an integer between 1 and 5'
      });
    }

    if (comment && comment.length > 500) {
      return res.status(400).json({
        status: 'error',
        message: 'Comment cannot exceed 500 characters'
      });
    }

    // Find job
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Only works if job status completed
    if (job.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: `Can only rate after job is completed. Current status: ${job.status}`,
        currentStatus: job.status
      });
    }

    // Only participants can rate
    const userId = req.user.id.toString();
    const isCustomer = job.customer.toString() === userId;
    const isProvider = job.provider.toString() === userId;

    if (!isCustomer && !isProvider) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only job participants can rate.'
      });
    }

    // Determine toUser automatically based on requester role
    // If requester is customer, they rate provider, and vice versa
    const toUserId = isCustomer ? job.provider.toString() : job.customer.toString();
    const fromUserId = userId;

    // Prevent self-rating (should not happen, but just in case)
    if (fromUserId === toUserId) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot rate yourself'
      });
    }

    // Check duplicate rating from same fromUser on same job (compound unique index)
    // Will also be enforced by DB index, but check for clear 400 message
    const existingReview = await Review.findOne({ job: jobId, fromUser: fromUserId });
    if (existingReview) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already rated this job. Duplicate rating from same user on same job is not allowed.',
        existingReviewId: existingReview._id
      });
    }

    // Create review
    const review = new Review({
      job: jobId,
      fromUser: fromUserId,
      toUser: toUserId,
      rating: parsedRating,
      comment: comment ? comment.trim() : ''
    });

    await review.save();

    // Recalculate rated user's average rating and review count via aggregation
    // Approach: aggregation for accuracy (documented choice)
    const aggregation = await Review.aggregate([
      { $match: { toUser: review.toUser } },
      {
        $group: {
          _id: '$toUser',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    if (aggregation.length > 0) {
      const { avgRating, count } = aggregation[0];
      // Round to 1 decimal for display? Keep full precision in DB but round for User field?
      // We'll round to 1 decimal for User.rating to match typical UI (e.g., 4.8)
      const roundedAvg = Math.round(avgRating * 10) / 10;

      await User.findByIdAndUpdate(toUserId, {
        rating: roundedAvg,
        reviews: count
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`⭐ User ${toUserId} rating updated: avg ${roundedAvg} from ${count} reviews (triggered by review ${review._id})`);
      }
    }

    await review.populate('fromUser', 'name role');
    await review.populate('toUser', 'name role rating reviews');

    return res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully',
      review: {
        id: review._id,
        job: review.job,
        fromUser: {
          id: review.fromUser._id,
          name: review.fromUser.name,
          role: review.fromUser.role
        },
        toUser: {
          id: review.toUser._id,
          name: review.toUser.name,
          role: review.toUser.role,
          rating: review.toUser.rating,
          reviews: review.toUser.reviews
        },
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt
      },
      ratedUserUpdated: aggregation.length > 0 ? {
        avgRating: aggregation[0].avgRating,
        roundedAvg: Math.round(aggregation[0].avgRating * 10) / 10,
        count: aggregation[0].count
      } : null
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Duplicate rating: you have already rated this job',
        code: 'DUPLICATE_RATING'
      });
    }

    console.error('RateJob error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to submit rating',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/jobs/:jobId/reviews
 * @desc Get reviews for a job - participants only
 * @access Private
 */
const getReviewsForJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    const userId = req.user.id.toString();
    const isCustomer = job.customer.toString() === userId;
    const isProvider = job.provider.toString() === userId;

    if (!isCustomer && !isProvider) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only job participants can view reviews.'
      });
    }

    const reviews = await Review.find({ job: jobId })
      .populate('fromUser', 'name role profilePicture')
      .populate('toUser', 'name role rating reviews')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      count: reviews.length,
      jobId,
      reviews: reviews.map(r => ({
        id: r._id,
        job: r.job,
        fromUser: {
          id: r.fromUser._id,
          name: r.fromUser.name,
          role: r.fromUser.role
        },
        toUser: {
          id: r.toUser._id,
          name: r.toUser.name,
          role: r.toUser.role,
          rating: r.toUser.rating,
          reviews: r.toUser.reviews
        },
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt
      }))
    });

  } catch (error) {
    console.error('GetReviewsForJob error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get reviews',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  rateJob,
  getReviewsForJob
};
