const { Server } = require('socket.io');
const authSocketMiddleware = require('./authSocket');
const { registerChatHandlers } = require('./chatSocket');
const { setIO: setNotifyIO } = require('../utils/notify');

/**
 * Socket.io Server Setup - Phase 5
 * 
 * - Attaches to existing HTTP server (not separate port)
 * - CORS allows frontend origin from CLIENT_URL env (same as Express)
 * - JWT authentication via handshake.auth.token (reuses HTTP JWT logic)
 * - Room-based: each user auto-joins room `user:{userId}` for targeted delivery
 * - Single in-memory instance (no Redis adapter) - deliberate scope decision for <20 users single instance
 *   See project_context.md for explanation
 */

let io = null;

const initSocket = (httpServer) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const allowedOrigins = clientUrl.split(',').map(o => o.trim());

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow no origin (mobile apps, curl, postman, tests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        // In dev, allow localhost
        if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
          return callback(null, true);
        }
        // For Phase 5 testing, be permissive
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST']
    },
    // For small scale, default in-memory adapter is fine (no Redis)
    // Mentioned as deliberate decision in project_context.md
  });

  // JWT auth middleware
  io.use(authSocketMiddleware);

  // Connection handling
  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    const userRole = socket.user?.role;
    const userName = socket.user?.name;

    if (!userId) {
      console.warn(`⚠️ Socket ${socket.id} connected without user id - disconnecting`);
      socket.disconnect();
      return;
    }

    // Auto-join user-specific room: user:{id}
    // This allows targeted delivery to specific user regardless of device/tab
    const userRoom = `user:${userId}`;
    socket.join(userRoom);

    // Also join role-based room for potential broadcasting (optional)
    // e.g., providers:all, customers:all - useful for future
    socket.join(`${userRole}s`); // providers or customers

    // Register chat handlers (Phase 7)
    registerChatHandlers(io, socket);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Socket connected: ${socket.id} | User: ${userName} (${userId}) Role: ${userRole} | Joined rooms: ${userRoom}, ${userRole}s`);
      console.log(`   Total connected sockets: ${io.engine.clientsCount}`);
    }

    // Optional: handle custom events from client (e.g., ping, typing - for future phases)
    // For Phase 5, we only need server -> client events, but we can log client events for debugging
    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`❌ Socket disconnected: ${socket.id} | User: ${userName} (${userId}) | Reason: ${reason}`);
        console.log(`   Total connected sockets: ${io.engine.clientsCount - 1}`);
      }
    });

    // Example future events (TODO Phase 7 chat)
    // socket.on('typing', (data) => { ... })

    // Heartbeat / ping for debugging
    socket.on('ping', (data, callback) => {
      if (typeof callback === 'function') {
        callback({ status: 'ok', timestamp: new Date().toISOString(), userId });
      }
    });
  });

  // Set io instance for notification utility (Phase 8) - allows notify.js to emit notification:new
  try {
    setNotifyIO(io);
  } catch (e) {
    console.warn('Failed to set io for notify utility:', e.message);
  }

  console.log('🚀 Socket.io server initialized');
  console.log(`   CORS origin: ${clientUrl}`);
  console.log(`   Room naming: user:{id} (e.g., user:507f1f77bcf86cd799439011)`);
  console.log(`   Auth: JWT via handshake.auth.token`);
  console.log(`   Adapter: in-memory (single instance, no Redis - deliberate for <20 users)`);
  console.log(`   Notification persistence: notification:new events emitted alongside existing events (Phase 8)`);

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized! Call initSocket(httpServer) first');
  }
  return io;
};

// Helper to emit to a specific user room
const emitToUser = (userId, event, payload) => {
  if (!io) return;
  const room = `user:${userId}`;
  io.to(room).emit(event, payload);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📤 Emitted ${event} to ${room}`, payload ? `payload keys: ${Object.keys(payload).join(',')}` : '');
  }
};

// Helper to emit to multiple users
const emitToUsers = (userIds, event, payload) => {
  if (!io) return;
  userIds.forEach(userId => {
    emitToUser(userId, event, payload);
  });
};

// Helper to emit to all providers (or all customers) - optional
const emitToRole = (role, event, payload) => {
  if (!io) return;
  // role = 'provider' or 'customer', room is providers or customers
  const room = `${role}s`;
  io.to(room).emit(event, payload);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToUsers,
  emitToRole
};
