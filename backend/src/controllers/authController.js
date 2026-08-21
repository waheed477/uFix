const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Otp = require('../models/Otp');
const RefreshToken = require('../models/RefreshToken');
const { generateAccessToken, generateRefreshToken, verifyToken, REFRESH_TTL_MS } = require('../utils/generateToken');
const { computeSetupComplete, firstIncompleteStep } = require('../utils/setupComplete');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Auth Controller - Returning-User Login & Session Persistence pass (2026-08-21).
 *
 * THE CONTRACT (single source of truth - frontend never guesses):
 * - Every successful auth response (phone OTP verify, Google, refresh-adjacent /me) carries
 *     isNewUser     : true ONLY when this call CREATED the account
 *     isNewUserPath : same, on the user payload too (consumed by onboarding routing)
 *     setupComplete : computed per role (utils/setupComplete) - false => resume onboarding
 *                     EXACTLY at firstIncompleteStep, never from scratch
 *     token / refreshToken : dual-token session (25min access + 30d refresh, type-claimed,
 *                     refresh is bcrypt-hashed in RefreshToken collection => revocable)
 * - verify-otp / google find-or-create rules:
 *     phone : existing User.phone => LOGIN (body name/role/city IGNORED - DB wins)
 *     google: googleId match => LOGIN; else phone match => LINK googleId to that account
 *             (never a duplicate user); else verified-email match => LINK; else SIGNUP
 *             (role required; phone required - mandatory identity in this app)
 */

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateOtpCode = () => Math.floor(100000 + Math.random() * 900000).toString();

/** Full, setup-aware user payload - IDENTICAL shape for phone + Google + /me. */
const serializeAuthUser = (user) => ({
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
  defaultVisitingCharge: user.defaultVisitingCharge,
  verificationStatus: user.verificationStatus,
  rating: user.rating,
  reviews: user.reviews,
  isPhoneVerified: user.isPhoneVerified,
  authProvider: user.authProvider,
  setupComplete: computeSetupComplete(user),
  setupStep: firstIncompleteStep(user), // null when complete; where a partial signup resumes
  createdAt: user.createdAt,
});

/**
 * Create a new session for BOTH auth methods: fresh access token + a NEW refresh-token
 * session record (per-device; nothing here invalidates other sessions - multi-device OK).
 */
const issueSession = async (user, device) => {
  const jti = crypto.randomBytes(16).toString('hex');
  const refreshToken = generateRefreshToken(user, jti);
  const doc = new RefreshToken({
    user: user._id,
    jti,
    tokenHash: await bcrypt.hash(refreshToken, 10),
    device: device ? String(device).slice(0, 120) : undefined,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  await doc.save();
  return { token: generateAccessToken(user), refreshToken };
};

const sessionPayload = (user, tokens, isNewUser, message, httpStatus) => ({
  httpStatus,
  body: {
    status: 'success',
    message,
    isNewUser,
    ...tokens,
    user: { ...serializeAuthUser(user), isNewUser },
  },
});

/**
 * @route POST /api/auth/google
 * @desc Google Sign-In - returning-user aware (googleId -> phone-link -> email-link -> signup)
 * @body { idToken, role?, phone?, name?, city?, device? }
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken, role, phone, name: customName, city, device } = req.body;

    if (!idToken) {
      return res.status(400).json({ status: 'error', message: 'Google ID token is required' });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        status: 'error',
        message: 'GOOGLE_CLIENT_ID not configured on server. Please set it in .env. See project_context.md Known Issues.',
        needsConfig: true
      });
    }

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return res.status(401).json({ status: 'error', message: 'Invalid Google ID token', details: err.message });
    }

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = customName || payload.name || 'User';
    const profilePicture = payload.picture;

    // ORDER MATTERS (documented contract): 1) googleId  2) phone  3) email
    // 1) Returning user by googleId - ignore any stale profile fields in the body.
    let user = await User.findOne({ googleId });

    // 2) Phone match => LINK the Google identity to the EXISTING account (no duplicate).
    if (!user && phone) {
      const phoneUser = await User.findOne({ phone: phone.trim() });
      if (phoneUser) {
        if (phoneUser.googleId && phoneUser.googleId !== googleId) {
          return res.status(409).json({
            status: 'error',
            message: 'This phone number is already linked to a different Google account. Please log in with phone OTP.'
          });
        }
        user = phoneUser;
        user.googleId = googleId;
        if (!user.email && email) user.email = email;
        if (profilePicture && !user.profilePicture) user.profilePicture = profilePicture;
        user.authProvider = user.authProvider === 'phone' ? 'both' : user.authProvider;
        await user.save();
        console.log(`🔗 Google account LINKED to existing phone account ${user._id} (${user.phone})`);
      }
    }

    // 3) Verified-email match (no phone provided, no phone account found) => link.
    if (!user && email) {
      const emailUser = await User.findOne({ email });
      if (emailUser) {
        if (emailUser.googleId && emailUser.googleId !== googleId) {
          return res.status(409).json({
            status: 'error',
            message: 'This email is already linked to a different Google account.'
          });
        }
        user = emailUser;
        user.googleId = googleId;
        if (profilePicture && !user.profilePicture) user.profilePicture = profilePicture;
        user.authProvider = user.authProvider === 'phone' ? 'both' : user.authProvider;
        await user.save();
      }
    }

    if (user) {
      // Returning login (possibly just linked above). Body name/role/city IGNORED - DB wins.
      const tokens = await issueSession(user, device);
      const out = sessionPayload(user, tokens, false, 'Logged in with Google', 200);
      return res.status(out.httpStatus).json(out.body);
    }

    // 4) Genuinely new: Google replaces identity verification ONLY, not profile setup.
    if (!phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is mandatory for all users. Please provide phone with Google sign-in.',
        needsPhone: true,
        googleData: { googleId, email, name, profilePicture }
      });
    }

    if (!role || !['customer', 'provider'].includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Role is required for new users: customer or provider',
        needsRole: true,
        needsPhone: false,
        googleData: { googleId, email, name, profilePicture }
      });
    }

    user = new User({
      name: name.trim(),
      email,
      googleId,
      phone: phone.trim(),
      role,
      city,
      profilePicture,
      isPhoneVerified: false, // Google verified identity; phone OTP not involved in this flow
      authProvider: 'both',
      isOnline: role === 'provider' ? false : undefined
    });
    await user.save();

    const tokens = await issueSession(user, device);
    const out = sessionPayload(user, tokens, true, 'Account created with Google', 201);
    return res.status(out.httpStatus).json(out.body);

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
 */
const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ status: 'error', message: 'Phone number is required' });
    }

    const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ status: 'error', message: 'Invalid phone number format' });
    }

    const normalizedPhone = phone.trim();

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

    const otpCode = generateOtpCode();
    await Otp.deleteMany({ phone: normalizedPhone });
    await new Otp({
      phone: normalizedPhone,
      otp: otpCode, // In production, should be hashed
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }).save();

    console.log('=================================');
    console.log(`📱 OTP for ${normalizedPhone}: ${otpCode}`);
    console.log(`⏰ Expires in 5 minutes`);
    console.log('=================================');

    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(200).json({
      status: 'success',
      message: 'OTP sent successfully',
      phone: normalizedPhone,
      expiresIn: '5 minutes',
      ...(isDev && {
        otp: otpCode,
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
 * @desc Verify OTP: existing phone => returning LOGIN (body extras ignored);
 *       unknown phone => SIGNUP requiring name/role. Flags decide routing, not guesses.
 */
const verifyOtp = async (req, res) => {
  try {
    const { phone, otp, name, role, city, device } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ status: 'error', message: 'Phone and OTP are required' });
    }

    const normalizedPhone = phone.trim();

    const otpDoc = await Otp.findOne({ phone: normalizedPhone }).sort({ createdAt: -1 });
    if (!otpDoc) {
      return res.status(400).json({ status: 'error', message: 'No OTP found for this phone. Please request a new OTP.' });
    }
    if (otpDoc.isExpired()) {
      await Otp.deleteMany({ phone: normalizedPhone });
      return res.status(400).json({ status: 'error', message: 'OTP expired. Please request a new OTP.' });
    }
    if (otpDoc.attempts >= 5) {
      await Otp.deleteMany({ phone: normalizedPhone });
      return res.status(429).json({ status: 'error', message: 'Too many failed attempts. OTP invalidated. Please request a new OTP.' });
    }
    if (otpDoc.otp !== otp.toString()) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return res.status(400).json({ status: 'error', message: 'Invalid OTP', attemptsLeft: 5 - otpDoc.attempts });
    }

    // OTP valid - existence decided BEFORE any creation (returning vs new).
    let user = await User.findOne({ phone: normalizedPhone });

    if (user) {
      // RETURNING USER: trust the DB - any name/role/city in the body is stale form data.
      if (!user.isPhoneVerified) { user.isPhoneVerified = true; await user.save(); }
      await Otp.deleteMany({ phone: normalizedPhone });

      const tokens = await issueSession(user, device);
      const out = sessionPayload(user, tokens, false, 'Logged in successfully', 200);
      return res.status(out.httpStatus).json(out.body);
    }

    // NEW USER: name/role mandatory (city optional); OTP kept valid across these 400s so
    // the details form can resubmit without a new SMS.
    if (!name) {
      return res.status(400).json({
        status: 'error', message: 'Name is required for new user registration',
        needsName: true, phoneVerified: true, phone: normalizedPhone, otpStillValid: true
      });
    }
    if (!role || !['customer', 'provider'].includes(role)) {
      return res.status(400).json({
        status: 'error', message: 'Role is required for new users: customer or provider',
        needsRole: true, phoneVerified: true, otpStillValid: true
      });
    }

    user = new User({
      name: name.trim(),
      phone: normalizedPhone,
      role,
      city,
      isPhoneVerified: true,
      authProvider: 'phone'
    });
    await user.save();
    await Otp.deleteMany({ phone: normalizedPhone });

    const tokens = await issueSession(user, device);
    const out = sessionPayload(user, tokens, true, 'Account created and logged in successfully', 201);
    return res.status(out.httpStatus).json(out.body);

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
 * @route POST /api/auth/refresh
 * @desc Exchange a VALID refresh token for a new access token (single source of session
 *       renewal; the access-token middleware + frontend 401 interceptor lead here).
 * @body { refreshToken }
 */
const refreshSession = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ status: 'error', message: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch (err) {
      return res.status(401).json({
        status: 'error',
        message: err.name === 'TokenExpiredError' ? 'Refresh token expired. Please log in again.' : 'Invalid refresh token.',
        code: 'REFRESH_INVALID'
      });
    }
    if (decoded.type !== 'refresh' || !decoded.jti) {
      return res.status(401).json({ status: 'error', message: 'Not a refresh token.', code: 'REFRESH_INVALID' });
    }

    // Server-side session record is the authority (revocable): must exist, unrevoked, unexpired,
    // and the presented token must match its bcrypt hash.
    const doc = await RefreshToken.findOne({ jti: decoded.jti });
    if (!doc || doc.revokedAt || doc.expiresAt.getTime() <= Date.now()) {
      return res.status(401).json({ status: 'error', message: 'Session expired or revoked. Please log in again.', code: 'REFRESH_REVOKED' });
    }
    const matches = await bcrypt.compare(refreshToken, doc.tokenHash);
    if (!matches || doc.user.toString() !== decoded.id.toString()) {
      return res.status(401).json({ status: 'error', message: 'Refresh token mismatch.', code: 'REFRESH_INVALID' });
    }

    const user = await User.findById(doc.user);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found for this session.', code: 'REFRESH_INVALID' });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Session refreshed',
      token: generateAccessToken(user),
      user: serializeAuthUser(user)
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to refresh session' });
  }
};

/**
 * @route POST /api/auth/logout
 * @desc Real server-side revocation: deletes the presented refresh session record.
 *       Idempotent (unknown/expired tokens still return success - nothing to revoke).
 * @body { refreshToken, device? }  (device label reserved for future multi-session UI)
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      let decoded = null;
      try { decoded = verifyToken(refreshToken); } catch { try { decoded = require('jsonwebtoken').decode(refreshToken); } catch {} }
      if (decoded?.jti) {
        await RefreshToken.deleteOne({ jti: decoded.jti });
        console.log(`🚪 Logout: refresh session ${decoded.jti} revoked (user ${decoded.id})`);
      }
    }
    return res.status(200).json({ status: 'success', message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to log out' });
  }
};

/**
 * @route GET /api/auth/me
 * @desc Session restore on app reload. isNewUser is ALWAYS false here - reaching /me
 *       requires an issued token, i.e. the account already exists.
 */
const getMe = async (req, res) => {
  try {
    const user = req.userDoc || await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    return res.status(200).json({
      status: 'success',
      isNewUser: false,
      user: {
        ...serializeAuthUser(user),
        googleId: undefined,
        googleLinked: !!user.googleId, // never expose the raw id
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
  refreshSession,
  logout,
  getMe
};
