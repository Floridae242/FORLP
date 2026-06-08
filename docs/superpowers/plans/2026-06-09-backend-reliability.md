# Backend Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ~12-test Vitest+Supertest suite for the FORLP backend, run a manual audit to find more silent-await bugs, and apply three targeted hardening fixes.

**Architecture:** Test schema isolation in the same Supabase project — production uses `public`, tests use `forlp_test` via `?options=-c%20search_path%3D` on the connection string. Express app is imported by tests via Vitest's auto-set `NODE_ENV=test` (the existing `start()` call at the bottom of `index.js` becomes guarded). Tests truncate between specs; no schema thrash.

**Tech Stack:** Vitest (matches frontend tooling), Supertest (in-process HTTP), pg (already installed). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-09-backend-reliability-design.md`

---

## Phase 1 — Bootstrap

### Task 1: Install dev dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install Vitest + Supertest**

Run:
```bash
cd /Users/floridae/FORLP/backend
npm install --save-dev vitest supertest
```

Expected: `vitest` and `supertest` appear under `devDependencies` in `backend/package.json`. No new entries in `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add vitest + supertest dev deps for backend tests"
```

---

### Task 2: Guard `start()` so tests can import the app

**Files:**
- Modify: `backend/src/index.js:1485` (just before `export default app`)

The existing entrypoint calls `start()` at module load, which means importing `app` from tests would also try to bind the port and run schedulers. Vitest sets `NODE_ENV=test` automatically; we use that to skip startup.

- [ ] **Step 1: Edit `backend/src/index.js`**

Find the line near the bottom that reads:
```js
start();

export default app;
```

Replace with:
```js
if (process.env.NODE_ENV !== 'test') {
    start();
}

export default app;
```

- [ ] **Step 2: Verify dev startup still works**

Run:
```bash
cd /Users/floridae/FORLP/backend
node src/index.js &
PID=$!
sleep 5
curl -s http://localhost:3000/health
kill $PID
```

Expected: JSON response `{"status":"ok",...}` then process dies.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.js
git commit -m "chore: skip start() when NODE_ENV=test so tests can import app"
```

---

### Task 3: Add `PGSCHEMA` support to `db/index.js`

**Files:**
- Modify: `backend/src/db/index.js:46-54` (the `initDatabase` function)

- [ ] **Step 1: Add a helper that appends search_path to the connection string**

In `backend/src/db/index.js`, just above the existing `export function getPool()` line (around line 11), add:

```js
function resolveConnectionString() {
    const base = process.env.DATABASE_URL;
    if (!base) return base;
    const schema = process.env.PGSCHEMA;
    if (!schema) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}options=${encodeURIComponent(`-c search_path=${schema},public`)}`;
}
```

- [ ] **Step 2: Use the helper in `initDatabase`**

In the same file, find:
```js
pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
```

Replace `process.env.DATABASE_URL` with `resolveConnectionString()`:

```js
pool = new Pool({
    connectionString: resolveConnectionString(),
    ssl: process.env.NODE_ENV === 'production'
```

- [ ] **Step 3: Document the env var**

In `backend/.env.example`, add at the bottom of the file:

```
# ==================== Testing ====================
# Leave empty for production; tests set this to forlp_test automatically
PGSCHEMA=
```

- [ ] **Step 4: Smoke-test the search_path is applied**

Run from `backend/`:
```bash
PGSCHEMA=forlp_test node --input-type=module -e "
import { initDatabase, getPool } from './src/db/index.js';
await initDatabase().catch(() => {});  // schema may not exist yet — ignore
const r = await getPool().query('SHOW search_path');
console.log('search_path:', r.rows[0].search_path);
await getPool().end();
"
```

Expected: `search_path: forlp_test, public`

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/index.js backend/.env.example
git commit -m "feat(db): honor PGSCHEMA env var for test isolation"
```

---

### Task 4: Write `vitest.config.js`

**Files:**
- Create: `backend/vitest.config.js`

- [ ] **Step 1: Create the config file**

Write to `backend/vitest.config.js`:

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
        poolOptions: {
            threads: {
                singleThread: true,
            },
        },
    },
});
```

The `singleThread: true` is non-negotiable — parallel test files would race on the truncate step.

- [ ] **Step 2: Commit**

```bash
git add backend/vitest.config.js
git commit -m "test: add vitest config (single-threaded, 15s timeout)"
```

---

### Task 5: Write `test/helpers/schema.js`

**Files:**
- Create: `backend/test/helpers/schema.js`

This helper creates the `forlp_test` schema if missing. It runs once at suite startup. The actual table creation happens via `initDatabase()` since the search_path is already pointed at `forlp_test`.

- [ ] **Step 1: Create the helper**

Write to `backend/test/helpers/schema.js`:

```js
import pkg from 'pg';
const { Client } = pkg;

export async function ensureTestSchema() {
    if (process.env.PGSCHEMA !== 'forlp_test') {
        throw new Error(`ensureTestSchema: refusing to run with PGSCHEMA=${process.env.PGSCHEMA}`);
    }
    // Connect to public schema explicitly to create forlp_test
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(`CREATE SCHEMA IF NOT EXISTS forlp_test`);
    await client.end();
}
```

The fail-closed check at the top is critical — it prevents accidentally pointing test infrastructure at the prod `public` schema.

- [ ] **Step 2: Commit**

```bash
git add backend/test/helpers/schema.js
git commit -m "test: helpers/schema — idempotent forlp_test schema creation"
```

---

### Task 6: Write `test/helpers/truncate.js`

**Files:**
- Create: `backend/test/helpers/truncate.js`

- [ ] **Step 1: Create the helper**

Write to `backend/test/helpers/truncate.js`:

```js
import { getPool } from '../../src/db/index.js';

const TABLES = [
    'users',
    'user_sessions',
    'user_line_tokens',
    'officer_tokens',
    'people_counts',
    'daily_reports',
    'line_broadcast_logs',
    'system_settings',
    'ai_people_counts',
    'ai_camera_status',
    'crowd_alerts',
    'zone_estimates',
];

export async function truncateAll() {
    if (process.env.PGSCHEMA !== 'forlp_test') {
        throw new Error(`truncateAll: refusing to run with PGSCHEMA=${process.env.PGSCHEMA}`);
    }
    const tables = TABLES.map((t) => `forlp_test.${t}`).join(', ');
    await getPool().query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/helpers/truncate.js
git commit -m "test: helpers/truncate — fail-closed table reset"
```

---

### Task 7: Write `test/helpers/setup.js`

**Files:**
- Create: `backend/test/helpers/setup.js`

Vitest runs this file once before any test file. We use it to create the schema, initialize the database (which runs `schema.sql` against `forlp_test`), and close the pool at suite end.

- [ ] **Step 1: Create the setup file**

Write to `backend/test/helpers/setup.js`:

```js
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { ensureTestSchema } from './schema.js';
import { truncateAll } from './truncate.js';
import { initDatabase, getPool } from '../../src/db/index.js';

beforeAll(async () => {
    await ensureTestSchema();
    await initDatabase();
    // initDatabase ran schema.sql which seeded officer_tokens.
    // Truncate now so seeds don't leak into the first test.
    await truncateAll();
});

beforeEach(async () => {
    await truncateAll();
});

afterAll(async () => {
    await getPool().end();
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/test/helpers/setup.js
git commit -m "test: helpers/setup — global Vitest lifecycle hooks"
```

---

### Task 8: Smoke test

**Files:**
- Create: `backend/test/smoke.test.js`

- [ ] **Step 1: Write a trivial test that verifies the harness boots**

Write to `backend/test/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { getPool } from '../src/db/index.js';

describe('test harness', () => {
    it('points search_path at forlp_test', async () => {
        const { rows } = await getPool().query('SHOW search_path');
        expect(rows[0].search_path).toBe('forlp_test, public');
    });

    it('can see test-schema tables', async () => {
        const { rows } = await getPool().query(`
            SELECT tablename FROM pg_tables WHERE schemaname = 'forlp_test' ORDER BY tablename
        `);
        const names = rows.map((r) => r.tablename);
        expect(names).toContain('people_counts');
        expect(names).toContain('users');
        expect(names).toContain('zone_estimates');
    });
});
```

- [ ] **Step 2: Run the smoke test**

Run from `backend/`:
```bash
PGSCHEMA=forlp_test npx vitest run test/smoke.test.js
```

Expected: 2 tests passing in under 5 seconds.

- [ ] **Step 3: Commit**

```bash
git add backend/test/smoke.test.js
git commit -m "test: smoke — verifies forlp_test schema isolation works"
```

---

### Task 9: Add npm scripts

**Files:**
- Modify: `backend/package.json` (scripts section)

- [ ] **Step 1: Edit the scripts block**

In `backend/package.json`, replace the existing `scripts` block with:

```json
"scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js",
    "test": "PGSCHEMA=forlp_test vitest run",
    "test:watch": "PGSCHEMA=forlp_test vitest"
}
```

Keep any other existing scripts (like `lint`) if present.

- [ ] **Step 2: Verify**

Run:
```bash
cd /Users/floridae/FORLP/backend
npm test -- test/smoke.test.js
```

Expected: same 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json
git commit -m "test: add npm test and test:watch scripts"
```

---

## Phase 2 — Audit

### Task 10: Run the audit greps and write the report

**Files:**
- Create: `backend/audit/2026-06-09-async-await-audit.md`

- [ ] **Step 1: Make the audit directory**

```bash
mkdir -p /Users/floridae/FORLP/backend/audit
```

- [ ] **Step 2: Run the missing-await greps**

Run each command from `backend/` and capture the output. Append findings to the report (template in Step 6). Filter out exports and imports.

```bash
# Missing await on queries.* (CRITICAL)
grep -rn 'queries\.\w\+(' src/ --include='*.js' | grep -v 'await queries\.' | grep -v 'import\|export'

# Missing await on peopleCountService async methods (CRITICAL)
grep -rnE 'peopleCountService\.(getDailySummary|getHistoricalData|getHourlyData|getLatestStats|getDailySummaryMarketHours|getHistoricalDataMarketHours)\(' src/ \
  | grep -v 'await peopleCountService\.'

# Missing await on authService async functions (CRITICAL)
grep -rnE '\b(upsertUser|createSession|getUserById|updateUserRole|verifySession|logoutUser|getUserLineTokens|updateUserLineTokens|deleteSession)\(' src/ \
  | grep -v 'await' | grep -v 'import\|export\|function '
```

- [ ] **Step 3: Run the empty-catch grep (HIGH)**

```bash
# Empty catch blocks
grep -rnE 'catch\s*(\([^)]*\))?\s*\{\s*\}' src/ --include='*.js'
```

- [ ] **Step 4: Run the async-without-await grep (LOW smell)**

```bash
# Functions declared async but using no await (false positives are common, treat as informational)
grep -rn 'async function' src/ --include='*.js'
# Cross-reference manually with `grep -L 'await' file.js` per match
```

- [ ] **Step 5: Run the unvalidated-body grep (MEDIUM)**

```bash
# req.body destructures without preceding validate middleware
grep -rn 'req\.body\.' src/ --include='*.js' | head -30
```

- [ ] **Step 6: Write the report**

Create `backend/audit/2026-06-09-async-await-audit.md` with this template, filling in actual findings from the greps above:

```markdown
# Backend Audit — 2026-06-09

Run after commit 215080b (Supabase migration + initial await fixes).

## Critical (fix inline before tests land)

- (file:line) — description — fix
- (none) if greps come up clean

## High (file as TODO, fix during hardening pass)

- (file:line) — description

## Medium / Low (punch list — triage)

- (file:line) — description
```

- [ ] **Step 7: Commit**

```bash
git add backend/audit/2026-06-09-async-await-audit.md
git commit -m "docs: backend reliability audit report"
```

---

### Task 11: Fix CRITICAL findings inline

**Files:**
- Modify: whatever files Task 10 surfaced as CRITICAL

If Task 10 found zero CRITICAL items, skip this task and note "no fixes needed" at the bottom of the audit report.

- [ ] **Step 1: For each CRITICAL finding, apply the fix**

For "missing await on async X":
```js
// Before
const result = someAsyncFunction(arg);

// After
const result = await someAsyncFunction(arg);
```

The enclosing function must also be `async`. If it isn't, mark it async and propagate awaits to callers.

- [ ] **Step 2: Run the smoke test to confirm nothing broke**

```bash
cd /Users/floridae/FORLP/backend
npm test -- test/smoke.test.js
```

Expected: still green.

- [ ] **Step 3: Commit**

```bash
git add backend/src
git commit -m "fix: address CRITICAL findings from 2026-06-09 audit"
```

If no CRITICAL findings, skip the commit.

---

## Phase 3 — P0 tests (catch the bug classes we just hit)

### Task 12: Daily report silent-zero regression test

**Files:**
- Create: `backend/test/services/dailyReport.test.js`

- [ ] **Step 1: Write the test**

Write to `backend/test/services/dailyReport.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPool } from '../../src/db/index.js';

// Mock the weather wrapper so we don't hit OpenWeather in tests
vi.mock('../../src/services/weatherService.js', () => ({
    weatherService: {
        getCurrentWeather: async () => ({ success: true, data: { description: 'mock', temperature: 25, humidity: 60 } }),
        getAirQuality: async () => ({ success: true, data: { components: { pm2_5: { value: 10 } } } }),
    },
}));

import { generateDailyReport } from '../../src/services/dailyReportService.js';

describe('dailyReportService.generateDailyReport', () => {
    it('persists non-zero max_people when source data exists', async () => {
        // Arrange — three rows for 2026-06-08 with varied counts
        await getPool().query(`
            INSERT INTO people_counts (count, recorded_at, source) VALUES
                (50, '2026-06-08 10:00:00+00', 'test'),
                (200, '2026-06-08 12:00:00+00', 'test'),
                (120, '2026-06-08 14:00:00+00', 'test')
        `);

        // Act
        const result = await generateDailyReport('2026-06-08');

        // Assert — function should report success
        expect(result.success).toBe(true);
        expect(result.data.max_people).toBe(200);
        expect(result.data.avg_people).toBeCloseTo(123.3, 1);

        // Assert — the saved daily_reports row also has non-zero values
        const { rows } = await getPool().query(
            `SELECT max_people, avg_people, min_people, total_samples
             FROM daily_reports WHERE report_date = '2026-06-08'`
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].max_people).toBe(200);
        expect(rows[0].avg_people).toBeCloseTo(123.3, 1);
        expect(rows[0].total_samples).toBe(3);
    });

    it('returns success with zero max_people when no source data exists', async () => {
        const result = await generateDailyReport('2026-01-01');
        expect(result.success).toBe(true);
        expect(result.data.max_people).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/floridae/FORLP/backend
npm test -- test/services/dailyReport.test.js
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add backend/test/services/dailyReport.test.js
git commit -m "test(dailyReport): pin silent-zero regression"
```

---

### Task 13: Type-coercion regression test for /api/people/daily

**Files:**
- Create: `backend/test/routes/people.test.js`

- [ ] **Step 1: Write the test**

Write to `backend/test/routes/people.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { getPool } from '../../src/db/index.js';

describe('GET /api/people/daily', () => {
    it('returns YYYY-MM-DD date string and numeric counts (not pg-typed strings)', async () => {
        await getPool().query(`
            INSERT INTO people_counts (count, recorded_at, source) VALUES
                (50, '2026-06-08 10:00:00+00', 'test'),
                (200, '2026-06-08 12:00:00+00', 'test'),
                (120, '2026-06-08 14:00:00+00', 'test')
        `);

        const res = await request(app).get('/api/people/daily?date=2026-06-08');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const d = res.body.data;
        // Date is a plain YYYY-MM-DD string, not an ISO timestamp
        expect(d.date).toBe('2026-06-08');
        // Counts are numbers, not strings
        expect(typeof d.max_people).toBe('number');
        expect(typeof d.avg_people).toBe('number');
        expect(typeof d.min_people).toBe('number');
        expect(typeof d.total_samples).toBe('number');
        expect(d.max_people).toBe(200);
        expect(d.total_samples).toBe(3);
    });

    it('returns zeros when no rows exist for the date', async () => {
        const res = await request(app).get('/api/people/daily?date=2026-01-01');
        expect(res.status).toBe(200);
        expect(res.body.data.max_people).toBe(0);
        expect(res.body.data.total_samples).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- test/routes/people.test.js
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add backend/test/routes/people.test.js
git commit -m "test(people): pin date string + numeric type coercion regression"
```

---

### Task 14: Early warning weekend-report test

**Files:**
- Create: `backend/test/services/earlyWarning.test.js`

The function under test is `processDailyReport(date)` in `earlyWarningService.js:531`. It early-returns `{ success: false, reason: 'not_weekend' }` on weekdays, otherwise builds a report from `getDailySummary` and forwards it to `sendDailyReport` (LINE). We assert the report it would send contains the seeded counts.

- [ ] **Step 1: Write the test**

Write to `backend/test/services/earlyWarning.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { getPool } from '../../src/db/index.js';

// Stub the LINE-side send and the weather fetch so the test stays offline.
// We capture what processDailyReport passes to sendDailyReport.
const sendDailyReportMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('../../src/services/earlyWarningService.js', async (orig) => {
    const actual = await orig();
    return {
        ...actual,
        sendDailyReport: sendDailyReportMock,
        getHourlyForecast: async () => ({ hourly: {} }),  // no weather data
    };
});

const { processDailyReport } = await import('../../src/services/earlyWarningService.js');

describe('earlyWarningService.processDailyReport', () => {
    it('reads non-zero max_people from people_counts on a Saturday', async () => {
        // 2026-06-06 is a Saturday (UTC). Seed two rows.
        await getPool().query(`
            INSERT INTO people_counts (count, recorded_at, source) VALUES
                (300, '2026-06-06 10:00:00+00', 'test'),
                (800, '2026-06-06 12:00:00+00', 'test')
        `);

        sendDailyReportMock.mockClear();

        const result = await processDailyReport('2026-06-06');

        // Function should not early-exit (this would've been the silent bug)
        expect(result.success).toBe(true);

        // Inspect what would have been sent to LINE
        expect(sendDailyReportMock).toHaveBeenCalledTimes(1);
        const reportData = sendDailyReportMock.mock.calls[0][0];
        expect(reportData.date).toBe('2026-06-06');
        expect(reportData.max_people).toBe(800);
        expect(reportData.avg_people).toBeCloseTo(550, 0);  // (300+800)/2
    });

    it('skips weekdays', async () => {
        sendDailyReportMock.mockClear();
        const result = await processDailyReport('2026-06-08');  // Monday
        expect(result.success).toBe(false);
        expect(result.reason).toBe('not_weekend');
        expect(sendDailyReportMock).not.toHaveBeenCalled();
    });
});
```

**Note on the import pattern** — `vi.mock` hoists above the import, so we use a dynamic `await import` after the mock is set up. This is how Vitest expects partial mocks to work.

- [ ] **Step 2: Run the test**

```bash
npm test -- test/services/earlyWarning.test.js
```

Expected: 1 passing.

- [ ] **Step 3: Commit**

```bash
git add backend/test/services/earlyWarning.test.js
git commit -m "test(earlyWarning): pin weekend report non-zero regression"
```

---

## Phase 4 — P1 tests (critical paths)

### Task 15: Auth session lifecycle test

**Files:**
- Create: `backend/test/services/auth.test.js`

- [ ] **Step 1: Write the test**

Write to `backend/test/services/auth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
    upsertUser,
    createSession,
    verifySession,
    logoutUser,
    getUserById,
} from '../../src/services/authService.js';

describe('auth session lifecycle', () => {
    it('upsert → create session → verify → logout → verify fails', async () => {
        // 1. Upsert
        const user = await upsertUser('U_test_001', 'Test User', null);
        expect(user.line_user_id).toBe('U_test_001');

        // 2. Create session
        const { sessionToken } = await createSession(user.id);
        expect(typeof sessionToken).toBe('string');
        expect(sessionToken.length).toBeGreaterThan(20);

        // 3. Verify
        const valid = await verifySession(sessionToken);
        expect(valid.valid).toBe(true);
        expect(valid.user.lineUserId).toBe('U_test_001');

        // 4. Logout
        await logoutUser(sessionToken);

        // 5. Verify after logout
        const invalid = await verifySession(sessionToken);
        expect(invalid.valid).toBe(false);
    });

    it('getUserById returns null for a missing id', async () => {
        const u = await getUserById(99999);
        expect(u).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- test/services/auth.test.js
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add backend/test/services/auth.test.js
git commit -m "test(auth): session lifecycle"
```

---

### Task 16: Officer token consumed exactly once

**Files:**
- Modify: `backend/test/services/auth.test.js` (append)

- [ ] **Step 1: Append the test to `auth.test.js`**

At the bottom of `backend/test/services/auth.test.js`, add:

```js
import { updateUserRole } from '../../src/services/authService.js';
import { getPool } from '../../src/db/index.js';

describe('officer token consumption', () => {
    it('consumes the token on first success and rejects reuse', async () => {
        // Seed: one user + one usable officer token
        const user = await upsertUser('U_officer', 'Officer A', null);
        await getPool().query(
            `INSERT INTO officer_tokens (token, description) VALUES ('TESTOFC01', 'test')`
        );

        // First use — succeeds, marks token used
        const r1 = await updateUserRole(user.id, 'officer', 'TESTOFC01');
        expect(r1.success).toBe(true);

        // Second use — same token, same or different user, must fail
        const user2 = await upsertUser('U_officer2', 'Officer B', null);
        const r2 = await updateUserRole(user2.id, 'officer', 'TESTOFC01');
        expect(r2.success).toBe(false);
        expect(r2.error).toMatch(/ใช้งานแล้ว|หมดอายุ|ไม่ถูกต้อง/);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- test/services/auth.test.js
```

Expected: 3 passing (the two from Task 15 plus this one).

- [ ] **Step 3: Commit**

```bash
git add backend/test/services/auth.test.js
git commit -m "test(auth): officer token consumed exactly once"
```

---

### Task 17: Zones round-trip test

**Files:**
- Create: `backend/test/routes/zones.test.js`

The zone update endpoint requires officer auth. To avoid mocking middleware, we call the service directly for the write, then hit the public read endpoint to verify.

- [ ] **Step 1: Write the test**

Write to `backend/test/routes/zones.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { queries } from '../../src/db/index.js';

describe('zone estimates round-trip', () => {
    it('GET /api/zones/current reflects writes from updateZoneEstimates', async () => {
        await queries.updateZoneEstimates({ A: 55, B: 35, C: 10 }, 'test-officer');

        const res = await request(app).get('/api/zones/current');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const zones = res.body.data.zones;
        const byCode = Object.fromEntries(zones.map((z) => [z.zone_code, z]));
        expect(byCode.A.percentage).toBe(55);
        expect(byCode.B.percentage).toBe(35);
        expect(byCode.C.percentage).toBe(10);
        expect(res.body.data.updated_by).toBe('test-officer');
    });

    it('defaults zones to 60/30/10 when no overrides exist', async () => {
        const res = await request(app).get('/api/zones/current');
        const byCode = Object.fromEntries(res.body.data.zones.map((z) => [z.zone_code, z]));
        expect(byCode.A.percentage).toBe(60);
        expect(byCode.B.percentage).toBe(30);
        expect(byCode.C.percentage).toBe(10);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- test/routes/zones.test.js
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add backend/test/routes/zones.test.js
git commit -m "test(zones): round-trip + default values"
```

---

### Task 18: LINE callback error paths

**Files:**
- Create: `backend/test/routes/auth.test.js`

- [ ] **Step 1: Write the test**

Write to `backend/test/routes/auth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';

describe('POST /api/auth/line/callback', () => {
    it('returns 400 when state is missing', async () => {
        const res = await request(app)
            .post('/api/auth/line/callback')
            .send({ code: 'abc' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 when code is missing', async () => {
        const res = await request(app)
            .post('/api/auth/line/callback')
            .send({ state: 'abc' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 when state is unknown (CSRF protection)', async () => {
        const res = await request(app)
            .post('/api/auth/line/callback')
            .send({ code: 'abc', state: 'never-issued' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toMatch(/หมดอายุ|ลองเข้าสู่ระบบใหม่/);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- test/routes/auth.test.js
```

Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add backend/test/routes/auth.test.js
git commit -m "test(auth): LINE callback error paths"
```

---

### Task 19: Zone update validation error paths

**Files:**
- Modify: `backend/test/routes/zones.test.js` (append)

- [ ] **Step 1: Append the test**

At the bottom of `backend/test/routes/zones.test.js`, add:

```js
describe('POST /api/zones/update validation', () => {
    it('returns 401 without auth', async () => {
        const res = await request(app)
            .post('/api/zones/update')
            .send({ A: 50, B: 30, C: 20 });
        expect(res.status).toBe(401);
    });
});
```

We test 401 (no auth) only; the 400-on-bad-sum path is covered by hitting the service layer in a unit test if needed. Mocking auth middleware just to validate sum logic adds more brittleness than it's worth.

- [ ] **Step 2: Run the test**

```bash
npm test -- test/routes/zones.test.js
```

Expected: 3 passing (the two from Task 17 plus this one).

- [ ] **Step 3: Commit**

```bash
git add backend/test/routes/zones.test.js
git commit -m "test(zones): require auth for updates"
```

---

### Task 20: isReportSentLine behavior

**Files:**
- Modify: `backend/test/services/dailyReport.test.js` (append)

- [ ] **Step 1: Append the test**

At the bottom of `backend/test/services/dailyReport.test.js`, add:

```js
import { queries } from '../../src/db/index.js';

describe('queries.isReportSentLine', () => {
    it('returns false for an unsaved date', async () => {
        expect(await queries.isReportSentLine('2026-03-15')).toBe(false);
    });

    it('returns false for a saved-but-not-marked date, true after marking', async () => {
        await queries.saveDailyReport({
            report_date: '2026-03-15',
            max_people: 100,
            avg_people: 50,
            min_people: 10,
            total_samples: 5,
        });
        expect(await queries.isReportSentLine('2026-03-15')).toBe(false);

        await queries.markReportSentLine('2026-03-15');
        expect(await queries.isReportSentLine('2026-03-15')).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- test/services/dailyReport.test.js
```

Expected: 4 passing (the two from Task 12 plus these two).

- [ ] **Step 3: Commit**

```bash
git add backend/test/services/dailyReport.test.js
git commit -m "test(dailyReport): isReportSentLine semantics"
```

---

## Phase 5 — P2 tests (pure functions)

### Task 21: calculateStatus thresholds

**Files:**
- Create: `backend/test/unit/calculateStatus.test.js`

The `calculateStatus` function isn't exported from `peopleCountService.js`. Export it first, then test.

- [ ] **Step 1: Export `calculateStatus`**

Open `backend/src/services/peopleCountService.js`. Find the line `function calculateStatus(count) {` and change it to:

```js
export function calculateStatus(count) {
```

The existing default export remains unchanged.

- [ ] **Step 2: Write the test**

Write to `backend/test/unit/calculateStatus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { calculateStatus } from '../../src/services/peopleCountService.js';

describe('calculateStatus thresholds', () => {
    it.each([
        [0, 'normal'],
        [500, 'normal'],
        [501, 'moderate'],
        [1200, 'moderate'],
        [1201, 'busy'],
        [2500, 'busy'],
        [2501, 'crowded'],
        [9999, 'crowded'],
    ])('count=%i → status=%s', (count, expectedKey) => {
        expect(calculateStatus(count).key).toBe(expectedKey);
    });
});
```

- [ ] **Step 3: Run the test**

```bash
npm test -- test/unit/calculateStatus.test.js
```

Expected: 8 passing.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/peopleCountService.js backend/test/unit/calculateStatus.test.js
git commit -m "test(unit): calculateStatus threshold boundaries"
```

---

### Task 22: Alert cooldown with fake timers

**Files:**
- Create: `backend/test/unit/shouldSendAlert.test.js`

`shouldSendAlert` and `markAlertSent` are also private. Export them first.

- [ ] **Step 1: Export the helpers**

In `backend/src/services/peopleCountService.js`, change:
```js
function shouldSendAlert(alertType) {
function markAlertSent(alertType) {
function resetAlertCooldown(alertType = null) {
```
to:
```js
export function shouldSendAlert(alertType) {
export function markAlertSent(alertType) {
export function resetAlertCooldown(alertType = null) {
```

Note: `resetAlertCooldown` may already be exported (it's referenced in the service's default export object). Skip if already exported.

- [ ] **Step 2: Write the test**

Write to `backend/test/unit/shouldSendAlert.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    shouldSendAlert,
    markAlertSent,
    resetAlertCooldown,
} from '../../src/services/peopleCountService.js';

describe('alert cooldown', () => {
    beforeEach(() => {
        resetAlertCooldown();
        vi.useRealTimers();
    });

    it('allows first alert immediately', () => {
        expect(shouldSendAlert('crowd_warning')).toBe(true);
    });

    it('blocks repeat alert within cooldown window', () => {
        vi.useFakeTimers();
        markAlertSent('crowd_warning');
        vi.advanceTimersByTime(5 * 60 * 1000);  // 5 min, less than 10-min cooldown
        expect(shouldSendAlert('crowd_warning')).toBe(false);
    });

    it('allows alert after cooldown expires', () => {
        vi.useFakeTimers();
        markAlertSent('crowd_warning');
        vi.advanceTimersByTime(11 * 60 * 1000);  // 11 min, past 10-min cooldown
        expect(shouldSendAlert('crowd_warning')).toBe(true);
    });

    it('tracks cooldown per alert type independently', () => {
        markAlertSent('crowd_warning');
        expect(shouldSendAlert('crowd_critical')).toBe(true);
    });
});
```

- [ ] **Step 3: Run the test**

```bash
npm test -- test/unit/shouldSendAlert.test.js
```

Expected: 4 passing.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/peopleCountService.js backend/test/unit/shouldSendAlert.test.js
git commit -m "test(unit): alert cooldown logic with fake timers"
```

---

### Task 23: zoneStatusFromCount mapping

**Files:**
- Create: `backend/test/unit/zoneStatusFromCount.test.js`

The function lives in `backend/src/index.js` and isn't exported. Extract it to a helper file so it can be imported.

- [ ] **Step 1: Create helper file**

Create `backend/src/services/zoneStatus.js`:

```js
export function zoneStatusFromCount(count) {
    if (count >= 2501) return { crowd_level: 'crowded',  crowd_label: 'แออัด' };
    if (count >= 1201) return { crowd_level: 'busy',     crowd_label: 'ค่อนข้างแออัด' };
    if (count >= 501)  return { crowd_level: 'moderate', crowd_label: 'ปกติ' };
    return             { crowd_level: 'normal',   crowd_label: 'เบาบาง' };
}
```

- [ ] **Step 2: Wire it back in `backend/src/index.js`**

Find the existing `function zoneStatusFromCount(count) {...}` block (around line 364) and replace with:

```js
import { zoneStatusFromCount } from './services/zoneStatus.js';
```

If there's already an imports block at the top of the file, add the import there and delete the function definition.

- [ ] **Step 3: Verify the smoke test still passes**

```bash
npm test -- test/smoke.test.js
```

Expected: still green.

- [ ] **Step 4: Write the unit test**

Write to `backend/test/unit/zoneStatusFromCount.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { zoneStatusFromCount } from '../../src/services/zoneStatus.js';

describe('zoneStatusFromCount', () => {
    it.each([
        [0, 'normal'],
        [500, 'normal'],
        [501, 'moderate'],
        [1200, 'moderate'],
        [1201, 'busy'],
        [2500, 'busy'],
        [2501, 'crowded'],
    ])('count=%i → crowd_level=%s', (count, expected) => {
        expect(zoneStatusFromCount(count).crowd_level).toBe(expected);
    });

    it('returns Thai labels in each band', () => {
        expect(zoneStatusFromCount(0).crowd_label).toBe('เบาบาง');
        expect(zoneStatusFromCount(700).crowd_label).toBe('ปกติ');
        expect(zoneStatusFromCount(1500).crowd_label).toBe('ค่อนข้างแออัด');
        expect(zoneStatusFromCount(3000).crowd_label).toBe('แออัด');
    });
});
```

- [ ] **Step 5: Run the test**

```bash
npm test -- test/unit/zoneStatusFromCount.test.js
```

Expected: 8 passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/zoneStatus.js backend/src/index.js backend/test/unit/zoneStatusFromCount.test.js
git commit -m "test(unit): zoneStatusFromCount mapping (extracted to its own module)"
```

---

## Phase 6 — Hardening

### Task 24: Pool error logging + tighter idle timeout

**Files:**
- Modify: `backend/src/db/index.js` (the `initDatabase` function)

- [ ] **Step 1: Update the pool config**

In `backend/src/db/index.js`, find the `pool = new Pool({...})` block in `initDatabase()`. Change the timing constants:

```js
pool = new Pool({
    connectionString: resolveConnectionString(),
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : (process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false),
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected pool error:', err.message);
});
```

(Was `idleTimeoutMillis: 30000`, no error listener.)

- [ ] **Step 2: Run the suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/index.js
git commit -m "fix(db): tighter idle timeout + pool error logging"
```

---

### Task 25: Per-request 30s timeout

**Files:**
- Modify: `backend/src/index.js` — middleware section, around line 90 (after CORS, before JSON parsing)

- [ ] **Step 1: Add the middleware**

Find the middleware section (after `app.use(cors(...))` and `app.use(rateLimitMiddleware)`). Add this middleware just before `app.use(express.json(...))`:

```js
// Per-request timeout — prevents a hung Supabase call from pinning a worker
app.use((req, res, next) => {
    res.setTimeout(30_000, () => {
        if (!res.headersSent) {
            res.status(503).json({ success: false, error: 'Request timeout' });
        }
    });
    next();
});
```

- [ ] **Step 2: Run the suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.js
git commit -m "fix: 30s per-request timeout middleware"
```

---

### Task 26: Fix HIGH severity empty-catch findings

**Files:**
- Modify: whatever Task 10 surfaced as HIGH

If Task 10's audit report lists empty catch blocks under HIGH, fix each one now.

- [ ] **Step 1: For each empty catch**

Add either a warning log or a re-throw depending on intent:

```js
// If the swallow was intentional (best-effort)
try {
    somethingOptional();
} catch (e) {
    console.warn('[X] Optional operation failed:', e.message);
}

// If the swallow was a copy-paste oversight
try {
    something();
} catch (e) {
    throw e;
}
```

Decide per-site, not blanket.

- [ ] **Step 2: Run the suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 3: Update the audit report**

In `backend/audit/2026-06-09-async-await-audit.md`, move the fixed HIGH items from the "High" section to a new "Fixed" section at the bottom.

- [ ] **Step 4: Commit**

```bash
git add backend/src backend/audit/2026-06-09-async-await-audit.md
git commit -m "fix: address HIGH severity empty-catch findings from audit"
```

If no HIGH findings, skip this task entirely.

---

## Phase 7 — Wire up

### Task 27: Document `npm test` in `backend/README.md`

**Files:**
- Modify (or create): `backend/README.md`

- [ ] **Step 1: Check if README exists**

```bash
ls /Users/floridae/FORLP/backend/README.md 2>/dev/null
```

If it doesn't exist, the next step creates it. If it does, append the testing section.

- [ ] **Step 2: Add the testing section**

Append (or create) `backend/README.md` with:

```markdown
## Testing

Tests use a separate `forlp_test` schema in the same Supabase project — production data is untouched.

```bash
# One-shot run
npm test

# Watch mode for development
npm run test:watch
```

Test data is truncated before each test. Tests use real Postgres; no mocking of the database. External APIs (LINE, OpenWeather) are mocked at the service wrapper boundary.

Schema isolation is controlled by the `PGSCHEMA` env var — production leaves it unset. The `npm test` script sets `PGSCHEMA=forlp_test` automatically.
```

(Use triple-backticks for the inner code block as usual; the markdown sample above shows them escaped for clarity.)

- [ ] **Step 3: Run the full suite one more time**

```bash
cd /Users/floridae/FORLP/backend
npm test
```

Expected: all 22+ tests pass in under 15 seconds.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "docs(backend): testing section"
```

---

## Done

After Task 27, the success criteria from the spec are met:

- `npm test` runs all tests in under 15s, all green
- `backend/audit/2026-06-09-async-await-audit.md` exists with all CRITICAL findings fixed
- Future dropped-await regressions on the daily report path break Task 12 / Task 14
- Production behavior unchanged (PGSCHEMA defaults to unset → `public` schema)

Push:
```bash
git push origin main
```
