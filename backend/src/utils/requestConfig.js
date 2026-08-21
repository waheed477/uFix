/**
 * Shared request configuration constants (no dependencies - safe to require from
 * models, controllers, and utils without creating require cycles).
 */

// How long a request may stay "pending" (no accepted offer) before it is
// auto-expired by the lazy-check-on-read mechanism. Tune here only.
//
// ⚠️ PRODUCTION WARNING (2026-08-21): 2 minutes is a DEMO/TESTING value chosen
// deliberately so flows can be iterated on quickly. It is likely TOO AGGRESSIVE
// for real users - a provider often needs 10-15 minutes just to notice and
// respond to a request. RAISE THIS (e.g. to 10-15) before any real production
// use with real users. Single source of truth - nothing else hardcodes it.
const REQUEST_EXPIRY_MINUTES = 2;

module.exports = { REQUEST_EXPIRY_MINUTES };
