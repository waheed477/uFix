const mongoose = require('mongoose');

/**
 * Job Model - Phase 6 Job Lifecycle & Contact Unlock
 * Represents active job after offer acceptance
 * One job per request (request unique)
 * 
 * Frontend alignment:
 * - Frontend JobStatus: open, accepted, on_the_way, arrived, in_progress, completed, cancelled
 * - Backend Job status here: on_the_way, arrived, in_progress, completed (matches frontend timeline stages)
 * - Frontend has full Job with customerId, providerId, offers, etc. Backend Job links to Request + Offer
 * - Contact unlock: phone numbers included in GET /api/jobs/:id since job only exists after acceptance
 */

const jobSchema = new mongoose.Schema({
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: [true, 'Request is required']
    // unique enforced via index below
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer is required']
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Provider is required']
  },
  offer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    required: [true, 'Accepted offer is required']
  },
  status: {
    type: String,
    enum: {
      values: ['on_the_way', 'arrived', 'in_progress', 'completed'],
      message: 'Job status must be on_the_way, arrived, in_progress, or completed'
    },
    default: 'on_the_way',
    // Sequence: on_the_way -> arrived -> in_progress -> completed
    // No backward, no skipping (validated in controller)
  },
  statusHistory: {
    type: [
      {
        status: {
          type: String,
          enum: ['on_the_way', 'arrived', 'in_progress', 'completed'],
          required: true
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ],
    default: function() {
      // Initialize with first status
      return [{ status: 'on_the_way', timestamp: new Date() }];
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
    // Set when status becomes completed
  }
}, {
  timestamps: true
});

// Indexes
jobSchema.index({ customer: 1, status: 1 });
jobSchema.index({ provider: 1, status: 1 });
jobSchema.index({ request: 1 }, { unique: true });
jobSchema.index({ createdAt: -1 });

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
