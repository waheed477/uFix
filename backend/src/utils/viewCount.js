/**
 * request:viewCount utilities — "X providers viewing your request" (2026-08-21, Issue 2).
 *
 * Single source of truth for the provider-matching used by BOTH the request:new fan-out
 * and the customer-facing live viewing count, so the two can never disagree:
 * primary 25km city+category search -> (dev-only) 100km fallback adoption -> busy-lock
 * exclusion (a busy provider can't SEE new requests, so they must not count as viewing).
 *
 * `request:viewCount` payload: { requestId, count, category } -> emitted to the CUSTOMER:
 *   - once at request creation (from requestController.createRequest), and
 *   - whenever a provider's online/offline toggle could change a pending request's count
 *     (reemitViewCountsForProvider, called from userController.updateProfile).
 *
 * Deliberately simple: full live "currently staring at the screen" presence tracking is
 * out of scope; count = providers this request is currently VISIBLE to.
 */
const Job = require('../models/Job');
const Request = require('../models/Request');
const { findNearbyProviders } = require('./geo');
const { isStalePending } = require('./requestExpiry');

/**
 * The exact matching used for request:new fan-out (extracted for reuse).
 * Returns the eligible provider docs (online, verified, category+city, within radius,
 * NOT busy). May be dev-expanded via the 100km fallback when the primary search is empty.
 */
const computeMatchingProviders = async ({ lng, lat, category, city }) => {
  let providers = await findNearbyProviders({ lng, lat, category, city, maxDistanceKm: 25, limit: 100 });
  if (providers.length === 0) {
    const fallbackProviders = await findNearbyProviders({ lng, lat, category, city, maxDistanceKm: 100, limit: 100 });
    if (fallbackProviders.length > 0 && process.env.NODE_ENV !== 'production') providers = fallbackProviders;
  }
  // Provider Availability Lock parity: busy providers (active job) cannot see new
  // requests server-side (nearby returns empty + offer blocked), so they are excluded
  // from the fan-out - and therefore from "viewing" counts too.
  try {
    const candidateIds = providers.map((p) => p._id);
    if (candidateIds.length > 0) {
      const busyIds = new Set(
        (await Job.find({ provider: { $in: candidateIds }, status: { $ne: 'completed' } }).select('provider'))
          .map((j) => j.provider.toString())
      );
      providers = providers.filter((p) => !busyIds.has(p._id.toString()));
    }
  } catch (busyErr) {
    console.warn('Busy-provider filter failed in viewCount (non-blocking):', busyErr.message);
  }
  return providers;
};

/** Emit the current viewing count for one request to its customer. */
const emitRequestViewCount = async (io, request) => {
  try {
    const providers = await computeMatchingProviders({
      lng: request.location.coordinates[0],
      lat: request.location.coordinates[1],
      category: request.category,
      city: request.city,
    });
    io.to(`user:${request.customer}`).emit('request:viewCount', {
      requestId: request._id,
      count: providers.length,
      category: request.category,
    });
  } catch (e) {
    console.error(`request:viewCount emit failed for ${request._id}:`, e.message);
  }
};

/**
 * Called when a provider toggles online/offline (or isOnline is PATCHed): every pending,
 * non-stale request in their city+category gets a refreshed count pushed to its customer.
 */
const reemitViewCountsForProvider = async (io, provider) => {
  if (!provider || provider.role !== 'provider' || !provider.category || !provider.city) return;
  try {
    const cityRx = new RegExp(`^${String(provider.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const pending = await Request.find({ status: 'pending', category: provider.category, city: cityRx }).select('_id customer category city status location expiresAt createdAt').lean();
    for (const req of pending) {
      if (isStalePending(req)) continue; // stale requests will be flipped by the lazy sweep on next read
      await emitRequestViewCount(io, req);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`👀 request:viewCount re-emitted for ${pending.length} pending ${provider.category} request(s) in ${provider.city} (provider ${provider._id} toggled online state)`);
    }
  } catch (e) {
    console.error('reemitViewCountsForProvider failed:', e.message);
  }
};

module.exports = { computeMatchingProviders, emitRequestViewCount, reemitViewCountsForProvider };
