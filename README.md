# Kad Kong Ta Smart Insight

ระบบวิเคราะห์และบริหารจัดการพื้นที่สาธารณะด้วยข้อมูลจริง สำหรับถนนคนเดินกาดกองต้า เทศบาลนครลำปาง

---

## ภาพรวมระบบ

ระบบนี้เปลี่ยนจากการ "คาดเดา" เป็นการ "ตัดสินใจด้วยข้อมูลจริง" โดยใช้ข้อมูลจาก:
- กล้อง CCTV เดิม (ไม่ติดตั้ง hardware ใหม่)
- AI People Counting (YOLOv8)
- สภาพอากาศและคุณภาพอากาศ
- การแจ้งเตือนผ่าน LINE OA

ประกอบด้วย 4 ส่วนหลัก:

| ส่วน | หน้าที่ |
|------|---------|
| `backend/` | API Server (Express + PostgreSQL/Supabase) — รวมข้อมูลคน, อากาศ, แจ้งเตือน, Auth |
| `frontend/` | เว็บสำหรับประชาชน/ร้านค้า + เจ้าหน้าที่ (React + Vite) — ความหนาแน่น, อากาศ, รายงาน, CCTV |
| `ai-service/` | AI People Counting (Python + YOLOv8) — อ่าน RTSP จาก NVR แล้วส่งจำนวนคนเข้า backend |

---

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---------|------------|
| AI People Counting | นับจำนวนคนอัตโนมัติด้วย YOLOv8 แบบ Real-time (6 กล้อง 3 โซน) |
| Zone Status | สถานะความหนาแน่นรายโซน (A, B, C) |
| สภาพอากาศ | อุณหภูมิ, ความชื้น, ความเร็วลม |
| คุณภาพอากาศ | ค่า PM2.5 พร้อมคำแนะนำ |
| รายงานข้อมูล | สรุปรายวัน, รายสัปดาห์ (นับเฉพาะช่วง 16:00-22:00 น.) |
| Daily Report | ส่งรายงานประจำวันไป LINE OA (เสาร์-อาทิตย์ 23:00 น.) |
| Early Warning | แจ้งเตือนฝน, ความแออัด (>= 1,201 คน), วิกฤต (>= 2,501 คน) |
| LINE Login | ระบบยืนยันตัวตนผ่าน LINE Login v2.1 |
| Role-based Access | แบ่งสิทธิ์ตามบทบาท (ร้านค้า, ประชาชน, นักท่องเที่ยว, เจ้าหน้าที่) |
| CCTV Streaming | ดูภาพสด/ย้อนหลังจาก NVR ผ่าน WebRTC proxy (เจ้าหน้าที่เท่านั้น) |

---

## สถานะความหนาแน่น

เกณฑ์ตามเอกสารเทศบาลนครลำปาง (ดู `backend/src/services/peopleCountService.js`):

| สถานะ | จำนวนคน | คำอธิบาย |
|-------|---------|----------|
| ปกติ | 0-500 | สภาพปกติ ไหลลื่น |
| ปานกลาง | 501-1,200 | ค่อนข้างคึกคัก |
| หนาแน่น | 1,201-2,500 | เริ่มแออัด (ส่ง warning) |
| หนาแน่นมาก | 2,501+ | วิกฤต (ส่ง critical alert) |

ค่าที่ใช้คำนวณเป็นค่า EMA-smoothed และมี cooldown 10 นาทีกันการแจ้งเตือนซ้ำ

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL (Supabase) |
| AI Service | Python, YOLOv8, OpenCV |
| Authentication | LINE Login v2.1 (OAuth 2.0) |
| Notification | LINE Messaging API |
| Weather API | OpenWeatherMap, Open-Meteo |
| Testing | Vitest, Supertest (backend) |
| Deployment | Vercel (Frontend), Render/Railway via Docker (Backend), On-premise Docker (AI Service) |

---

## Project Structure

```
FORLP/
├── backend/                    # Backend API Server
│   ├── src/
│   │   ├── index.js           # Routes + app entry
│   │   ├── config/            # env-driven config + validation
│   │   ├── db/                # pg pool, query helpers, schema.sql
│   │   ├── middleware/        # rate limit, sanitize, timeout, error handler
│   │   ├── services/
│   │   │   ├── authService.js         # LINE Login + Role management
│   │   │   ├── peopleCountService.js  # นับคน, EMA smoothing, thresholds
│   │   │   ├── zoneStatus.js          # สถานะความหนาแน่นรายโซน
│   │   │   ├── weatherService.js      # Weather + PM2.5 API
│   │   │   ├── earlyWarningService.js # Rain + Crowd alerts
│   │   │   ├── dailyReportService.js  # LINE OA messaging
│   │   │   └── pollingService.js      # Data polling
│   │   └── utils/             # error classes, structured logging
│   └── test/                  # unit / services / routes (Vitest + Supertest)
│
├── frontend/                   # React Frontend (ประชาชน/ร้านค้า)
│   ├── src/
│   │   ├── App.jsx            # Main app + routing
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx    # Authentication context
│   │   ├── pages/
│   │   │   ├── PeoplePage.jsx     # หน้าจำนวนผู้คน
│   │   │   ├── WeatherPage.jsx    # หน้าสภาพอากาศ
│   │   │   ├── ReportsPage.jsx    # หน้ารายงาน
│   │   │   ├── CameraPage.jsx     # หน้ากล้อง CCTV
│   │   │   └── SettingsPage.jsx   # หน้าตั้งค่าบัญชี
│   │   └── services/
│   │       ├── api.jsx            # API client
│   │       └── liffService.js     # LINE LIFF integration
│   └── index.html
│
├── ai-service/                 # AI People Counting Service
│   ├── src/
│   │   ├── main.py            # Main AI processing
│   │   └── health.py          # Health check API
│   ├── config.yaml            # Camera + AI configuration (6 กล้อง: A01/B01/B02)
│   ├── yolov8n.pt             # YOLOv8 model
│   ├── Dockerfile             # CPU Docker image
│   ├── Dockerfile.gpu         # GPU Docker image
│   └── requirements.txt       # Python dependencies
│
├── docs/                       # Documentation
│   ├── architecture.md
│   ├── ENV_SETUP.md
│   └── openapi.yaml
│
├── monitoring/                 # Monitoring
│   └── prometheus.yml
│
├── docker-compose.yml
├── railway.json               # Railway deployment config
└── vercel.json                # Vercel deployment config
```

---

## หน้าจอในระบบ (frontend = Dashboard)

`frontend/` (React + Vite) เป็นแอปเดียวที่ทำหน้าที่เป็น Dashboard สำหรับทั้งประชาชนและเจ้าหน้าที่
(รวม Dashboard เจ้าหน้าที่เข้ามาไว้ในแอปนี้แล้ว — ดู [การทำตามแผน Figma](#การทำตามแผน-figma))

| หน้า | Path | รายละเอียด |
|------|------|------------|
| ภาพรวมพื้นที่ | `/` | จำนวนผู้คน Real-time + Crowd Level + Zone A/B/C heatmap |
| กล้องวงจรปิด | `/camera` | CCTV Live + Playback (เจ้าหน้าที่เท่านั้น) |
| สภาพอากาศ | `/weather` | อุณหภูมิ, ความชื้น, PM2.5 |
| รายงานข้อมูล | `/reports` | สรุปรายวัน/รายสัปดาห์ (เฉพาะช่วงตลาดเปิด) |
| ตั้งค่าบัญชี | `/settings` | LINE Login + ยืนยัน Officer Token, ปรับสัดส่วน Zone |

---

## การทำตามแผน Figma

แผน Use Case + System Architecture: [FORLP Figma Board](https://www.figma.com/board/viJMti5DzvkZumagTLNyvS/FORLP-Use-Case-Diagram-and-System-Achitecture)

### ทำแล้ว (ตรงตามแผน)

- ภาพรวมจำนวนคน + Crowd Level + Zone A/B/C (`/api/people/current`, `/api/zones/current`)
- สภาพอากาศ + PM2.5 (`/api/weather/current`)
- รายงานรายวัน/รายสัปดาห์ (`/api/reports/daily|weekly`)
- CCTV Live + Playback เฉพาะเจ้าหน้าที่ (`/api/cctv/streams`, `/api/cctv/playback-url`)
- LINE Login v2.1 + ยืนยัน Officer Token (`/api/auth/*`)
- เจ้าหน้าที่ปรับสัดส่วน Zone A/B/C (`/api/zones/update`)
- แจ้งเตือน LINE OA: Rain / Crowd (≥1,201) / Critical (≥2,501) / Daily Report (เสาร์-อาทิตย์ 23:00)

### ยังไม่ได้ทำ (planned ในแผน Figma)

- Landing Page (Exhibition) + สลับภาษา TH/EN
- Kiosk Mode `/kiosk` (4K TV, refresh 10 วิ)
- รายงานรายเดือน + Event Comparison (`/api/reports/monthly`)
- แจ้งจุดเสี่ยง + GPS + Safety Log (`/api/safety-reports`)
- หน้าตั้งค่า Alert Threshold สำหรับเจ้าหน้าที่

> หมายเหตุความต่างจากแผน: หน้าภาพรวมตั้ง auto-refresh ไว้ที่ **30 วินาที** (แผน Figma ระบุ 5 วินาที)

---

## การติดตั้ง

### Prerequisites

- Node.js 20+
- Python 3.10+ (สำหรับ AI Service)
- Supabase project (PostgreSQL) สำหรับ backend
- Docker (optional)

### Installation

```bash
# Clone project
git clone <repository-url>
cd FORLP

# Install backend + frontend dependencies
npm run install:all
```

### Development

```bash
# รัน Backend + Frontend พร้อมกัน
npm run dev

# หรือรันแยก
npm run dev:backend    # Backend: http://localhost:3000
npm run dev:frontend   # Frontend: http://localhost:5173
```

### AI Service

```bash
cd ai-service

# สร้าง virtual environment
python -m venv venv
source venv/bin/activate

# ติดตั้ง dependencies
pip install -r requirements.txt

# แก้ไข config.yaml ตาม environment
# รัน service
python src/main.py
```

### Docker

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down
```

---

## Environment Variables

ดูรายการเต็มพร้อมคำอธิบายใน `backend/.env.example` และ `docs/ENV_SETUP.md` — ค่าหลักที่ต้องตั้ง:

```env
# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true

# LINE OA (Messaging API)
LINE_CHANNEL_ACCESS_TOKEN=xxx
LINE_CHANNEL_SECRET=xxx

# LINE Login (OAuth 2.0)
LINE_LOGIN_CHANNEL_ID=xxx
LINE_LOGIN_CHANNEL_SECRET=xxx
LINE_LOGIN_CALLBACK_URL=https://your-frontend.com/settings

# Weather API
OPENWEATHER_API_KEY=xxx

# AI Service (ต้องตรงกับ config.yaml ของ ai-service)
AI_API_KEY=xxx

# NVR / CCTV (ห้าม hardcode ในโค้ด)
NVR_HOST_A=...
NVR_HOST_B=...
NVR_USER=...
NVR_PASS=...
WEBRTC_BASE_URL=...

# Session + Frontend
SESSION_SECRET=xxx
FRONTEND_URL=https://your-frontend.com
```

### AI Service (config.yaml)

```yaml
service:
  model: "yolov8n.pt"
  device: "cpu"
  confidence: 0.4
  send_interval_s: 5
  backend_endpoint: "https://your-backend.com/api/ai/people-count"
  backend_api_key: "your-api-key"

streams:
  - stream_id: "camera-1"
    rtsp: "rtsp://user:pass@ip:554/path"
    sampling_fps: 0.5
```

---

## API Endpoints

รายละเอียดเต็มดูที่ `docs/openapi.yaml` — endpoint หลัก:

### People & Zones

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/people/current` | จำนวนคนปัจจุบัน |
| GET | `/api/people/history` | ข้อมูลย้อนหลัง |
| GET | `/api/people/hourly` | สรุปรายชั่วโมง |
| GET | `/api/people/daily?date=YYYY-MM-DD` | สรุปรายวัน |
| GET | `/api/people/crowd-level` | ระดับความแออัด |
| GET | `/api/zones/current` | สถานะความหนาแน่นรายโซน |
| POST | `/api/zones/update` | อัปเดตข้อมูลโซน (ต้อง auth) |

### Reports & Weather

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/daily` | รายงานรายวัน |
| GET | `/api/reports/weekly` | สรุปรายสัปดาห์ (เฉพาะช่วง 16:00-22:00) |
| GET | `/api/reports/history` | รายงานย้อนหลัง |
| GET | `/api/weather/current` | สภาพอากาศปัจจุบัน |
| GET | `/api/warnings/forecast` | พยากรณ์/คำเตือน |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/line/authorize` | เริ่ม LINE Login |
| POST | `/api/auth/line/callback` | รับ callback จาก LINE |
| GET | `/api/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน |
| PUT | `/api/auth/role` | เปลี่ยนบทบาท |
| POST | `/api/auth/verify-officer` | ยืนยันตัวตนเจ้าหน้าที่ |
| POST | `/api/auth/logout` | ออกจากระบบ |

### AI Service & CCTV

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/people-count` | รับข้อมูลจาก AI Service |
| POST | `/api/ai/people-count/batch` | รับข้อมูลแบบ batch |
| GET | `/api/ai/cameras` | รายการกล้อง |
| GET | `/api/cctv/streams` | รายการ stream (เจ้าหน้าที่) |
| POST | `/api/cctv/playback-url` | URL ดูภาพย้อนหลัง (เจ้าหน้าที่) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/system/status` | สถานะระบบ |
| GET | `/api/dashboard` | ข้อมูลรวมสำหรับ dashboard |

---

## Scheduled Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| Rain Check | ทุก 10 นาที | ตรวจสอบพยากรณ์ฝน |
| Crowd Alerts | Real-time | แจ้งเตือนเมื่อคน >= 1,201 (warning) หรือ >= 2,501 (critical) |
| Daily Report | เสาร์-อาทิตย์ 23:00 (Asia/Bangkok) | ส่งรายงานประจำวันไป LINE OA |

---

## Testing

Backend มีชุดทดสอบด้วย Vitest + Supertest (unit / services / routes) รันกับ Postgres จริงใน schema แยก `forlp_test` — ไม่กระทบข้อมูล production

```bash
cd backend
npm test          # one-shot
npm run test:watch
```

รายละเอียดเพิ่มเติมดู `backend/README.md`

---

## Privacy & Security

- ไม่เก็บวิดีโอหรือภาพบุคคล
- ไม่ทำ Face Recognition
- เก็บเฉพาะข้อมูลเชิงสถิติ (จำนวนคน, เวลา)
- สอดคล้อง PDPA / Privacy by Design
- กล้อง CCTV เข้าถึงได้เฉพาะเจ้าหน้าที่ที่ยืนยันตัวตนแล้ว
- Credentials ของ NVR/LINE/Supabase ใช้ environment variables เท่านั้น (ดู `backend/SECURITY.md`)

---

## Deployment

### Frontend (Vercel)

`vercel.json` build จาก `frontend/` และตั้ง `VITE_API_URL` ชี้ไปยัง backend — push ไป main branch แล้ว auto deploy

### Backend (Render / Railway)

Deploy ด้วย Docker (`backend/Dockerfile`) — มี `railway.json` สำหรับ Railway และปัจจุบัน frontend ชี้ API ไปที่ instance บน Render (`forlp.onrender.com`)

### AI Service (On-premise Docker)

```bash
# On-premise server with RTSP access
docker-compose up ai-service -d
```

---

## พัฒนาโดย

DII CAMT CMU
