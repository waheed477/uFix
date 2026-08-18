const User = require('../models/User');

/**
 * Geospatial Utility - Phase 3 + Phase 4
 * 
 * IMPORTANT: MongoDB GeoJSON coordinate order is [longitude, latitude] - NOT [latitude, longitude]
 * This is a very common source of bugs. All functions in this file use [lng, lat] order
 * to be consistent with MongoDB and GeoJSON spec.
 * 
 * Frontend's location.ts uses { lat, lng } object (lat first) because that's natural for JS,
 * but when storing in MongoDB GeoJSON we MUST convert to [lng, lat].
 * 
 * Example:
 * - Frontend: { lat: 31.4181, lng: 73.0776 }
 * - MongoDB: { type: "Point", coordinates: [73.0776, 31.4181] } // [lng, lat]
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * Useful for tests to verify expected distances
 * @param {Number} lat1 - latitude 1
 * @param {Number} lng1 - longitude 1
 * @param {Number} lat2 - latitude 2
 * @param {Number} lng2 - longitude 2
 * @returns {Number} distance in kilometers
 */
const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg) => deg * Math.PI / 180;

/**
 * findNearbyProviders - Core geospatial query for Phase 3 & Phase 4
 * 
 * Builds and executes a $near query filtering by:
 * - role: "provider"
 * - isOnline: true
 * - isVerified: true (only verified providers shown to customers)
 * - category matches requested category (if provided)
 * - within maxDistanceKm (converted to meters for $maxDistance)
 * 
 * @param {Object} options
 * @param {Number} options.lng - longitude (-180 to 180)
 * @param {Number} options.lat - latitude (-90 to 90)
 * @param {String} options.category - optional: plumber|electrician|mechanic
 * @param {Number} options.maxDistanceKm - max distance in km (e.g. 15)
 * @param {Number} options.limit - optional, max results (default 50)
 * @returns {Promise<Array>} - array of provider User docs sorted by distance (closest first)
 * 
 * This function will be directly reused in Phase 4 for actual nearby-requests/providers logic
 */
const findNearbyProviders = async ({ lng, lat, category, maxDistanceKm, limit = 50 }) => {
  // Validation
  if (lng === undefined || lat === undefined) {
    throw new Error('lng and lat are required');
  }

  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error('lng and lat must be numbers');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('lng must be between -180 and 180');
  }

  if (lat < -90 || lat > 90) {
    throw new Error('lat must be between -90 and 90');
  }

  // Convert km to meters for MongoDB $maxDistance
  const maxDistanceMeters = maxDistanceKm ? maxDistanceKm * 1000 : undefined;

  // Build query filter
  const isDev = process.env.NODE_ENV !== 'production';
  const filter = {
    role: 'provider',
    isOnline: true,
    // In production, only verified providers. In dev, allow unverified to ease testing (auto-verified in getNearbyRequests anyway)
    ...(isDev ? {} : { isVerified: true }),
    // Exclude users with default [0,0] location (not set)
    'location.coordinates': { $ne: [0, 0] },
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat] // IMPORTANT: [lng, lat] order
        },
        ...(maxDistanceMeters ? { $maxDistance: maxDistanceMeters } : {})
      }
    }
  };

  // Optional category filter
  if (category) {
    const validCategories = ['plumber', 'electrician', 'mechanic'];
    if (!validCategories.includes(category)) {
      throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }
    filter.category = category;
  }

  // Execute query
  // Note: $near automatically sorts by distance (closest first)
  // It requires a 2dsphere index on location field (added in User model)
  try {
    // Debug: Count total providers matching basic filters without geo for logging
    const debugCount = await User.countDocuments({
      role: 'provider',
      isOnline: true,
      isVerified: true,
      'location.coordinates': { $ne: [0, 0] },
      ...(category ? { category } : {})
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   [geo] findNearbyProviders debug: total online+verified providers with valid location (category=${category||'any'}): ${debugCount}`);
    }

    const providers = await User.find(filter)
      .select('name phone role category radiusKm location isOnline isVerified rating reviews profilePicture city yearsExperience')
      .limit(limit)
      .lean();

    // Add computed distance
    const providersWithDistance = providers.map(provider => {
      const [provLng, provLat] = provider.location.coordinates;
      const distanceKm = calculateDistanceKm(lat, lng, provLat, provLng);
      return {
        ...provider,
        distanceKm: Math.round(distanceKm * 100) / 100,
        _distanceMeters: distanceKm * 1000
      };
    });

    providersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    if (process.env.NODE_ENV !== 'production' && providersWithDistance.length === 0 && debugCount === 0) {
      // Additional debug: why zero?
      const all = await User.find({ role: 'provider' }).select('name category isOnline isVerified location').lean();
      console.log(`   [geo] All providers debug (${all.length}):`, all.map(p => ({
        name: p.name,
        category: p.category,
        isOnline: p.isOnline,
        isVerified: p.isVerified,
        loc: p.location?.coordinates,
        isZero: p.location?.coordinates?.[0] === 0 && p.location?.coordinates?.[1] === 0
      })));
    }

    return providersWithDistance;

  } catch (err) {
    if (err.message.includes('2dsphere') || err.code === 2) {
      console.error('❌ Geospatial query failed - 2dsphere index missing. Ensure User model has location: 2dsphere index');
      throw new Error('Geospatial index missing. User model must have 2dsphere index on location field');
    }
    throw err;
  }
};

/**
 * Alternative using $geoNear aggregation (more powerful, returns distance field)
 * This version is useful for Phase 4 when you need official distance from MongoDB
 * Keeping it here as reference, but findNearbyProviders above uses $near for simplicity
 */
const findNearbyProvidersWithGeoNear = async ({ lng, lat, category, maxDistanceKm, limit = 50 }) => {
  const maxDistanceMeters = maxDistanceKm ? maxDistanceKm * 1000 : 10000; // default 10km

  const matchStage = {
    role: 'provider',
    isOnline: true,
    isVerified: true,
    ...(category ? { category } : {})
  };

  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] }, // [lng, lat]
        distanceField: 'distanceMeters',
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: matchStage
      }
    },
    { $limit: limit },
    {
      $project: {
        name: 1,
        phone: 1,
        role: 1,
        category: 1,
        radiusKm: 1,
        location: 1,
        isOnline: 1,
        isVerified: 1,
        rating: 1,
        reviews: 1,
        profilePicture: 1,
        distanceMeters: 1,
        distanceKm: { $divide: ['$distanceMeters', 1000] }
      }
    },
    { $sort: { distanceMeters: 1 } }
  ];

  const providers = await User.aggregate(pipeline);
  return providers;
};

/**
 * findNearbyRequests - Phase 4 Core Logic
 * Reuses same geospatial pattern as findNearbyProviders but opposite direction:
 * - Finds Requests near a provider's location, not providers near a point
 * - Used by GET /api/requests/nearby (provider views nearby pending requests)
 * 
 * Builds and executes a $near query filtering by:
 * - status: "pending" (only open requests)
 * - category matches provider's category (if provided)
 * - within maxDistanceKm (converted to meters)
 * 
 * @param {Object} options
 * @param {Number} options.lng - provider longitude
 * @param {Number} options.lat - provider latitude
 * @param {String} options.category - provider's category filter (plumber/electrician/mechanic)
 * @param {Number} options.maxDistanceKm - max distance e.g. provider's radiusKm
 * @param {Number} options.limit - max results default 50
 * @returns {Promise<Array>} - array of Request docs sorted by distance
 */
const findNearbyRequests = async ({ lng, lat, category, maxDistanceKm, limit = 50 }) => {
  // Lazy require to avoid circular dependency (Request model requires User)
  const Request = require('../models/Request');

  if (lng === undefined || lat === undefined) {
    throw new Error('lng and lat are required');
  }

  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error('lng and lat must be numbers');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('lng must be between -180 and 180');
  }

  if (lat < -90 || lat > 90) {
    throw new Error('lat must be between -90 and 90');
  }

  const maxDistanceMeters = maxDistanceKm ? maxDistanceKm * 1000 : undefined;

  const filter = {
    status: 'pending',
    'location.coordinates': { $ne: [0, 0] },
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat] // [lng, lat]
        },
        ...(maxDistanceMeters ? { $maxDistance: maxDistanceMeters } : {})
      }
    }
  };

  if (category) {
    const valid = ['plumber', 'electrician', 'mechanic'];
    if (!valid.includes(category)) {
      throw new Error(`Invalid category. Must be one of: ${valid.join(', ')}`);
    }
    filter.category = category;
  }

  try {
    const requests = await Request.find(filter)
      .populate('customer', 'name phone city profilePicture rating reviews')
      .limit(limit)
      .lean();

    const requestsWithDistance = requests.map(req => {
      const [reqLng, reqLat] = req.location.coordinates;
      const distanceKm = calculateDistanceKm(lat, lng, reqLat, reqLng);
      return {
        ...req,
        distanceKm: Math.round(distanceKm * 100) / 100
      };
    });

    requestsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    return requestsWithDistance;

  } catch (err) {
    if (err.message.includes('2dsphere') || err.code === 2) {
      console.error('❌ Geospatial query failed - Request 2dsphere index missing');
      throw new Error('Geospatial index missing on Request.location');
    }
    throw err;
  }
};

module.exports = {
  findNearbyProviders,
  findNearbyProvidersWithGeoNear,
  findNearbyRequests,
  calculateDistanceKm
};
