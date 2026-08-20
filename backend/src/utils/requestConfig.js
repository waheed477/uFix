/**
 * Shared request configuration constants (no dependencies - safe to require from
 * models, controllers, and utils without creating require cycles).
 */

// How long a request may stay "pending" (no accepted offer) before it is
// auto-expired by the lazy-check-on-read mechanism. Tune here only.
const REQUEST_EXPIRY_MINUTES = 20;

module.exports = { REQUEST_EXPIRY_MINUTES };
