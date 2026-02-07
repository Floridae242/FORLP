# Kad Kong Ta Smart Insight

ระบบวิเคราะห์และบริหารจัดการพื้นที่สาธารณะด้วยข้อมูลจริง สำหรับถนนคนเดินกาดกองต้า เทศบาลนครลำปาง

---

## ภาพรวมระบบ

ระบบนี้เปลี่ยนจากการ "คาดเดา" เป็นการ "ตัดสินใจด้วยข้อมูลจริง" โดยใช้ข้อมูลจาก:
- กล้อง CCTV เดิม (ไม่ติดตั้ง hardware ใหม่)
- AI People Counting (YOLOv8)
- สภาพอากาศและคุณภาพอากาศ
- การแจ้งเตือนผ่าน LINE OA

---

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---------|------------|
| AI People Counting | นับจำนวนคนอัตโนมัติด้วย YOLOv8 แบบ Real-time |
| สภาพอากาศ | อุณหภูมิ, ความชื้น, ความเร็วลม |
| คุณภาพอากาศ | ค่า PM2.5 พร้อมคำแนะนำ |
| รายงานข้อมูล | สรุปรายวัน, รายสัปดาห์ (นับเฉพาะช่วง 16:00-22:00 น.) |
| Daily Report | ส่งรายงานประจำวันไป LINE OA (เสาร์-อาทิตย์ 23:00 น.) |
| Early Warning | แจ้งเตือนฝน, ความแออัด (>= 300 คน), วิกฤต (>= 600 คน) |
| LINE Login | ระบบยืนยันตัวตนผ่าน LINE Login v2.1 |
| Role-based Access | แบ่งสิทธิ์ตามบทบาท (ร้านค้า, ประชาชน, นักท่องเที่ยว, เจ้าหน้าที่) |

---

## สถานะความหนาแน่น

| สถานะ | จำนวนคน | คำอธิบาย |
|-------|---------|----------|
| ปกติ | 0-99 | พื้นที่โล่ง |
| ปานกลาง | 100-299 | มีคนพอสมควร |
| ค่อนข้างหนาแน่น | 300-599 | แออัด (แจ้งเตือน) |
| หนาแน่นมาก | 600+ | วิกฤต (แจ้งเตือนฉุกเฉิน) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite |
| Backend | Node.js, Express |
| Database | SQLite |
| AI Service | Python, YOLOv8, OpenCV |
| Authentication | LINE Login v2.1 (OAuth 2.0) |
| Notification | LINE Messaging API |
| Weather API | OpenWeatherMap, Open-Meteo |
| Deployment | Railway (Backend), Vercel (Frontend) |

---

## Project Structure

```
FORLP/
├── backend/                    # Backend API Server
│   ├── src/
│   │   ├── index.js           # Main server + API routes
│   │   ├── config/
│   │   │   └── index.js       # Configuration
│   │   ├── db/
│   │   │   ├── index.js       # Database connection
│   │   │   └── schema.sql     # Database schema
│   │   └── services/
│   │       ├── authService.js         # LINE Login + Role management
│   │       ├── peopleCountService.js  # People counting logic
│   │       ├── weatherService.js      # Weather + PM2.5 API
│   │       ├── earlyWarningService.js # Rain + Crowd alerts
│   │       ├── dailyReportService.js  # LINE OA messaging
│   │       └── pollingService.js      # Data polling
│   └── data/
│       └── kadkongta.db       # SQLite database
│
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── App.jsx            # Main app + routing
│   │   ├── index.css          # Global styles
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
│   ├── config.yaml            # Camera + AI configuration
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

## หน้าจอในระบบ

| หน้า | Path | รายละเอียด |
|------|------|------------|
| ภาพรวมพื้นที่ | `/` | แสดงจำนวนผู้คนในพื้นที่แบบ Real-time |
| กล้องวงจรปิด | `/camera` | ดูภาพจากกล้อง CCTV (เจ้าหน้าที่เท่านั้น) |
| สภาพอากาศ | `/weather` | อุณหภูมิ, ความชื้น, PM2.5 |
| รายงานข้อมูล | `/reports` | สรุปรายวัน/รายสัปดาห์ (เฉพาะช่วงตลาดเปิด) |
| ตั้งค่าบัญชี | `/settings` | LINE Login, เลือกบทบาท |

---

## การติดตั้ง

### Prerequisites

- Node.js 18+
- Python 3.10+ (สำหรับ AI Service)
- Docker (optional)

### Installation

```bash
# Clone project
git clone <repository-url>
cd FORLP

# Install all dependencies
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

### Backend (.env)

```env
PORT=3000
NODE_ENV=production

# LINE OA (Messaging API)
LINE_CHANNEL_ACCESS_TOKEN=xxx
LINE_CHANNEL_SECRET=xxx

# LINE Login (OAuth 2.0)
LINE_LOGIN_CHANNEL_ID=xxx
LINE_LOGIN_CHANNEL_SECRET=xxx
LINE_LOGIN_CALLBACK_URL=https://your-frontend.com/settings

# Weather API
OPENWEATHER_API_KEY=xxx

# Frontend URL
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

### Public APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/people/current` | จำนวนคนปัจจุบัน |
| GET | `/api/people/daily?date=YYYY-MM-DD` | สรุปรายวัน |
| GET | `/api/reports/weekly` | สรุปรายสัปดาห์ (เฉพาะช่วง 16:00-22:00) |
| GET | `/api/weather/current` | สภาพอากาศปัจจุบัน |
| GET | `/api/people/crowd-level` | ระดับความแออัด |

### Auth APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/line/authorize` | เริ่ม LINE Login |
| POST | `/api/auth/line/callback` | รับ callback จาก LINE |
| GET | `/api/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน |
| PUT | `/api/auth/role` | เปลี่ยนบทบาท |
| POST | `/api/auth/logout` | ออกจากระบบ |

### AI Service APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/people-count` | รับข้อมูลจาก AI Service |
| GET | `/api/ai/cameras` | รายการกล้อง |

---

## Scheduled Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| Rain Check | ทุก 10 นาที | ตรวจสอบพยากรณ์ฝน |
| Crowd Alerts | Real-time | แจ้งเตือนเมื่อคน >= 300 หรือ >= 600 |
| Daily Report | เสาร์-อาทิตย์ 23:00 | ส่งรายงานประจำวันไป LINE OA |

---

## Privacy & Security

- ไม่เก็บวิดีโอหรือภาพบุคคล
- ไม่ทำ Face Recognition
- เก็บเฉพาะข้อมูลเชิงสถิติ (จำนวนคน, เวลา)
- สอดคล้อง PDPA / Privacy by Design
- กล้อง CCTV เข้าถึงได้เฉพาะเจ้าหน้าที่ที่ยืนยันตัวตนแล้ว

---

## Deployment

### Backend (Railway)

```bash
# railway.json configured
# Push to main branch -> auto deploy
```

### Frontend (Vercel)

```bash
# vercel.json configured
# Push to main branch -> auto deploy
```

### AI Service (Docker)

```bash
# On-premise server with RTSP access
docker-compose up ai-service -d
```

---

## พัฒนาโดย

DII CAMT CMU

