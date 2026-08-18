const mongoose = require('mongoose');

/**
 * Offer Model - Phase 4 Core Business Logic
 * Represents a provider's offer on a customer request
 * 
 * Aligns with frontend lib/types.ts Offer:
 * - Frontend: id, providerId, providerName, providerRating, avatarColor, visitingCharge, etaMin, distanceKm, timestamp
 * - Backend: request ref, provider ref, visitingCharge, etaMinutes, status, createdAt
 *   (provider details populated via User ref when needed)
 * 
 * Business rules:
 * - A provider cannot submit multiple offers on same request (compound unique index)
 * - Only verified & online providers can offer (enforced in controller, not schema)
 * - Category must match request category (enforced in controller)
 */

const offerSchema = new mongoose.Schema({
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: [true, 'Request is required']
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Provider is required']
  },
  visitingCharge: {
    type: Number,
    required: [true, 'Visiting charge is required'],
    min: [1, 'Visiting charge must be positive'],
    max: [100000, 'Visiting charge seems too high'] // reasonable upper limit
  },
  etaMinutes: {
    type: Number,
    required: [true, 'ETA minutes is required'],
    min: [1, 'ETA must be at least 1 minute'],
    max: [1440, 'ETA cannot exceed 24 hours (1440 minutes)']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'accepted', 'rejected'],
      message: 'Offer status must be pending, accepted, or rejected'
    },
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- Indexes ---
// Compound unique index: a provider cannot submit multiple offers on same request
offerSchema.index({ request: 1, provider: 1 }, { unique: true });
offerSchema.index({ request: 1, status: 1 });
offerSchema.index({ provider: 1 });
offerSchema.index({ createdAt: -1 });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
