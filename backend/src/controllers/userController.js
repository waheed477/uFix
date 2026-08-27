const User = require('../models/User');
const { uploadFromBuffer } = require('../config/cloudinary');
const { reemitViewCountsForProvider } = require('../utils/viewCount');

/**
 * User Profile Controller - Phase 2
 * Handles profile updates, picture upload, get own profile
 */

/**
 * @route GET /api/users/profile
 * @desc Get own full profile (protected)
 * @access Private
 */
const getOwnProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-__v');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        city: user.city,
        profilePicture: user.profilePicture,
        location: user.location,
        locationSource: (user.locationSource || 'gps'),
        pinnedLocation: user.pinnedLocation,
        isOnline: user.isOnline,
        isVerified: user.isVerified,
        category: user.category,
        radiusKm: user.radiusKm,
        yearsExperience: user.yearsExperience,
        documentUrl: user.documentUrl,
        verificationStatus: user.verificationStatus,
        rating: user.rating,
        reviews: user.reviews,
        isPhoneVerified: user.isPhoneVerified,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('GetOwnProfile error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch profile',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/users/profile
 * @desc Update name, city, profilePicture URL (protected, any authenticated user)
 * @body { name?, city? } or { profilePicture? } (URL)
 * Note: For file upload use POST /api/users/profile/picture
 * @access Private
 * 
 * Phase 9 Backend Fix: Added isOnline support for provider online/offline toggle
 * Originally Phase 2 only allowed name, city, profilePicture. Frontend provider home has online toggle
 * that needs to update isOnline field. Since isOnline is a User field and toggle is core UX,
 * we added isOnline boolean support here as minimal fix rather than creating new endpoint.
 * Documented in project_context.md Phase 9 Backend Fixes.
 */
const updateProfile = async (req, res) => {
  try {
    const { name, city, profilePicture, isOnline, phone } = req.body;

    const updates = {};

    // Phone "set-once, then locked" (2026-08-26 Task 1): a phone number may ONLY be SET
    // when the account currently has none - i.e. a Google-sign-in user whose account
    // predates the mandatory-phone rule (their login identity is Google, not phone).
    // Once set it locks FOREVER, identical to phone-OTP users (whose phone IS their login):
    // changing an existing number is rejected regardless of auth method or role.
    if (phone !== undefined) {
      const me = await User.findById(req.user.id).select('phone');
      if (me && me.phone && me.phone.trim().length > 0) {
        return res.status(403).json({
          status: 'error',
          code: 'PHONE_LOCKED',
          message: 'Phone number cannot be changed - it is used for login and job contact identity. Contact support if you need to update it.'
        });
      }
      const cleaned = typeof phone === 'string' ? phone.trim() : '';
      const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/; // same rule as /auth/phone/send-otp
      if (!phoneRegex.test(cleaned)) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number format is invalid. Example: +923001234567'
        });
      }
      const conflict = await User.findOne({ phone: cleaned }).select('_id');
      if (conflict) {
        return res.status(409).json({
          status: 'error',
          code: 'PHONE_TAKEN',
          message: 'This phone number is already linked to another account. Please use phone OTP to log into that account instead.'
        });
      }
      updates.phone = cleaned;
      updates.isPhoneVerified = false; // set via profile, not via OTP - honestly marked unverified
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          status: 'error',
          message: 'Name must be at least 2 characters'
        });
      }
      if (name.trim().length > 50) {
        return res.status(400).json({
          status: 'error',
          message: 'Name cannot exceed 50 characters'
        });
      }
      updates.name = name.trim();
    }

    if (city !== undefined) {
      // city is optional reference field - allow empty string to clear
      if (city === null || city === '') {
        updates.city = undefined; // or null? keep as undefined to unset
      } else if (typeof city === 'string') {
        updates.city = city.trim();
      } else {
        return res.status(400).json({
          status: 'error',
          message: 'City must be a string'
        });
      }
    }

    if (profilePicture !== undefined) {
      // Allow updating profilePicture via URL directly (for Phase 2, optional)
      // If you upload via file route, this will be overwritten anyway
      if (profilePicture === null || profilePicture === '') {
        updates.profilePicture = null;
      } else if (typeof profilePicture === 'string') {
        // Basic URL validation
        try {
          new URL(profilePicture);
          updates.profilePicture = profilePicture;
        } catch {
          return res.status(400).json({
            status: 'error',
            message: 'profilePicture must be a valid URL'
          });
        }
      } else {
        return res.status(400).json({
          status: 'error',
          message: 'profilePicture must be a URL string'
        });
      }
    }

    if (isOnline !== undefined) {
      // Phase 9 fix: Allow online/offline toggle for providers
      // Only relevant for providers, but we allow for any role for flexibility
      if (typeof isOnline !== 'boolean') {
        return res.status(400).json({
          status: 'error',
          message: 'isOnline must be a boolean'
        });
      }
      updates.isOnline = isOnline;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid fields to update. Allowed: name, city, profilePicture, isOnline'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // 2026-08-21 (Issue 2): a provider's online/offline toggle changes how many providers
    // can currently SEE each pending request in their city+category - push refreshed
    // request:viewCount to those customers so the "X providers viewing" pill stays live.
    // Fire-and-forget; never blocks or fails the profile update itself.
    if (isOnline !== undefined && user.role === 'provider') {
      try {
        const io = req.app.get('io');
        if (io) reemitViewCountsForProvider(io, user).catch((e) => console.error('viewCount re-emit failed:', e.message));
      } catch (e) {
        console.error('viewCount re-emit setup failed:', e.message);
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        city: user.city,
        profilePicture: user.profilePicture,
        isOnline: user.isOnline,
        isVerified: user.isVerified,
        category: user.category,
        radiusKm: user.radiusKm,
        verificationStatus: user.verificationStatus
      }
    });

  } catch (error) {
    console.error('UpdateProfile error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update profile',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route POST /api/users/profile/picture
 * @desc Upload/replace profile picture (protected, multipart via multer -> Cloudinary)
 * @access Private
 */
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded. Please attach a file with field name "picture".'
      });
    }

    // Upload to Cloudinary
    const result = await uploadFromBuffer(req.file.buffer, {
      folder: 'ufix/profile_pictures',
      resource_type: 'image',
      public_id: `profile_${req.user.id}_${Date.now()}`,
      transformation: [
        { width: 500, height: 500, crop: 'limit', quality: 'auto' }
      ]
    });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { profilePicture: result.secure_url } },
      { new: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Profile picture uploaded successfully',
      profilePicture: result.secure_url,
      cloudinary: {
        public_id: result.public_id,
        bytes: result.bytes,
        mock: result.mock || false
      },
      user: {
        id: user._id,
        name: user.name,
        profilePicture: user.profilePicture
      }
    });

  } catch (error) {
    console.error('UploadProfilePicture error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to upload profile picture',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/users/location
 * @desc Update current coordinates - protected, any authenticated user
 * @body { lng: Number, lat: Number }
 * @access Private
 * 
 * Phase 3 - Location & Geospatial Setup
 * Stores as GeoJSON Point { type: "Point", coordinates: [lng, lat] }
 * IMPORTANT: MongoDB order [lng, lat] NOT [lat, lng]
 */
const updateLocation = async (req, res) => {
  try {
    const { lng, lat, city } = req.body;

    // Post-Audit Fix P3: optional `city` updates user.city in the SAME atomic $set as the
    // coordinates, so DB city and coordinates can never represent different places (matching
    // - request fan-out, getNearbyRequests - filters on the user.city string).

    if (lng === undefined || lat === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'lng and lat are required. Example: { lng: 73.0776, lat: 31.4181 }',
        example: { lng: 73.0776, lat: 31.4181 },
        note: 'Coordinate order for storage is [lng, lat] per MongoDB GeoJSON spec'
      });
    }

    const parsedLng = Number(lng);
    const parsedLat = Number(lat);

    if (isNaN(parsedLng) || isNaN(parsedLat)) {
      return res.status(400).json({
        status: 'error',
        message: 'lng and lat must be valid numbers'
      });
    }

    if (parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'lng must be between -180 and 180 (longitude range)',
        received: parsedLng
      });
    }

    if (parsedLat < -90 || parsedLat > 90) {
      return res.status(400).json({
        status: 'error',
        message: 'lat must be between -90 and 90 (latitude range)',
        received: parsedLat
      });
    }

    if (city !== undefined && (typeof city !== 'string' || !city.trim() || city.trim().length > 100)) {
      return res.status(400).json({
        status: 'error',
        message: 'city (when provided) must be a non-empty string under 100 characters'
      });
    }

    // Work-location pinning (2026-08-24): body.source
    //   'manual' -> provider pinned on the map in Profile: location + city come from the
    //               PIN and are locked in (locationSource='manual', pinnedLocation stored).
    //   'gps'/absent -> device/IP geolocation. If a manual pin exists, DON'T overwrite
    //               `location`/`city` (a drifting/emulator GPS must not hijack matching);
    //               just record it in gpsLocation. Otherwise behaves exactly as before.
    const source = req.body.source === 'manual' ? 'manual' : 'gps';
    // Explicit "Use my live GPS" (Profile button) sends unpin:true - the ONLY way back from a
    // manual pin to GPS control. Silent background GPS syncs must NEVER clear a pin by accident.
    const explicitUnpin = req.body.unpin === true;
    const gpsPoint = { type: 'Point', coordinates: [parsedLng, parsedLat] }; // [lng, lat]

    const user = await User.findById(req.user.id).select('-__v');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    let pinPreserved = false;
    if (source === 'manual') {
      user.location = gpsPoint;
      user.pinnedLocation = gpsPoint;
      user.locationSource = 'manual';
      if (city !== undefined) user.city = city.trim();
    } else {
      user.gpsLocation = gpsPoint;
      if (!explicitUnpin && user.locationSource === 'manual' && user.pinnedLocation && user.pinnedLocation.coordinates && user.pinnedLocation.coordinates.length === 2) {
        pinPreserved = true; // pin keeps location + city; nothing else to set
      } else {
        if (explicitUnpin) { user.pinnedLocation = undefined; }
        user.location = gpsPoint;
        user.locationSource = 'gps';
        if (city !== undefined) user.city = city.trim();
      }
    }
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: pinPreserved
        ? 'GPS recorded, but your pinned work location stays active (pinned location always wins)'
        : 'Location updated successfully',
      location: {
        type: user.location.type,
        coordinates: user.location.coordinates, // [lng, lat]
        readable: {
          lng: user.location.coordinates[0],
          lat: user.location.coordinates[1]
        },
        note: 'Stored as GeoJSON [lng, lat] - frontend {lat,lng} converted correctly'
      },
      locationSource: user.locationSource,
      pinPreserved,
      user: {
        id: user._id,
        name: user.name,
        city: user.city,
        location: user.location,
        locationSource: user.locationSource
      }
    });

  } catch (error) {
    console.error('UpdateLocation error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update location',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  getOwnProfile,
  updateProfile,
  uploadProfilePicture,
  updateLocation
};
