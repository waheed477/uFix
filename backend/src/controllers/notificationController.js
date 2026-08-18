const Notification = require('../models/Notification');

/**
 * Notification Controller - Phase 8 Notification Persistence
 * Handles fetching, marking read, marking all read
 */

/**
 * @route GET /api/notifications
 * @desc Get current user's notifications, newest-first, paginated, includes unreadCount
 * @query { page, limit }
 * @access Private
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const filter = { user: userId };

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);

    return res.status(200).json({
      status: 'success',
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
        unreadCount
      },
      unreadCount,
      count: notifications.length,
      notifications: notifications.map(n => ({
        id: n._id,
        type: n.type,
        title: n.title,
        body: n.body,
        relatedId: n.relatedId,
        isRead: n.isRead,
        createdAt: n.createdAt,
        timestamp: n.createdAt ? new Date(n.createdAt).getTime() : Date.now()
      }))
    });

  } catch (error) {
    console.error('GetNotifications error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get notifications',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/notifications/:id/read
 * @desc Mark one notification as read (only if belongs to requester)
 * @access Private
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notification = await Notification.findOne({ _id: id, user: userId });

    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found or not owned by you'
      });
    }

    if (notification.isRead) {
      return res.status(200).json({
        status: 'success',
        message: 'Notification already marked as read',
        notification: {
          id: notification._id,
          isRead: true
        }
      });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
      notification: {
        id: notification._id,
        type: notification.type,
        isRead: true
      }
    });

  } catch (error) {
    console.error('MarkAsRead error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to mark notification as read',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/notifications/read-all
 * @desc Mark all of requester's notifications as read
 * @access Private
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount || 0
    });

  } catch (error) {
    console.error('MarkAllAsRead error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to mark all as read',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead
};
