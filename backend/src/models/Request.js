const mongoose = require('mongoose');

/**
 * Request Model - Phase 4 Core Business Logic
 * Represents a customer request for service (plumber/electrician/mechanic)
 * 
 * Aligns with frontend lib/types.ts:
 * - Frontend Job has: id, customerId, customerName, category, description, location (x,y normalized 0..100), address, status (JobStatus open/accepted/etc), offers, etc.
 * - Backend Request uses GeoJSON Point [lng,lat] for location (not x,y normalized), but keeps category, description, address similar
 * - Frontend status: open, accepted, on_the_way, arrived, in_progress, completed, cancelled
 * - Backend status (Phase 4 spec): pending, active, completed, cancelled
 *   Mapping: pending ≈ open (awaiting offers), active ≈ accepted (offer accepted, job in progress), completed/cancelled same
 *   Full lifecycle status progression (on_the_way etc) is Phase 6 per spec
 */

const requestSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer is required']
  },
  category: {
    type: String,
    enum: {
      values: ['plumber', 'electrician', 'mechanic'],
      message: 'Category must be plumber, electrician, or mechanic'
    },
    required: [true, 'Category is required']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  location: {
    // GeoJSON Point - [lng, lat] order (CRITICAL)
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number],
      required: [true, 'Coordinates are required'],
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && // lng
                 v[1] >= -90 && v[1] <= 90; // lat
        },
        message: 'Coordinates must be [lng, lat] with lng -180..180 and lat -90..90'
      }
    }
  },
  address: {
    type: String,
    trim: true,
    maxlength: [300, 'Address cannot exceed 300 characters'],
    // Human-readable for display only, not used in geo queries
  },
  city: {
    type: String,
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters'],
    // City-based filtering: when customer posts request, store city so providers of same city see it
    // This allows precise location ignore and city-based matching as per user request
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'active', 'completed', 'cancelled'],
      message: 'Status must be pending, active, completed, or cancelled'
    },
    default: 'pending',
    // pending = waiting for offers / no offer accepted yet (frontend: open)
    // active = offer accepted, job in progress (frontend: accepted)
    // completed = job done (full flow Phase 6)
    // cancelled = customer cancelled before accepting (frontend: cancelled)
  },
  acceptedOffer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    // Set on accept
  },
  acceptedProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // Set on accept
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // adds createdAt, updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- Indexes ---
// 2dsphere for geospatial queries - finding nearby pending requests for providers
requestSchema.index({ location: '2dsphere' });
requestSchema.index({ customer: 1, status: 1 }); // for checking one open request per customer + my requests
requestSchema.index({ status: 1, category: 1 }); // for filtering pending by category
requestSchema.index({ createdAt: -1 });

// Virtual for offers (reverse populate) - optional, can also query Offer model separately
requestSchema.virtual('offers', {
  ref: 'Offer',
  localField: '_id',
  foreignField: 'request'
});

const Request = mongoose.model('Request', requestSchema);

module.exports = Request;
