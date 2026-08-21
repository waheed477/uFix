const Request = require('../models/Request');
const Offer = require('../models/Offer');
const User = require('../models/User');
const Job = require('../models/Job');
const { findNearbyRequests, findNearbyProviders } = require('../utils/geo');
const { createNotification } = require('../utils/notify');
const { expireRequestIfStale, expireStalePendingRequests, REQUEST_EXPIRY_MINUTES } = require('../utils/requestExpiry');
const { computeMatchingProviders } = require('../utils/viewCount');

const VALID_CATEGORIES = ['plumber', 'electrician', 'mechanic'];

const createRequest = async (req, res) => {
  try {
    const { category, description, lng, lat, address, city } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ status: 'error', message: `Category is required and must be one of: ${VALID_CATEGORIES.join(', ')}`, validCategories: VALID_CATEGORIES });
    }
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({ status: 'error', message: 'Description is required and must be at least 10 characters' });
    }
    if (description.trim().length > 1000) {
      return res.status(400).json({ status: 'error', message: 'Description cannot exceed 1000 characters' });
    }
    if (lng === undefined || lat === undefined) {
      return res.status(400).json({ status: 'error', message: 'lng and lat are required', note: 'Coordinate order [lng,lat]' });
    }

    const parsedLng = Number(lng);
    const parsedLat = Number(lat);
    if (isNaN(parsedLng) || isNaN(parsedLat)) return res.status(400).json({ status: 'error', message: 'lng and lat must be valid numbers' });
    if (parsedLng < -180 || parsedLng > 180) return res.status(400).json({ status: 'error', message: 'lng must be between -180 and 180' });
    if (parsedLat < -90 || parsedLat > 90) return res.status(400).json({ status: 'error', message: 'lat must be between -90 and 90' });

    const existingOpen = await Request.findOne({ customer: req.user.id, status: { $in: ['pending', 'active'] } });
    if (existingOpen) {
      return res.status(400).json({ status: 'error', message: 'You already have an open request', existingRequestId: existingOpen._id, existingStatus: existingOpen.status });
    }

    let requestCity = city ? city.trim() : undefined;
    if (!requestCity) {
      try {
        const customerUser = await User.findById(req.user.id).select('city');
        if (customerUser && customerUser.city) requestCity = customerUser.city;
      } catch {}
    }

    const request = new Request({
      customer: req.user.id,
      category,
      description: description.trim(),
      location: { type: 'Point', coordinates: [parsedLng, parsedLat] },
      address: address ? address.trim() : undefined,
      city: requestCity,
      status: 'pending'
    });
    // expiresAt defaults to createdAt + REQUEST_EXPIRY_MINUTES (Request model).
    // DEV-ONLY test hook: a caller may pass expiresInMinutes (number <= 60) to force a
    // short expiry for testing the lazy-expiry flow. Ignored entirely in production
    // and NOT a UI feature.
    if (process.env.NODE_ENV !== 'production' && req.body.expiresInMinutes !== undefined) {
      const mins = Number(req.body.expiresInMinutes);
      if (!isNaN(mins) && mins > 0 && mins <= 60) {
        request.expiresAt = new Date(Date.now() + mins * 60 * 1000);
        console.log(`🧪 DEV: request expiry overridden to ${mins} min(s) for testing`);
      }
    }

    await request.save();
    await request.populate('customer', 'name phone city profilePicture');

    // "X providers viewing" seed for the customer (2026-08-21, Issue 2): set once the
    // fan-out list is computed below; returned in the 201 response + emitted live.
    let viewingCount = 0;

    try {
      const io = req.app.get('io');
      if (io) {
        // Shared provider matcher (2026-08-21, Issue 2): the exact same logic that
        // decides who can SEE this request. Extracted to utils/viewCount so the
        // request:new fan-out and the customer's live "X providers viewing" count can
        // never disagree (primary 25km + dev-only 100km fallback within the helper).
        let nearbyProviders = await computeMatchingProviders({ lng: parsedLng, lat: parsedLat, category, city: requestCity });
        console.log(`📡 createRequest: category=${category} city=${requestCity||'any'} -> ${nearbyProviders.length} eligible providers (online+verified+radius, busy excluded)`);
        viewingCount = nearbyProviders.length;
        nearbyProviders.forEach(provider => {
          io.to(`user:${provider._id}`).emit('request:new', {
            request: {
              id: request._id,
              category: request.category,
              description: request.description,
              location: request.location,
              address: request.address,
              city: request.city,
              status: request.status,
              customer: { id: request.customer._id, name: request.customer.name, city: request.customer.city, rating: request.customer.rating || 0 },
              distanceKm: provider.distanceKm || 0,
              createdAt: request.createdAt
            },
            message: 'New nearby request'
          });
        });
        if (process.env.NODE_ENV !== 'production') console.log(`📤 request:new emitted to ${nearbyProviders.length} nearby ${category} providers for request ${request._id} (city=${requestCity})`);
        // 2026-08-21 notification-semantics correction (Issue 2): NO persisted
        // 'request_new' bell entry for nearby providers - merely SEEING a request in
        // their list is not a notification. The live socket event + client sound/vibration
        // cue is sufficient; the bell stays reserved for actions tied to the provider
        // personally (offer accepted/declined/rejected, or request cancelled/expired
        // after they offered). Legacy request_new entries stay renderable client-side.
        // Customer side: live "X providers viewing your request" indicator.
        io.to(`user:${request.customer._id}`).emit('request:viewCount', {
          requestId: request._id,
          count: viewingCount,
          category
        });
      }
    } catch (socketErr) { console.error('Socket emit request:new failed:', socketErr.message); }

    return res.status(201).json({
      status: 'success',
      message: 'Request created successfully',
      request: { id: request._id, customer: request.customer, category: request.category, description: request.description, location: request.location, readable: { lng: request.location.coordinates[0], lat: request.location.coordinates[1] }, address: request.address, city: request.city, status: request.status, cancelledReason: request.cancelledReason, expiresAt: request.expiresAt, createdAt: request.createdAt, viewingProviders: { count: viewingCount, category } }
    });
  } catch (error) {
    console.error('CreateRequest error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to create request', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const getNearbyRequests = async (req, res) => {
  try {
    const provider = await User.findById(req.user.id);
    if (!provider) return res.status(404).json({ status: 'error', message: 'Provider not found' });
    if (provider.role !== 'provider') return res.status(403).json({ status: 'error', message: 'Only providers can view nearby requests' });

    if (!provider.isVerified) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`⚠️ DEV: Provider ${provider._id} not verified but allowing nearby in dev mode`);
        try { provider.isVerified = true; provider.verificationStatus = 'approved'; await provider.save(); } catch (e) { console.warn(e.message); }
      } else {
        return res.status(403).json({ status: 'error', message: 'Provider not verified', verificationStatus: provider.verificationStatus, needsVerification: true });
      }
    }

    if (!provider.location || !provider.location.coordinates || (provider.location.coordinates[0] === 0 && provider.location.coordinates[1] === 0)) {
      return res.status(400).json({ status: 'error', message: 'Provider location not set', needsLocation: true });
    }
    if (!provider.category) return res.status(400).json({ status: 'error', message: 'Provider category not set', needsSetup: true });

    // Provider Availability Lock (Part 1): a BUSY provider (active job, status != completed)
    // gets NO nearby requests - cleaner than returning cards they can't act on and disabling
    // them client-side. Server is the source of truth (mirrors the createOffer enforcement);
    // the frontend shows a calm "you have an active job" banner driven by hasActiveJob.
    // The provider intentionally stays ONLINE (live tracking for the active job is unaffected).
    const activeJob = await Job.findOne({ provider: provider._id, status: { $ne: 'completed' } }).select('status');
    if (activeJob) {
      return res.status(200).json({
        status: 'success',
        message: 'You have an active job - new requests hidden until it is completed',
        hasActiveJob: true,
        activeJobStatus: activeJob.status,
        count: 0,
        requests: []
      });
    }

    // Lazy expiry sweep (Part 2): flip THIS provider's relevant stale pending requests to
    // cancelled('expired') before listing, so expired requests never reach request cards
    await expireStalePendingRequests({ category: provider.category, city: provider.city }, req.app.get('io'));

    let maxDistanceKm = provider.radiusKm || 10;
    if (req.query.radiusKm) {
      const parsed = parseFloat(req.query.radiusKm);
      if (!isNaN(parsed) && parsed > 0) maxDistanceKm = parsed;
    }
    const category = provider.category;
    const [lng, lat] = provider.location.coordinates;

    console.log(`📡 getNearbyRequests: Provider ${provider._id} (${provider.name}) loc=[${lng},${lat}] city=${provider.city||'any'} category=${category} radius=${maxDistanceKm}km online=${provider.isOnline} verified=${provider.isVerified}`);

    const requests = await findNearbyRequests({ lng, lat, category, city: provider.city, maxDistanceKm, limit: 50 });

    console.log(`   -> Found ${requests.length} nearby requests for provider ${provider._id} (city=${provider.city||'any'})`);

    return res.status(200).json({
      status: 'success',
      message: 'Nearby pending requests found',
      hasActiveJob: false,
      providerLocation: { lng, lat, category, radiusKm: maxDistanceKm },
      count: requests.length,
      requests: requests.map(r => ({
        id: r._id,
        category: r.category,
        description: r.description,
        location: r.location,
        address: r.address,
        city: r.city,
        status: r.status,
        customer: r.customer ? { id: r.customer._id, name: r.customer.name, city: r.customer.city, rating: r.customer.rating } : undefined,
        distanceKm: r.distanceKm,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('GetNearbyRequests error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get nearby requests', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const getMyRequests = async (req, res) => {
  try {
    // Lazy expiry sweep (Part 2): this customer's own stale pending requests flip to
    // cancelled('expired') so their Jobs tab / offers screens never act on them
    await expireStalePendingRequests({ customer: req.user.id }, req.app.get('io'));

    const requests = await Request.find({ customer: req.user.id }).populate('acceptedOffer').populate('acceptedProvider', 'name phone category rating profilePicture').sort({ createdAt: -1 });
    return res.status(200).json({ status: 'success', count: requests.length, requests: requests.map(r => ({ id: r._id, category: r.category, description: r.description, location: r.location, address: r.address, city: r.city, status: r.status, cancelledReason: r.cancelledReason, acceptedOffer: r.acceptedOffer, acceptedProvider: r.acceptedProvider, createdAt: r.createdAt, updatedAt: r.updatedAt, expiresAt: r.expiresAt })) });
  } catch (error) {
    console.error('GetMyRequests error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get my requests', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const getRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    let request = await Request.findById(id).populate('customer', 'name phone city profilePicture rating reviews').populate('acceptedOffer').populate('acceptedProvider', 'name phone category rating profilePicture');
    if (!request) return res.status(404).json({ status: 'error', message: 'Request not found' });

    // Lazy expiry touch (Part 2)
    request = await expireRequestIfStale(request, req.app.get('io'));
    // Re-populate customer fields if the doc was flipped (save() keeps refs, this is a safety no-op)
    if (request.cancelledReason === 'expired') {
      await request.populate('customer', 'name phone city profilePicture rating reviews');
    }
    const isOwner = request.customer._id.toString() === req.user.id.toString();
    let hasOffered = false;
    if (!isOwner) {
      const existingOffer = await Offer.findOne({ request: id, provider: req.user.id });
      hasOffered = !!existingOffer;
    }
    if (!isOwner && !hasOffered) return res.status(403).json({ status: 'error', message: 'Access denied. Only request owner or providers who offered can view this request.' });
    const offers = await Offer.find({ request: id }).populate('provider', 'name phone category rating reviews profilePicture isVerified isOnline').sort({ createdAt: -1 });
    return res.status(200).json({
      status: 'success',
      request: {
        id: request._id,
        customer: request.customer,
        category: request.category,
        description: request.description,
        location: request.location,
        readable: { lng: request.location.coordinates[0], lat: request.location.coordinates[1] },
        address: request.address,
        city: request.city,
        status: request.status,
        cancelledReason: request.cancelledReason,
        expiresAt: request.expiresAt,
        acceptedOffer: request.acceptedOffer,
        acceptedProvider: request.acceptedProvider,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        offers: offers.map(o => ({ id: o._id, provider: o.provider, visitingCharge: o.visitingCharge, etaMinutes: o.etaMinutes, status: o.status, createdAt: o.createdAt }))
      }
    });
  } catch (error) {
    console.error('GetRequestById error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get request', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

const cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await Request.findOne({ _id: id, customer: req.user.id });
    if (!request) return res.status(404).json({ status: 'error', message: 'Request not found or not owned by you' });
    if (request.status !== 'pending') return res.status(400).json({ status: 'error', message: `Cannot cancel request with status ${request.status}. Only pending requests can be cancelled.`, currentStatus: request.status });
    request.status = 'cancelled';
    request.cancelledReason = 'customer'; // Part 2: distinguish user-initiated cancel from auto-expiry
    await request.save();
    await Offer.updateMany({ request: id, status: 'pending' }, { $set: { status: 'rejected' } });
    try {
      const io = req.app.get('io');
      if (io) {
        const offers = await Offer.find({ request: id }).select('provider');
        const providerIds = [...new Set(offers.map(o => o.provider.toString()))];
        providerIds.forEach(providerId => {
          io.to(`user:${providerId}`).emit('request:cancelled', { requestId: request._id, category: request.category, status: 'cancelled', message: 'Request cancelled by customer' });
        });
        if (process.env.NODE_ENV !== 'production') console.log(`📤 request:cancelled emitted to ${providerIds.length} providers for request ${request._id}`);
        try {
          for (const providerId of providerIds) {
            await createNotification({ userId: providerId, type: 'request_cancelled', title: 'Request cancelled', body: `A ${request.category} request you offered on was cancelled by customer`, relatedId: request._id });
          }
        } catch (notifyErr) { console.error('Notification creation for request:cancelled failed:', notifyErr.message); }
      }
    } catch (socketErr) { console.error('Socket emit request:cancelled failed:', socketErr.message); }
    return res.status(200).json({ status: 'success', message: 'Request cancelled successfully', request: { id: request._id, status: request.status, category: request.category, updatedAt: request.updatedAt } });
  } catch (error) {
    console.error('CancelRequest error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to cancel request', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

// NEW: Direct Accept - Customer directly books a provider with price from profile (provider discovery model)
const directAccept = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { providerId } = req.body;

    if (!providerId) return res.status(400).json({ status: 'error', message: 'providerId is required' });

    let request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ status: 'error', message: 'Request not found' });

    // Lazy expiry touch (Part 2): booking on a stale request is impossible after this line
    request = await expireRequestIfStale(request, req.app.get('io'));
    if (request.status === 'cancelled' && request.cancelledReason === 'expired') {
      return res.status(400).json({ status: 'error', message: 'This request expired (no offer was accepted in time). Please post it again.', code: 'REQUEST_EXPIRED', cancelledReason: 'expired' });
    }

    if (request.customer.toString() !== req.user.id.toString()) return res.status(403).json({ status: 'error', message: 'Only request owner can directly accept providers' });
    if (request.status !== 'pending') return res.status(400).json({ status: 'error', message: `Request is no longer pending. Current status: ${request.status}`, currentStatus: request.status });

    const provider = await User.findById(providerId);
    if (!provider) return res.status(404).json({ status: 'error', message: 'Provider not found' });
    if (provider.role !== 'provider') return res.status(400).json({ status: 'error', message: 'User is not a provider' });

    // Check provider availability
    if (!provider.isOnline) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`DEV: Provider ${providerId} offline but allowing direct accept in dev`);
        provider.isOnline = true;
        await provider.save();
      } else {
        return res.status(400).json({ status: 'error', message: 'Provider is offline. Please choose another provider who is online.' });
      }
    }

    if (!provider.isVerified && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ status: 'error', message: 'Provider not verified' });
    }

    // Category must match
    if (provider.category !== request.category) {
      return res.status(400).json({ status: 'error', message: `Category mismatch. Request is ${request.category}, provider is ${provider.category}. Only ${request.category} providers can be booked.`, providerCategory: provider.category, requestCategory: request.category });
    }

    // City must match (city-based filtering as per user requirement)
    if (request.city && provider.city && request.city.toLowerCase() !== provider.city.toLowerCase()) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ status: 'error', message: `City mismatch. Request in ${request.city}, provider in ${provider.city}. Only same city providers can be booked.` });
      } else {
        console.warn(`DEV: City mismatch request ${request.city} vs provider ${provider.city} - allowing in dev`);
      }
    }

    // Check if provider already has active job (one active job at a time)
    const activeJob = await Job.findOne({ provider: providerId, status: { $ne: 'completed' } });
    if (activeJob) {
      return res.status(400).json({ status: 'error', message: 'Provider is busy with another job. Please choose another provider.', activeJobId: activeJob._id });
    }

    // Check duplicate offer
    const existingOffer = await Offer.findOne({ request: requestId, provider: providerId });
    let offer;
    if (existingOffer) {
      offer = existingOffer;
    } else {
      // Create offer automatically with provider's default price
      const visitingCharge = provider.defaultVisitingCharge || 500;
      // Calculate ETA based on distance if possible, else default 15
      let etaMinutes = 15;
      try {
        if (provider.location && provider.location.coordinates && request.location && request.location.coordinates) {
          const [provLng, provLat] = provider.location.coordinates;
          const [reqLng, reqLat] = request.location.coordinates;
          const { calculateDistanceKm } = require('../utils/geo');
          const dist = calculateDistanceKm(provLat, provLng, reqLat, reqLng);
          etaMinutes = Math.max(5, Math.min(60, Math.round(dist / 30 * 60) + 5)); // 30 km/h avg
        }
      } catch {}
      offer = new Offer({ request: requestId, provider: providerId, visitingCharge, etaMinutes, status: 'pending' });
      await offer.save();
      await offer.populate('provider', 'name category rating reviews');
    }

    // Now accept the offer (same logic as acceptOffer)
    const updatedRequest = await Request.findOneAndUpdate({ _id: requestId, status: 'pending' }, { $set: { status: 'active', acceptedOffer: offer._id, acceptedProvider: providerId } }, { new: true });
    if (!updatedRequest) {
      const currentRequest = await Request.findById(requestId);
      return res.status(400).json({ status: 'error', message: `Request no longer pending. Current status: ${currentRequest ? currentRequest.status : 'unknown'}`, currentStatus: currentRequest ? currentRequest.status : undefined });
    }

    await Offer.findByIdAndUpdate(offer._id, { $set: { status: 'accepted' } });
    await Offer.updateMany({ request: requestId, _id: { $ne: offer._id } }, { $set: { status: 'rejected' } });

    let createdJob = null;
    try {
      const existingJob = await Job.findOne({ request: requestId });
      if (!existingJob) {
        createdJob = new Job({ request: requestId, customer: request.customer, provider: providerId, offer: offer._id, status: 'on_the_way', statusHistory: [{ status: 'on_the_way', timestamp: new Date() }] });
        await createdJob.save();
        console.log(`📦 Job created via direct-accept: ${createdJob._id} for request ${requestId}`);
      } else {
        createdJob = existingJob;
      }
    } catch (jobErr) { console.error('Job creation failed:', jobErr.message); }

    // Socket emits
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${providerId}`).emit('offer:accepted', {
          offer: { id: offer._id, request: { id: request._id, category: request.category }, visitingCharge: offer.visitingCharge, etaMinutes: offer.etaMinutes, status: 'accepted' },
          request: { id: request._id, status: 'active', category: request.category },
          message: 'Customer booked you directly! Customer details unlocked.'
        });

        // Close request for other providers
        const { findNearbyProviders } = require('../utils/geo');
        try {
          const [reqLng, reqLat] = request.location.coordinates;
          const nearbyProviders = await findNearbyProviders({ lng: reqLng, lat: reqLat, category: request.category, city: request.city, maxDistanceKm: 25, limit: 100 });
          nearbyProviders.forEach(p => {
            if (p._id.toString() !== providerId.toString()) {
              io.to(`user:${p._id}`).emit('request:closed', { requestId: request._id, category: request.category, status: 'active', acceptedProviderId: providerId, message: 'Request booked by another provider' });
            }
          });
        } catch {}

        try {
          await createNotification({ userId: providerId, type: 'offer_accepted', title: 'You have been booked!', body: `Customer booked you for ${request.category} in ${request.city||'your area'} - Rs ${offer.visitingCharge}`, relatedId: request._id });
          // Notify others rejected
          const otherOffers = await Offer.find({ request: requestId, _id: { $ne: offer._id } }).select('provider');
          for (const o of otherOffers) {
            await createNotification({ userId: o.provider, type: 'offer_rejected', title: 'Request booked by another provider', body: `A ${request.category} request in ${request.city||'your area'} was booked by another provider`, relatedId: request._id });
          }
        } catch (notifyErr) { console.error('Notification failed:', notifyErr.message); }
      }
    } catch (socketErr) { console.error('Socket emit direct-accept failed:', socketErr.message); }

    const finalOffer = await Offer.findById(offer._id).populate('provider', 'name phone category rating profilePicture');
    const finalRequest = await Request.findById(requestId).populate('customer', 'name phone city').populate('acceptedProvider', 'name phone category rating').populate('acceptedOffer');

    let jobResponse = null;
    if (createdJob) {
      jobResponse = { id: createdJob._id, status: createdJob.status, request: createdJob.request, customer: createdJob.customer, provider: createdJob.provider, offer: createdJob.offer };
    }

    return res.status(200).json({
      status: 'success',
      message: 'Provider booked directly successfully. Job created with contact unlock.',
      request: { id: finalRequest._id, status: finalRequest.status, category: finalRequest.category, acceptedOffer: finalRequest.acceptedOffer, acceptedProvider: finalRequest.acceptedProvider },
      acceptedOffer: { id: finalOffer._id, visitingCharge: finalOffer.visitingCharge, etaMinutes: finalOffer.etaMinutes, status: finalOffer.status, provider: finalOffer.provider },
      job: jobResponse,
      note: 'Direct accept - provider price from profile, no need for provider to send offer first. Provider now sees customer details.'
    });
  } catch (error) {
    console.error('DirectAccept error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to directly accept provider', ...(process.env.NODE_ENV === 'development' && { error: error.message }) });
  }
};

module.exports = { createRequest, getNearbyRequests, getMyRequests, getRequestById, cancelRequest, directAccept };
