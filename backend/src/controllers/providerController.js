const User = require('../models/User');
const { uploadFromBuffer } = require('../config/cloudinary');

const VALID_CATEGORIES = ['plumber', 'electrician', 'mechanic'];

const setupProvider = async (req, res) => {
  try {
    const { category, radiusKm, yearsExperience, defaultVisitingCharge } = req.body;
    const updates = {};

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ status: 'error', message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, validCategories: VALID_CATEGORIES });
      }
      updates.category = category;
    }

    if (radiusKm !== undefined) {
      const radius = Number(radiusKm);
      if (isNaN(radius)) return res.status(400).json({ status: 'error', message: 'radiusKm must be a number' });
      if (radius < 2 || radius > 25) return res.status(400).json({ status: 'error', message: 'radiusKm must be between 2 and 25 km', received: radius });
      updates.radiusKm = radius;
    }

    if (yearsExperience !== undefined) {
      const exp = Number(yearsExperience);
      if (isNaN(exp)) return res.status(400).json({ status: 'error', message: 'yearsExperience must be a number' });
      if (exp < 0 || exp > 50) return res.status(400).json({ status: 'error', message: 'yearsExperience must be between 0 and 50' });
      updates.yearsExperience = exp;
    }

    if (defaultVisitingCharge !== undefined) {
      const charge = Number(defaultVisitingCharge);
      if (isNaN(charge) || charge < 100 || charge > 5000) {
        return res.status(400).json({ status: 'error', message: 'defaultVisitingCharge must be between 100 and 5000', received: charge });
      }
      updates.defaultVisitingCharge = charge;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid fields to update. Allowed: category, radiusKm, yearsExperience, defaultVisitingCharge' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true }).select('-__v');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

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
        defaultVisitingCharge: user.defaultVisitingCharge,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus
      }
    });
  } catch (error) {
    console.error('SetupProvider error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update provider setup', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded. Please attach a file with field name "document" (image or PDF).' });
    const isPdf = req.file.mimetype === 'application/pdf';
    const resourceType = isPdf ? 'raw' : 'image';
    const result = await uploadFromBuffer(req.file.buffer, {
      folder: 'ufix/verification_docs',
      resource_type: resourceType,
      public_id: `doc_${req.user.id}_${Date.now()}`,
      ...(isPdf ? {} : { transformation: [{ width: 1000, crop: 'limit', quality: 'auto' }] })
    });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: { documentUrl: result.secure_url, verificationStatus: 'pending' } }, { new: true }).select('-__v');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    return res.status(200).json({
      status: 'success',
      message: 'Verification document uploaded successfully. Status is now pending review.',
      documentUrl: result.secure_url,
      verificationStatus: user.verificationStatus,
      cloudinary: { public_id: result.public_id, bytes: result.bytes, resource_type: result.resource_type, mock: result.mock || false },
      user: { id: user._id, name: user.name, role: user.role, documentUrl: user.documentUrl, verificationStatus: user.verificationStatus, isVerified: user.isVerified }
    });
  } catch (error) {
    console.error('UploadDocument error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to upload verification document', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const getVerificationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('verificationStatus isVerified documentUrl category');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
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
    return res.status(500).json({ status: 'error', message: 'Failed to get verification status', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const verifyProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid verification status. Must be "approved" or "rejected".', validStatuses: ['approved', 'rejected'] });
    }
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'] || req.body.adminSecret;
    if (process.env.NODE_ENV === 'production') {
      // 2026-08-26 hardening Task 2: in production this route REQUIRES a strong ADMIN_SECRET.
      // If it isn't configured, the route is INVISIBLE (404) rather than left open - and the
      // misconfiguration is logged loudly on every hit so ops notices immediately.
      if (!adminSecret) {
        console.error('⛔ SECURITY: PATCH /api/providers/:id/verify hit in production but ADMIN_SECRET is not set - refusing (404). Set a strong random ADMIN_SECRET to enable.');
        return res.status(404).json({ status: 'error', message: 'Not found' });
      }
      if (!providedSecret || providedSecret !== adminSecret) {
        return res.status(403).json({ status: 'error', message: 'Admin secret required. Provide X-Admin-Secret header.' });
      }
    } else if (adminSecret) {
      if (!providedSecret || providedSecret !== adminSecret) {
        return res.status(403).json({ status: 'error', message: 'Admin secret required. Provide X-Admin-Secret header or adminSecret in body.', needsAdminSecret: true });
      }
    } else {
      console.warn('⚠️  ADMIN_SECRET not set - PATCH /api/providers/:id/verify is open without admin protection (dev only).');
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Provider not found' });
    if (user.role !== 'provider') return res.status(400).json({ status: 'error', message: 'Only providers can be verified. This user is a customer.' });
    user.verificationStatus = status;
    user.isVerified = status === 'approved';
    await user.save();
    return res.status(200).json({
      status: 'success',
      message: `Provider verification ${status} successfully`,
      user: { id: user._id, name: user.name, role: user.role, category: user.category, verificationStatus: user.verificationStatus, isVerified: user.isVerified, documentUrl: user.documentUrl },
      ...(reason && { reason }),
      warning: adminSecret ? undefined : 'This route is currently open without admin auth.'
    });
  } catch (error) {
    console.error('VerifyProvider error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update verification status', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const getAvailableProviders = async (req, res) => {
  try {
    const { city, category } = req.query;
    const filter = { role: 'provider', isOnline: true, isVerified: true };
    if (category) {
      const valid = ['plumber', 'electrician', 'mechanic'];
      if (!valid.includes(category)) return res.status(400).json({ status: 'error', message: `Invalid category. Must be one of: ${valid.join(', ')}` });
      filter.category = category;
    }
    if (city) filter.city = { $regex: new RegExp(`^${city}$`, 'i') };
    // Provider Availability Lock (Part 1): exclude busy providers (active job) from the
    // bookable list - directAccept would reject them anyway, so don't offer a dead "Book Now".
    const Job = require('../models/Job');
    const busyProviderIds = await Job.distinct('provider', { status: { $ne: 'completed' } });
    if (busyProviderIds.length > 0) filter._id = { $nin: busyProviderIds };
    const count = await User.countDocuments(filter);
    // Deterministic top-N: sort before limiting so a busy DB with 20+ online pros in a city never
    // arbitrarily hides the SAME free provider relative to insertion order (2026-08-24 polish audit).
    const providers = await User.find(filter).select('name category city rating reviews profilePicture isOnline defaultVisitingCharge yearsExperience').sort({ rating: -1, reviews: -1, _id: 1 }).limit(20).lean();
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
        isOnline: p.isOnline,
        defaultVisitingCharge: p.defaultVisitingCharge || 500,
        yearsExperience: p.yearsExperience
      })),
      message: city ? `${count} online ${category||'providers'} available in ${city}` : `${count} online providers available`
    });
  } catch (error) {
    console.error('GetAvailableProviders error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get available providers', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const devAutoVerify = async (req, res) => {
  try {
    // 2026-08-26 hardening Task 2: dev-convenience route must be INVISIBLE in production.
    // 404 (not 403) - don't even reveal the hidden route exists.
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ status: 'error', message: 'Not found' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    if (user.role !== 'provider') return res.status(400).json({ status: 'error', message: 'Only providers can auto-verify' });
    user.isVerified = true;
    user.verificationStatus = 'approved';
    if (!user.documentUrl) user.documentUrl = 'https://res.cloudinary.com/demo/image/upload/mock-verified-doc.jpg';
    await user.save();
    console.log(`✅ DEV Auto-verified provider ${user._id} (${user.name}) - isVerified=true`);
    return res.status(200).json({
      status: 'success',
      message: 'Provider auto-verified for dev testing',
      user: { id: user._id, name: user.name, isVerified: user.isVerified, verificationStatus: user.verificationStatus, category: user.category }
    });
  } catch (error) {
    console.error('DevAutoVerify error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to auto-verify', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

module.exports = { setupProvider, uploadDocument, getVerificationStatus, verifyProvider, getAvailableProviders, devAutoVerify };
