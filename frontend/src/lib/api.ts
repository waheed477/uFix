/**
 * API Client - Phase 9 Frontend Integration
 * 
 * A small fetch wrapper (not axios) that:
 * - Attaches JWT as Bearer token to every request
 * - Handles base URL from env VITE_API_URL
 * - Centralizes error handling (401 triggers logout)
 * 
 * JWT Storage Decision:
 * This is a standalone Vite app (not a claude.ai artifact), so browser storage restrictions
 * don't apply. We use localStorage for JWT persistence so user stays logged in across refreshes.
 * Alternative would be memory-only (React state) which would log out on refresh - worse UX.
 * For artifact deployment, memory-only would be required, but for standalone Vite, localStorage is appropriate.
 * Documented in project_context.md under Phase 9.
 * 
 * Base URL handling:
 * - Uses import.meta.env.VITE_API_URL || 'http://localhost:5000'
 * - No hardcoded localhost:5000 anywhere else - all requests go through this client
 * - Live-preview safe: when the app is served through a port-proxied preview host
 *   (https://{port}-{sandbox}.e2b.app), the browser is NOT on the sandbox's localhost,
 *   so we derive the backend origin from the preview hostname (port 5000) instead.
 */

function resolveApiBase(): string {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  try {
    const host = window.location.hostname;
    if (/^\d+-.+\.e2b\.app$/.test(host)) {
      return `${window.location.protocol}//${host.replace(/^\d+-/, '5000-')}`;
    }
  } catch {}
  return 'http://localhost:5000';
}

const API_BASE = resolveApiBase();

const TOKEN_KEY = 'ufix_jwt';
const USER_KEY = 'ufix_user';

// Token helpers - exported for socket client and store
export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (e) {
    console.warn('Failed to set token in localStorage', e);
  }
};

export const getStoredUser = (): any | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: any | null) => {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch (e) {
    console.warn('Failed to store user', e);
  }
};

export const clearAuth = () => {
  setToken(null);
  setStoredUser(null);
};

// Central fetch wrapper
interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function apiFetch(path: string, options: FetchOptions = {}) {
  const token = getToken();
  
  // Build URL with query params if provided
  let url = `${API_BASE}${path}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers: Record<string, string> = {
    ...(options.headers as any),
  };

  // Default Content-Type JSON, but allow override for FormData (multipart)
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 - trigger logout
  if (response.status === 401) {
    // Don't auto-logout for auth endpoints themselves (send-otp, verify-otp, google)
    // Only for protected routes
    if (!path.includes('/auth/')) {
      clearAuth();
      // Dispatch event for store to handle logout
      window.dispatchEvent(new CustomEvent('ufix:unauthorized'));
    }
  }

  // Try to parse JSON, but handle empty responses
  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with ${response.status}`) as any;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// API client organized logically
export const api = {
  // Health
  health: () => apiFetch('/api/health'),

  // Auth
  auth: {
    google: (idToken: string, phone?: string, role?: string, name?: string, city?: string) =>
      apiFetch('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken, phone, role, name, city }),
      }),
    sendOtp: (phone: string) =>
      apiFetch('/api/auth/phone/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    verifyOtp: (phone: string, otp: string, name?: string, role?: string, city?: string) =>
      apiFetch('/api/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, otp, name, role, city }),
      }),
    me: () => apiFetch('/api/auth/me'),
  },

  // Users
  users: {
    getProfile: () => apiFetch('/api/users/profile'),
    updateProfile: (data: { name?: string; city?: string; profilePicture?: string; isOnline?: boolean }) =>
      apiFetch('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    uploadPicture: (file: File) => {
      const formData = new FormData();
      formData.append('picture', file);
      return apiFetch('/api/users/profile/picture', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type, browser will set multipart boundary
        headers: {} as any,
      });
    },
    updateLocation: (lng: number, lat: number) =>
      apiFetch('/api/users/location', {
        method: 'PATCH',
        body: JSON.stringify({ lng, lat }),
      }),
  },

  // Providers
  providers: {
    setup: (data: { category?: string; radiusKm?: number; yearsExperience?: number }) =>
      apiFetch('/api/providers/setup', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    uploadDocument: (file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      return apiFetch('/api/providers/document', {
        method: 'POST',
        body: formData,
        headers: {} as any,
      });
    },
    verificationStatus: () => apiFetch('/api/providers/verification-status'),
    // NEW: Available providers by city - for customer to see online providers in same city
    available: (params?: { city?: string; category?: string }) =>
      apiFetch('/api/providers/available', {
        params: params as any,
      }),
    // DEV ONLY - auto-verify current provider for local testing (no admin secret needed)
    devAutoVerify: () =>
      apiFetch('/api/providers/dev/verify-me', {
        method: 'POST',
      }),
  },

  // Requests
  requests: {
    create: (data: { category: string; description: string; lng: number; lat: number; address?: string; city?: string }) =>
      apiFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    nearby: (params?: { radiusKm?: number }) =>
      apiFetch('/api/requests/nearby', {
        params: params as any,
      }),
    my: () => apiFetch('/api/requests/my'),
    getOne: (id: string) => apiFetch(`/api/requests/${id}`),
    cancel: (id: string) =>
      apiFetch(`/api/requests/${id}/cancel`, {
        method: 'PATCH',
      }),
    // NEW: Direct accept - customer directly books provider with price from profile (provider discovery model)
    directAccept: (requestId: string, providerId: string) =>
      apiFetch(`/api/requests/${requestId}/direct-accept`, {
        method: 'POST',
        body: JSON.stringify({ providerId }),
      }),
  },

  // Offers
  offers: {
    create: (requestId: string, data: { visitingCharge: number; etaMinutes: number }) =>
      apiFetch(`/api/requests/${requestId}/offers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getForRequest: (requestId: string) => apiFetch(`/api/requests/${requestId}/offers`),
    accept: (offerId: string) =>
      apiFetch(`/api/offers/${offerId}/accept`, {
        method: 'PATCH',
      }),
    // NEW: Decline a single pending offer (request stays open for other offers)
    decline: (offerId: string) =>
      apiFetch(`/api/offers/${offerId}/decline`, {
        method: 'PATCH',
      }),
  },

  // Jobs
  jobs: {
    getOne: (id: string) => apiFetch(`/api/jobs/${id}`),
    updateStatus: (id: string, status: string) =>
      apiFetch(`/api/jobs/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    myActive: () => apiFetch('/api/jobs/my/active'),
    history: (params?: { status?: 'all' | 'completed' | 'cancelled'; page?: number; limit?: number }) =>
      apiFetch('/api/jobs/history', {
        params: params as any,
      }),
    rate: (jobId: string, data: { rating: number; comment?: string }) =>
      apiFetch(`/api/jobs/${jobId}/rate`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getReviews: (jobId: string) => apiFetch(`/api/jobs/${jobId}/reviews`),
  },

  // Messages (Chat history)
  messages: {
    history: (jobId: string, params?: { before?: string; limit?: number }) =>
      apiFetch(`/api/jobs/${jobId}/messages`, {
        params: params as any,
      }),
  },

  // Notifications
  notifications: {
    list: (params?: { page?: number; limit?: number }) =>
      apiFetch('/api/notifications', {
        params: params as any,
      }),
    markRead: (id: string) =>
      apiFetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      }),
    markAllRead: () =>
      apiFetch('/api/notifications/read-all', {
        method: 'PATCH',
      }),
  },
};

// Export base URL for debugging
export const getApiBase = () => API_BASE;
