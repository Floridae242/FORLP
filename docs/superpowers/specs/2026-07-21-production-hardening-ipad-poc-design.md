# Production Hardening and iPad Camera POC Design

## Decision

Use incremental hardening rather than a backend rewrite. Preserve the existing
HTTP contracts where they are safe, introduce explicit security boundaries,
and extract code from `backend/src/index.js` only as each affected feature is
changed and covered by tests.

The first deployable slice closes the currently exposed privileged operations,
makes officer promotion atomic, secures machine-to-machine people-count
ingestion, and provides a camera topology that does not expose NVR or iPad
credentials to the browser.

## Goals

- Require an authenticated officer for every test or broadcast notification.
- Accept AI count ingestion only from an authenticated service and reject
  replayed or stale requests.
- Consume an officer token exactly once, atomically with the role change.
- Return consistent, non-sensitive API errors with a request identifier.
- Emit structured logs that redact credentials and correlate one request.
- Run backend and frontend containers as non-root production processes.
- Connect an iPad camera through a private RTSP relay for a local POC.
- Add focused unit, integration, and route coverage before behavior changes.

## Non-Goals

- Rewriting the whole 1,700-line application in one change.
- Publishing the iPad, RTSP relay, Prometheus, or Grafana directly to the
  Internet.
- Migrating every existing route to a new module in the first slice.
- Replacing PostgreSQL or changing frontend page behavior unrelated to camera
  playback and authentication.

## Architecture

The first slice introduces shared infrastructure and feature-owned boundaries:

```text
backend/src/
  app.js                         Express construction and middleware order
  server.js                      startup, shutdown, and scheduler lifecycle
  shared/
    errors/                      typed operational errors and handler
    logging/                     Pino logger, redaction, request IDs
    validation/                  request schemas and validation middleware
  middleware/
    authentication.js           user session and officer authorization
    serviceAuthentication.js    signed AI request verification
  modules/
    auth/
      officerTokenRepository.js atomic database operation
      officerRoleService.js     promotion business rule
    people/
      peopleController.js       HTTP adapter
      peopleSchemas.js          boundary validation
      peopleRoutes.js
    notifications/
      notificationController.js
      notificationRoutes.js
  infra/
    db/                          pool and transaction helpers
    replay/                      nonce store interface and implementation
```

Existing services remain available while routes are migrated. New controllers
depend on services and repositories; they do not issue SQL or call third-party
SDKs directly. The application factory does not listen on a port, which lets
route tests import it without starting schedulers.

## Security Invariants

1. A notification side effect is reachable only after session authentication
   and officer-role authorization. Debug notification routes are disabled in
   production unless explicitly enabled, and remain officer-only when enabled.
2. An AI request carries `X-Service-Id`, `X-Timestamp`, `X-Nonce`, and
   `X-Signature`. The signature covers method, canonical path, timestamp,
   nonce, and the SHA-256 body digest. Verification uses constant-time
   comparison, a five-minute clock window, and single-use nonce storage.
3. Officer promotion occurs in one PostgreSQL transaction. A conditional
   `UPDATE ... WHERE is_used = false ... RETURNING` claims the token before the
   user role changes; any failure rolls the whole transaction back.
4. Browser responses never contain stack traces, database details, service
   secrets, RTSP credentials, or upstream response bodies.
5. Camera credentials exist only in server-side secret configuration. The
   frontend receives an opaque camera ID and a proxied HLS/WebRTC playback URL.

## Request and Error Flow

```text
request
  -> request ID and structured request log
  -> security headers and bounded body parser
  -> schema validation
  -> user or service authentication
  -> controller
  -> service
  -> repository / external adapter
  -> response envelope
  -> global error handler and completion log
```

Expected failures use typed operational errors and stable codes such as
`VALIDATION_ERROR`, `AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `TOKEN_INVALID`,
and `REPLAY_DETECTED`. Unexpected errors are logged with the request ID and
return HTTP 500 with a generic message. Validation failures return 400,
missing/invalid credentials 401, insufficient role 403, conflicts or replay
409, and unavailable dependencies 503.

## iPad Camera POC

The iPad runs an RTSP-capable camera application while powered and kept in the
foreground. It connects only to the local trusted Wi-Fi/VLAN. A MediaMTX relay
pulls the private iPad RTSP stream and exposes separate internal outputs:

```text
iPad camera app --private RTSP--> MediaMTX/go2rtc
                                      |--RTSP--> AI counter
                                      `--HLS/WebRTC--> authenticated proxy
AI counter --signed count event--> backend --JSON/WebSocket--> dashboard
```

The relay and AI service share a private container network. Only the dashboard
proxy is browser-accessible; the raw RTSP port, metrics, and control endpoints
are not published externally. Configuration uses environment-secret references
for the iPad URL and credentials. The POC includes reconnect backoff, stale
frame detection, and a health state visible to officers.

The operational limitation is explicit: iPadOS may suspend a camera app in the
background. The POC therefore assumes foreground operation, continuous power,
screen-lock prevention, and a reserved DHCP address. A dedicated ONVIF/RTSP
camera is the production replacement.

## Delivery Sequence

1. Add failing tests for anonymous notification access, unsigned/stale/replayed
   AI ingestion, and concurrent officer-token redemption.
2. Add configuration validation, typed errors, request IDs, and structured
   redacted logging.
3. Add service-signature verification and migrate both people-count ingestion
   endpoints to the same authenticated controller.
4. Protect or disable every notification test/broadcast route.
5. Replace officer token selection/update with a transaction and conditional
   claim; remove predictable seeded production tokens.
6. Split application construction from process startup and move the modified
   routes into feature modules.
7. Add non-root multi-stage Docker builds, `.dockerignore`, secret-only Compose
   configuration, PostgreSQL health checks, and a CI pipeline.
8. Add an opt-in `poc` Compose profile for MediaMTX and document iPad setup.

## Testing and Acceptance

- Route tests prove anonymous and ordinary-user notification requests return
  401/403 without calling LINE.
- Ingest tests prove missing, malformed, stale, and duplicate signatures fail;
  a correctly signed request succeeds once.
- A concurrency integration test sends two role promotions using one token and
  proves exactly one user becomes an officer.
- Unit tests cover canonical signature construction, constant-time verification,
  schema boundaries, and error-to-HTTP mapping.
- Existing backend and frontend tests remain green against the configured test
  database; frontend production build succeeds.
- Docker images run as non-root users and contain no project `.env`, VCS data,
  host `node_modules`, or camera credentials.
- The POC accepts frames after relay startup, reports stale input after a frame
  timeout, reconnects after the iPad stream returns, and never returns the RTSP
  URL to a browser response.

## Rollout and Rollback

Deploy notification authorization first because it is backward-compatible for
legitimate officers. Deploy signed ingestion with a short dual-read migration:
the backend can accept the existing AI key only when an explicit temporary
compatibility flag is enabled, logs its use, and removes it after the AI service
is upgraded. Do not permit query-string credentials.

Database changes are additive. Generate random officer invitation tokens out of
band, store only a hash, and retain the current table columns until the migration
has been verified. Each route extraction is independently reversible, but the
authorization guards and secret rotation are not rolled back after exposure.

## Assumptions

- PostgreSQL remains the production datastore.
- LINE Login remains the human authentication provider.
- Redis is optional for a single backend replica; PostgreSQL nonce storage is
  the default durable replay defense and Redis becomes preferable when request
  volume or replica count increases.
- No measured latency budget was supplied. Signature verification and nonce
  insertion are expected to be small relative to AI inference and network time;
  CI will record route latency to catch regressions.
