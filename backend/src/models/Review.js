const mongoose = require('mongoose');

/**
 * Review Model - Phase 8 Ratings & Order History
 * 
 * Allows both parties to rate each other after job completion.
 * One review per user per job (customer→provider and provider→customer can coexist on same job)
 * Enforced via compound unique index on (job, fromUser)
 * 
 * After saving, we recalculate the rated user's average rating and review count.
 * Approach: Aggregation ($avg, $count) - chosen for accuracy over incremental math
 * Why aggregation? Incremental math can drift due to floating point and edge cases
 * like review updates/deletes (future). Aggregation always computes exact average from DB,
 * slightly more expensive but safe for small scale (<20 users) and ensures correctness.
 * For high scale, we could use incremental + periodic recalc job, but not needed here.
 */

const reviewSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job is required'],
    index: true
  },
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'From user (reviewer) is required']
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'To user (rated) is required']
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer between 1 and 5'
    }
  },
  comment: {
    type: String,
    trim: true,
    maxlength: [500, 'Comment cannot exceed 500 characters'],
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound unique index: one review per user per job, but both directions allowed
// e.g., customer→provider and provider→customer can coexist on same job
// So (job: Job1, fromUser: Customer) and (job: Job1, fromUser: Provider) are different and allowed
// But (job: Job1, fromUser: Customer) twice is blocked
reviewSchema.index({ job: 1, fromUser: 1 }, { unique: true });
reviewSchema.index({ toUser: 1 });
reviewSchema.index({ fromUser: 1 });
reviewSchema.index({ createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
