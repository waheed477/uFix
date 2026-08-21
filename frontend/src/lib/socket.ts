/**
 * Socket Client - Phase 9 Frontend Integration
 * 
 * Initializes Socket.io client with JWT in `auth: { token }` matching backend's authSocket.js expectation
 * Connect after login, disconnect on logout
 * Central place to register/unregister listeners for all events
 * 
 * Events from backend (per project_context.md Phase 8):
 * - request:new → nearby providers when customer creates request
 * - offer:new → customer when provider offers
 * - offer:accepted → accepted provider
 * - offer:rejected → other providers
 * - request:closed → nearby providers excluding accepted
 * - request:cancelled → providers who offered
 * - job:statusUpdate → both customer & provider
 * - chat:send (client→server), chat:message (server→both), chat:markRead, chat:read, chat:error
 * - notification:new → user for live bell
 * 
 * JWT storage: uses api.ts getToken() which reads from localStorage (standalone Vite app, not artifact)
 */

import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

// Live-preview safe resolution (same rule as api.ts): on a port-proxied preview host the
// browser cannot reach the sandbox's localhost - derive the backend origin from the hostname.
function resolveSocketUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_SOCKET_URL || (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  try {
    const host = window.location.hostname;
    if (/^\d+-.+\.e2b\.app$/.test(host)) {
      return `${window.location.protocol}//${host.replace(/^\d+-/, '5000-')}`;
    }
  } catch {}
  return 'http://localhost:5000';
}

const SOCKET_URL = resolveSocketUrl();

let socket: Socket | null = null;
let isConnecting = false;

type SocketEventCallback = (data: any) => void;

const listeners: Map<string, Set<SocketEventCallback>> = new Map();

function getSocket(): Socket | null {
  return socket;
}

function isSocketConnected(): boolean {
  return !!socket?.connected;
}

function connectSocket(): Socket | null {
  const token = getToken();
  if (!token) {
    console.warn('[Socket] No JWT token, skipping socket connection');
    return null;
  }

  if (socket?.connected) {
    console.log('[Socket] Already connected', socket.id);
    return socket;
  }

  if (isConnecting) {
    console.log('[Socket] Already connecting, skipping');
    return socket;
  }

  isConnecting = true;

  console.log(`[Socket] Connecting to ${SOCKET_URL} with JWT`);

  // Disconnect existing if any
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const newSocket = io(SOCKET_URL, {
    // Function form (socket.io v4.4+): every connect AND every auto-reconnect reads the
    // CURRENT access token, so a refreshed session never reconnects with a stale one.
    auth: (cb: (data: { token: string | null }) => void) => cb({ token: getToken() }),
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  });

  newSocket.on('connect', () => {
    console.log(`[Socket] Connected: ${newSocket.id} (user room: user:{id} auto-joined)`);
    isConnecting = false;

    // Re-register all listeners that were registered before connection
    listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        newSocket.on(event, cb);
      });
    });
  });

  newSocket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected: ${newSocket.id}, reason: ${reason}`);
    isConnecting = false;
  });

  newSocket.on('connect_error', (err) => {
    console.error(`[Socket] Connect error: ${err.message}`);
    isConnecting = false;

    // If auth error, clear token and trigger logout via event
    if (err.message.includes('Authentication error')) {
      console.warn('[Socket] Auth failed, triggering logout');
      window.dispatchEvent(new CustomEvent('ufix:unauthorized'));
    }
  });

  // Global error logging for chat:error
  newSocket.on('chat:error', (err) => {
    console.error('[Socket] chat:error', err);
  });

  socket = newSocket;
  return socket;
}

function disconnectSocket() {
  if (socket) {
    console.log(`[Socket] Disconnecting ${socket.id}`);
    socket.disconnect();
    socket = null;
  }
  isConnecting = false;
  // Clear listeners map? Keep them for next connection, they will be re-registered on connect
  // Alternatively clear, but we keep for auto re-register
}

function on(event: string, callback: SocketEventCallback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(callback);

  // If socket already connected, register immediately
  if (socket) {
    socket.on(event, callback);
  }

  // Return unsubscribe function
  return () => off(event, callback);
}

function off(event: string, callback?: SocketEventCallback) {
  if (!listeners.has(event)) return;

  if (callback) {
    listeners.get(event)!.delete(callback);
    if (socket) {
      socket.off(event, callback);
    }
  } else {
    // Remove all listeners for event
    const callbacks = listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        if (socket) {
          socket.off(event, cb);
        }
      });
    }
    listeners.delete(event);
  }
}

function emit(event: string, data: any, ack?: (response: any) => void) {
  if (!socket || !socket.connected) {
    console.warn(`[Socket] Cannot emit ${event}, socket not connected`);
    if (ack) {
      ack({ status: 'error', error: { message: 'Socket not connected' } });
    }
    return;
  }

  if (ack) {
    socket.emit(event, data, ack);
  } else {
    socket.emit(event, data);
  }
}

// Specific helpers for chat (per Phase 7 spec)
function sendChatMessage(jobId: string, text: string, ack?: (res: any) => void) {
  emit('chat:send', { jobId, text }, ack);
}

function markChatRead(jobId: string, ack?: (res: any) => void) {
  emit('chat:markRead', { jobId }, ack);
}

// Live location sharing for active job - both customer and provider see each other's live location
function sendLocationUpdate(jobId: string, lat: number, lng: number, extra?: { heading?: number; speed?: number; accuracy?: number | null }, ack?: (res: any) => void) {
  emit('job:locationUpdate', { jobId, lat, lng, ...extra }, ack);
}

// Helper to re-authenticate socket after token refresh
function reconnectWithNewToken() {
  disconnectSocket();
  setTimeout(() => {
    connectSocket();
  }, 100);
}

// Export socket client API
export const socketClient = {
  connect: connectSocket,
  disconnect: disconnectSocket,
  getSocket,
  isConnected: isSocketConnected,
  on,
  off,
  emit,
  sendChatMessage,
  markChatRead,
  sendLocationUpdate,
  reconnectWithNewToken,
  getUrl: () => SOCKET_URL,
};

export const getSocketUrl = () => SOCKET_URL;
