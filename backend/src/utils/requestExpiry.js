const Request = require('../models/Request');
const Offer = require('../models/Offer');
const { createNotification } = require('./notify');
const { REQUEST_EXPIRY_MINUTES } = require('./requestConfig');

/**
 * Lazy Request Expiry - Provider Availability Lock & Request Expiry pass (Part 2)
 *
 * DESIGN DECISION: lazy-check-on-read instead of a cron/background scheduler.
 * Why no cron job?
 *  - Project scale is <20 concurrent users (per project_context Phase 5's equally
 *    deliberate no-Redis decision) - at this scale a scheduler adds operational
 *    complexity (a second process, or in-process timers that don't survive restarts)
 *    for zero user-visible gain.
 *  - Every endpoint that READS or ACTS ON a pending request checks `expiresAt`
 *    first and flips stale ones to cancelled ('expired') before its normal logic.
 *    The outcome is identical from every user's point of view: an expired request
 *    can never be offered on or accepted, disappears from nearby lists, and shows
 *    as "Expired" in history - it just happens on the next touch instead of on a
 *    timer tick.
 *
 * Side effects mirror the customer-cancel flow:
 *  - status -> 'cancelled', cancelledReason -> 'expired'
 *  - still-pending offers -> 'rejected'
 *  - socket 'request:expired' -> customer + providers who offered (live card/badge updates)
 *  - socket 'request:closed' -> nearby providers who hadn't offered (drop stale cards),
 *    same pattern the accept flow already uses
 *  - persisted 'request_expired' notifications -> customer + offering providers
 */

function resolveIO(passedIO) {
  if (passedIO) return passedIO;
  try {
    return require('../sockets').getIO();
  } catch {
    return null;
  }
}

// 2026-08-21 (Repeated-notification/stale-request fix): requests created BEFORE the
// expiry feature shipped have NO expiresAt at all. Without a fallback they stayed
// pending FOREVER and kept resurfacing in provider nearby lists (the "old test
// requests keep notifying" bug). Treat a missing expiresAt as createdAt + window.
const stalenessDeadlineMs = (request) => {
  if (request.expiresAt) return new Date(request.expiresAt).getTime();
  if (request.createdAt) return new Date(request.createdAt).getTime() + REQUEST_EXPIRY_MINUTES * 60 * 1000;
  return null;
};

const isStalePending = (request) => {
  if (!request || request.status !== 'pending') return false;
  const deadline = stalenessDeadlineMs(request);
  return !!deadline && deadline <= Date.now();
};

/**
 * Expire one request document if it is pending and past expiresAt.
 * Safe to call with an already-settled request (no-op).
 * @returns the request (refetched if it was flipped)
 */
const expireRequestIfStale = async (request, io) => {
  if (!isStalePending(request)) return request;

  const ioInstance = resolveIO(io);
  const requestId = request._id;
  const customerId = request.customer?.toString?.() || (request.customer?._id?.toString?.() ?? request.customer);

  // Flip to cancelled with distinguishing reason
  request.status = 'cancelled';
  request.cancelledReason = 'expired';
  await request.save();

  // Reject any still-pending offers (same as customer cancel flow)
  const pendingOffers = await Offer.find({ request: requestId, status: 'pending' }).select('provider');
  await Offer.updateMany({ request: requestId, status: 'pending' }, { $set: { status: 'rejected' } });
  const offerProviderIds = [...new Set(pendingOffers.map(o => o.provider.toString()))];

  if (ioInstance) {
    // 1. Live socket events
    ioInstance.to(`user:${customerId}`).emit('request:expired', {
      requestId,
      category: request.category,
      city: request.city,
      reason: 'expired',
      message: 'Your request expired - no providers responded in time'
    });
    offerProviderIds.forEach(providerId => {
      ioInstance.to(`user:${providerId}`).emit('request:expired', {
        requestId,
        category: request.category,
        city: request.city,
        reason: 'expired',
        message: 'A request you offered on expired'
      });
    });

    // 2. Drop stale cards for nearby providers who never offered (same pattern as accept flow's request:closed)
    try {
      const { findNearbyProviders } = require('./geo');
      const [reqLng, reqLat] = request.location.coordinates;
      const nearbyProviders = await findNearbyProviders({
        lng: reqLng, lat: reqLat, category: request.category, city: request.city, maxDistanceKm: 25, limit: 100
      });
      nearbyProviders.forEach(p => {
        const pid = p._id.toString();
        if (!offerProviderIds.includes(pid)) {
          ioInstance.to(`user:${pid}`).emit('request:closed', {
            requestId, category: request.category, status: 'cancelled', reason: 'expired',
            message: 'Request expired'
          });
        }
      });
    } catch (geoErr) {
      console.warn('request:closed fan-out for expired request failed (non-blocking):', geoErr.message);
    }

    // 3. Persisted notifications (bell history, works while offline)
    try {
      await createNotification({
        userId: customerId,
        type: 'request_expired',
        title: 'Request expired',
        body: `Your ${request.category} request${request.city ? ` in ${request.city}` : ''} expired - no providers responded in time. You can post it again.`,
        relatedId: requestId
      });
      for (const providerId of offerProviderIds) {
        await createNotification({
          userId: providerId,
          type: 'request_expired',
          title: 'Request expired',
          body: `A ${request.category} request${request.city ? ` in ${request.city}` : ''} you offered on expired before being accepted.`,
          relatedId: requestId
        });
      }
    } catch (notifyErr) {
      console.error('Notifications for request:expired failed:', notifyErr.message);
    }
  }

  console.log(`⏰ Request ${requestId} EXPIRED (lazy check, pending > ${REQUEST_EXPIRY_MINUTES} min) - ${offerProviderIds.length} pending offers rejected, customer + providers notified`);
  return request;
};

/**
 * Sweep variant for list endpoints (nearby, my): expire ALL stale pending requests
 * matching the given filter, so lists never include expired ones.
 * @param filter mongoose filter to scope the sweep (e.g. { category, city } or { customer })
 */
const expireStalePendingRequests = async (filter = {}, io) => {
  try {
    // 2026-08-21: $or covers BOTH modern docs (expiresAt set) and LEGACY docs with no
    // expiresAt (created before the expiry feature) - judged by createdAt + window.
    const now = new Date();
    const legacyCreatedBefore = new Date(Date.now() - REQUEST_EXPIRY_MINUTES * 60 * 1000);
    const stale = await Request.find({
      ...filter,
      status: 'pending',
      $or: [
        { expiresAt: { $lte: now } },
        { expiresAt: { $exists: false }, createdAt: { $lte: legacyCreatedBefore } },
        { expiresAt: null, createdAt: { $lte: legacyCreatedBefore } }
      ]
    }).limit(25);
    for (const req of stale) {
      await expireRequestIfStale(req, io);
    }
    return stale.length;
  } catch (err) {
    console.error('expireStalePendingRequests sweep failed (non-blocking):', err.message);
    return 0;
  }
};

module.exports = { expireRequestIfStale, expireStalePendingRequests, REQUEST_EXPIRY_MINUTES, isStalePending };
