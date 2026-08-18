const Job = require('../models/Job');
const Message = require('../models/Message');
const { adaptMessageForFrontend } = require('../utils/responseAdapters');
const { createNotification } = require('../utils/notify');

/**
 * Chat Socket Handlers - Phase 7 + Phase 8 Notification Persistence
 * Handles real-time messaging scoped to Job participants
 * 
 * Events:
 * - chat:send (client → server): { jobId, text }
 * - chat:message (server → both participants): full message
 * - chat:markRead (client → server): { jobId }
 * - chat:read (server → other participant): { jobId, readByUserId, readAt }
 * - chat:error (server → sender): error message
 * 
 * Phase 8: Adds notification persistence for chat:message
 * - Always creates notification for recipient (other participant) even if recipient actively chatting
 * - Simplification documented: we don't track which screen is open, persisted isRead=false harmless
 */

const registerChatHandlers = (io, socket) => {
  const userId = socket.user?.id;
  const userRole = socket.user?.role;

  if (!userId) return;

  socket.on('chat:send', async (payload, callback) => {
    try {
      const { jobId, text } = payload || {};

      if (!jobId) {
        const err = { message: 'jobId is required', code: 'MISSING_JOB_ID' };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      if (text === undefined || text === null) {
        const err = { message: 'Text is required', code: 'MISSING_TEXT' };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const trimmedText = typeof text === 'string' ? text.trim() : '';

      if (trimmedText.length === 0) {
        const err = { message: 'Message cannot be empty or whitespace only', code: 'EMPTY_TEXT' };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      if (trimmedText.length > 2000) {
        const err = { message: 'Message cannot exceed 2000 characters', code: 'TOO_LONG', maxLength: 2000 };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const job = await Job.findById(jobId);

      if (!job) {
        const err = { message: 'Job not found', code: 'JOB_NOT_FOUND', jobId };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const isCustomer = job.customer.toString() === userId;
      const isProvider = job.provider.toString() === userId;

      if (!isCustomer && !isProvider) {
        const err = { message: 'Access denied. Only job participants can send messages.', code: 'NOT_PARTICIPANT', jobId };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const message = new Message({
        job: jobId,
        sender: userId,
        text: trimmedText,
        readAt: null
      });

      await message.save();
      await message.populate('sender', 'name role profilePicture');

      const adapted = adaptMessageForFrontend(message, {});

      const customerId = job.customer.toString();
      const providerId = job.provider.toString();

      const messagePayload = {
        message: adapted,
        _backend: {
          id: message._id,
          job: jobId,
          sender: userId,
          text: trimmedText,
          createdAt: message.createdAt
        }
      };

      io.to(`user:${customerId}`).emit('chat:message', messagePayload);
      io.to(`user:${providerId}`).emit('chat:message', messagePayload);

      if (process.env.NODE_ENV !== 'production') {
        console.log(`📤 chat:message emitted to user:${customerId} and user:${providerId} for job ${jobId} - from ${userId}: "${trimmedText.substring(0, 50)}"`);
      }

      // Phase 8: Notification persistence for recipient (other participant)
      // Simplification: always create even if recipient actively chatting - isRead=false harmless
      // We don't have presence tracking for which job chat is open
      try {
        const recipientId = isCustomer ? providerId : customerId;
        const senderName = socket.user?.name || 'Someone';
        await createNotification({
          userId: recipientId,
          type: 'new_message',
          title: 'New message',
          body: `${senderName}: ${trimmedText.substring(0, 50)}${trimmedText.length > 50 ? '...' : ''}`,
          relatedId: message._id
        });
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔔 Notification new_message created for recipient user:${recipientId}`);
        }
      } catch (notifyErr) {
        console.error('Notification creation for chat:message failed:', notifyErr.message);
      }

      if (typeof callback === 'function') {
        callback({ status: 'success', message: adapted });
      }

    } catch (error) {
      console.error('chat:send error:', error);
      const err = { message: 'Failed to send message', code: 'INTERNAL_ERROR', details: error.message };
      socket.emit('chat:error', err);
      if (typeof callback === 'function') {
        try { callback({ status: 'error', error: err }); } catch (cbErr) { console.error('Callback error:', cbErr); }
      }
    }
  });

  socket.on('chat:markRead', async (payload, callback) => {
    try {
      const { jobId } = payload || {};

      if (!jobId) {
        const err = { message: 'jobId is required', code: 'MISSING_JOB_ID' };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const job = await Job.findById(jobId);

      if (!job) {
        const err = { message: 'Job not found', code: 'JOB_NOT_FOUND', jobId };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const isCustomer = job.customer.toString() === userId;
      const isProvider = job.provider.toString() === userId;

      if (!isCustomer && !isProvider) {
        const err = { message: 'Access denied. Only participants can mark read.', code: 'NOT_PARTICIPANT', jobId };
        socket.emit('chat:error', err);
        if (typeof callback === 'function') callback({ status: 'error', error: err });
        return;
      }

      const result = await Message.updateMany(
        { job: jobId, sender: { $ne: userId }, readAt: null },
        { $set: { readAt: new Date() } }
      );

      const readAt = new Date();
      const otherParticipantId = isCustomer ? job.provider.toString() : job.customer.toString();

      io.to(`user:${otherParticipantId}`).emit('chat:read', {
        jobId,
        readByUserId: userId,
        readAt: readAt.getTime(),
        readAtISO: readAt.toISOString(),
        modifiedCount: result.modifiedCount || 0,
        message: `Messages read by ${userId}`
      });

      io.to(`user:${userId}`).emit('chat:read', {
        jobId,
        readByUserId: userId,
        readAt: readAt.getTime(),
        readAtISO: readAt.toISOString(),
        modifiedCount: result.modifiedCount || 0,
        isSelf: true
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`📤 chat:read emitted to user:${otherParticipantId} (and self) - job ${jobId} read by ${userId}, ${result.modifiedCount} messages marked read`);
      }

      if (typeof callback === 'function') {
        callback({ status: 'success', modifiedCount: result.modifiedCount, readAt });
      }

    } catch (error) {
      console.error('chat:markRead error:', error);
      const err = { message: 'Failed to mark read', code: 'INTERNAL_ERROR' };
      socket.emit('chat:error', err);
      if (typeof callback === 'function') {
        callback({ status: 'error', error: err });
      }
    }
  });
};

module.exports = {
  registerChatHandlers
};
