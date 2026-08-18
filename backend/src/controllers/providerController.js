const User = require('../models/User');
const { uploadFromBuffer } = require('../config/cloudinary');

/**
 * Provider Controller - Phase 2
 * Handles provider setup (category, radius, experience), document upload, verification status
 */

const VALID_CATEGORIES = ['plumber', 'electrician', 'mechanic'];
const VALID_VERIFICATION_STATUSES = ['not_submitted', 'pending', 'approved', 'rejected'];

/**
 * @route PATCH /api/providers/setup
 * @desc Set category, radiusKm, yearsExperience (provider-only)
 * @body { category?, radiusKm?, yearsExperience? }
 * @access Private - provider role
 */
const setupProvider = async (req, res) => {
  try {
    const { category, radiusKm, yearsExperience } = req.body;

    const updates = {};

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
          validCategories: VALID_CATEGORIES
        });
      }
      updates.category = category;
    }

    if (radiusKm !== undefined) {
      const radius = Number(radiusKm);
      if (isNaN(radius)) {
        return res.status(400).json({
          status: 'error',
          message: 'radiusKm must be a number'
        });
      }
      if (radius < 2 || radius > 25) {
        return res.status(400).json({
          status: 'error',
          message: 'radiusKm must be between 2 and 25 km (matching frontend slider)',
          received: radius
        });
      }
      updates.radiusKm = radius;
    }

    if (yearsExperience !== undefined) {
      const exp = Number(yearsExperience);
      if (isNaN(exp)) {
        return res.status(400).json({
          status: 'error',
          message: 'yearsExperience must be a number'
        });
      }
      if (exp < 0 || exp > 50) {
        return res.status(400).json({
          status: 'error',
          message: 'yearsExperience must be between 0 and 50'
        });
      }
      updates.yearsExperience = exp;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid fields to update. Allowed: category (plumber/electrician/mechanic), radiusKm (2-25), yearsExperience (0-50)'
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
      message: 'Provider setup updated successfully',
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        category: user.category,
        radiusKm: user.radiusKm,
        yearsExperience: user.yearsExperience,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus
      }
    });

  } catch (error) {
    console.error('SetupProvider error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update provider setup',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route POST /api/providers/document
 * @desc Upload verification document (provider-only, sets status to pending)
 * @access Private - provider role
 */
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded. Please attach a file with field name "document" (image or PDF).'
      });
    }

    // Determine resource type - PDF needs raw or auto
    const isPdf = req.file.mimetype === 'application/pdf';
    const resourceType = isPdf ? 'raw' : 'image';

    const result = await uploadFromBuffer(req.file.buffer, {
      folder: 'ufix/verification_docs',
      resource_type: resourceType,
      public_id: `doc_${req.user.id}_${Date.now()}`,
      ...(isPdf ? {} : { transformation: [{ width: 1000, crop: 'limit', quality: 'auto' }] })
    });

    // Update user with documentUrl and set verificationStatus to pending
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          documentUrl: result.secure_url,
          verificationStatus: 'pending'
          // isVerified remains false until admin approves
        }
      },
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
      message: 'Verification document uploaded successfully. Status is now pending review.',
      documentUrl: result.secure_url,
      verificationStatus: user.verificationStatus,
      cloudinary: {
        public_id: result.public_id,
        bytes: result.bytes,
        resource_type: result.resource_type,
        mock: result.mock || false
      },
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        documentUrl: user.documentUrl,
        verificationStatus: user.verificationStatus,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('UploadDocument error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to upload verification document',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/providers/verification-status
 * @desc Check current verification status (provider-only)
 * @access Private - provider role
 */
const getVerificationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('verificationStatus isVerified documentUrl category');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      verificationStatus: user.verificationStatus,
      isVerified: user.isVerified,
      hasDocument: !!user.documentUrl,
      documentUrl: user.documentUrl ? (user.verificationStatus === 'approved' || req.user.id.toString() === user._id.toString() ? user.documentUrl : undefined) : undefined,
      category: user.category
    });

  } catch (error) {
    console.error('GetVerificationStatus error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get verification status',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/providers/:id/verify
 * @desc Temporary manual verification approval (sets status to approved/rejected and updates isVerified)
 * @body { status: "approved" | "rejected", reason? }
 * @access - Temporary: protected by ADMIN_SECRET header or open with warning (needs real admin auth later)
 * 
 * This is a TEMPORARY manual mechanism for testing Phase 2 without building full admin panel.
 * In production, this needs proper admin authentication, role, audit log.
 */
const verifyProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    // Validate status
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid verification status. Must be "approved" or "rejected".',
        validStatuses: ['approved', 'rejected']
      });
    }

    // --- Temporary Admin Check ---
    // Option 1: Check ADMIN_SECRET header (simple protection for testing)
    // Option 2: If no ADMIN_SECRET set in env, allow but warn (for Phase 2 testing)
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'] || req.body.adminSecret;

    if (adminSecret) {
      // If ADMIN_SECRET is set, require it
      if (!providedSecret || providedSecret !== adminSecret) {
        return res.status(403).json({
          status: 'error',
          message: 'Admin secret required. Provide X-Admin-Secret header or adminSecret in body. This is temporary manual verification route.',
          needsAdminSecret: true
        });
      }
    } else {
      // No admin secret configured - allow but log warning (Phase 2 testing convenience)
      console.warn('⚠️  ADMIN_SECRET not set - PATCH /api/providers/:id/verify is open without admin protection. Set ADMIN_SECRET in .env for basic protection. TODO: Real admin auth in later phase.');
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider not found'
      });
    }

    if (user.role !== 'provider') {
      return res.status(400).json({
        status: 'error',
        message: 'Only providers can be verified. This user is a customer.'
      });
    }

    // Update verification status and isVerified flag
    user.verificationStatus = status;
    user.isVerified = status === 'approved';

    await user.save();

    return res.status(200).json({
      status: 'success',
      message: `Provider verification ${status} successfully`,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        category: user.category,
        verificationStatus: user.verificationStatus,
        isVerified: user.isVerified,
        documentUrl: user.documentUrl
      },
      ...(reason && { reason }),
      warning: adminSecret ? undefined : 'This route is currently open without admin auth. Set ADMIN_SECRET in .env and use X-Admin-Secret header. Real admin system needed in later phase.'
    });

  } catch (error) {
    console.error('VerifyProvider error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update verification status',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/providers/available
 * @desc Get count and list of available online providers by city and category (for customer)
 * @query city, category
 * @access Private (customer or provider)
 * 
 * This enables: "Jo city customer select karta hai, usko usi city ke online available providers dikhne chahiye"
 * City-based filtering, precise location ignore as per user request
 */
const getAvailableProviders = async (req, res) => {
  try {
    const { city, category } = req.query;

    const filter = {
      role: 'provider',
      isOnline: true,
      isVerified: true,
    };

    if (category) {
      const valid = ['plumber', 'electrician', 'mechanic'];
      if (!valid.includes(category)) {
        return res.status(400).json({ status: 'error', message: `Invalid category. Must be one of: ${valid.join(', ')}` });
      }
      filter.category = category;
    }

    if (city) {
      filter.city = { $regex: new RegExp(`^${city}$`, 'i') };
    }

    const count = await User.countDocuments(filter);
    const providers = await User.find(filter)
      .select('name category city rating reviews profilePicture isOnline')
      .limit(20)
      .lean();

    return res.status(200).json({
      status: 'success',
      city: city || 'all',
      category: category || 'all',
      count,
      providers: providers.map(p => ({
        id: p._id,
        name: p.name,
        category: p.category,
        city: p.city,
        rating: p.rating,
        reviews: p.reviews,
        profilePicture: p.profilePicture,
        isOnline: p.isOnline
      })),
      message: city ? `${count} online ${category||'providers'} available in ${city}` : `${count} online providers available`
    });
  } catch (error) {
    console.error('GetAvailableProviders error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get available providers',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route POST /api/providers/dev/verify-me
 * @desc DEV ONLY - Auto-verify current provider (no admin secret needed in dev)
 * @access Private - provider role, only when NODE_ENV !== production
 */
const devAutoVerify = async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        status: 'error',
        message: 'Dev auto-verify not allowed in production'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (user.role !== 'provider') {
      return res.status(400).json({ status: 'error', message: 'Only providers can auto-verify' });
    }

    user.isVerified = true;
    user.verificationStatus = 'approved';
    // If no document, set dummy
    if (!user.documentUrl) {
      user.documentUrl = 'https://res.cloudinary.com/demo/image/upload/mock-verified-doc.jpg';
    }
    await user.save();

    console.log(`✅ DEV Auto-verified provider ${user._id} (${user.name}) - isVerified=true`);

    return res.status(200).json({
      status: 'success',
      message: 'Provider auto-verified for dev testing',
      user: {
        id: user._id,
        name: user.name,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
        category: user.category
      }
    });
  } catch (error) {
    console.error('DevAutoVerify error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to auto-verify',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  setupProvider,
  uploadDocument,
  getVerificationStatus,
  verifyProvider,
  getAvailableProviders,
  devAutoVerify
};
