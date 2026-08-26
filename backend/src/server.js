const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const { apiBaseline } = require('./middleware/rateLimit');
const http = require('http');
const connectDB = require('./config/db');
const healthRoute = require('./routes/health');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const providerRoutes = require('./routes/providerRoutes');
const requestRoutes = require('./routes/requestRoutes');
const offerRoutes = require('./routes/offerRoutes');
const jobRoutes = require('./routes/jobRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { initSocket } = require('./sockets');

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Production CORS lockdown (2026-08-26 hardening Task 3): in production the deployed
// frontend URL MUST be set via CLIENT_URL. A forgotten value (or a wildcard) FAILS LOUD
// and cross-origin requests are REJECTED - never an open fallback. (The old
// "permissive for Phase 5 testing" catch-all allowed EVERY origin - removed.)
if (isProduction && (!process.env.CLIENT_URL || process.env.CLIENT_URL.includes('*'))) {
  console.error('⛔ SECURITY: NODE_ENV=production requires CLIENT_URL set to the real deployed frontend URL (no wildcard). Cross-origin requests will be REJECTED until fixed.');
}

// ======================
// Middleware
// ======================
const allowedOrigins = CLIENT_URL.split(',').map(o => o.trim())
  .filter(o => !(isProduction && o === '*')); // wildcard stripped in production (deny-by-default)
const allowNoOrigin = true; // curl/native mobile apps/same-origin send no Origin header
const isLocalDevOrigin = (o) => {
  try { const h = new URL(o).hostname; return ['localhost', '127.0.0.1'].includes(h); } catch { return false; }
};
app.use(cors({
  origin: function (origin, callback) {
    if (!origin && allowNoOrigin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProduction && allowedOrigins.includes('*')) return callback(null, true); // dev-inmemory convenience
    if (!isProduction && isLocalDevOrigin(origin)) return callback(null, true); // local dev ports
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security headers (2026-08-26 hardening Task 5): X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy etc. CSP disabled deliberately - this is a pure JSON API (no HTML served),
// and these defaults do not interfere with CORS/Socket.io (Socket.io handles its own CORS).
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// General rate-limit safety net (2026-08-26 Task 1): 100 req/min/IP across ALL /api/*;
// auth endpoints ALSO have stricter per-phone/per-IP limiters (authRoutes.js).
// Skipped when RATE_LIMIT_DISABLED=true or NODE_ENV=test (regression battery convenience,
// documented in middleware/rateLimit.js) - production never sets these.
app.use('/api', apiBaseline);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ======================
// Database Connection
// ======================
connectDB();

// ======================
// Routes
// ======================
app.use('/api/health', healthRoute);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/jobs', messageRoutes); // GET /api/jobs/:jobId/messages - history, socket for sending
app.use('/api/jobs', reviewRoutes); // POST /api/jobs/:jobId/rate, GET /api/jobs/:jobId/reviews
app.use('/api/notifications', notificationRoutes); // GET /, PATCH /:id/read, PATCH /read-all

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to uFix API - On-demand Home & Vehicle Services Marketplace',
    version: 'Phase 9 - Frontend Integration - Site Fully Functional End-to-End',
    health: '/api/health',
    auth: {
      google: 'POST /api/auth/google',
      sendOtp: 'POST /api/auth/phone/send-otp',
      verifyOtp: 'POST /api/auth/phone/verify-otp',
      me: 'GET /api/auth/me (protected)'
    },
    users: {
      getProfile: 'GET /api/users/profile (protected)',
      updateProfile: 'PATCH /api/users/profile (protected, name, city, profilePicture, isOnline - Phase 9 fix for online toggle)',
      uploadPicture: 'POST /api/users/profile/picture (protected, multipart)',
      updateLocation: 'PATCH /api/users/location (protected, {lng,lat})'
    },
    providers: {
      setup: 'PATCH /api/providers/setup (protected, provider-only)',
      uploadDoc: 'POST /api/providers/document (protected, provider-only)',
      verificationStatus: 'GET /api/providers/verification-status (protected, provider-only)',
      verify: 'PATCH /api/providers/:id/verify (temporary manual approval)'
    },
    requests: {
      create: 'POST /api/requests (protected, customer-only) - emits request:new + notifies nearby providers',
      nearby: 'GET /api/requests/nearby (protected, provider-only)',
      my: 'GET /api/requests/my (protected, customer-only)',
      getOne: 'GET /api/requests/:id (protected)',
      cancel: 'PATCH /api/requests/:id/cancel (protected, customer-only) - emits request:cancelled + notifies'
    },
    offers: {
      create: 'POST /api/requests/:id/offers (protected, provider-only) - emits offer:new + notifies customer',
      getOffers: 'GET /api/requests/:id/offers (protected, owner only)',
      accept: 'PATCH /api/offers/:id/accept (protected, customer-only) - creates Job on_the_way, emits accepted/rejected/closed + notifies'
    },
    jobs: {
      getOne: 'GET /api/jobs/:id (protected, only participants, phone numbers unlocked) - contact unlocked at acceptance',
      updateStatus: 'PATCH /api/jobs/:id/status (protected, provider-only, forward only on_the_way→arrived→in_progress→completed, emits job:statusUpdate + notifies both)',
      myActive: 'GET /api/jobs/my/active (protected, both roles)',
      history: 'GET /api/jobs/history?status=all|completed|cancelled&page&limit - returns completed Jobs + cancelled Requests merged, sorted newest-first, paginated, Option B (single endpoint)',
      rate: 'POST /api/jobs/:jobId/rate {rating 1-5, comment?} (protected, only participants, only if completed, rates other party auto, duplicate blocked, updates User rating via aggregation)',
      getReviews: 'GET /api/jobs/:jobId/reviews (protected, participants only)'
    },
    messages: {
      history: 'GET /api/jobs/:jobId/messages (protected, only participants, sorted oldest-first, supports ?before & ?limit) - REST for history, Socket for sending',
      note: 'Sending via Socket.io chat:send, not REST, to avoid double-path'
    },
    notifications: {
      list: 'GET /api/notifications?page=&limit= (protected, newest-first, includes unreadCount)',
      markRead: 'PATCH /api/notifications/:id/read (protected, only owner)',
      markAllRead: 'PATCH /api/notifications/read-all (protected)',
      note: 'Every major event persists notification + emits notification:new live to user:{id}'
    },
    socket: {
      url: `ws://localhost:${PORT}`,
      auth: 'JWT via handshake.auth.token',
      rooms: 'user:{id} auto-joined',
      events: {
        'request:new': 'Server → Provider: new request nearby + notification:new (request_new)',
        'offer:new': 'Server → Customer: new offer + notification:new (new_offer)',
        'offer:accepted': 'Server → Provider: accepted + notification (offer_accepted)',
        'offer:rejected': 'Server → Provider: rejected + notification (offer_rejected)',
        'request:closed': 'Server → Provider: closed',
        'request:cancelled': 'Server → Provider: cancelled + notification (request_cancelled)',
        'job:statusUpdate': 'Server → Both: status changed + notification (job_status_update)',
        'chat:send': 'Client → Server: send message {jobId, text}',
        'chat:message': 'Server → Both: new message + notification:new (new_message) to recipient',
        'chat:markRead': 'Client → Server: mark read {jobId}',
        'chat:read': 'Server → Other: read receipt',
        'chat:error': 'Server → Sender: error',
        'notification:new': 'Server → User: new notification (lightweight, adapted)'
      },
      note: 'Frontend now real client: lib/api.ts + lib/socket.ts + lib/adapters.ts, no more timers/mock, JWT localStorage persistence'
    },
    frontend: {
      url: CLIENT_URL,
      envExample: 'VITE_API_URL and VITE_SOCKET_URL in frontend/.env.example - no hardcoded localhost:5000 in code',
      storage: 'JWT in localStorage (standalone Vite app, not artifact) - documented in project_context.md Phase 9',
      screens: {
        onboarding: 'Real POST /api/auth/phone/send-otp + verify-otp + POST /api/auth/google, JWT localStorage, role + provider setup wired',
        location: 'GPS + reverseGeocode + PATCH /api/users/location + x/y ↔ lat/lng via coordsToOffset/offsetToCoords frontend-side per Phase 6 decision',
        customerHome: 'Map only user dot (removed fake SCATTER/onlineCount per task instruction, TODO if backend adds nearby providers route)',
        newRequest: 'POST /api/requests with x,y→lat,lng conversion',
        offers: 'GET /api/requests/:id/offers initial + socket offer:new live, Accept via PATCH accept',
        providerHome: 'Online toggle via PATCH profile isOnline (Phase 9 backend fix), nearby via GET nearby + socket request:new, Send Offer via POST',
        activeJob: 'GET my/active + job:statusUpdate live, status advance via PATCH, call tel: with real unlocked phone',
        chat: 'GET messages history on open + chat:send emit + chat:message live + markRead + read ticks',
        rating: 'POST /api/jobs/:jobId/rate',
        notifications: 'GET /api/notifications with unreadCount + notification:new live + mark read',
        history: 'GET /api/jobs/history?status=all|completed|cancelled (Option B merged)'
      }
    },
    note: 'Site fully functional end-to-end - two real users (customer + provider) can complete entire journey: signup, request, offer, accept, contact unlock, status timeline live, chat real-time, rating, history, notifications',
    timestamp: new Date().toISOString()
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'POST /api/auth/google',
      'POST /api/auth/phone/send-otp',
      'POST /api/auth/phone/verify-otp',
      'GET /api/auth/me',
      'GET /api/users/profile',
      'PATCH /api/users/profile',
      'POST /api/users/profile/picture',
      'PATCH /api/users/location',
      'PATCH /api/providers/setup',
      'POST /api/providers/document',
      'GET /api/providers/verification-status',
      'PATCH /api/providers/:id/verify',
      'POST /api/requests',
      'GET /api/requests/nearby',
      'GET /api/requests/my',
      'GET /api/requests/:id',
      'PATCH /api/requests/:id/cancel',
      'POST /api/requests/:id/offers',
      'GET /api/requests/:id/offers',
      'PATCH /api/offers/:id/accept',
      'GET /api/jobs/:id',
      'PATCH /api/jobs/:id/status',
      'GET /api/jobs/my/active',
      'GET /api/jobs/history?status=all|completed|cancelled',
      'POST /api/jobs/:jobId/rate',
      'GET /api/jobs/:jobId/reviews',
      'GET /api/jobs/:jobId/messages',
      'GET /api/notifications',
      'PATCH /api/notifications/:id/read',
      'PATCH /api/notifications/read-all',
      'Socket.io: ws://localhost:' + PORT + ' events: request:new, offer:new, accepted/rejected, closed/cancelled, job:statusUpdate, chat:send, chat:message, markRead/read/error, notification:new'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ======================
// HTTP Server + Socket.io
// ======================
const httpServer = http.createServer(app);

// Init Socket.io and attach to app
const io = initSocket(httpServer);
app.set('io', io); // Makes io accessible via req.app.get('io') in controllers

// ======================
// Server Start
// ======================
const server = httpServer.listen(PORT, () => {
  console.log('=================================');
  console.log(`🚀 uFix Backend Server Running`);
  console.log(`📡 Port: ${PORT} (HTTP + WebSocket)`);
  console.log(`🌐 Client URL: ${CLIENT_URL}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.io: ws://localhost:${PORT} (rooms: user:{id})`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=================================');
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;
module.exports.io = io;
module.exports.httpServer = httpServer;
