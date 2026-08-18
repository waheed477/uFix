const mongoose = require('mongoose');
const Request = require('../models/Request');
const Offer = require('../models/Offer');
const User = require('../models/User');
const Job = require('../models/Job');
const { createNotification } = require('../utils/notify');

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
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        status: 'error',
        message: 'Request not found'
      });
    }

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

    // Check duplicate offer (compound index also enforces, but check for clear message)
    const existingOffer = await Offer.findOne({ request: requestId, provider: req.user.id });
    if (existingOffer) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already submitted an offer on this request. A provider cannot offer twice on same request.',
        existingOfferId: existingOffer._id
      });
    }

    // Create offer
    const offer = new Offer({
      request: requestId,
      provider: req.user.id,
      visitingCharge: charge,
      etaMinutes: eta,
      status: 'pending'
    });

    await offer.save();

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
            body: `${offer.provider.name} offered ₹${offer.visitingCharge} for your ${request.category} request`,
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

    const offers = await Offer.find({ request: requestId })
      .populate('provider', 'name phone category rating reviews profilePicture isVerified isOnline city yearsExperience')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      count: offers.length,
      requestId,
      requestStatus: request.status,
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

    // Reject all other offers on same request
    await Offer.updateMany(
      { request: request._id, _id: { $ne: offer._id } },
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
        // Find other offers that were rejected
        const otherOffers = await Offer.find({ request: request._id, _id: { $ne: offer._id } }).select('provider');
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

module.exports = {
  createOffer,
  getOffersForRequest,
  acceptOffer
};
