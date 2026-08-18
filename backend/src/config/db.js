const mongoose = require('mongoose');

/**
 * Connect to MongoDB via Mongoose
 * Uses MONGO_URI from environment variables
 * Logs success/error clearly for dev visibility
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      console.warn('⚠️  MONGO_URI not set in .env - skipping DB connection (server will run without DB)');
      return null;
    }

    // Mongoose connection options - production grade defaults
    const conn = await mongoose.connect(mongoUri, {
      // These options are no longer needed in Mongoose 6+, kept for clarity
      // but mongoose will ignore unknown options
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host} | DB: ${conn.connection.name}`);
    
    // Handle connection events for better observability
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed due to app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    console.error('   Hint: Check if MONGO_URI is correct and IP whitelist allows your IP (Atlas)');
    // Don't exit in Phase 0 - allow server to run without DB for health check testing
    // In production phases, you might want process.exit(1)
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return null;
  }
};

module.exports = connectDB;
