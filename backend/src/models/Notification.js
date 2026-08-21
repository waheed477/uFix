const mongoose = require('mongoose');

/**
 * Notification Model - Phase 8 Notification Persistence
 * 
 * Persists every major event type so that even if recipient is offline,
 * they see notifications when they come online, and notification bell has history.
 * Previously (Phases 5-7) socket events were fire-and-forget with no persistence (per Phase 7 TODO),
 * now we store them.
 * 
 * Types mirror Socket.io event names closely for traceability:
 * - request_new → request:new
 * - new_offer → offer:new
 * - offer_accepted → offer:accepted
 * - offer_rejected → offer:rejected
 * - request_cancelled → request:cancelled
 * - job_status_update → job:statusUpdate
 * - new_message → chat:message
 * 
 * Using snake_case for enum values to be DB-friendly, but close to socket event names
 */

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User (recipient) is required'],
    index: true
  },
  type: {
    type: String,
    enum: {
      values: [
        'new_offer',        // offer:new
        'offer_accepted',   // offer:accepted
        'offer_rejected',   // offer:rejected
        'offer_declined',   // offer:declined (customer declined a single offer - Bidirectional Sync pass)
        'offer_withdrawn',  // offer:withdrawn (provider withdrew their own pending offer - 2026-08-21)
        'request_new',      // request:new
        'request_cancelled',// request:cancelled
        'request_expired',  // request:expired (lazy auto-expiry - Availability & Expiry pass)
        'job_status_update',// job:statusUpdate
        'new_message',      // chat:message
        'new_rating'        // you received a new rating (Bidirectional Sync pass)
      ],
      message: 'Invalid notification type'
    },
    required: [true, 'Type is required']
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  body: {
    type: String,
    required: [true, 'Body is required'],
    trim: true,
    maxlength: [300, 'Body cannot exceed 300 characters']
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    // The Request/Offer/Job/Message id this notification refers to, for tap-to-navigate
    // Optional because some notifications might be generic
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 }); // newest-first for user's notifications
notificationSchema.index({ user: 1, isRead: 1 }); // for unreadCount

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
