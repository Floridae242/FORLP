# 🔧 Environment Variables Configuration Guide
# ระบบข้อมูลถนนคนเดินกาดกองต้า - เทศบาลนครลำปาง
# อัปเดตล่าสุด: 3 กุมภาพันธ์ 2026

---

## 🔷 Vercel (Frontend)

ไปที่ **Project Settings → Environment Variables**

| Variable | Value | Required |
|----------|-------|----------|
| `VITE_API_URL` | `https://forlp-production.up.railway.app` | ✅ Yes |

> **หมายเหตุ:** ค่านี้ตั้งไว้ใน `vercel.json` แล้ว ไม่ต้องตั้งเพิ่ม

---

## 🔶 Railway (Backend)

ไปที่ **Project → Variables** แล้วเพิ่ม Environment Variables ดังนี้:

### ⚡ General Settings

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `NODE_ENV` | `production` | ✅ Yes | โหมด Production |
| `PORT` | `3001` | ❌ No | Railway ตั้งให้อัตโนมัติ |
| `MOCK_MODE` | `false` | ❌ No | ปิด Mock Data (default: true) |

### 🔐 LINE Login (OAuth 2.0 v2.1) - สำหรับระบบ Login

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `LINE_LOGIN_CHANNEL_ID` | `xxxxxxxxxx` | ✅ Yes | Channel ID จาก LINE Login Channel |
| `LINE_LOGIN_CHANNEL_SECRET` | `xxxxxxxxxxxxxxxx` | ✅ Yes | Channel Secret จาก LINE Login Channel |
| `LINE_LOGIN_CALLBACK_URL` | `https://forlp-bams.vercel.app/settings` | ✅ Yes | URL ที่ LINE redirect กลับมา |
| `FRONTEND_URL` | `https://forlp-bams.vercel.app` | ✅ Yes | URL ของ Frontend |

### 📱 LINE Messaging API - สำหรับ Daily Report & Early Warning

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `LINE_CHANNEL_ACCESS_TOKEN` | `xxxxxxxx...` | ⚠️ แนะนำ | Access Token จาก LINE OA (Messaging API) |
| `LINE_CHANNEL_SECRET` | `xxxxxxxx` | ⚠️ แนะนำ | Channel Secret จาก LINE OA |

### 🌤️ Weather & Air Quality API

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `OPENWEATHER_API_KEY` | `xxxxxxxx` | ⚠️ แนะนำ | API Key จาก OpenWeatherMap |
| `DEFAULT_LAT` | `18.2816` | ❌ No | ละติจูด (default: กาดกองต้า) |
| `DEFAULT_LON` | `99.5082` | ❌ No | ลองจิจูด (default: กาดกองต้า) |

### 📹 Camera/AI People Count API

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `CAMERA_API_URL` | `http://your-ai-service` | ❌ No | URL ของ AI Service |
| `CAMERA_API_KEY` | `xxxxxxxx` | ❌ No | API Key สำหรับ AI Service |

### 🔒 Security & Session

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `SESSION_SECRET` | `your-strong-random-key` | ✅ Yes | Secret สำหรับ Session (ควรเป็น random string ยาว 32+ ตัวอักษร) |
| `SESSION_MAX_AGE` | `604800000` | ❌ No | อายุ Session (ms) - default: 7 วัน |

### 💾 Database

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `DB_PATH` | `./data/kadkongta.db` | ❌ No | Path ของ SQLite Database |

### ⏰ Scheduler Settings

| Variable | Value | Required | คำอธิบาย |
|----------|-------|----------|----------|
| `POLLING_INTERVAL` | `60000` | ❌ No | Interval สำหรับ polling (ms) |
| `DAILY_REPORT_HOUR` | `18` | ❌ No | ชั่วโมงที่ส่ง Daily Report |
| `DAILY_REPORT_MINUTE` | `0` | ❌ No | นาทีที่ส่ง Daily Report |

---

## 📝 ตัวอย่าง Railway Variables (Copy ได้เลย)

```env
# General
NODE_ENV=production
MOCK_MODE=false

# LINE Login (OAuth 2.0 v2.1) - จำเป็น
LINE_LOGIN_CHANNEL_ID=your_line_login_channel_id
LINE_LOGIN_CHANNEL_SECRET=your_line_login_channel_secret
LINE_LOGIN_CALLBACK_URL=https://forlp-bams.vercel.app/settings
FRONTEND_URL=https://forlp-bams.vercel.app

# LINE Messaging API (สำหรับ Daily Report)
LINE_CHANNEL_ACCESS_TOKEN=your_line_oa_access_token
LINE_CHANNEL_SECRET=your_line_oa_channel_secret

# Security
SESSION_SECRET=kadkongta-production-secret-2026-change-this

# Weather API
OPENWEATHER_API_KEY=your_openweather_api_key
```

---

## 🛠️ LINE Developers Console - ต้องตั้งค่า

### 1. LINE Login Channel
- ไปที่ https://developers.line.biz/console/
- เลือก Provider → LINE Login Channel
- ตั้งค่า **Callback URL**:
  ```
  https://forlp-bams.vercel.app/settings
  ```
- เปิด **Scopes**:
  - ✅ `profile`
  - ✅ `openid`

### 2. LINE Messaging API Channel (สำหรับ Daily Report)
- เลือก Provider → Messaging API Channel
- คัดลอก **Channel Access Token** และ **Channel Secret**

---

## ✅ Checklist ก่อน Deploy

### Railway (Backend)
- [ ] ตั้ง `NODE_ENV=production`
- [ ] ตั้ง `LINE_LOGIN_CHANNEL_ID`
- [ ] ตั้ง `LINE_LOGIN_CHANNEL_SECRET`
- [ ] ตั้ง `LINE_LOGIN_CALLBACK_URL`
- [ ] ตั้ง `FRONTEND_URL`
- [ ] ตั้ง `SESSION_SECRET` (ใช้ค่า random ที่แข็งแกร่ง)
- [ ] ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` (ถ้าต้องการส่ง Daily Report)
- [ ] ตั้ง `OPENWEATHER_API_KEY` (ถ้าต้องการข้อมูลอากาศจริง)

### LINE Developers Console
- [ ] ตั้ง Callback URL ใน LINE Login Channel
- [ ] เปิด Scopes: `profile`, `openid`

### Vercel (Frontend)
- [ ] ตรวจสอบ `VITE_API_URL` ใน vercel.json

### ทดสอบ
- [ ] Deploy Backend ไป Railway
- [ ] Deploy Frontend ไป Vercel
- [ ] ทดสอบ LINE Login บน Production
- [ ] ทดสอบเปลี่ยน Role
- [ ] ทดสอบ Logout
