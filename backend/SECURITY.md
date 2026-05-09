# 🔒 Security Setup Guide

## Quick Security Fix - Implementation Complete ✅

### 1. Environment Variables Setup

ทั้งหมด secrets ได้ย้ายไป `.env` file แล้ว:

```bash
# Copy template
cp .env.example .env

# Edit .env และ set ค่าตามจริง
nano .env
```

**Required Variables:**
- `LINE_CHANNEL_ACCESS_TOKEN` - LINE OA token สำหรับ Daily Report
- `LINE_CHANNEL_SECRET` - LINE OA secret
- `LINE_LOGIN_CHANNEL_ID` - LINE Login channel ID
- `LINE_LOGIN_CHANNEL_SECRET` - LINE Login channel secret
- `OPENWEATHER_API_KEY` - Weather API key
- `AI_API_KEY` - AI service API key (ต้องตรงกับ config.yaml)
- `SESSION_SECRET` - Session encryption key
- `OFFICER_TOKENS` - Officer verification tokens (comma-separated)

### 2. Input Validation & Sanitization ✅

เพิ่มแล้ว middleware ต่อไปนี้:

#### `rateLimitMiddleware`
- ป้องกัน DDoS/brute force attacks
- Rate limit: 100 requests per 15 minutes (default)
- Config via `RATE_LIMIT_WINDOW_MS` และ `RATE_LIMIT_MAX_REQUESTS`

#### `sanitizeInputs`
- Sanitize ทุก string input เพื่อป้องกัน XSS
- ลบ `<>` characters
- Limit string length 2000 characters

#### `validateJsonPayload`
- ตรวจสอบ payload size (max 1MB)
- ตรวจสอบ Content-Type

#### Request Validators
- `validatePeopleCountRequest` - ตรวจสอบ people count data
- `validateOfficerTokenRequest` - ตรวจสอบ officer token format
- `validateLineCallbackRequest` - ตรวจสอบ LINE callback data

### 3. API Key Validation ✅

AI Service API endpoints ตรวจสอบ API Key:

```javascript
// Valid API Key from .env
const apiKey = req.headers['x-api-key'] || req.query.api_key;
if (!apiKey || apiKey !== AI_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
}
```

### 4. Error Handling ✅

Global error handler จัดการทุก exception:

```javascript
// กำหนด error handler ที่ท้ายสุด
app.use(errorHandler);

// ผลลัพธ์:
// - JSON parsing errors
// - 404 Not Found
// - 5xx Internal Server Errors
// - Graceful error messages
```

### 5. Security Headers ✅

เพิ่ม HTTP security headers:

```
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

### 6. CORS Configuration ✅

CORS ตั้งค่าเฉพาะ allowed origins:

```javascript
const corsOptions = {
    origin: [
        'https://forlp-bams.vercel.app',  // Production
        'http://localhost:5173',           // Frontend dev
        config.frontendUrl
    ],
    credentials: true
};
```

---

## Usage Examples

### ✅ Valid Request (People Count)
```bash
curl -X POST http://localhost:3000/api/ai/people-count \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_ai_api_key" \
  -d '{"camera_id": 1, "count": 150, "timestamp": "2026-03-18T10:00:00Z"}'
```

### ❌ Invalid Requests (จะ reject)

**Missing API Key:**
```bash
curl -X POST http://localhost:3000/api/ai/people-count \
  -H "Content-Type: application/json" \
  -d '{"count": 150}'
# Response: 401 Invalid or missing API key
```

**Invalid count value:**
```bash
curl -X POST http://localhost:3000/api/ai/people-count \
  -H "X-API-Key: key" \
  -d '{"count": -50}'
# Response: 400 Invalid count value (must be 0-100000)
```

**Rate limit exceeded:**
```bash
# หลังจาก 100 requests ใน 15 นาที
# Response: 429 Too many requests
```

---

## Production Checklist 🚀

- [ ] ✅ ทั้งหมด secrets ย้ายไป `.env` file
- [ ] ✅ `.env` file เพิ่มใน `.gitignore`
- [ ] ✅ Input validation enabled
- [ ] ✅ Rate limiting enabled
- [ ] ✅ CORS configured
- [ ] ✅ Security headers enabled
- [ ] ✅ Error handling implemented
- [ ] ⏳ Database encryption (Next)
- [ ] ⏳ HTTPS/TLS setup (Next)
- [ ] ⏳ API Key rotation mechanism (Next)

---

## Testing

### Test Rate Limiting
```bash
# Run 150 requests ใน 15 นาที - request ที่ 101+ จะถูก reject
for i in {1..150}; do
  curl http://localhost:3000/api/people/current
  echo "Request $i"
done
```

### Test Input Validation
```bash
# Test XSS prevention
curl -X POST http://localhost:3000/api/people/ingest \
  -H "Content-Type: application/json" \
  -d '{"people_count": 100, "stream_id": "<script>alert(1)</script>"}'
# เหล่า <> จะถูกลบออก
```

---

## Security Notes

⚠️ **Important:**
1. ทุก API endpoints ตรวจสอบ input แล้ว
2. Sensitive data ไม่ต้องเก็บใน code
3. ทดสอบ malicious input ก่อน deploy
4. Rotate API keys ทุก 90 วัน
5. Monitor rate limit logs เพื่อ detect abuse

---

## Next Steps

### Priority 2 - Error Handling Wrapper
- Wrap ทุก async operations ด้วย try-catch
- Add comprehensive logging

### Priority 3 - Database Enhancement  
- Add audit log tables
- Track officer verification attempts
- Track API key usage

### Priority 4 - Performance
- Add caching (Redis)
- Database query optimization
- Add metrics collection

See `../docs/architecture.md` for full roadmap.
