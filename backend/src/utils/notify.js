const Notification = require('../models/Notification');

/**
 * Notification Utility - Phase 8
 * 
 * Creates a notification in DB AND emits lightweight `notification:new` socket event
 * to user:{userId} so online user's notification bell updates live without polling.
 * 
 * This is reusable and called alongside existing socket emissions from Phases 5-7
 * (additive - does not change existing socket emissions, just adds persistence + notification event)
 * 
 * For chat:message, we have a deliberate simplification:
 * - We always create notification on chat:message, even if recipient is actively chatting
 * - Why? We don't have presence-tracking for "which screen is open" (e.g., is user currently in that job's chat?)
 * - A persisted record with isRead=false is harmless even if recipient is actively chatting - they will see message in chat anyway, and notification bell will show unread count
 * - Over-engineering presence detection (tracking which job chat is open per socket) is unnecessary for MVP scale <20 users
 * - Documented as simplification in project_context.md
 */

let ioInstance = null;

// Allow setting io instance from server.js or sockets/index.js
// We can also get it via app.get('io') in controllers, but for utility we need a setter
const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => {
  return ioInstance;
};

/**
 * Create notification and emit real-time event
 * @param {Object} params
 * @param {String|ObjectId} params.userId - recipient user id
 * @param {String} params.type - one of notification enum values
 * @param {String} params.title - short title e.g., "New offer received"
 * @param {String} params.body - short description
 * @param {String|ObjectId} params.relatedId - optional related Request/Offer/Job/Message id for tap-to-navigate
 * @returns {Promise<Notification>} created notification
 */
const createNotification = async ({ userId, type, title, body, relatedId = null }) => {
  try {
    if (!userId) {
      console.warn('createNotification called without userId, skipping');
      return null;
    }

    // Validate type is in enum (mongoose will also validate on save)
    const validTypes = [
      'new_offer',
      'offer_accepted',
      'offer_rejected',
      'offer_declined',
      'offer_withdrawn',  // offer:withdrawn (provider pulled own pending offer - 2026-08-21)
      'request_new',
      'request_cancelled',
      'request_expired',
      'job_status_update',
      'new_message',
      'new_rating'
    ];

    if (!validTypes.includes(type)) {
      console.warn(`Invalid notification type ${type}, must be one of ${validTypes.join(', ')}`);
      // Still proceed, mongoose will throw if invalid, but we warn
    }

    const notification = new Notification({
      user: userId,
      type,
      title,
      body,
      relatedId: relatedId || null,
      isRead: false
    });

    await notification.save();

    // Emit lightweight notification:new event to user's room if io available
    // This allows online user's notification bell to update live without polling
    try {
      const io = ioInstance || (global.io ? global.io : null);
      // Try to get io from global or from setter
      // If not available via setter, controllers can also emit directly via req.app.get('io')
      // But for utility, we try our stored instance first, then fallback to trying to require server's io?
      // For simplicity, if ioInstance not set, we try to get from sockets/index.js getIO()
      let activeIO = ioInstance;
      if (!activeIO) {
        try {
          const { getIO: getIOFromSockets } = require('../sockets');
          activeIO = getIOFromSockets();
        } catch (e) {
          // getIO may throw if not initialized yet, ignore
        }
      }

      if (activeIO) {
        // Adapt notification for frontend (reuse adapter pattern)
        const adapted = {
          id: notification._id.toString(),
          type: notification.type,
          title: notification.title,
          body: notification.body,
          relatedId: notification.relatedId ? notification.relatedId.toString() : null,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          timestamp: notification.createdAt ? new Date(notification.createdAt).getTime() : Date.now(),
          // For frontend bell: unread count will be fetched via REST, but this event triggers live update
        };

        activeIO.to(`user:${userId}`).emit('notification:new', {
          notification: adapted,
          message: title
        });

        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔔 notification:new emitted to user:${userId} - type: ${type}, title: "${title}"`);
        }
      }
    } catch (socketErr) {
      // Socket emit failure should not block notification creation
      console.error('Failed to emit notification:new socket event:', socketErr.message);
    }

    return notification;

  } catch (error) {
    console.error('createNotification failed:', error.message);
    // Do not throw - notification creation failure should not break main flow (e.g., offer creation)
    // It's additive, so we log and return null
    return null;
  }
};

module.exports = {
  createNotification,
  setIO,
  getIO
};
