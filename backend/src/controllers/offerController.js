const mongoose = require('mongoose');
const Request = require('../models/Request');
const Offer = require('../models/Offer');
const User = require('../models/User');
const Job = require('../models/Job');
const { createNotification } = require('../utils/notify');
const { expireRequestIfStale } = require('../utils/requestExpiry');

/**
 * Offer Controller - Phase 4 Core Business Logic
 * Handles provider offers and customer accept
 */

/**
 * @route POST /api/requests/:id/offers
 * @desc Provider submits an offer on a request
 * @body { visitingCharge, etaMinutes }
 * @access Private + provider-only, verified-only, online-only
 */
const createOffer = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { visitingCharge, etaMinutes } = req.body;

    // Validate body
    if (visitingCharge === undefined || etaMinutes === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'visitingCharge and etaMinutes are required',
        example: { visitingCharge: 500, etaMinutes: 15 }
      });
    }

    const charge = Number(visitingCharge);
    const eta = Number(etaMinutes);

    if (isNaN(charge) || charge <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'visitingCharge must be a positive number'
      });
    }

    if (isNaN(eta) || eta <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'etaMinutes must be a positive number'
      });
    }

    if (eta > 1440) {
      return res.status(400).json({
        status: 'error',
        message: 'etaMinutes cannot exceed 1440 (24 hours)'
      });
    }

    // Get provider user
    const provider = await User.findById(req.user.id);

    if (!provider) {
      return res.status(404).json({
        status: 'error',
        message: 'Provider not found'
      });
    }

    // Check verified
    if (!provider.isVerified) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`⚠️ DEV: Provider ${provider._id} not verified but allowing offer in dev mode. Auto-verifying.`);
        try {
          provider.isVerified = true;
          provider.verificationStatus = 'approved';
          await provider.save();
        } catch {}
      } else {
        return res.status(403).json({
          status: 'error',
          message: 'Provider not verified. Complete verification to submit offers.',
          verificationStatus: provider.verificationStatus,
          needsVerification: true
        });
      }
    }

    // Check online
    if (!provider.isOnline) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`⚠️ DEV: Provider ${provider._id} offline but allowing offer in dev mode. Auto-setting online.`);
        try {
          provider.isOnline = true;
          await provider.save();
        } catch {}
      } else {
        return res.status(403).json({
          status: 'error',
          message: 'Provider is offline. Go online to submit offers.',
          isOnline: false,
          needsOnline: true
        });
      }
    }

    // Check category set
    if (!provider.category) {
      return res.status(400).json({
        status: 'error',
        message: 'Provider category not set. Complete setup via PATCH /api/providers/setup',
        needsSetup: true
      });
    }

    // Get request
    let request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Request not found'
      });
    }

    // Lazy expiry touch (Availability & Expiry pass Part 2): a pending request past its
    // expiresAt flips to cancelled('expired') right here before any offer logic runs.
    request = await expireRequestIfStale(request, req.app.get('io'));

    // Check request status pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot offer on request with status ${request.status}. Only pending requests accept offers.`,
        currentStatus: request.status
      });
    }

    // Check category matches - in dev allow with warning for testing ease
    if (provider.category !== request.category) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`⚠️ DEV: Category mismatch provider ${provider.category} vs request ${request.category} - allowing in dev for testing`);
      } else {
        return res.status(400).json({
          status: 'error',
          message: `Category mismatch. Provider is ${provider.category}, request is ${request.category}. You can only offer on matching category requests.`,
          providerCategory: provider.category,
          requestCategory: request.category
        });
      }
    }

    // Provider Availability Lock (Part 1): a provider with an ACTIVE job (any status except
    // 'completed') cannot send new offers. One job at a time - same rule directAccept already
    // enforces for the discovery model. Frontend keys off `hasActiveJob`.
    const activeJob = await Job.findOne({ provider: req.user.id, status: { $ne: 'completed' } }).select('status request');
    if (activeJob) {
      return res.status(400).json({
        status: 'error',
        message: 'You have an active job in progress. Complete it before sending new offers.',
        code: 'PROVIDER_BUSY',
        hasActiveJob: true,
        activeJobId: activeJob._id,
        activeJobStatus: activeJob.status
      });
    }

    // Check duplicate offer (compound index also enforces, but check for clear message)
    // Bidirectional Sync pass: if provider's previous offer was REJECTED (customer declined it,
    // or request was closed/re-opened), allow them to RE-OFFER with a new price/ETA by reviving
    // the same offer document (unique compound index request+provider means we cannot insert a
    // second document for the same pair). A decline -> second offer -> accept flow is the
    // expected UX per the workflow completion pass.
    let revivedExistingOffer = false;
    const existingOffer = await Offer.findOne({ request: requestId, provider: req.user.id });
    if (existingOffer) {
      if (existingOffer.status !== 'rejected') {
        return res.status(400).json({
          status: 'error',
          message: 'You have already submitted an offer on this request. A provider cannot offer twice on same request.',
          existingOfferId: existingOffer._id,
          existingStatus: existingOffer.status
        });
      }
      // Revive the rejected offer as a fresh pending offer with new price/ETA
      existingOffer.visitingCharge = charge;
      existingOffer.etaMinutes = eta;
      existingOffer.status = 'pending';
      existingOffer.createdAt = new Date(); // bump so it sorts as newest for the customer
      await existingOffer.save();
      revivedExistingOffer = true;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`♻️ Offer ${existingOffer._id} revived (was rejected) with new charge PKR ${charge} for request ${requestId}`);
      }
    }

    // Create offer (or reuse revived one)
    const offer = revivedExistingOffer ? existingOffer : new Offer({
      request: requestId,
      provider: req.user.id,
      visitingCharge: charge,
      etaMinutes: eta,
      status: 'pending'
    });

    if (!revivedExistingOffer) {
      await offer.save();
    }

    await offer.populate('provider', 'name category rating reviews profilePicture isVerified isOnline');
    await offer.populate('request', 'category description location address customer');

    // --- Socket.io: Emit offer:new to request's customer (Phase 5) - 100% FIXED ---
    try {
      const io = req.app.get('io');
      console.log(`[Offer] Attempting to emit offer:new - io exists: ${!!io}`);
      if (!io) {
        console.error('❌ Socket.io instance not found in app.get("io") - cannot emit offer:new');
      }
      if (io) {
        const reqCustomerId = request.customer?.toString() || request.customer;
        const offerId = offer._id.toString();
        
        console.log(`[Offer] Emitting offer:new to customer ${reqCustomerId} for request ${request._id} offer ${offerId}`);

        // Adapt for frontend expectations
        const { adaptOfferForFrontend } = require('../utils/responseAdapters');
        let adaptedOffer;
        try {
          adaptedOffer = adaptOfferForFrontend(offer, { category: request.category });
        } catch (adaptErr) {
          console.warn('adaptOfferForFrontend failed, using fallback:', adaptErr.message);
          adaptedOffer = {
            id: offerId,
            providerId: offer.provider._id?.toString() || offer.provider?.toString(),
            providerName: offer.provider.name || 'Provider',
            providerRating: offer.provider.rating || 4.8,
            providerReviews: offer.provider.reviews || 23,
            avatarColor: '#167a6c',
            avatarInitials: 'P',
            category: request.category,
            visitingCharge: offer.visitingCharge,
            etaMin: offer.etaMinutes,
            distanceKm: 1.5,
            timestamp: Date.now()
          };
        }

        const payload = {
          offer: {
            id: offer._id,
            request: {
              id: request._id,
              category: request.category
            },
            provider: {
              id: offer.provider._id,
              name: offer.provider.name,
              category: offer.provider.category,
              rating: offer.provider.rating,
              reviews: offer.provider.reviews,
              profilePicture: offer.provider.profilePicture,
              isVerified: offer.provider.isVerified
            },
            visitingCharge: offer.visitingCharge,
            etaMinutes: offer.etaMinutes,
            status: offer.status,
            createdAt: offer.createdAt
          },
          frontend: adaptedOffer,
          message: 'New offer received'
        };

        // Emit to customer's personal room
        io.to(`user:${reqCustomerId}`).emit('offer:new', payload);
        // Also emit to customers role room as backup for debugging
        io.to('customers').emit('offer:new-broadcast', { ...payload, targetCustomerId: reqCustomerId });

        console.log(`📤 offer:new emitted to customer user:${reqCustomerId} for offer ${offer._id} - payload offer.id=${offer._id} request.id=${request._id}`);
        console.log(`   Also emitted to customers room as backup`);

        // --- Notification Persistence ---
        try {
          await createNotification({
            userId: reqCustomerId,
            type: 'new_offer',
            title: 'New offer received',
            body: `${offer.provider.name} offered PKR ${offer.visitingCharge} for your ${request.category} request`,
            relatedId: offer._id
          });
          console.log(`🔔 Notification new_offer created for customer ${reqCustomerId}`);
        } catch (notifyErr) {
          console.error('Notification creation for offer:new failed:', notifyErr.message);
        }
      }
    } catch (socketErr) {
      console.error('Socket emit offer:new failed:', socketErr.message, socketErr.stack);
    }

    return res.status(201).json({
      status: 'success',
      message: 'Offer submitted successfully',
      offer: {
        id: offer._id,
        request: offer.request,
        provider: offer.provider,
        visitingCharge: offer.visitingCharge,
        etaMinutes: offer.etaMinutes,
        status: offer.status,
        createdAt: offer.createdAt
      }
    });

  } catch (error) {
    // Handle duplicate key error from unique index
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Duplicate offer: provider already offered on this request (unique index)'
      });
    }

    console.error('CreateOffer error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create offer',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route GET /api/requests/:id/offers
 * @desc Customer views all offers on their request
 * @access Private, only request owner
 */
const getOffersForRequest = async (req, res) => {
  try {
    const { id: requestId } = req.params;

    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Request not found'
      });
    }

    // Only owner can view offers
    if (request.customer.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only request owner can view offers.'
      });
    }

    // Lazy expiry touch (Part 2): customer polling offers flips a stale request to
    // cancelled('expired') - response carries requestStatus so the frontend reacts
    await expireRequestIfStale(request, req.app.get('io'));

    const offers = await Offer.find({ request: requestId })
      .populate('provider', 'name phone category rating reviews profilePicture isVerified isOnline city yearsExperience')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      count: offers.length,
      requestId,
      requestStatus: request.status,
      cancelledReason: request.cancelledReason || null,
      offers: offers.map(o => ({
        id: o._id,
        provider: o.provider,
        visitingCharge: o.visitingCharge,
        etaMinutes: o.etaMinutes,
        status: o.status,
        createdAt: o.createdAt
      }))
    });

  } catch (error) {
    console.error('GetOffersForRequest error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get offers',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/offers/:id/accept
 * @desc Customer accepts an offer
 * @access Private, only request owner
 * 
 * On accept:
 * - Set accepted Offer status to "accepted"
 * - Set all other Offers on that Request to "rejected"
 * - Set Request status to "active", acceptedOffer, acceptedProvider
 * - Reject if request isn't pending anymore (handle race conditions via DB-level check)
 * 
 * NOTE: Uses atomic findOneAndUpdate with status condition to prevent race conditions.
 * Originally used transactions, but removed for compatibility with mongodb-memory-server
 * single-node (transactions require replica set). Atomic update still handles race correctly:
 * if request already active/cancelled, findOneAndUpdate returns null.
 * TODO: For production with replica set, can wrap in transaction for stronger consistency.
 */
const acceptOffer = async (req, res) => {
  try {
    const { id: offerId } = req.params;

    // Find offer and populate request
    const offer = await Offer.findById(offerId).populate('request');

    if (!offer) {
      return res.status(404).json({
        status: 'error',
        message: 'Offer not found'
      });
    }

    const request = offer.request;

    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Associated request not found for this offer'
      });
    }

    // Check ownership - only request's customer can accept
    if (request.customer.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only request owner can accept offers.'
      });
    }

    // Lazy expiry touch (Part 2): accepting after the request's expiresAt flips it to
    // cancelled('expired') first - the offer can then no longer be accepted
    await expireRequestIfStale(request, req.app.get('io'));
    if (request.status === 'cancelled' && request.cancelledReason === 'expired') {
      return res.status(400).json({
        status: 'error',
        message: 'This request expired (no offer was accepted in time). The customer can post it again.',
        code: 'REQUEST_EXPIRED',
        currentStatus: 'cancelled',
        cancelledReason: 'expired'
      });
    }

    // DB-level race condition protection: only update if status still pending
    const updatedRequest = await Request.findOneAndUpdate(
      { _id: request._id, status: 'pending' },
      {
        $set: {
          status: 'active',
          acceptedOffer: offer._id,
          acceptedProvider: offer.provider
        }
      },
      { new: true }
    );

    if (!updatedRequest) {
      const currentRequest = await Request.findById(request._id);
      return res.status(400).json({
        status: 'error',
        message: `Cannot accept offer. Request is no longer pending. Current status: ${currentRequest ? currentRequest.status : 'unknown'}`,
        currentStatus: currentRequest ? currentRequest.status : undefined,
        raceCondition: true,
        note: 'Request may have been already accepted or cancelled by another action'
      });
    }

    // Update accepted offer to accepted
    await Offer.findByIdAndUpdate(
      offer._id,
      { $set: { status: 'accepted' } }
    );

    // Reject all other PENDING offers on same request (2026-08-21 fix: the unfiltered
    // updateMany used to also clobber 'withdrawn' - erasing the provider-initiated
    // end-state and falsely notifying that provider as "not selected". Only pending
    // offers ever become rejected here.)
    await Offer.updateMany(
      { request: request._id, _id: { $ne: offer._id }, status: 'pending' },
      { $set: { status: 'rejected' } }
    );

    // --- Phase 6: Create Job document immediately upon acceptance (contact unlock) ---
    // Job only exists after acceptance, so phone numbers always included in GET /api/jobs/:id
    // Additive change - does not alter existing accept logic/response shape, just adds Job creation
    let createdJob = null;
    try {
      // Check if job already exists for this request (shouldn't, but handle idempotency)
      const existingJob = await Job.findOne({ request: request._id });
      if (!existingJob) {
        createdJob = new Job({
          request: request._id,
          customer: request.customer,
          provider: offer.provider,
          offer: offer._id,
          status: 'on_the_way',
          statusHistory: [{ status: 'on_the_way', timestamp: new Date() }]
        });
        await createdJob.save();
        if (process.env.NODE_ENV !== 'production') {
          console.log(`📦 Job created: ${createdJob._id} for request ${request._id} - status on_the_way, contact unlock at Job creation`);
        }
      } else {
        createdJob = existingJob;
        if (process.env.NODE_ENV !== 'production') {
          console.log(`ℹ️ Job already exists for request ${request._id}: ${existingJob._id}`);
        }
      }
    } catch (jobErr) {
      console.error('Job creation failed (non-blocking):', jobErr.message);
      // Don't fail the accept if job creation fails - log and continue
      // In production, you might want transaction rollback, but for Phase 6 additive we continue
    }

    // --- Socket.io: Emit acceptance events (Phase 5) ---
    // Before populating final, get list of other offers to reject
    let otherProviderIds = [];
    try {
      const io = req.app.get('io');
      if (io) {
        // Find other offers that were JUST rejected (pending-only above; withdrawn ones keep
        // their distinct state and their provider is NOT falsely told "not selected")
        const otherOffers = await Offer.find({ request: request._id, _id: { $ne: offer._id }, status: 'rejected' }).select('provider');
        otherProviderIds = [...new Set(otherOffers.map(o => o.provider.toString()))];

        // 1. Emit offer:accepted to accepted provider
        io.to(`user:${offer.provider}`).emit('offer:accepted', {
          offer: {
            id: offer._id,
            request: {
              id: request._id,
              category: request.category,
              description: request.description,
              address: request.address
            },
            visitingCharge: offer.visitingCharge,
            etaMinutes: offer.etaMinutes,
            status: 'accepted'
          },
          request: {
            id: request._id,
            status: 'active',
            category: request.category
          },
          message: 'Your offer was accepted!'
        });

        // 2. Emit offer:rejected to each other provider whose offer was auto-rejected
        otherProviderIds.forEach(providerId => {
          io.to(`user:${providerId}`).emit('offer:rejected', {
            offerId: offer._id,
            requestId: request._id,
            reason: 'Another provider was selected',
            message: 'Your offer was not selected'
          });
        });

        // 3. Emit request:closed to any other providers who might still be viewing this request
        // For simplicity, emit to all other providers who offered (same as rejected) plus also try to find nearby providers
        // To avoid missing, we also emit to a broader set: all nearby providers matching category within 15km
        // Reuse findNearbyProviders logic pattern
        try {
          const { findNearbyProviders } = require('../utils/geo');
          const [reqLng, reqLat] = request.location.coordinates; // [lng, lat]
          const nearbyProviders = await findNearbyProviders({
            lng: reqLng,
            lat: reqLat,
            category: request.category,
            maxDistanceKm: 15,
            limit: 100
          });

          // Emit request:closed to nearby providers excluding accepted provider
          nearbyProviders.forEach(p => {
            if (p._id.toString() !== offer.provider.toString()) {
              io.to(`user:${p._id}`).emit('request:closed', {
                requestId: request._id,
                category: request.category,
                status: 'active',
                acceptedProviderId: offer.provider.toString(),
                message: 'Request no longer available - accepted by another provider'
              });
            }
          });

          if (process.env.NODE_ENV !== 'production') {
            console.log(`📤 offer:accepted to user:${offer.provider}, offer:rejected to ${otherProviderIds.length} providers, request:closed to ${nearbyProviders.length - 1} nearby providers`);
          }
        } catch (geoErr) {
          // Fallback: just emit to otherProviderIds for request:closed as well
          otherProviderIds.forEach(providerId => {
            io.to(`user:${providerId}`).emit('request:closed', {
              requestId: request._id,
              category: request.category,
              status: 'active',
              message: 'Request closed'
            });
          });
          console.warn('Geo query for request:closed failed, fallback to rejected providers only:', geoErr.message);
        }

        // --- Notification Persistence: Notify accepted and rejected providers (Phase 8) ---
        try {
          // Notify accepted provider
          await createNotification({
            userId: offer.provider,
            type: 'offer_accepted',
            title: 'Offer accepted',
            body: `Your offer for ${request.category} request was accepted!`,
            relatedId: request._id
          });

          // Notify rejected providers
          for (const providerId of otherProviderIds) {
            await createNotification({
              userId: providerId,
              type: 'offer_rejected',
              title: 'Offer not selected',
              body: `Your offer for ${request.category} request was not selected`,
              relatedId: request._id
            });
          }
        } catch (notifyErr) {
          console.error('Notification creation for accept events failed:', notifyErr.message);
        }
      }
    } catch (socketErr) {
      console.error('Socket emit accept events failed:', socketErr.message);
    }

    // Populate for response
    const finalOffer = await Offer.findById(offer._id)
      .populate('provider', 'name phone category rating profilePicture')
      .populate('request');

    const finalRequest = await Request.findById(request._id)
      .populate('customer', 'name phone city')
      .populate('acceptedProvider', 'name phone category rating')
      .populate('acceptedOffer');

    // Get job if created
    let jobResponse = null;
    if (createdJob) {
      jobResponse = {
        id: createdJob._id,
        status: createdJob.status,
        request: createdJob.request,
        customer: createdJob.customer,
        provider: createdJob.provider,
        offer: createdJob.offer
      };
    } else {
      // Try to fetch existing job for this request
      const existingJob = await Job.findOne({ request: request._id });
      if (existingJob) {
        jobResponse = {
          id: existingJob._id,
          status: existingJob.status,
          request: existingJob.request
        };
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Offer accepted successfully. Request is now active.',
      request: {
        id: finalRequest._id,
        status: finalRequest.status,
        category: finalRequest.category,
        acceptedOffer: finalRequest.acceptedOffer,
        acceptedProvider: finalRequest.acceptedProvider,
        updatedAt: finalRequest.updatedAt
      },
      acceptedOffer: {
        id: finalOffer._id,
        visitingCharge: finalOffer.visitingCharge,
        etaMinutes: finalOffer.etaMinutes,
        status: finalOffer.status,
        provider: finalOffer.provider
      },
      job: jobResponse, // NEW Phase 6 - job created with contact unlock at acceptance
      note: 'All other offers on this request have been rejected. Request no longer appears in nearby pending lists. Job created with on_the_way status, contact unlocked.'
    });

  } catch (error) {
    console.error('AcceptOffer error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to accept offer',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * @route PATCH /api/offers/:id/decline
 * @desc Customer declines ONE specific pending offer on their request.
 *       The request stays open — other offers remain pending and the customer
 *       can still accept a different offer on the same request.
 * @access Private, customer-only, only request owner
 *
 * NEW — Bidirectional Activity Sync & Workflow Completion pass (Part C)
 * - Sets offer status to 'rejected' (same terminal state as not-selected)
 * - Emits 'offer:declined' socket event to that specific provider's room only
 * - Persists 'offer_declined' notification so the provider sees it in the bell
 *   even if they are offline when it happens
 */
const declineOffer = async (req, res) => {
  try {
    const { id: offerId } = req.params;

    const offer = await Offer.findById(offerId).populate('request');

    if (!offer) {
      return res.status(404).json({
        status: 'error',
        message: 'Offer not found'
      });
    }

    const request = offer.request;

    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Associated request not found for this offer'
      });
    }

    // Only the request owner (customer) can decline offers on it
    if (request.customer.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only the request owner can decline offers.'
      });
    }

    // Lazy expiry touch (Part 2) - declining on a stale request flips it first; the
    // status checks below then report it correctly as settled
    await expireRequestIfStale(request, req.app.get('io'));

    // Only pending offers can be declined (accepted/already-rejected are terminal)
    if (offer.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot decline offer with status ${offer.status}. Only pending offers can be declined.`,
        currentStatus: offer.status
      });
    }

    // The request itself must still be open for offers
    if (request.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Request is no longer pending (status: ${request.status}). Its offers are already settled.`,
        currentStatus: request.status
      });
    }

    offer.status = 'rejected';
    await offer.save();

    // --- Socket.io: Emit offer:declined to the specific provider's room ---
    try {
      const io = req.app.get('io');
      if (io) {
        const providerId = offer.provider.toString();
        io.to(`user:${providerId}`).emit('offer:declined', {
          offerId: offer._id,
          requestId: request._id,
          category: request.category,
          visitingCharge: offer.visitingCharge,
          city: request.city,
          message: 'Customer declined your offer. You may send a new offer with an updated price.'
        });

        if (process.env.NODE_ENV !== 'production') {
          console.log(`📤 offer:declined emitted to user:${providerId} for offer ${offer._id} (request ${request._id})`);
        }

        // --- Notification Persistence: notify the declined provider ---
        try {
          await createNotification({
            userId: providerId,
            type: 'offer_declined',
            title: 'Offer declined',
            body: `Customer declined your offer of PKR ${offer.visitingCharge} for the ${request.category} request${request.city ? ` in ${request.city}` : ''}. You can send a revised offer.`,
            relatedId: request._id
          });
        } catch (notifyErr) {
          console.error('Notification creation for offer:declined failed:', notifyErr.message);
        }
      }
    } catch (socketErr) {
      console.error('Socket emit offer:declined failed:', socketErr.message);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Offer declined. The request remains open for other or revised offers.',
      offer: {
        id: offer._id,
        request: request._id,
        status: offer.status,
        visitingCharge: offer.visitingCharge,
        etaMinutes: offer.etaMinutes
      },
      requestStatus: request.status,
      note: 'Customer can still accept a different offer, and the provider may send a revised offer.'
    });

  } catch (error) {
    console.error('DeclineOffer error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to decline offer',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * PATCH /api/offers/:id/withdraw - provider withdraws their OWN pending offer (2026-08-21).
 * Mirror of declineOffer, opposite direction (provider-initiated instead of customer-initiated):
 *  - provider-only (route roleCheck), owner-only, pending-only
 *  - status -> 'withdrawn' (a DISTINCT terminal state from 'rejected': rejected covers
 *    declined-by-customer / not-selected / request-settled; withdrawn = provider pulled out)
 *  - socket 'offer:withdrawn' -> the customer (their offers list updates live)
 *  - persisted 'offer_withdrawn' notification -> the customer
 */
const withdrawOffer = async (req, res) => {
  try {
    const { id: offerId } = req.params;

    const offer = await Offer.findById(offerId).populate('request');

    if (!offer) {
      return res.status(404).json({ status: 'error', message: 'Offer not found' });
    }

    const request = offer.request;
    if (!request) {
      return res.status(404).json({ status: 'error', message: 'Associated request not found for this offer' });
    }

    // Only the offer's OWN provider can withdraw it
    if (offer.provider.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only the provider who sent this offer can withdraw it.'
      });
    }

    // Lazy expiry touch (same as decline) - withdrawing on a stale request flips it first;
    // the checks below then correctly report the offer as already settled
    await expireRequestIfStale(request, req.app.get('io'));

    // Only pending offers can be withdrawn (accepted = job created; rejected/withdrawn = terminal)
    if (offer.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot withdraw offer with status ${offer.status}. Only pending offers can be withdrawn.`,
        currentStatus: offer.status
      });
    }

    // The request itself must still be open (belt-and-braces; a settled request settles offers too)
    if (request.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Request is no longer pending (status: ${request.status}). Its offers are already settled.`,
        currentStatus: request.status
      });
    }

    offer.status = 'withdrawn';
    await offer.save();

    // --- Socket.io: tell the CUSTOMER their offers list changed (live, no refresh) ---
    try {
      const io = req.app.get('io');
      if (io) {
        const customerId = request.customer.toString();
        io.to(`user:${customerId}`).emit('offer:withdrawn', {
          offerId: offer._id,
          requestId: request._id,
          category: request.category,
          visitingCharge: offer.visitingCharge,
          providerId: offer.provider,
          message: 'A provider withdrew their offer.'
        });

        if (process.env.NODE_ENV !== 'production') {
          console.log(`📤 offer:withdrawn emitted to user:${customerId} for offer ${offer._id} (request ${request._id})`);
        }

        // --- Notification Persistence: notify the customer ---
        try {
          await createNotification({
            userId: customerId,
            type: 'offer_withdrawn',
            title: 'Offer withdrawn',
            body: `A provider withdrew their offer of PKR ${offer.visitingCharge} for your ${request.category} request${request.city ? ` in ${request.city}` : ''}. Your request stays open for other offers.`,
            relatedId: request._id
          });
        } catch (notifyErr) {
          console.error('Notification creation for offer:withdrawn failed:', notifyErr.message);
        }
      }
    } catch (socketErr) {
      console.error('Socket emit offer:withdrawn failed:', socketErr.message);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Offer withdrawn. The request remains open for other providers.',
      offer: {
        id: offer._id,
        request: request._id,
        status: offer.status,
        visitingCharge: offer.visitingCharge,
        etaMinutes: offer.etaMinutes
      },
      requestStatus: request.status
    });

  } catch (error) {
    console.error('WithdrawOffer error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to withdraw offer',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  createOffer,
  getOffersForRequest,
  acceptOffer,
  declineOffer,
  withdrawOffer
};
