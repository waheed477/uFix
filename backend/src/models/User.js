const mongoose = require('mongoose');

/**
 * User Model - Phase 1
 * Aligns with frontend lib/types.ts where possible, but uses backend-friendly naming
 * Frontend expects: id, name, phone, city, role, avatar (initials), color, rating, etc.
 * Backend stores core auth fields now; extended provider fields come in Phase 2+
 */

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  googleId: {
    type: String,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is mandatory for all users'],
    trim: true,
    // Basic E.164-ish validation - allow +92 format from frontend
    match: [/^\+?[0-9\s\-()]{7,20}$/, 'Please provide a valid phone number']
  },
  role: {
    type: String,
    enum: {
      values: ['customer', 'provider'],
      message: 'Role must be customer or provider'
    },
    required: [true, 'Role is required']
  },
  profilePicture: {
    type: String,
    default: null,
    // URL to avatar - will be populated in Phase 2
  },
  city: {
    type: String,
    trim: true,
    // One-time reference field from signup (frontend collects city)
  },
  location: {
    // GeoJSON Point - defined now, indexed in Phase 3
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      // [longitude, latitude]
      type: [Number],
      default: [0, 0], // will be updated when GPS permission granted
      validate: {
        validator: function(v) {
          return v.length === 2;
        },
        message: 'Coordinates must be [lng, lat]'
      }
    }
  },
  // Work-location pinning (2026-08-24 Task: provider-set location)
  // locationSource: whose coordinates does `location` currently represent?
  //   'gps'    = last device/IP geolocation (default, backwards compatible)
  //   'manual' = provider pinned their work location on a map in Profile
  // Manual pin ALWAYS wins: gps patches only refresh `gpsLocation` while a pin exists,
  // so a drifting/emulator GPS can never silently break city matching + distances again.
  locationSource: {
    type: String,
    enum: ['gps', 'manual'],
    default: 'gps'
  },
  pinnedLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }
  },
  gpsLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }
  },
  isOnline: {
    type: Boolean,
    default: false,
    // Only relevant for providers - online/offline toggle
  },
  isVerified: {
    type: Boolean,
    default: false,
    // Only relevant for providers - document verification in Phase 2
  },
  // --- Provider-specific fields (Phase 2+) ---
  category: {
    type: String,
    enum: {
      values: ['plumber', 'electrician', 'mechanic'],
      message: 'Category must be plumber, electrician, or mechanic'
    },
    // Only for providers - set via PATCH /api/providers/setup
  },
  radiusKm: {
    type: Number,
    min: [2, 'Service radius must be at least 2 km'],
    max: [25, 'Service radius cannot exceed 25 km'],
    // Matches frontend slider range 2-25
  },
  yearsExperience: {
    type: Number,
    min: [0, 'Experience cannot be negative'],
    max: [50, 'Experience seems too high'],
    // Providers only
  },
  defaultVisitingCharge: {
    type: Number,
    min: [100, 'Visiting charge must be at least Rs 100'],
    max: [5000, 'Visiting charge cannot exceed Rs 5000'],
    default: 500,
    // Provider's default price set during profile setup, shown to customers in available providers list
    // Customer sees this price when browsing online providers in same city, can directly book
  },
  documentUrl: {
    type: String,
    // Verification document URL (image or PDF) - providers only
    // Uploaded via POST /api/providers/document -> Cloudinary
  },
  verificationStatus: {
    type: String,
    enum: {
      values: ['not_submitted', 'pending', 'approved', 'rejected'],
      message: 'Verification status must be not_submitted/pending/approved/rejected'
    },
    default: 'not_submitted',
    // Providers only - flow: not_submitted -> pending (after upload) -> approved/rejected (via admin route)
  },
  // Frontend also uses avatar initials/color/rating — we can derive or store later
  // For now we compute initials on demand, keep rating defaults
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: {
    type: Number,
    default: 0
  },
  // Auth completeness flag - helpful for Google flow missing phone
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  authProvider: {
    type: String,
    enum: ['google', 'phone', 'both'],
    default: 'phone'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // adds createdAt, updatedAt automatically (keeps our manual createdAt too)
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- Indexes ---
// Unique sparse for optional fields
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true });
// Geospatial index for location queries - Phase 3
// IMPORTANT: MongoDB GeoJSON order is [lng, lat] - NOT [lat, lng]
userSchema.index({ location: '2dsphere' });

// --- Virtuals / Helpers ---

// Avatar initials - matches frontend logic
userSchema.virtual('avatar').get(function() {
  if (!this.name) return '?';
  return this.name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
});

// Ensure phone normalization (remove spaces for uniqueness, but keep original format for display)
// We store trimmed version; for strict E.164 you would normalize further
userSchema.pre('save', function(next) {
  if (this.isModified('phone')) {
    // Keep as entered but trim; unique check will be on trimmed value
    // Optional: normalize to remove spaces for comparison
    // For now keep user input
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
