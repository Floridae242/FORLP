# Functional PostgreSQL Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an instructor-ready platform where a demo officer signs in, changes zone percentages, and sees those values survive refresh because they are stored in a real PostgreSQL database.

**Architecture:** Keep the current React/Express UI and API contracts. Add a self-contained PostgreSQL demo stack, a development-only access-code login that creates a normal database session, and integration coverage for the existing transactional zone update. Production continues to use LINE login; the demo endpoint is absent unless both demo environment variables are explicitly enabled.

**Tech Stack:** React 18, Vite 5, Express 4, Node.js 20, PostgreSQL 16, Vitest, Supertest, Docker Compose v2

## Global Constraints

- Preserve the current UI and public API responses unless this plan explicitly extends them.
- Every user-visible write must be awaited before returning success and must be verified by reading PostgreSQL back.
- `POST /api/auth/demo` must return `404` unless `DEMO_MODE=true` and `DEMO_ACCESS_CODE` is non-empty.
- Demo access codes and session tokens must never be logged or committed.
- Demo users use the existing `users` and `user_sessions` tables and the existing bearer-token middleware; no authentication bypass is allowed.
- PostgreSQL is bound to `127.0.0.1:55432` for the local demo and is not exposed to the LAN.
- Production startup must reject a missing `DATABASE_URL` and must not silently continue after a schema statement fails.
- Keep all existing uncommitted user files unchanged.
- Follow RED, GREEN, REFACTOR for every behavior change and run focused tests before the full suite.

---

### Task 1: Reproducible PostgreSQL demo stack and truthful readiness

**Files:**
- Create: `compose.demo.yml`
- Create: `backend/.dockerignore`
- Create: `frontend/.dockerignore`
- Modify: `backend/src/db/index.js`
- Modify: `backend/src/index.js`
- Modify: `backend/test/helpers/schema.js`
- Test: `backend/test/db/connection-config.test.js`

**Interfaces:**
- Produces: `resolveDatabaseSsl(databaseUrl, sslMode, nodeEnv): false | { rejectUnauthorized: boolean }`
- Produces: `GET /ready -> 200 { status: "ready", database: "ok" }` or `503 { status: "not_ready", database: "unavailable" }`
- Produces: Compose services `postgres`, `backend`, and `frontend` with health-gated dependencies.

- [ ] **Step 1: Write failing SSL and readiness tests**

```js
import { describe, expect, it } from 'vitest';
import { resolveDatabaseSsl } from '../../src/db/index.js';

describe('resolveDatabaseSsl', () => {
  it('disables TLS for local PostgreSQL', () => {
    expect(resolveDatabaseSsl('postgresql://forlp:demo@127.0.0.1:55432/forlp', 'disable', 'development')).toBe(false);
  });

  it('requires verified TLS when requested', () => {
    expect(resolveDatabaseSsl('postgresql://example/db', 'verify-full', 'production'))
      .toEqual({ rejectUnauthorized: true });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm --prefix backend test -- test/db/connection-config.test.js`

Expected: FAIL because `resolveDatabaseSsl` is not exported.

- [ ] **Step 3: Centralize database configuration and fail schema initialization atomically**

Implement this public helper in `backend/src/db/index.js` and use it for the application and test helper:

```js
export function resolveDatabaseSsl(databaseUrl, sslMode = 'auto', nodeEnv = 'development') {
  if (sslMode === 'disable') return false;
  if (sslMode === 'verify-full') return { rejectUnauthorized: true };
  if (sslMode === 'require') return { rejectUnauthorized: false };
  if (/^(postgres(?:ql)?:\/\/)(localhost|127\.0\.0\.1|postgres)(?::|\/)/.test(databaseUrl ?? '')) return false;
  return nodeEnv === 'production' || databaseUrl?.includes('supabase')
    ? { rejectUnauthorized: true }
    : false;
}
```

Before constructing the pool, throw `new Error('DATABASE_URL is required')` when the URL is empty. Execute `schema.sql` in one transaction; rollback and throw on the first error instead of logging and continuing.

- [ ] **Step 4: Add database readiness**

Add an async `/ready` route that runs `SELECT 1`. It returns 200 only when PostgreSQL responds; it returns 503 with a fixed public message otherwise. Keep `/health` as process liveness.

- [ ] **Step 5: Add the isolated demo Compose stack**

Create `compose.demo.yml` with PostgreSQL 16 Alpine, backend, and frontend. Use database `forlp`, user `forlp`, local-only password `forlp_demo_only`, a named volume, `pg_isready`, backend `DATABASE_SSL=disable`, and health-gated `depends_on`. Bind ports to `127.0.0.1` only. Do not include AI, monitoring, LINE, or camera services in the default demo.

- [ ] **Step 6: Verify GREEN and configuration**

Run:

```bash
npm --prefix backend test -- test/db/connection-config.test.js
docker compose -f compose.demo.yml config --quiet
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add compose.demo.yml backend/.dockerignore frontend/.dockerignore backend/src/db/index.js backend/src/index.js backend/test/helpers/schema.js backend/test/db/connection-config.test.js
git commit -m "feat: add self-contained postgres demo stack"
```

---

### Task 2: Database-backed instructor demo login

**Files:**
- Modify: `backend/src/config/index.js`
- Modify: `backend/src/services/authService.js`
- Modify: `backend/src/index.js`
- Test: `backend/test/routes/demo-auth.test.js`
- Modify: `frontend/src/contexts/AuthContext.jsx`
- Modify: `frontend/src/pages/SettingsPage.jsx`
- Test: `frontend/src/contexts/AuthContext.test.jsx`

**Interfaces:**
- Consumes: existing `createSession(userId)` and `getUserById(userId)`.
- Produces: `createDemoOfficerSession(): Promise<{ user: User, session: { token: string, expiresAt: string } }>`.
- Produces: `POST /api/auth/demo` with `{ accessCode: string }`.
- Produces: `demoLogin(accessCode): Promise<{ success: boolean, error?: string }>` in `AuthContext`.

- [ ] **Step 1: Write failing backend route tests**

Cover these exact cases in `backend/test/routes/demo-auth.test.js`:

```js
it('is absent when demo mode is disabled', async () => {
  const response = await request(app).post('/api/auth/demo').send({ accessCode: 'anything' });
  expect(response.status).toBe(404);
});

it('creates a verified officer and a durable session for the correct code', async () => {
  const response = await request(app).post('/api/auth/demo').send({ accessCode: process.env.DEMO_ACCESS_CODE });
  expect(response.status).toBe(200);
  expect(response.body.data.user).toMatchObject({ role: 'officer', roleVerified: true });
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${response.body.data.session.token}`);
  expect(me.status).toBe(200);
});
```

Use `vi.resetModules()` and isolated environment setup so enabled and disabled route registration are each evaluated at module load.

- [ ] **Step 2: Run the route test and confirm RED**

Run: `npm --prefix backend test -- test/routes/demo-auth.test.js`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement gated demo authentication**

Add `demoMode` and `demoAccessCode` config values. Register `POST /api/auth/demo` only when both are set. Compare the submitted code with `crypto.timingSafeEqual` after verifying equal byte lengths. On success, transactionally upsert a fixed `line_user_id='demo-instructor'`, `display_name='Instructor Demo'`, `role='officer'`, `role_verified=1`, then create a normal session. Return 401 for a wrong code and the same Thai login failure message for every mismatch.

- [ ] **Step 4: Write failing frontend auth tests**

Test that `demoLogin('correct-code')` stores the returned session and changes `isAuthenticated` to true, and that a 401 response exposes a retryable error without storing any token.

- [ ] **Step 5: Run the frontend test and confirm RED**

Run: `npm --prefix frontend test -- --run src/contexts/AuthContext.test.jsx`

Expected: FAIL because `demoLogin` is missing.

- [ ] **Step 6: Add the explicitly gated demo login UI**

When `VITE_DEMO_MODE === 'true'`, render an access-code password field and `เข้าสู่ระบบสาธิต` button below the LINE button. `demoLogin` must await the response, call the existing `saveSession`, update `user`, and return a result so the button always clears its busy state in `finally`. Keep the demo controls absent in ordinary production builds.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm --prefix backend test -- test/routes/demo-auth.test.js
npm --prefix frontend test -- --run src/contexts/AuthContext.test.jsx
```

Expected: both suites pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/config/index.js backend/src/services/authService.js backend/src/index.js backend/test/routes/demo-auth.test.js frontend/src/contexts/AuthContext.jsx frontend/src/pages/SettingsPage.jsx frontend/src/contexts/AuthContext.test.jsx
git commit -m "feat: add gated instructor demo login"
```

---

### Task 3: Prove click-to-database zone persistence and recover from failures

**Files:**
- Modify: `backend/test/routes/zones.test.js`
- Modify: `frontend/src/components/zones/ZoneHeatmap.jsx`
- Test: `frontend/src/components/zones/ZoneHeatmap.test.jsx`
- Modify: `frontend/src/pages/SettingsPage.jsx`
- Test: `frontend/src/pages/SettingsPage.test.jsx`

**Interfaces:**
- Consumes: bearer session from Task 2 and existing `POST /api/zones/update`.
- Produces: a tested `POST -> GET -> direct SQL` persistence proof.
- Produces: retryable zone loading and login controls after network errors.

- [ ] **Step 1: Replace the incomplete zone POST test with a full persistence test**

Create a verified officer and session in PostgreSQL, send `{ A: 45, B: 35, C: 20 }` to `POST /api/zones/update`, assert 200, call `GET /api/zones/current`, and query `zone_estimates` directly. Assert all three sources contain 45/35/20 and `updated_by='Instructor Demo'`.

Add an invalid `{ A: 90, B: 20, C: 10 }` case and assert the response is 400 and the previously stored rows remain unchanged.

- [ ] **Step 2: Run the backend test and confirm RED**

Run: `npm --prefix backend test -- test/routes/zones.test.js`

Expected: FAIL until the fixture/session helper and route behavior are connected.

- [ ] **Step 3: Make the smallest route/repository correction required**

Keep the existing transaction and parameterized UPSERT. If the new test finds a defect, fix only the failing boundary. Do not replace the response contract.

- [ ] **Step 4: Write failing frontend recovery tests**

Test that a failed initial `getZoneCurrent()` renders `ลองอีกครั้ง`, clicking it retries, and a successful response renders the zone cards and officer update button. Test that failed LINE or demo login restores the enabled button and shows the error.

- [ ] **Step 5: Run the frontend tests and confirm RED**

Run:

```bash
npm --prefix frontend test -- --run src/components/zones/ZoneHeatmap.test.jsx
npm --prefix frontend test -- --run src/pages/SettingsPage.test.jsx
```

Expected: FAIL because the current loading and login states do not recover.

- [ ] **Step 6: Implement retryable click behavior**

Represent zone loading as `{ status: 'loading' | 'ready' | 'error', data, message }`, expose a retry button on error, and preserve the last successful data during later refreshes. Wrap login actions in `try/finally`; only a real browser redirect may leave the LINE button busy.

- [ ] **Step 7: Verify GREEN**

Run all three focused suites and expect 0 failures.

- [ ] **Step 8: Commit**

```bash
git add backend/test/routes/zones.test.js frontend/src/components/zones/ZoneHeatmap.jsx frontend/src/components/zones/ZoneHeatmap.test.jsx frontend/src/pages/SettingsPage.jsx frontend/src/pages/SettingsPage.test.jsx
git commit -m "test: prove zone updates persist in postgres"
```

---

### Task 4: Instructor workflow, complete verification, and deployment guardrails

**Files:**
- Create: `scripts/demo-smoke.sh`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `backend/.env.example`
- Modify: `frontend/.env.example`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `scripts/demo-smoke.sh` which logs in, writes zones, reads zones, and fails unless PostgreSQL returns the same values.
- Produces: one-command startup and reset instructions.

- [ ] **Step 1: Write the smoke script with strict assertions**

The script must use `set -euo pipefail`, call `/ready`, obtain a demo session without printing it, POST 45/35/20, GET the current zones, and use `node -e` to assert the returned percentages. It must print only `PASS: PostgreSQL zone update persisted` on success.

- [ ] **Step 2: Run it against the demo stack and confirm any failure is actionable**

Run:

```bash
docker compose -f compose.demo.yml up --build --wait
DEMO_ACCESS_CODE='<local value>' ./scripts/demo-smoke.sh
```

Expected: the stack becomes healthy and the script prints the single PASS line.

- [ ] **Step 3: Document the exact instructor flow**

Document:

1. Copy `.env.example` to `.env` and set a private `DEMO_ACCESS_CODE`.
2. Run `docker compose -f compose.demo.yml up --build --wait`.
3. Open `http://127.0.0.1:5173/settings` and use Instructor Demo Login.
4. Open the people page, click `อัปเดต`, save 45/35/20, refresh, and show the same values.
5. Run `docker compose -f compose.demo.yml exec -T postgres psql -U forlp -d forlp -c 'TABLE zone_estimates;'` to show the persisted rows.
6. Reset only demo data with `docker compose -f compose.demo.yml down -v`.

State that Render must receive a current Supabase pooler `DATABASE_URL`; never paste credentials into source control.

- [ ] **Step 4: Add CI checks**

Add a GitHub Actions workflow with PostgreSQL 16 service, Node 20, `npm ci` for both packages, backend tests with `PGSCHEMA=forlp_test` and local `DATABASE_SSL=disable`, frontend tests, frontend build, and `docker compose -f compose.demo.yml config --quiet`.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
npm --prefix backend test
npm --prefix frontend test -- --run
npm --prefix frontend run build
docker compose -f compose.demo.yml config --quiet
npm --prefix backend audit --audit-level=high
npm --prefix frontend audit --audit-level=high
git diff --check
```

Expected: all tests and builds pass, Compose config is valid, no high-severity dependency finding is introduced, and `git diff --check` has no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/demo-smoke.sh README.md .env.example backend/.env.example frontend/.env.example .github/workflows/ci.yml
git commit -m "ci: verify the functional postgres demo"
```

---

## Demonstration Acceptance Test

- [ ] PostgreSQL starts with an empty named volume and schema initialization completes without warnings.
- [ ] The demo login route is unavailable unless explicitly enabled.
- [ ] A correct demo code creates a row in `users` and a row in `user_sessions`.
- [ ] Clicking zone update writes three `zone_estimates` rows in one transaction.
- [ ] Refreshing the browser reads the same three values from PostgreSQL.
- [ ] Invalid totals return HTTP 400 and do not change stored rows.
- [ ] Database outage makes `/ready` return 503 and the UI offers retry instead of loading forever.
- [ ] The full backend/frontend test suites and production frontend build pass.

