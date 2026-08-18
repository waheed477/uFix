const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { generateToken } = require('../utils/generateToken');
const bcrypt = require('bcryptjs');

/**
 * Auth Controller - Phase 1
 * Handles Google Sign-In + Phone OTP + Get Me
 */

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Helper: Generate 6-digit OTP
 */
const generateOtpCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
};

/**
 * @route POST /api/auth/google
 * @desc Google Sign-In - verify ID token, create/login user, return JWT
 * @body { idToken, role?, phone?, name?, city? }
 * 
 * Flow:
 * - Verify Google ID token with google-auth-library
 * - If user exists by googleId or email, login
 * - If new user, require phone + role to create (phone mandatory per spec)
 * - Return JWT
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken, role, phone, name: customName, city } = req.body;

    if (!idToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Google ID token is required'
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        status: 'error',
        message: 'GOOGLE_CLIENT_ID not configured on server. Please set it in .env. See project_context.md Known Issues.',
        needsConfig: true
      });
    }

    // Verify token with Google
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid Google ID token',
        details: err.message
      });
    }

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = customName || payload.name || 'User';
    const profilePicture = payload.picture;

    // Check if user exists by googleId or email
    let user = await User.findOne({
      $or: [
        { googleId: googleId },
        ...(email ? [{ email: email }] : [])
      ]
    });

    if (user) {
      // Existing user - update googleId if missing, login
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.email && email) user.email = email;
        if (profilePicture && !user.profilePicture) user.profilePicture = profilePicture;
        user.authProvider = user.authProvider === 'phone' ? 'both' : user.authProvider;
        await user.save();
      }

      const token = generateToken(user);

      return res.status(200).json({
        status: 'success',
        message: 'Logged in with Google',
        token,
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
          authProvider: user.authProvider
        }
      });
    }

    // New user - require phone and role
    if (!phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is mandatory for all users. Please provide phone with Google sign-in.',
        needsPhone: true,
        googleData: {
          googleId,
          email,
          name,
          profilePicture
        }
      });
    }

    if (!role || !['customer', 'provider'].includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Role is required for new users: customer or provider',
        needsRole: true
      });
    }

    // Check if phone already exists with different account
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number already registered with another account. Please login via phone OTP instead, then link Google.'
      });
    }

    // Create new user
    user = new User({
      name,
      email,
      googleId,
      phone,
      role,
      city,
      profilePicture,
      isPhoneVerified: false, // phone not verified via OTP yet, but allowed for Google flow
      authProvider: 'both',
      isOnline: role === 'provider' ? false : undefined
    });

    await user.save();

    const token = generateToken(user);

    return res.status(201).json({
      status: 'success',
      message: 'Account created with Google',
      token,
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
        authProvider: user.authProvider
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Google authentication failed',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route POST /api/auth/phone/send-otp
 * @desc Send OTP to phone number (simple OTP system - no external provider)
 * @body { phone }
 * 
 * Generates 6-digit OTP, saves to DB with 5-min expiry
 * In dev, logs OTP to console and returns it (for testing without SMS)
 * In prod, would integrate Twilio/Firebase
 */
const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is required'
      });
    }

    // Basic phone validation
    const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid phone number format'
      });
    }

    const normalizedPhone = phone.trim();

    // Rate limiting: check if OTP sent recently (last 60 seconds)
    const recentOtp = await Otp.findOne({
      phone: normalizedPhone,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
    }).sort({ createdAt: -1 });

    if (recentOtp) {
      return res.status(429).json({
        status: 'error',
        message: 'OTP already sent. Please wait 60 seconds before requesting again.',
        retryAfter: 60 - Math.floor((Date.now() - recentOtp.createdAt) / 1000)
      });
    }

    // Generate OTP
    const otpCode = generateOtpCode();

    // Optional: Hash OTP for storage (using bcrypt) for security
    // For Phase 1 simplicity we store plain but can hash if needed
    // Here we store plain for easy verification, but also save hashed version example:
    // const hashedOtp = await bcrypt.hash(otpCode, 10);

    // Delete old OTPs for this phone (keep only latest)
    await Otp.deleteMany({ phone: normalizedPhone });

    // Create new OTP record
    const otpDoc = new Otp({
      phone: normalizedPhone,
      otp: otpCode, // In production, should be hashed
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });

    await otpDoc.save();

    // Log OTP to console (dev mode) - this is how we test without SMS
    console.log('=================================');
    console.log(`📱 OTP for ${normalizedPhone}: ${otpCode}`);
    console.log(`⏰ Expires in 5 minutes`);
    console.log('=================================');

    // In development, return OTP in response for easy testing
    // In production, never return OTP - only send via SMS
    const isDev = process.env.NODE_ENV !== 'production';

    return res.status(200).json({
      status: 'success',
      message: 'OTP sent successfully',
      phone: normalizedPhone,
      expiresIn: '5 minutes',
      ...(isDev && {
        otp: otpCode, // ONLY in dev for testing without SMS provider
        devNote: 'OTP returned in response only in development mode. In production, this will be sent via SMS using Twilio/Firebase.'
      })
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to send OTP',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route POST /api/auth/phone/verify-otp
 * @desc Verify OTP and login/create user, return JWT
 * @body { phone, otp, name?, role?, city? }
 * 
 * - Checks OTP validity & expiry
 * - If user exists, login
 * - If not, create new user (requires name, role)
 * - Return JWT
 */
const verifyOtp = async (req, res) => {
  try {
    const { phone, otp, name, role, city } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone and OTP are required'
      });
    }

    const normalizedPhone = phone.trim();

    // Find latest OTP for this phone
    const otpDoc = await Otp.findOne({ phone: normalizedPhone }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({
        status: 'error',
        message: 'No OTP found for this phone. Please request a new OTP.'
      });
    }

    // Check expiry
    if (otpDoc.isExpired()) {
      await Otp.deleteMany({ phone: normalizedPhone });
      return res.status(400).json({
        status: 'error',
        message: 'OTP expired. Please request a new OTP.'
      });
    }

    // Check attempts (prevent brute force)
    if (otpDoc.attempts >= 5) {
      await Otp.deleteMany({ phone: normalizedPhone });
      return res.status(429).json({
        status: 'error',
        message: 'Too many failed attempts. OTP invalidated. Please request a new OTP.'
      });
    }

    // Verify OTP
    if (otpDoc.otp !== otp.toString()) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid OTP',
        attemptsLeft: 5 - otpDoc.attempts
      });
    }

    // OTP is valid - now check user existence
    // For new users, we need extra fields. Do NOT delete OTP yet if fields missing
    // so the same OTP can be reused with name/role in next request.

    let user = await User.findOne({ phone: normalizedPhone });

    if (user) {
      // Existing user - login, then delete OTPs
      user.isPhoneVerified = true;
      await user.save();

      await Otp.deleteMany({ phone: normalizedPhone });

      const token = generateToken(user);

      return res.status(200).json({
        status: 'success',
        message: 'Logged in successfully',
        token,
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
          authProvider: user.authProvider
        }
      });
    }

    // New user - require name and role
    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Name is required for new user registration',
        needsName: true,
        phoneVerified: true,
        phone: normalizedPhone,
        // Keep OTP valid - don't delete yet
        otpStillValid: true
      });
    }

    if (!role || !['customer', 'provider'].includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Role is required for new users: customer or provider',
        needsRole: true,
        phoneVerified: true,
        otpStillValid: true
      });
    }

    // Create new user
    user = new User({
      name: name.trim(),
      phone: normalizedPhone,
      role,
      city,
      isPhoneVerified: true,
      authProvider: 'phone'
    });

    await user.save();
    // Now delete OTP after successful creation
    await Otp.deleteMany({ phone: normalizedPhone });

    const token = generateToken(user);

    return res.status(201).json({
      status: 'success',
      message: 'Account created and logged in successfully',
      token,
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
        authProvider: user.authProvider
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'OTP verification failed',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/auth/me
 * @desc Get current logged-in user data (protected)
 * @access Private - requires JWT
 */
const getMe = async (req, res) => {
  try {
    // req.userDoc is set by auth middleware (full doc)
    // req.user is minimal { id, role, phone, etc }

    const user = req.userDoc || await User.findById(req.user.id);

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
        googleId: user.googleId ? 'linked' : undefined, // don't expose raw googleId
        phone: user.phone,
        role: user.role,
        city: user.city,
        profilePicture: user.profilePicture,
        location: user.location,
        isOnline: user.isOnline,
        isVerified: user.isVerified,
        category: user.category,
        radiusKm: user.radiusKm,
        rating: user.rating,
        reviews: user.reviews,
        isPhoneVerified: user.isPhoneVerified,
        authProvider: user.authProvider,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('GetMe error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get user data',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  googleAuth,
  sendOtp,
  verifyOtp,
  getMe
};
