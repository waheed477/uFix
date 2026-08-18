const express = require('express');
const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint - confirms server is alive and responding
 * Returns status, timestamp, uptime, and DB connection status
 */
router.get('/', (req, res) => {
  const mongoose = require('mongoose');
  const dbStatus = mongoose.connection.readyState;
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting

  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatusMap[dbStatus] || 'unknown',
    version: '0.1.0 - Phase 0',
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
