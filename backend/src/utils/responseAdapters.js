const { calculateDistanceKm } = require('./geo');

/**
 * Response Adapters - Phase 6
 * Transforms backend objects into frontend lib/types.ts expected shapes
 * Addresses EVERY mismatch documented in Phase 5
 * 
 * Mismatches identified in Phase 5:
 * - etaMinutes → etaMin
 * - provider.id/name → providerId/providerName (flatten)
 * - createdAt → timestamp
 * - Add distanceKm where missing
 * - lng/lat → x/y conversion decision
 * - avatarColor/avatarInitials vs profilePicture
 * - providerRating, providerReviews vs rating/reviews
 * - visitingCharge same, but needs mapping
 * - category same
 * - etc.
 * 
 * Decision for x/y conversion:
 * Frontend's lib/location.ts uses custom SVG map with normalized 0..100 coordinates
 * and functions offsetToCoords(x,y,base) and coordsToOffset(coords,base) where
 * 100 units ≈ 3km around base point (METERS_PER_UNIT=30).
 * Backend stores real GeoJSON [lng,lat]. Converting to x,y requires knowing base coords
 * (e.g., user's current location or DEFAULT_COORDS). Since base is frontend-specific
 * and varies per user, conversion should happen FRONTEND-SIDE using frontend's own
 * coordsToOffset() function. Backend will continue returning GeoJSON [lng,lat] and
 * readable {lng,lat}, and frontend should convert via coordsToOffset when rendering
 * custom map pins. This is documented in project_context.md for Phase 9.
 * 
 * For adapter purposes, we provide a helper `geoToXY()` that estimates x,y using
 * DEFAULT_COORDS as base, but primary recommendation is frontend-side conversion.
 */

const DEFAULT_COORDS = { lat: 31.4181, lng: 73.0776 }; // Faisalabad reference from frontend
const METERS_PER_UNIT = 30;

// Helper: Convert lat,lng to x,y normalized 0..100 using base coords (rough, for adapter demo)
// Same logic as frontend's coordsToOffset
const coordsToXY = (lat, lng, base = DEFAULT_COORDS) => {
  const dxM = (lng - base.lng) * 111320 * Math.cos((base.lat * Math.PI) / 180);
  const dyM = (lat - base.lat) * 111320;
  const x = 50 + dxM / METERS_PER_UNIT;
  const y = 50 - dyM / METERS_PER_UNIT;
  // Clamp to 0..100 for display - frontend does similar but allows outside?
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y))
  };
};

// Helper: Get initials from name (matches frontend avatar logic)
const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
};

// Helper: Deterministic color from string (for avatarColor)
const stringToColor = (str) => {
  const colors = ['#167a6c', '#0d8cd0', '#7c3aed', '#e0495b', '#0e7c5b', '#e08b00'];
  if (!str) return colors[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
};

// Helper: Convert Date to timestamp number (frontend uses number)
const toTimestamp = (date) => {
  if (!date) return Date.now();
  return new Date(date).getTime();
};

/**
 * Adapt backend Offer to frontend Offer shape
 * Backend Offer: { _id, request, provider (populated User), visitingCharge, etaMinutes, status, createdAt }
 * Frontend Offer: { id, providerId, providerName, providerRating, providerReviews, avatarColor, avatarInitials, category, visitingCharge, etaMin, distanceKm, timestamp }
 */
const adaptOfferForFrontend = (offer, options = {}) => {
  if (!offer) return null;

  // Provider may be populated User or ObjectId
  const provider = offer.provider && typeof offer.provider === 'object' ? offer.provider : null;
  const providerId = provider ? provider._id : offer.provider;
  const providerName = provider ? provider.name : options.providerName || 'Provider';
  
  // Category from request or provider or options
  const category = options.category || 
                   (offer.request && typeof offer.request === 'object' ? offer.request.category : null) || 
                   (provider ? provider.category : 'plumber');

  // Distance calculation if we have both locations
  let distanceKm = options.distanceKm;
  if (distanceKm === undefined && options.customerLocation && options.providerLocation) {
    const [custLng, custLat] = options.customerLocation.coordinates || options.customerLocation;
    const [provLng, provLat] = options.providerLocation.coordinates || options.providerLocation;
    if (custLng !== undefined && custLat !== undefined && provLng !== undefined && provLat !== undefined) {
      // calculateDistanceKm expects lat1,lng1,lat2,lng2
      distanceKm = calculateDistanceKm(custLat, custLng, provLat, provLng);
      distanceKm = Math.round(distanceKm * 10) / 10; // 1 decimal like frontend
    }
  }
  if (distanceKm === undefined) {
    // Fallback random-ish but deterministic? For adapter we leave undefined or estimate 1.2
    distanceKm = options.estimatedDistance || undefined;
  }

  const adapted = {
    // Frontend exact fields
    id: offer._id?.toString() || offer.id,
    providerId: providerId?.toString(),
    providerName: providerName,
    providerRating: provider ? (provider.rating || 4.8) : (options.providerRating || 4.8),
    providerReviews: provider ? (provider.reviews || 23) : (options.providerReviews || 23),
    avatarColor: provider ? (provider.color || stringToColor(providerName)) : stringToColor(providerName),
    avatarInitials: provider ? (provider.avatar || getInitials(providerName)) : getInitials(providerName),
    category: category,
    visitingCharge: offer.visitingCharge,
    etaMin: offer.etaMinutes, // mapped
    distanceKm: distanceKm !== undefined ? distanceKm : (offer.distanceKm || 1.5), // fallback
    timestamp: toTimestamp(offer.createdAt),

    // Keep backend fields as well for backward compatibility (so Phase 4/5 tests don't break)
    // These extra fields help new frontend still read old names if needed
    _backend: {
      _id: offer._id,
      provider: providerId,
      visitingCharge: offer.visitingCharge,
      etaMinutes: offer.etaMinutes, // original
      status: offer.status,
      createdAt: offer.createdAt,
      request: offer.request
    }
  };

  // Also include backward compat top-level for old API consumers
  adapted.visitingCharge = offer.visitingCharge;
  adapted.etaMinutes = offer.etaMinutes;
  adapted.status = offer.status;
  adapted.createdAt = offer.createdAt;

  return adapted;
};

/**
 * Adapt backend Request to frontend Job shape (partial)
 * Backend Request: { _id, customer, category, description, location GeoJSON, address, status pending/active/completed/cancelled, acceptedOffer, acceptedProvider, createdAt }
 * Frontend Job: { id, customerId, customerName, customerPhone?, category, description, location {x,y,label}, address, status open/accepted/on_the_way/arrived/in_progress/completed/cancelled, createdAt number, offers, providerId?, providerName?, etc }
 * 
 * Note: x/y conversion decision - we provide both GeoJSON and estimated x,y using DEFAULT_COORDS base,
 * but recommend frontend does conversion via coordsToOffset with its own base
 */
const adaptRequestForFrontend = (request, options = {}) => {
  if (!request) return null;

  const customer = request.customer && typeof request.customer === 'object' ? request.customer : null;
  const customerId = customer ? customer._id : request.customer;
  const customerName = customer ? customer.name : options.customerName || 'Customer';

  const [lng, lat] = request.location?.coordinates || [73.0776, 31.4181];

  // x/y conversion using DEFAULT_COORDS base (estimate) + also keep real lat/lng
  const xy = coordsToXY(lat, lng, options.baseCoords || DEFAULT_COORDS);

  // Map backend status to frontend status
  const statusMap = {
    pending: 'open', // frontend open = awaiting offers
    active: 'accepted', // frontend accepted = offer accepted
    completed: 'completed',
    cancelled: 'cancelled'
  };
  const frontendStatus = statusMap[request.status] || request.status;

  const adapted = {
    id: request._id?.toString() || request.id,
    customerId: customerId?.toString(),
    customerName: customerName,
    customerPhone: customer ? customer.phone : options.customerPhone,
    customerAvatarColor: customer ? stringToColor(customerName) : stringToColor(customerName),
    customerAvatarInitials: getInitials(customerName),
    category: request.category,
    description: request.description,
    location: {
      x: xy.x,
      y: xy.y,
      label: request.address || options.label || 'Customer location'
    },
    // Keep real geo for new frontend that can handle it
    geoLocation: {
      type: 'Point',
      coordinates: [lng, lat],
      lat,
      lng
    },
    address: request.address || '',
    status: frontendStatus,
    createdAt: toTimestamp(request.createdAt),
    offers: options.offers ? options.offers.map(o => adaptOfferForFrontend(o, { category: request.category })) : [],
    acceptedOfferId: request.acceptedOffer?.toString() || request.acceptedOffer,
    providerId: request.acceptedProvider ? (request.acceptedProvider._id?.toString() || request.acceptedProvider.toString()) : undefined,
    // Additional backend fields
    _backend: {
      _id: request._id,
      customer: customerId,
      location: request.location,
      status: request.status,
      acceptedOffer: request.acceptedOffer,
      acceptedProvider: request.acceptedProvider,
      createdAt: request.createdAt
    }
  };

  // Also keep original backend status for debugging
  adapted._originalStatus = request.status;
  adapted._frontendStatus = frontendStatus;

  return adapted;
};

/**
 * Adapt backend Job to frontend Job shape
 * Backend Job: { _id, request ref, customer ref, provider ref, offer ref, status on_the_way/arrived/in_progress/completed, statusHistory, createdAt, completedAt }
 * Frontend Job: similar to Request but with active job status timeline
 */
const adaptJobForFrontend = (job, options = {}) => {
  if (!job) return null;

  const customer = job.customer && typeof job.customer === 'object' ? job.customer : null;
  const provider = job.provider && typeof job.provider === 'object' ? job.provider : null;
  const request = job.request && typeof job.request === 'object' ? job.request : null;
  const offer = job.offer && typeof job.offer === 'object' ? job.offer : null;

  const customerId = customer ? customer._id : job.customer;
  const providerId = provider ? provider._id : job.provider;

  // Location from request if populated
  let lng = 73.0776, lat = 31.4181, address = '';
  if (request && request.location && request.location.coordinates) {
    [lng, lat] = request.location.coordinates;
    address = request.address || '';
  } else if (options.requestLocation) {
    [lng, lat] = options.requestLocation.coordinates || [lng, lat];
    address = options.requestLocation.address || '';
  }

  const xy = coordsToXY(lat, lng, options.baseCoords || DEFAULT_COORDS);

  const customerName = customer ? customer.name : options.customerName || 'Customer';
  const providerName = provider ? provider.name : options.providerName || 'Provider';

  const adapted = {
    id: job._id?.toString() || job.id,
    customerId: customerId?.toString(),
    customerName: customerName,
    customerPhone: customer ? customer.phone : undefined, // unlocked - job only exists after acceptance
    customerAvatarColor: stringToColor(customerName),
    customerAvatarInitials: getInitials(customerName),
    category: request ? request.category : (options.category || 'plumber'),
    description: request ? request.description : options.description || '',
    location: {
      x: xy.x,
      y: xy.y,
      label: address || 'Active job location'
    },
    geoLocation: {
      type: 'Point',
      coordinates: [lng, lat],
      lat,
      lng
    },
    address: address,
    status: job.status, // already matches frontend timeline: on_the_way, arrived, in_progress, completed
    createdAt: toTimestamp(job.createdAt),
    offers: [], // job has single accepted offer, but frontend Job has offers array - we can populate with accepted offer adapted
    acceptedOfferId: offer ? (offer._id?.toString() || offer.toString()) : undefined,
    providerId: providerId?.toString(),
    providerName: providerName,
    providerPhone: provider ? provider.phone : undefined, // unlocked
    providerAvatarColor: provider ? stringToColor(providerName) : stringToColor(providerName),
    providerAvatarInitials: provider ? getInitials(providerName) : getInitials(providerName),
    providerRating: provider ? (provider.rating || 4.8) : 4.8,
    fee: offer ? `₹${offer.visitingCharge}` : undefined,
    rating: undefined, // for completed jobs, rating will be added later
    review: undefined,
    // Status history for timeline debugging
    statusHistory: job.statusHistory ? job.statusHistory.map(h => ({
      status: h.status,
      timestamp: toTimestamp(h.timestamp)
    })) : [],
    // Backend fields
    _backend: {
      _id: job._id,
      request: request ? request._id : job.request,
      customer: customerId,
      provider: providerId,
      offer: offer ? offer._id : job.offer,
      status: job.status,
      statusHistory: job.statusHistory,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    },
    // Original and frontend status same for Job (since Job status already matches frontend timeline)
    _originalStatus: job.status
  };

  // If offer exists, add to offers array as frontend expects (even though job is active, frontend Job has offers history)
  if (offer) {
    const adaptedOffer = adaptOfferForFrontend(offer, {
      category: adapted.category,
      providerName: providerName,
      providerRating: adapted.providerRating,
      distanceKm: options.distanceKm
    });
    adapted.offers = [adaptedOffer];
    adapted.visitingCharge = offer.visitingCharge;
    adapted.etaMin = offer.etaMinutes;
  }

  return adapted;
};

/**
 * Adapt Request/offers list for socket payloads to match frontend expectations
 * Wraps adapted offer with additional metadata
 */
const adaptOfferPayloadForSocket = (offer, request, customerLocation, providerLocation) => {
  const adapted = adaptOfferForFrontend(offer, {
    category: request?.category,
    customerLocation,
    providerLocation,
    distanceKm: undefined // will be calculated if locations provided
  });
  
  // For socket, also include backend compatible fields
  return {
    offer: adapted, // frontend shape
    _raw: {
      id: offer._id,
      visitingCharge: offer.visitingCharge,
      etaMinutes: offer.etaMinutes,
      status: offer.status
    }
  };
};

/**
 * Adapt Job status update for socket payload
 */
const adaptJobStatusPayload = (job) => {
  return {
    jobId: job._id?.toString() || job.id,
    newStatus: job.status,
    timestamp: Date.now(),
    statusHistory: job.statusHistory ? job.statusHistory.map(h => ({
      status: h.status,
      timestamp: toTimestamp(h.timestamp)
    })) : [],
    // Also frontend-compatible Job
    job: adaptJobForFrontend(job)
  };
};

/**
 * Adapt backend Message to frontend ChatMessage shape
 * Backend Message: { _id, job ref, sender ref (User), text, readAt (Date or null), createdAt, updatedAt }
 * Frontend ChatMessage: { id, senderId, text, timestamp, read }
 * 
 * Frontend store.tsx:
 * - senderId is "me" or peer id - but backend sender is ObjectId of User who sent
 * - For frontend adapter, we keep senderId as sender._id string, and frontend can map "me" based on current user
 * - read boolean: true if readAt not null, false if null
 * - timestamp: createdAt → number
 */
const adaptMessageForFrontend = (message, options = {}) => {
  if (!message) return null;

  const sender = message.sender && typeof message.sender === 'object' ? message.sender : null;
  const senderId = sender ? sender._id?.toString() : (message.sender?.toString() || options.senderId);

  const adapted = {
    // Frontend exact fields
    id: message._id?.toString() || message.id,
    senderId: senderId,
    text: message.text,
    timestamp: toTimestamp(message.createdAt),
    read: !!message.readAt, // true if readAt exists, false if null

    // Additional helpful fields for new frontend
    readAt: message.readAt ? toTimestamp(message.readAt) : null,
    senderName: sender ? sender.name : options.senderName,
    senderRole: sender ? sender.role : options.senderRole,

    // Backward compat + backend fields
    _backend: {
      _id: message._id,
      job: message.job,
      sender: senderId,
      text: message.text,
      readAt: message.readAt,
      createdAt: message.createdAt
    }
  };

  // Also include raw for old consumers
  adapted.sender = senderId;
  adapted.createdAt = message.createdAt;

  return adapted;
};

module.exports = {
  adaptOfferForFrontend,
  adaptRequestForFrontend,
  adaptJobForFrontend,
  adaptOfferPayloadForSocket,
  adaptJobStatusPayload,
  adaptMessageForFrontend,
  coordsToXY,
  getInitials,
  stringToColor,
  toTimestamp,
  DEFAULT_COORDS,
  METERS_PER_UNIT
};
