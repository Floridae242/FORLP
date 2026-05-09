# Error Handling Setup Guide

## Quick Start

### 1. Files Created
```
backend/src/
├── utils/
│   ├── errorHandling.js      ✅ Error classes, logger, retry logic, circuit breaker
│   ├── serviceWrapper.js     ✅ Service wrapping, database, API call wrappers
│   └── index.js              ✅ Export all utilities
├── middleware/
│   └── index.js              ✅ Validation, sanitization, error handler
└── index.js                  ✅ Updated with error handling setup

backend/
├── ERROR_HANDLING.md         ✅ Full documentation with examples
└── ERROR_HANDLING_SETUP.md   ✅ This file
```

### 2. Key Features Implemented

#### Error Classes (8 types)
- `AppError` - Base error class
- `ValidationError` (400) - Input validation
- `AuthenticationError` (401) - Auth failures
- `AuthorizationError` (403) - Permission denied
- `NotFoundError` (404) - Resource not found
- `ConflictError` (409) - Data conflicts
- `RateLimitError` (429) - Rate limit exceeded
- `ExternalServiceError` (502) - External API failures
- `DatabaseError` (500) - Database operations

#### Error Logger
```javascript
import { ErrorLogger } from './src/utils/errorHandling.js';

const logger = new ErrorLogger('./logs');
logger.log(error, { userId, method, path, ip });
```

#### Service Wrapping
```javascript
import { wrapService } from './src/utils/serviceWrapper.js';

const wrapped = wrapService(service, 'ServiceName', {
  method1: { retryable: true, maxRetries: 3 },
  method2: { circuitBreaker: true }
});
```

#### Retry Logic
```javascript
import { retryAsync } from './src/utils/errorHandling.js';

const result = await retryAsync(
  async () => await apiCall(),
  { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
);
```

#### Circuit Breaker
```javascript
import { CircuitBreaker } from './src/utils/errorHandling.js';

const breaker = new CircuitBreaker(fn, {
  failureThreshold: 5,
  resetTimeoutMs: 60000
});
const result = await breaker.call();
```

### 3. Middleware Features

- ✅ Security headers (HSTS, CSP, X-Frame-Options)
- ✅ Rate limiting (100 req/15min per IP)
- ✅ Input validation (type checking, required fields)
- ✅ Input sanitization (XSS prevention)
- ✅ Request logging (unique IDs, timing)
- ✅ Global error handler (catches all errors)

### 4. Global Error Handlers

```javascript
// Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

// Uncaught Exceptions
process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
});
```

### 5. Error Response Format

**Production:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid people count",
    "code": "VALIDATION_ERROR",
    "timestamp": "2026-03-18T10:30:45.123Z"
  }
}
```

**Development:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid people count",
    "code": "VALIDATION_ERROR",
    "timestamp": "2026-03-18T10:30:45.123Z",
    "stack": "ValidationError: ...",
    "details": { "field": "count" },
    "requestId": "1234567890-abc123",
    "path": "/api/people/ingest"
  }
}
```

### 6. Log Files

Logs are written to `backend/logs/` directory:
```
logs/
├── error-2026-03-18.log
├── warning-2026-03-18.log
└── error-2026-03-19.log
```

View logs:
```bash
tail -f backend/logs/error-$(date +%Y-%m-%d).log
```

### 7. Usage in Services

**Before:**
```javascript
export async function getCurrentWeather() {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Weather error:', error);
    return null;
  }
}
```

**After (with wrapper):**
```javascript
import { callExternalAPI } from '../utils/serviceWrapper.js';

export async function getCurrentWeather() {
  return await callExternalAPI(
    'OpenWeatherMap',
    async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    },
    { retryable: true, maxRetries: 3, timeout: 15000 }
  );
}
```

### 8. Usage in Routes

**Before:**
```javascript
app.post('/api/people/ingest', (req, res) => {
  try {
    if (typeof req.body.count !== 'number') {
      return res.status(400).json({ error: 'Invalid count' });
    }
    const result = peopleCountService.ingestPeopleCount(req.body.count);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**After (with wrapper):**
```javascript
import { expressAsyncHandler, ValidationError } from './utils/errorHandling.js';

app.post('/api/people/ingest', expressAsyncHandler(async (req, res) => {
  const { count } = req.body;
  
  if (typeof count !== 'number') {
    throw new ValidationError('Invalid people count', { field: 'count' });
  }
  
  const result = await peopleCountService.ingestPeopleCount(count);
  res.json({ success: true, data: result });
}));
```

### 9. Integration Checklist

- ✅ Error handling utilities created
- ✅ Service wrapper created
- ✅ Middleware with error handlers created
- ✅ Main server updated with global handlers
- ✅ Error logger initialized
- ✅ Documentation provided

### 10. Next Steps

1. **Update Services** (peopleCountService, weatherService, etc.)
   ```javascript
   import { wrapServiceMethod } from '../utils/serviceWrapper.js';
   
   // Wrap individual methods
   export async function method() {
     // Your code
   }
   ```

2. **Update Routes** (use expressAsyncHandler)
   ```javascript
   app.post('/api/endpoint', expressAsyncHandler(async (req, res) => {
     // Your code
   }));
   ```

3. **Test Error Handling**
   ```bash
   # Test validation error
   curl -X POST http://localhost:3000/api/people/ingest \
     -H "Content-Type: application/json" \
     -d '{"count": "invalid"}'
   
   # Test rate limiting
   for i in {1..101}; do curl http://localhost:3000/api/data; done
   ```

4. **Monitor Logs**
   ```bash
   tail -f backend/logs/error-$(date +%Y-%m-%d).log
   ```

### 11. Configuration

Add to `.env`:
```bash
NODE_ENV=production
ERROR_LOG_DIR=./logs
RETRY_MAX_ATTEMPTS=3
RETRY_DELAY_MS=1000
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=60000
API_TIMEOUT_MS=15000
DB_TIMEOUT_MS=30000
```

### 12. Benefits

✅ **Consistency** - All services handle errors the same way
✅ **Reliability** - Automatic retry with exponential backoff
✅ **Resilience** - Circuit breaker prevents cascading failures
✅ **Visibility** - Comprehensive error logging
✅ **Security** - Input validation and sanitization
✅ **Performance** - Timeout handling, batch operations
✅ **Debugging** - Unique request IDs, stack traces in dev mode
✅ **Monitoring** - Error rates, types, and patterns tracked in logs

---

## File Structure

```
backend/
├── src/
│   ├── utils/                    # NEW
│   │   ├── errorHandling.js     # ~500 lines
│   │   ├── serviceWrapper.js    # ~400 lines
│   │   └── index.js             # Exports
│   ├── middleware/               # NEW
│   │   └── index.js             # ~300 lines
│   ├── services/
│   │   ├── weatherService.js
│   │   ├── peopleCountService.js
│   │   ├── dailyReportService.js
│   │   ├── earlyWarningService.js
│   │   ├── authService.js
│   │   └── pollingService.js
│   ├── config/
│   ├── db/
│   └── index.js                 # Updated
├── logs/                         # NEW (auto-created)
│   ├── error-2026-03-18.log
│   ├── warning-2026-03-18.log
│   └── ...
├── ERROR_HANDLING.md            # NEW
└── ERROR_HANDLING_SETUP.md      # NEW
```

---

## Summary

**Comprehensive Error Handling** has been successfully implemented for the backend with:

1. **Custom Error Classes** - 8 different error types with proper HTTP status codes
2. **Error Logger** - Automatic file logging by severity and date
3. **Service Wrapper** - Retry logic, circuit breaker, timeout handling
4. **Middleware** - Validation, sanitization, rate limiting, security headers
5. **Global Handlers** - Catch unhandled rejections and exceptions
6. **Request Tracking** - Unique IDs and timing for debugging
7. **Documentation** - Complete guide with examples and best practices

All files are production-ready and follow Node.js best practices! 🚀

