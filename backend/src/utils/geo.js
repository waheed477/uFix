const User = require('../models/User');

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad(deg) { return deg * Math.PI / 180; }

const findNearbyProviders = async ({ lng, lat, category, maxDistanceKm, city, limit = 50 }) => {
  if (lng === undefined || lat === undefined) throw new Error('lng and lat are required');
  if (typeof lng !== 'number' || typeof lat !== 'number') throw new Error('lng and lat must be numbers');
  if (lng < -180 || lng > 180) throw new Error('lng must be between -180 and 180');
  if (lat < -90 || lat > 90) throw new Error('lat must be between -90 and 90');

  const maxDistanceMeters = maxDistanceKm ? maxDistanceKm * 1000 : undefined;
  const isDev = process.env.NODE_ENV !== 'production';

  const filter = {
    role: 'provider',
    isOnline: true,
    ...(isDev ? {} : { isVerified: true }),
    ...(city ? {} : { 'location.coordinates': { $ne: [0, 0] } }),
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        ...(maxDistanceMeters ? { $maxDistance: maxDistanceMeters } : {})
      }
    }
  };

  if (category) {
    const validCategories = ['plumber', 'electrician', 'mechanic'];
    if (!validCategories.includes(category)) throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    filter.category = category;
  }

  if (city) {
    filter.city = { $regex: new RegExp(`^${city}$`, 'i') };
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   [geo] City-based filter enabled: city=${city}, category=${category||'any'}`);
    }
  }

  try {
    const debugFilter = {
      role: 'provider',
      isOnline: true,
      ...(isDev ? {} : { isVerified: true }),
      ...(category ? { category } : {}),
      ...(city ? { city: { $regex: new RegExp(`^${city}$`, 'i') } } : {})
    };
    const debugCount = await User.countDocuments(debugFilter);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   [geo] findNearbyProviders debug: total online providers (city=${city||'any'}, category=${category||'any'}): ${debugCount}`);
    }

    let providers = [];
    try {
      providers = await User.find(filter)
        .select('name phone role category radiusKm location isOnline isVerified rating reviews profilePicture city yearsExperience')
        .limit(limit).lean();
    } catch (geoErr) {
      console.warn(`   [geo] Geospatial query failed, falling back to city-only: ${geoErr.message}`);
      providers = [];
    }

    if (providers.length === 0 && city) {
      console.log(`   [geo] City fallback: No providers found via geo, trying city-only filter for city=${city}`);
      const cityOnlyFilter = {
        role: 'provider',
        isOnline: true,
        ...(isDev ? {} : { isVerified: true }),
        ...(category ? { category } : {}),
        city: { $regex: new RegExp(`^${city}$`, 'i') }
      };
      providers = await User.find(cityOnlyFilter)
        .select('name phone role category radiusKm location isOnline isVerified rating reviews profilePicture city yearsExperience')
        .limit(limit).lean();
      console.log(`   [geo] City-only fallback found ${providers.length} providers for city=${city}`);
    }

    const providersWithDistance = providers.map(provider => {
      let distanceKm = 1.5;
      try {
        const coords = provider.location && provider.location.coordinates;
        if (coords && (coords[0] !== 0 || coords[1] !== 0)) {
          distanceKm = calculateDistanceKm(lat, lng, coords[1], coords[0]);
        }
      } catch {}
      return { ...provider, distanceKm: Math.round(distanceKm * 100) / 100, _distanceMeters: distanceKm * 1000 };
    });

    providersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    if (process.env.NODE_ENV !== 'production' && providersWithDistance.length === 0) {
      const all = await User.find({ role: 'provider' }).select('name category isOnline isVerified location city').lean();
      console.log(`   [geo] All providers debug (${all.length}):`, all.map(p => ({
        name: p.name, category: p.category, city: p.city, isOnline: p.isOnline, isVerified: p.isVerified, loc: p.location && p.location.coordinates
      })));
    }

    return providersWithDistance;
  } catch (err) {
    if (err.message.includes('2dsphere') || err.code === 2) {
      console.error('Geospatial index missing');
      throw new Error('Geospatial index missing');
    }
    throw err;
  }
};

const findNearbyProvidersWithGeoNear = async ({ lng, lat, category, maxDistanceKm, limit = 50 }) => {
  const maxDistanceMeters = maxDistanceKm ? maxDistanceKm * 1000 : 10000;
  const matchStage = { role: 'provider', isOnline: true, isVerified: true, ...(category ? { category } : {}) };
  const pipeline = [
    { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distanceMeters', maxDistance: maxDistanceMeters, spherical: true, query: matchStage } },
    { $limit: limit },
    { $project: { name: 1, phone: 1, role: 1, category: 1, radiusKm: 1, location: 1, isOnline: 1, isVerified: 1, rating: 1, reviews: 1, profilePicture: 1, distanceMeters: 1, distanceKm: { $divide: ['$distanceMeters', 1000] } } },
    { $sort: { distanceMeters: 1 } }
  ];
  const providers = await User.aggregate(pipeline);
  return providers;
};

const findNearbyRequests = async ({ lng, lat, category, maxDistanceKm, city, limit = 50 }) => {
  const Request = require('../models/Request');
  if (lng === undefined || lat === undefined) throw new Error('lng and lat are required');
  if (typeof lng !== 'number' || typeof lat !== 'number') throw new Error('lng and lat must be numbers');
  if (lng < -180 || lng > 180) throw new Error('lng must be between -180 and 180');
  if (lat < -90 || lat > 90) throw new Error('lat must be between -90 and 90');

  const maxDistanceMeters = maxDistanceKm ? maxDistanceKm * 1000 : undefined;

  const filter = {
    status: 'pending',
    ...(city ? {} : { 'location.coordinates': { $ne: [0, 0] } }),
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        ...(maxDistanceMeters ? { $maxDistance: maxDistanceMeters } : {})
      }
    }
  };

  if (category) {
    const valid = ['plumber', 'electrician', 'mechanic'];
    if (!valid.includes(category)) throw new Error(`Invalid category. Must be one of: ${valid.join(', ')}`);
    filter.category = category;
  }

  if (city) {
    filter.city = { $regex: new RegExp(`^${city}$`, 'i') };
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   [geo] findNearbyRequests city filter enabled: city=${city}, category=${category}`);
    }
  }

  try {
    let requests = [];
    try {
      requests = await Request.find(filter).populate('customer', 'name phone city profilePicture rating reviews').limit(limit).lean();
    } catch (geoErr) {
      console.warn(`   [geo] findNearbyRequests geo failed, fallback to city-only: ${geoErr.message}`);
      requests = [];
    }

    if (requests.length === 0 && city) {
      console.log(`   [geo] City fallback for requests: city=${city}, category=${category}`);
      const cityOnlyFilter = {
        status: 'pending',
        ...(category ? { category } : {}),
        city: { $regex: new RegExp(`^${city}$`, 'i') }
      };
      requests = await Request.find(cityOnlyFilter).populate('customer', 'name phone city profilePicture rating reviews').limit(limit).lean();
      console.log(`   [geo] City-only fallback found ${requests.length} requests for city=${city}`);
    }

    const requestsWithDistance = requests.map(req => {
      let distanceKm = 1.5;
      try {
        const coords = req.location && req.location.coordinates;
        if (coords && (coords[0] !== 0 || coords[1] !== 0)) {
          distanceKm = calculateDistanceKm(lat, lng, coords[1], coords[0]);
        }
      } catch {}
      return { ...req, distanceKm: Math.round(distanceKm * 100) / 100 };
    });

    requestsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    return requestsWithDistance;
  } catch (err) {
    if (err.message.includes('2dsphere') || err.code === 2) {
      console.error('Geospatial query failed - Request 2dsphere index missing');
      throw new Error('Geospatial index missing on Request.location');
    }
    throw err;
  }
};

module.exports = { findNearbyProviders, findNearbyProvidersWithGeoNear, findNearbyRequests, calculateDistanceKm };
