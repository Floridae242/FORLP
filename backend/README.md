# FORLP Backend

Express + PostgreSQL (Supabase) backend for the Kad Kong Ta Smart Insight platform.

## Run

```bash
npm install
npm run dev   # node src/index.js
```

Requires `backend/.env` with at minimum `DATABASE_URL` (Supabase connection string) and the LINE/OpenWeather credentials documented in `.env.example`.

## Testing

Tests use a separate `forlp_test` schema in the same Supabase project — production data is untouched.

```bash
# One-shot run
npm test

# Watch mode for development
npm run test:watch
```

Test data is truncated before each test. Tests use real Postgres; no mocking of the database. External APIs (LINE, OpenWeather) are mocked at the service wrapper boundary.

Schema isolation is controlled by the `PGSCHEMA` env var — production leaves it unset (defaults to `public`). The `npm test` script sets `PGSCHEMA=forlp_test` automatically.

### Test layout

```text
test/
├── helpers/        # schema creation, table truncation, vitest setup
├── unit/           # pure-function tests (calculateStatus, alert cooldown, zoneStatusFromCount)
├── services/       # async DB-touching service tests (auth, dailyReport, earlyWarning)
└── routes/         # full HTTP via Supertest (auth, zones, people)
```

Current suite: 10 files / 39 tests, ~55s total runtime against Supabase.

## Project structure

```text
src/
├── config/       # env-driven config + validation
├── db/           # pg pool, query helpers, schema.sql
├── middleware/   # express middleware (rate limit, sanitize, error handler)
├── services/     # business logic (auth, people-count, weather, daily-report, early-warning)
├── utils/        # error classes, structured logging
└── index.js      # routes + app entry
```
