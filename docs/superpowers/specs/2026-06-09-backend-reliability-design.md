# Backend Reliability — Tests, Audit, Hardening

## Motivation

The SQLite → Supabase migration (commit `5178b2a`) shipped with two silent bugs that I only caught during a post-hoc code review:

- `backend/src/services/dailyReportService.js:21` — `getDailySummary` (now async) was called without `await`; `peopleSummary.max_people` resolved to `undefined`, the `|| 0` fallback fired, and every saved daily report would have logged `0/0/0/0` regardless of actual data.
- `backend/src/services/earlyWarningService.js:546` — the same bug on the weekend report path.

Both were fixed in commit `215080b`. No tests would have caught them — the backend has none. A similar migration in the future will introduce the same class of bug.

This spec covers three concurrent workstreams: a manual audit for silent failures, a small focused test suite, and three concrete reliability fixes.

## Scope

**In scope:**
- Backend (`/Users/floridae/FORLP/backend`) only.
- Vitest + Supertest, ~12 tests across unit / service / route tiers.
- Audit pass for missing-await, empty-catch, unvalidated input.
- Three hardening changes: pool tuning, request timeout, empty-catch fixes.

**Out of scope:**
- CI/CD (GitHub Actions). Follow-up after this lands.
- Frontend test expansion. Frontend already has Vitest configured.
- Observability stack, distributed tracing, alerting.
- Retry logic or circuit breakers. Postgres errors usually mean "fix the query," not "retry."
- Replacing the auth state `Map` (in-process, lost on restart) with Redis. Known issue but separate concern.

## Architecture

### Test database isolation

The cleanest way to share one Supabase project between prod and tests: a separate Postgres schema, selected via `PGSCHEMA` env var.

- Production: `PGSCHEMA` unset → defaults to `public`. No behavior change.
- Tests: `PGSCHEMA=forlp_test`. Schema is created on first run, tables are created via the same `schema.sql`, sequences and constraints share definitions with prod.

Mechanism — `db/index.js` appends `?options=-c%20search_path%3D${PGSCHEMA},public` to the `DATABASE_URL` when `PGSCHEMA` is set. Postgres applies the search path at connection time, so it survives pool checkouts and never races. All subsequent queries resolve unqualified table names against the test schema.

Test cleanup: `TRUNCATE` all tables between specs (sequences keep going; that's fine). No `DROP/CREATE` thrash. A `BEGIN; ROLLBACK` health-check at suite start catches leaked state from a previous timeout.

### Directory layout

```text
backend/
├── test/
│   ├── helpers/
│   │   ├── schema.js       # idempotent: create forlp_test, apply schema.sql
│   │   ├── truncate.js     # TRUNCATE all tables RESTART IDENTITY CASCADE
│   │   └── app.js          # exports an Express app instance (no port binding)
│   ├── unit/
│   │   ├── calculateStatus.test.js
│   │   ├── shouldSendAlert.test.js
│   │   └── zoneStatusFromCount.test.js
│   ├── services/
│   │   ├── auth.test.js
│   │   ├── dailyReport.test.js
│   │   ├── peopleCount.test.js
│   │   └── earlyWarning.test.js
│   └── routes/
│       ├── zones.test.js
│       ├── reports.test.js
│       ├── people.test.js
│       └── auth.test.js
├── audit/
│   └── 2026-06-09-async-await-audit.md
└── vitest.config.js
```

### Why Supertest for route tests

Supertest mounts the Express app in-process — no port binding, no race conditions between test files. Tests look like `request(app).post('/api/zones/update').send(...)`. The app instance comes from `test/helpers/app.js` which calls the same setup as `index.js` minus the `listen()` call.

### Mocking boundary

Real:
- Supabase Postgres (via `forlp_test` schema)
- Express route handlers
- Service-layer logic

Mocked:
- LINE Messaging API (`fetch` to `api.line.me`)
- OpenWeather API (`fetch` to `api.openweathermap.org`)
- AI camera service (`fetch` to `CAMERA_API_URL`)

Mocks use Vitest's `vi.mock('node-fetch', ...)` or stub the service-level wrappers (`weatherService.getCurrentWeather`, `sendLineMessage`). Stubbing at the service boundary is cleaner than at the fetch boundary because tests don't need to match wire-level URLs.

## Audit

### Patterns

Each pattern → grep command → severity rule.

| Pattern | Severity if found |
|---|---|
| `queries\.\w+\(` without preceding `await` in the same statement | CRITICAL — these are async DB calls, dropping the await means writes silently no-op or reads return Promises |
| `peopleCountService\.(getDailySummary\|getHistoricalData\|getHourlyData\|getLatestStats\|getDailySummaryMarketHours\|getHistoricalDataMarketHours)\(` without `await` | CRITICAL — same class as the bug we already fixed |
| `(upsertUser\|createSession\|getUserById\|updateUserRole\|verifySession\|logoutUser\|getUserLineTokens\|updateUserLineTokens)\(` without `await` | CRITICAL — async auth functions |
| `catch\s*\(\s*\w*\s*\)\s*\{\s*\}` or `catch\s*\{\s*\}` | HIGH — empty catch blocks swallow errors |
| `async function \w+[^{]*\{[^}]*\}` with zero `await` inside | LOW — usually a refactor leftover, harmless but a smell |
| `req\.body\.[a-zA-Z_]+` in a route handler that has no validation middleware | MEDIUM — crash-on-bad-input |
| `process\.env\.[A-Z_]+` accessed without a fallback or startup check | LOW — misconfig surfaces as `undefined` deep in code |

### Output

`backend/audit/2026-06-09-async-await-audit.md` with this shape:

```markdown
## Critical (fix inline before tests land)
- `path/file.js:LINE` — description — fix
- ...

## High (file as TODO, fix during hardening pass)
- ...

## Medium / Low (punch list for triage)
- ...
```

I fix the CRITICAL items inline before writing tests. HIGH items get fixed during the hardening pass. MEDIUM/LOW go on the punch list.

## Test catalog

### P0 — bug-class regression tests (catch the kind we just hit)

1. **`test/services/dailyReport.test.js`** — seeds three rows into `people_counts` for date `2026-06-08`, calls `generateDailyReport('2026-06-08')`, asserts the saved row in `daily_reports` has `max_people = 200` (not 0). This is the exact test that would have caught the silent-zero bug.
2. **`test/services/earlyWarning.test.js`** — same seed shape, calls the weekend report path, asserts non-zero max.
3. **`test/routes/people.test.js`** — `GET /api/people/daily?date=2026-06-08` after seeding, asserts response shape: `data.date` is the string `"2026-06-08"` (not an ISO timestamp), `data.max_people` is the number `200` (not the string `"200"`). This is the type-coercion regression I fixed in commit `26cade0`.

### P1 — critical paths

4. **`test/services/auth.test.js`** — full session lifecycle: `upsertUser` creates a row, `createSession` returns a token, `verifySession(token)` returns valid + user, `logoutUser(token)` invalidates it, `verifySession(token)` then returns `valid: false`.
5. **`test/services/auth.test.js`** — `updateUserRole(userId, 'officer', 'KKTOFC01')` succeeds, marks token used; calling again with the same token returns "token already used."
6. **`test/routes/zones.test.js`** — `POST /api/zones/update` with mocked officer auth, then `GET /api/zones/current` returns the new values. Verifies the transaction in `updateZoneEstimates` actually commits.

### P2 — pure functions (fast, complete coverage of business rules)

7. **`test/unit/calculateStatus.test.js`** — `calculateStatus` for counts at threshold boundaries (0, 500, 501, 1200, 1201, 2500, 2501).
8. **`test/unit/shouldSendAlert.test.js`** — alert cooldown logic with `Date.now()` mocked via `vi.useFakeTimers()`.
9. **`test/unit/zoneStatusFromCount.test.js`** — every threshold mapping in `index.js:364`.

### P1 — error-path coverage

10. **`test/routes/auth.test.js`** — `POST /api/auth/line/callback` with missing `state` → 400. With valid `state` but bad `code` (LINE token exchange mocked to fail) → 400 + error message in Thai.
11. **`test/routes/zones.test.js`** — `POST /api/zones/update` with A+B+C ≠ 100 → 400. Without officer auth → 403.
12. **`test/services/dailyReport.test.js`** — `isReportSentLine(date)` returns false for a never-saved date, true after `saveDailyReport` + `markReportSentLine`. Pins the behavior of the `row?.is_sent_line === 1` check against future schema changes.

**Total: 12 tests.** Whole suite target: green in under 15 seconds.

## Reliability hardening

Three concrete changes, no refactor.

### 1. Pool tuning + exhaustion logging

Current `db/index.js`:
```js
max: 10,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 5000,
```

Tighten:
- `max: 10` is fine for a single Render dyno but logs nothing when exhausted. Add `pool.on('error', ...)` that logs pool errors to stderr.
- Add `pool.on('connect', ...)` for `SET search_path` (already needed for tests; double-duty).
- Drop `idleTimeoutMillis` to `10000` — Supabase transaction pooler reclaims aggressively, no point holding idle connections.

### 2. Per-request timeout middleware

A hung Supabase call currently pins an Express worker forever. Add:
```js
app.use((req, res, next) => {
    res.setTimeout(30_000, () => {
        if (!res.headersSent) {
            res.status(503).json({ success: false, error: 'Request timeout' });
        }
    });
    next();
});
```

### 3. Empty-catch fixes

Each empty catch found in the audit gets either:
- A `console.warn` with the error message (if the swallow is intentional), or
- A re-throw (if the swallow was a copy-paste oversight).

Decision is per-site, not blanket.

## Execution order

Strictly sequential — each phase informs the next.

| # | Phase | Deliverable | Est. |
|---|---|---|---|
| 1 | Bootstrap | Vitest + Supertest installed. `helpers/schema.js` + `helpers/truncate.js` + `helpers/app.js` written. One smoke test green against `forlp_test` schema. | 30 min |
| 2 | Audit pass | `backend/audit/2026-06-09-async-await-audit.md` produced. CRITICAL findings fixed inline. | 45 min |
| 3 | P0 tests | Tests #1, #2, #3 written and green. | 1 hr |
| 4 | P1 tests | Tests #4, #5, #6, #10, #11, #12 written and green. | 1 hr |
| 5 | P2 tests | Tests #7, #8, #9 written and green. | 30 min |
| 6 | Hardening | Pool tuning, timeout middleware, empty-catch fixes committed. | 30 min |
| 7 | Wire `npm test` | `package.json` scripts updated. `backend/README.md` gets a 1-paragraph testing section. | 15 min |

**Total: ~4.5 hours of focused work.**

## Configuration changes

### `backend/.env` (dev)
Add line:
```
# Empty in production → schema = public
PGSCHEMA=
```

### `backend/.env.example`
Document:
```
PGSCHEMA=                 # leave empty for production; tests set to forlp_test
```

### `backend/package.json` scripts
```json
"scripts": {
    "start": "node src/index.js",
    "test": "PGSCHEMA=forlp_test vitest run",
    "test:watch": "PGSCHEMA=forlp_test vitest"
}
```

### `backend/vitest.config.js`
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/helpers/setup.js'],
        testTimeout: 15_000,
        hookTimeout: 30_000,
        pool: 'threads',
        poolOptions: { threads: { singleThread: true } },  // tests share the test schema; no parallelism
    },
});
```

The `singleThread: true` is non-negotiable — parallel tests would race on the truncate step.

## Success criteria

- `npm test` from `backend/` runs all 12 tests in under 15 seconds, all green.
- The audit report exists at `backend/audit/2026-06-09-async-await-audit.md`. All CRITICAL findings are fixed.
- A future change that drops an `await` on a `queries.*` or `peopleCountService.*` call breaks at least one P0 test.
- Production behavior is unchanged. `PGSCHEMA` defaults to empty/`public`, all existing endpoints respond identically.

## Risk and mitigation

| Risk | Mitigation |
|---|---|
| Test schema accidentally points at `public` and tests truncate prod data | `helpers/truncate.js` asserts `process.env.PGSCHEMA === 'forlp_test'` before issuing TRUNCATE. Fail-closed. |
| Supabase free tier rate limits hit during test runs | Single-threaded pool, ~12 tests × ~5 queries each = ~60 queries per run. Well below limits. |
| `SET search_path` is per-connection but pool checkouts may reuse old connections that ran it under a different schema | Set search_path in the connection string via `?options=-c%20search_path%3D...` so Postgres applies it at connect time. No per-checkout hook needed. |
| Mocking `fetch` for LINE/OpenWeather is brittle | Mock at the service-wrapper boundary (`weatherService.getCurrentWeather`, `sendLineMessage`), not at the fetch layer. Wrapper signatures change rarely; URLs change with version bumps. |
