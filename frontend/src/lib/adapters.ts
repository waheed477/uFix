/**
 * Adapters - Phase 9 Frontend Integration
 * 
 * Maps backend response shapes to frontend lib/types.ts expected shapes
 * Reuses logic from backend's utils/responseAdapters.js but adapted for frontend
 * Addresses mismatches documented in Phase 5/6/8:
 * - etaMinutes → etaMin
 * - provider.id/name → providerId/providerName
 * - createdAt (ISO/Date) → timestamp (number)
 * - avatarColor/avatarInitials from name
 * - lng/lat → x/y via coordsToOffset (frontend-side conversion per Phase 6 decision)
 * - distanceKm calculation
 * 
 * Decision for x/y conversion (from Phase 6 docs):
 * Frontend's lib/location.ts has offsetToCoords(x,y,base) and coordsToOffset(coords,base)
 * where 100 units ≈ 3km (METERS_PER_UNIT=30) around base point.
 * Backend stores real GeoJSON [lng,lat]. Converting to x,y requires knowing base coords
 * (user's current location or DEFAULT_COORDS). Since base is frontend-specific and varies,
 * conversion should happen FRONTEND-SIDE using coordsToOffset with base = user's location or DEFAULT_COORDS.
 * Backend provides geoLocation for that. This adapter provides estimated x,y using DEFAULT_COORDS as base
 * for convenience, but primary recommendation is frontend-side conversion via coordsToOffset.
 */

import type { Category, Offer, Job, User, ChatMessage } from './types';
import { coordsToOffset, DEFAULT_COORDS, type Coords } from './location';

// Helper: Get initials from name (matches backend and frontend avatar logic)
export const getInitials = (name: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

// Helper: Deterministic color from string (for avatarColor)
export const stringToColor = (str: string): string => {
  const colors = ['#167a6c', '#0d8cd0', '#7c3aed', '#e0495b', '#0e7c5b', '#e08b00'];
  if (!str) return colors[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
};

// Helper: Convert Date/ISO/string to timestamp number (frontend uses number)
export const toTimestamp = (date: any): number => {
  if (!date) return Date.now();
  if (typeof date === 'number') return date;
  return new Date(date).getTime();
};

// Helper: Convert lng,lat to x,y normalized 0..100 using base coords (estimate)
export const lngLatToXY = (lng: number, lat: number, base: Coords = DEFAULT_COORDS): { x: number; y: number } => {
  const result = coordsToOffset({ lat, lng }, base);
  // Clamp to 0..100 for display, same as backend coordsToXY
  return {
    x: Math.max(0, Math.min(100, result.x)),
    y: Math.max(0, Math.min(100, result.y)),
  };
};

// Mapping: Backend User → Frontend User
export const adaptBackendUserToFrontendUser = (backendUser: any): User => {
  if (!backendUser) return null as any;

  const id = backendUser.id || backendUser._id?.toString() || backendUser._id || 'unknown';
  const name = backendUser.name || 'User';
  const phone = backendUser.phone || '';
  const city = backendUser.city;
  const role = backendUser.role || 'customer';
  const profilePicture = backendUser.profilePicture;
  const isOnline = backendUser.isOnline;
  const isVerified = backendUser.isVerified;
  const category = backendUser.category;
  const radiusKm = backendUser.radiusKm;
  const yearsExperience = backendUser.yearsExperience;
  const rating = backendUser.rating ?? 4.8;
  const reviews = backendUser.reviews ?? 23;
  const jobsCompleted = backendUser.jobsCompleted ?? 0;

  return {
    id: id.toString(),
    name,
    phone,
    city,
    role,
    avatar: getInitials(name),
    color: stringToColor(name),
    rating,
    reviews,
    category,
    radiusKm,
    verified: isVerified,
    isOnline,
    yearsExperience,
    jobsCompleted,
    // Keep raw backend for debugging
    _backend: backendUser,
  } as any;
};

// Mapping: Backend Request → Frontend Job (for customer's pending/active requests)
export const adaptBackendRequestToFrontendJob = (backendRequest: any, options: { baseCoords?: Coords; currentUserId?: string } = {}): Job => {
  if (!backendRequest) return null as any;

  const id = backendRequest.id || backendRequest._id?.toString() || backendRequest._id;
  const customer = backendRequest.customer && typeof backendRequest.customer === 'object' ? backendRequest.customer : null;
  const customerId = customer ? (customer.id || customer._id?.toString() || customer._id) : backendRequest.customer;
  const customerName = customer ? customer.name : 'Customer';

  const [lng, lat] = backendRequest.location?.coordinates || [73.0776, 31.4181];
  const base = options.baseCoords || DEFAULT_COORDS;
  const xy = lngLatToXY(lng, lat, base);

  // Map backend status pending/active/completed/cancelled to frontend JobStatus open/accepted/on_the_way/arrived/in_progress/completed/cancelled
  const statusMap: Record<string, any> = {
    pending: 'open',
    active: 'accepted',
    completed: 'completed',
    cancelled: 'cancelled',
  };
  const frontendStatus = statusMap[backendRequest.status] || backendRequest.status;

  return {
    id: id.toString(),
    customerId: customerId?.toString() || 'unknown',
    customerName: customerName,
    customerPhone: customer?.phone,
    customerAvatarColor: customer ? stringToColor(customerName) : '#167a6c',
    customerAvatarInitials: getInitials(customerName),
    category: backendRequest.category,
    description: backendRequest.description,
    location: {
      x: xy.x,
      y: xy.y,
      label: backendRequest.address || 'Customer location',
    },
    address: backendRequest.address || '',
    status: frontendStatus,
    createdAt: toTimestamp(backendRequest.createdAt),
    offers: [], // will be populated separately via offers API
    acceptedOfferId: backendRequest.acceptedOffer?.toString() || backendRequest.acceptedOfferId,
    providerId: backendRequest.acceptedProvider ? (backendRequest.acceptedProvider.id || backendRequest.acceptedProvider._id?.toString() || backendRequest.acceptedProvider.toString()) : undefined,
    providerName: backendRequest.acceptedProvider?.name,
    providerPhone: backendRequest.acceptedProvider?.phone,
    providerAvatarColor: backendRequest.acceptedProvider ? stringToColor(backendRequest.acceptedProvider.name) : undefined,
    providerAvatarInitials: backendRequest.acceptedProvider ? getInitials(backendRequest.acceptedProvider.name) : undefined,
    providerRating: backendRequest.acceptedProvider?.rating,
    // Keep backend raw for debugging
    _backend: backendRequest,
    _originalStatus: backendRequest.status,
    // GeoLocation preserved for future real map
    _geoLocation: {
      type: 'Point',
      coordinates: [lng, lat],
      lat,
      lng,
    },
  } as any;
};

// Mapping: Backend Offer → Frontend Offer
export const adaptBackendOfferToFrontendOffer = (backendOffer: any, options: { category?: Category; distanceKm?: number; baseCoords?: Coords } = {}): Offer => {
  if (!backendOffer) return null as any;

  const provider = backendOffer.provider && typeof backendOffer.provider === 'object' ? backendOffer.provider : null;
  const providerId = provider ? (provider.id || provider._id?.toString() || provider._id) : backendOffer.provider;
  const providerName = provider ? provider.name : (options as any).providerName || 'Provider';
  const category = (backendOffer.request && typeof backendOffer.request === 'object' ? backendOffer.request.category : null) || options.category || (provider?.category as Category) || 'plumber';

  // DistanceKm: if provided via options, use it, else if offer has distanceKm, use it, else fallback 1.5
  const distanceKm = options.distanceKm !== undefined ? options.distanceKm : (backendOffer.distanceKm ?? 1.5);

  const adapted: any = {
    id: (backendOffer.id || backendOffer._id?.toString() || backendOffer._id).toString(),
    providerId: providerId?.toString() || 'unknown',
    providerName: providerName,
    providerRating: provider ? (provider.rating ?? 4.8) : 4.8,
    providerReviews: provider ? (provider.reviews ?? 23) : 23,
    avatarColor: provider ? stringToColor(providerName) : stringToColor(providerName),
    avatarInitials: getInitials(providerName),
    category: category as Category,
    visitingCharge: backendOffer.visitingCharge,
    etaMin: backendOffer.etaMinutes ?? backendOffer.etaMin ?? 15, // map etaMinutes → etaMin
    distanceKm: distanceKm,
    timestamp: toTimestamp(backendOffer.createdAt),
    _backend: backendOffer,
  };

  // Backward compat fields (keep original names for old consumers)
  adapted.etaMinutes = backendOffer.etaMinutes;
  adapted.status = backendOffer.status;

  return adapted as Offer;
};

// Mapping: Backend Job → Frontend Job (with contact unlock)
export const adaptBackendJobToFrontendJob = (backendJob: any, options: { baseCoords?: Coords } = {}): Job => {
  if (!backendJob) return null as any;

  const customer = backendJob.customer && typeof backendJob.customer === 'object' ? backendJob.customer : null;
  const provider = backendJob.provider && typeof backendJob.provider === 'object' ? backendJob.provider : null;
  const request = backendJob.request && typeof backendJob.request === 'object' ? backendJob.request : null;
  const offer = backendJob.offer && typeof backendJob.offer === 'object' ? backendJob.offer : null;

  const customerId = customer ? (customer.id || customer._id?.toString() || customer._id) : backendJob.customer;
  const providerId = provider ? (provider.id || provider._id?.toString() || provider._id) : backendJob.provider;

  let lng = 73.0776, lat = 31.4181, address = '';
  if (request && request.location && request.location.coordinates) {
    [lng, lat] = request.location.coordinates;
    address = request.address || '';
  } else if ((backendJob as any)._geoLocation) {
    lng = (backendJob as any)._geoLocation.coordinates[0];
    lat = (backendJob as any)._geoLocation.coordinates[1];
  }

  const base = options.baseCoords || DEFAULT_COORDS;
  const xy = lngLatToXY(lng, lat, base);

  const customerName = customer ? customer.name : 'Customer';
  const providerName = provider ? provider.name : 'Provider';

  // Status already matches frontend timeline for Job: on_the_way, arrived, in_progress, completed
  // No mapping needed, but ensure it is valid JobStatus
  const status = backendJob.status;

  return {
    id: (backendJob.id || backendJob._id?.toString() || backendJob._id).toString(),
    customerId: customerId?.toString() || 'unknown',
    customerName: customerName,
    customerPhone: customer ? customer.phone : undefined, // unlocked
    customerAvatarColor: stringToColor(customerName),
    customerAvatarInitials: getInitials(customerName),
    category: request ? request.category : (provider?.category as Category) || 'plumber',
    description: request ? request.description : '',
    location: {
      x: xy.x,
      y: xy.y,
      label: address || 'Active job location',
    },
    address: address,
    status: status,
    createdAt: toTimestamp(backendJob.createdAt),
    offers: offer ? [adaptBackendOfferToFrontendOffer(offer, { category: (request?.category as Category) || 'plumber' })] : [],
    acceptedOfferId: offer ? (offer.id || offer._id?.toString()) : undefined,
    providerId: providerId?.toString() || 'unknown',
    providerName: providerName,
    providerPhone: provider ? provider.phone : undefined, // unlocked
    providerAvatarColor: stringToColor(providerName),
    providerAvatarInitials: getInitials(providerName),
    providerRating: provider ? (provider.rating ?? 4.8) : 4.8,
    fee: offer ? `₹${offer.visitingCharge}` : undefined,
    // Keep backend raw
    _backend: backendJob,
    _geoLocation: {
      type: 'Point',
      coordinates: [lng, lat],
      lat,
      lng,
    },
  } as any;
};

// Mapping: Backend Message → Frontend ChatMessage
export const adaptBackendMessageToFrontendMessage = (backendMessage: any, options: { currentUserId?: string } = {}): ChatMessage => {
  if (!backendMessage) return null as any;

  const sender = backendMessage.sender && typeof backendMessage.sender === 'object' ? backendMessage.sender : null;
  const senderId = sender ? (sender.id || sender._id?.toString() || sender._id) : backendMessage.sender;

  // Frontend expects senderId "me" for current user, or peer id otherwise
  // If currentUserId provided, map senderId to "me" if it matches current user
  let frontendSenderId = senderId?.toString() || 'unknown';
  if (options.currentUserId && frontendSenderId === options.currentUserId) {
    frontendSenderId = 'me';
  }

  const isRead = backendMessage.readAt ? true : !!backendMessage.read;

  return {
    id: (backendMessage.id || backendMessage._id?.toString() || backendMessage._id).toString(),
    senderId: frontendSenderId,
    text: backendMessage.text,
    timestamp: toTimestamp(backendMessage.createdAt),
    read: isRead,
    // Additional fields for debugging
    _backend: backendMessage,
    _senderName: sender ? sender.name : undefined,
    _readAt: backendMessage.readAt,
  } as any;
};

// Mapping: Backend Notification → Frontend Notification (for bell)
export interface FrontendNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedId?: string;
  isRead: boolean;
  timestamp: number;
  createdAt: number;
  _backend?: any;
}

export const adaptBackendNotificationToFrontend = (backendNotif: any): FrontendNotification => {
  if (!backendNotif) return null as any;

  return {
    id: (backendNotif.id || backendNotif._id?.toString() || backendNotif._id).toString(),
    type: backendNotif.type,
    title: backendNotif.title,
    body: backendNotif.body,
    relatedId: backendNotif.relatedId?.toString(),
    isRead: !!backendNotif.isRead,
    timestamp: toTimestamp(backendNotif.createdAt),
    createdAt: toTimestamp(backendNotif.createdAt),
    _backend: backendNotif,
  };
};

// Mapping: Backend Request (for provider nearby) → Frontend IncomingRequest
export const adaptBackendRequestToIncomingRequest = (backendRequest: any, options: { baseCoords?: Coords } = {}): any => {
  if (!backendRequest) return null as any;

  const customer = backendRequest.customer && typeof backendRequest.customer === 'object' ? backendRequest.customer : null;
  const customerName = customer ? customer.name : 'Customer';
  const [lng, lat] = backendRequest.location?.coordinates || [73.0776, 31.4181];
  const base = options.baseCoords || DEFAULT_COORDS;
  const xy = lngLatToXY(lng, lat, base);

  return {
    id: (backendRequest.id || backendRequest._id?.toString()).toString(),
    customerName: customerName,
    customerAvatar: getInitials(customerName),
    customerColor: stringToColor(customerName),
    category: backendRequest.category,
    description: backendRequest.description,
    location: {
      x: xy.x,
      y: xy.y,
      label: backendRequest.address || 'Customer location',
    },
    address: backendRequest.address || '',
    distanceKm: backendRequest.distanceKm ?? 1.2, // from geo query
    createdAt: toTimestamp(backendRequest.createdAt),
    fee: undefined, // not in backend Request, but frontend IncomingRequest has fee range
    _backend: backendRequest,
    _geoLocation: {
      type: 'Point',
      coordinates: [lng, lat],
      lat,
      lng,
    },
  };
};
