const User = require('../models/User');
const { uploadFromBuffer } = require('../config/cloudinary');

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
    const { name, city, profilePicture, isOnline } = req.body;

    const updates = {};

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
    const { lng, lat } = req.body;

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

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          location: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat] // IMPORTANT: [lng, lat]
          }
        }
      },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Location updated successfully',
      location: {
        type: user.location.type,
        coordinates: user.location.coordinates, // [lng, lat]
        readable: {
          lng: user.location.coordinates[0],
          lat: user.location.coordinates[1]
        },
        note: 'Stored as GeoJSON [lng, lat] - frontend {lat,lng} converted correctly'
      },
      user: {
        id: user._id,
        name: user.name,
        location: user.location
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
