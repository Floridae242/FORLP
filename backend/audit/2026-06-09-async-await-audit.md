# Backend Audit — 2026-06-09

Run after commits 215080b (Supabase migration) + Phase 1 of reliability plan.
Branch: reliability/tests-audit-hardening.

## Critical (fix inline before tests land)

(none) — no missing-await bugs detected. All `queries.*`, `peopleCountService.*`,
and `authService.*` async call sites are either directly `await`ed or wrapped in
`await Promise.all([...])`. The two known regressions
(`dailyReportService.js:21`, `earlyWarningService.js:546`) were already patched
in commit 215080b and were re-verified by this audit.

## High

(all fixed in Task 26 — see "Fixed in Phase 6" below)

## Medium / Low (punch list — triage later)

- `src/middleware/index.js` — `validatePeopleCountRequest`,
  `validateOfficerTokenRequest`, `validateLineCallbackRequest` are imported in
  `src/index.js:49-51` but never wired to any route. Routes do inline
  `typeof X !== 'string'` checks instead. Either wire the middleware into the
  corresponding `app.post(...)` handlers (DRY) or delete the unused exports.
  (MEDIUM — current inline checks are functional, so no behavioural bug.)
- `src/utils/serviceWrapper.js:119` — `withTransaction(db, fn, ...)` is leftover
  from the better-sqlite3 era. It calls `db.transaction(fn)` synchronously and
  expects a sync `transaction()` return — incompatible with the new
  `pg.Pool`-backed `transaction()` helper in `src/db/index.js:50`. The function
  is exported (`src/utils/index.js:33,66`) but has zero call sites. Delete or
  rewrite against the new pool API. (MEDIUM — dead code, but a footgun if a
  future caller picks it up.)
- `src/services/weatherService.js:17` — hardcoded fallback API key
  `'2e840e910703cfed79919cef0a09f771'` if `OPENWEATHER_API_KEY` is unset.
  Should fail loudly at startup if the var is missing in production.
  (LOW — secret in source.)
- `src/config/index.js:40` — `sessionSecret` defaults to a hardcoded literal
  `'kadkongta-secret-key-2024'` when `SESSION_SECRET` is unset. Same concern:
  refuse to boot in production without a real secret. (LOW.)
- `src/index.js:776` — `earlyWarningService.processCrowdCheck().catch(err => {...})`
  fires after `/api/people/ingest`. Fine pattern (logs `err.message`), but the
  parent handler does not await — by design, since this is fire-and-forget. No
  fix needed; flagged so future readers don't "fix" it. (INFO.)

## Greps run

```bash
# Grep 1: missing await on queries.*
grep -rn 'queries\.\w\+(' src/ --include='*.js' \
  | grep -v 'await queries\.' | grep -v 'import\|export'
#   → 0 hits.

# Grep 2: missing await on async peopleCountService methods
grep -rnE 'peopleCountService\.(getDailySummary|getHistoricalData|getHourlyData|getLatestStats|getDailySummaryMarketHours|getHistoricalDataMarketHours)\(' src/ \
  | grep -v 'await peopleCountService\.'
#   → 2 hits at src/index.js:903-904, both inside `await Promise.all([...])`. Benign.

# Grep 3: missing await on async authService functions
grep -rnE '\b(upsertUser|createSession|getUserById|updateUserRole|verifySession|logoutUser|getUserLineTokens|updateUserLineTokens|deleteSession)\(' src/ \
  | grep -v 'await' | grep -v 'import\|export\|function '
#   → 0 hits.

# Grep 4: empty catch blocks
grep -rnE 'catch\s*(\([^)]*\))?\s*\{\s*\}' src/ --include='*.js'
#   → 0 hits (truly empty).
# Plus multi-line scan via perl: 0 hits.
# Plus targeted single-line "catch { return … }" sweep:
grep -rnE 'catch\s*(\(\w*\))?\s*\{' src/ --include='*.js' | grep -E '\}\s*$'
#   → 3 hits at dailyReportService.js:333/337/341 (filed under HIGH).

# Empty .catch promise chains
grep -rnE '\.catch\s*\(\s*\)\s*$|\.catch\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)' src/ --include='*.js'
#   → 1 hit at peopleCountService.js:271 (filed under HIGH).

# Grep 5: async function declarations (informational)
grep -rn 'async function' src/ --include='*.js'
#   → 70 hits. Brace-walked via node script; flagged:
#     - src/db/index.js:46 execute        — returns Promise directly. OK.
#     - src/services/authService.js:347 getUserLineTokens — returns Promise. OK.
#     - src/utils/serviceWrapper.js:119 withTransaction   — dead code, filed MEDIUM.

# Grep 6: req.body usage
grep -rn 'req\.body\.\|req\.body\b' src/ --include='*.js'
#   → 15 hits. All POST handlers do inline typeof / Array.isArray checks
#     before using the destructured fields. Middleware exists but is unwired
#     (filed MEDIUM).

# Grep 7: process.env usage
grep -rn 'process\.env\.' src/ --include='*.js'
#   → Centralised in src/config/index.js. All vars have || fallbacks except
#     DATABASE_URL (correct — should fail fast). Two LOW issues: hardcoded
#     fallbacks for OPENWEATHER_API_KEY and SESSION_SECRET.
```

## Notes

- Phase 1's smoke test (`test/smoke.test.js`) was used as the regression gate.
  Re-ran after audit completed; still green.
- No code changes were needed for CRITICAL severity. All HIGH and MEDIUM items
  are filed as TODOs for Task 26 (error-handling hardening) and a future
  cleanup pass.
- Triage methodology: each grep result was opened at the reported line and
  inspected for enclosing `await`, `Promise.all`, or fire-and-forget intent.
  False positives (e.g. matches inside `await Promise.all([...])`) were
  discarded.
- Counted: 0 CRITICAL, 4 HIGH, 5 MEDIUM/LOW/INFO.

## Outcome

No CRITICAL findings. No inline fixes required.

## Fixed in Phase 6

- `src/services/dailyReportService.js` — `getLatestReport`, `getReportByDate`, `getRecentReports` now log errors via `console.warn` before returning the null/empty fallback.
- `src/services/peopleCountService.js` — `ai_people_counts` insert catch now logs the error instead of silently discarding.
