const mongoose = require('mongoose');

/**
 * Connect to MongoDB via Mongoose
 * Uses MONGO_URI from environment variables
 * Logs success/error clearly for dev visibility
 *
 * Post-Audit Fix P5 (deployment blocker): previously a missing MONGO_URI was only a
 * warning and the server kept running, so EVERY request later hung on Mongoose's
 * buffering timeout (10s) - a silently broken deployment (exactly what Render would do
 * with a misconfigured env). Now we FAIL FAST in any real run context:
 *   - NODE_ENV 'test'      -> allowed to run without DB (unit-test friendliness)
 *   - ALLOW_NO_DB='true'   -> explicit opt-out (health-check-only scenarios)
 *   - dev-inmemory.js      -> unaffected: it sets MONGO_URI (in-memory mongod) itself
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  const allowNoDb = process.env.ALLOW_NO_DB === 'true' || process.env.NODE_ENV === 'test';

  if (!mongoUri) {
    if (!allowNoDb) {
      console.error('');
      console.error('═══════════════════════════════════════════════════════════════════');
      console.error('❌ FATAL: MONGO_URI is not set - refusing to start without a database.');
      console.error('   A server that starts without a DB accepts requests that all hang');
      console.error('   (10s buffering timeouts) - this is a silently broken deployment.');
      console.error('');
      console.error('   Fix for local/prod:');
      console.error('     1. Copy backend/.env.example to backend/.env');
      console.error('     2. Set a REAL MONGO_URI (MongoDB Atlas) and a REAL JWT_SECRET (64 hex)');
      console.error('     3. Run: npm start');
      console.error('');
      console.error('   Alternatives:');
      console.error('     - Quick sandbox testing (no Atlas needed): node dev-inmemory.js');
      console.error('     - Health-check-only run (no DB):           ALLOW_NO_DB=true npm start');
      console.error('═══════════════════════════════════════════════════════════════════');
      process.exit(1);
    }
    console.warn('⚠️  MONGO_URI not set - running WITHOUT a database because ALLOW_NO_DB=true / NODE_ENV=test');
    console.warn('   Any endpoint that touches the DB will hang/time out. This mode is for health checks only.');
    return null;
  }

  try {
    // serverSelectionTimeoutMS: fail fast (~10s) instead of the default 30s guess-and-hang
    const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

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
    if (!allowNoDb) {
      console.error('');
      console.error('═══════════════════════════════════════════════════════════════════');
      console.error(`❌ FATAL: MongoDB connection failed: ${error.message}`);
      console.error('   Refusing to start - fix the config instead of shipping a dead API.');
      console.error('   Checklist:');
      console.error('     1. backend/.env has the REAL MONGO_URI (not the .env.example placeholder)');
      console.error('     2. Network reachable / Atlas IP whitelist allows this machine');
      console.error('     3. Credentials in the URI are correct');
      console.error('   For sandbox testing without any MongoDB: node dev-inmemory.js');
      console.error('═══════════════════════════════════════════════════════════════════');
      process.exit(1);
    }
    console.error(`❌ MongoDB connection failed: ${error.message} (continuing because ALLOW_NO_DB / NODE_ENV=test mode)`);
    return null;
  }
};

module.exports = connectDB;
