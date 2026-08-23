#!/usr/bin/env bash
# Full regression battery — requires the backend running on :5000 (node dev-inmemory.js)
# Suites are self-isolating (unique phones/ids per run) but a FRESH backend is preferred.
set -u
cd "$(dirname "$0")/.."

TEST_SUITES=(
  tests/e2e-self-test.js
  tests/e2e-bidirectional.js
  tests/final-lifecycle-run.js
  tests/e2e-availability-expiry.js
  tests/offer-withdraw.js
  tests/notification-view-count.js
  tests/fix-p3-city-sync.js
  tests/guard-regression-checks.js        # BUG A (city-override) + BUG B (null-user) guards - DO NOT EDIT
  tests/audit-live-checks.js
  tests/pre-deploy-checks.js
  tests/auth-flow.js                       # Auth-issue fix: isNewUser/setupComplete, linking, dual-token refresh/revoke
  tests/sound-system.js                    # Sound system: 3 distinct tones, wiring guards, dedup/anti-stack, live feed-through
  tests/provider-home-and-price.js         # Flicker fix (silent polls+reconcile+per-id animation) + edited-price chain (777/888)
  tests/offers-visibility-and-card.js      # Zero-offers-before-submit live proof + offer-card layout zone locks
  tests/no-premature-offer.js              # BUG FIX lock: empty offers until provider POSTs; root-cause nav guard (2026-08-23)
  tests/distance-ux.js                     # Distance UX: shared pattern/ETA (18 km/h), 3-way sort, Closest badge, live snapshot proof (2026-08-23)
)

total_pass=0; total_fail=0; failed_suites=()
for s in "${TEST_SUITES[@]}"; do
  echo "════════ $s"
  out="$(node "$s" 2>&1)"; line="$(echo "$out" | grep -Eo '[0-9]+ passed, [0-9]+ failed' | tail -1)"
  echo "  $line"
  p="${line%% passed*}"; f="$(echo "$line" | sed -E 's/.* ([0-9]+) failed/\1/')"
  total_pass=$((total_pass + ${p:-0})); total_fail=$((total_fail + ${f:-0}))
  [ "${f:-1}" = "0" ] || failed_suites+=("$s")
done

echo "════════════════ GRAND TOTAL: $total_pass passed, $total_fail failed"
if [ ${#failed_suites[@]} -gt 0 ]; then printf 'FAILED SUITES: %s\n' "${failed_suites[@]}"; exit 1; fi
echo "ALL GREEN"
