/**
 * Dev-only launcher: runs the real uFix backend against an in-memory MongoDB
 * (mongodb-memory-server, already in devDependencies) so no external DB is needed
 * for local testing / live previews. Do NOT use in production.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '5000';
process.env.CLIENT_URL = process.env.CLIENT_URL || '*';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  '9f1b3c2d4e5a6f708192a3b4c5d6e7f809182a3b4c5d6e7f8091a2b3c4d5e6f7a';

(async () => {
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    console.log('🧠 Starting in-memory MongoDB (first run downloads the mongod binary)...');
    const mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri('ufix');
    console.log(`🧠 In-memory MongoDB ready: ${process.env.MONGO_URI}`);
    require('./src/server');
  } catch (err) {
    console.error('❌ Failed to start in-memory dev server:', err);
    process.exit(1);
  }
})();
