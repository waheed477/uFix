const mongoose = require('mongoose');

/**
 * Message Model - Phase 7 Chat System
 * Scoped strictly to an active Job - only two participants (customer and provider) can send/read
 * Job must exist (offer must have been accepted) before chat - follows contact unlock at acceptance
 */

const messageSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job is required'],
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  text: {
    type: String,
    required: [true, 'Text is required'],
    trim: true,
    minlength: [1, 'Message cannot be empty after trim'],
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
    validate: {
      validator: function(v) {
        return v.trim().length > 0;
      },
      message: 'Message cannot be empty or whitespace only'
    }
  },
  readAt: {
    type: Date,
    default: null // null means unread, Date means read
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // adds createdAt, updatedAt (we keep our manual createdAt too for compatibility, but timestamps will manage updatedAt)
});

// Indexes for efficient history queries
messageSchema.index({ job: 1, createdAt: 1 }); // for sorting oldest-first
messageSchema.index({ job: 1, sender: 1 });
messageSchema.index({ job: 1, readAt: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
