/**
 * setupComplete contract (2026-08-21 Returning-User/Session pass) - the SINGLE source of
 * truth for "does this account still need onboarding steps?" used by verify-otp, google
 * sign-in and GET /auth/me. The frontend routes strictly on this flag for BOTH methods.
 *
 *   customer: name + city set
 *   provider: name + city + category + radiusKm set AND verificationStatus != 'not_submitted'
 *
 * `firstIncompleteStep` tells the frontend exactly WHERE a partial signup resumes:
 *   customer: 'details' (needs name/city) -> otherwise null
 *   provider: 'category' (no category) -> 'verification' (setup done, no document
 *             submitted yet) -> otherwise null
 */
const computeSetupComplete = (user) => {
  if (!user) return false;
  const hasBasics = !!user.name && !!user.city;
  if (user.role === 'provider') {
    return hasBasics && !!user.category && !!user.radiusKm && user.verificationStatus !== 'not_submitted';
  }
  return hasBasics;
};

const firstIncompleteStep = (user) => {
  if (!user || !user.role) return 'details';
  if (!user.name || !user.city) return 'details';
  if (user.role === 'provider') {
    if (!user.category || !user.radiusKm) return 'category';
    if (user.verificationStatus === 'not_submitted') return 'verification';
  }
  return null; // complete
};

module.exports = { computeSetupComplete, firstIncompleteStep };
