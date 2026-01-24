##  ระบบนี้ทำอะไร

| สิ่งที่ทำ 
| แสดงจำนวนคนใน Zone A, B, C 
| แสดงสภาพอากาศ (อุณหภูมิ, ฝน) 
| แสดงคุณภาพอากาศ (PM2.5) 
| สรุปข้อมูลประจำวัน 
| ส่ง Daily Report ไป LINE OA 


| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | ข้อมูลรวมสำหรับ Dashboard |
| GET | `/api/zones` | จำนวนคนทุก Zone |
| GET | `/api/zones/:code` | จำนวนคน Zone เดียว (A, B, C) |
| GET | `/api/weather` | สภาพอากาศและ PM2.5 |
| GET | `/api/reports/daily` | รายงานประจำวันล่าสุด |
| GET | `/api/reports/history` | รายงานย้อนหลัง 7 วัน |
| POST | `/api/reports/generate` | สร้างรายงานใหม่ |
| POST | `/api/system/refresh` | Force refresh ข้อมูล |

---

##  Database Schema

```sql
-- จำนวนคนตาม Zone
people_counts (id, zone_code, people_count, recorded_at)

-- รายงานประจำวัน
daily_reports (id, report_date, zone_a_total, zone_b_total, zone_c_total, 
               weather_summary, pm25_avg, pm25_level, is_sent_line)
```

---

##  Daily Report (LINE OA)

ระบบจะส่งรายงานไป LINE Official Account ทุกวันเวลา **18:00 น.**

ตัวอย่างข้อความ:

```
 รายงานกาดก้องตา ประจำวัน
วันศุกร์ที่ 24 มกราคม 2569

👥 จำนวนผู้ใช้งานพื้นที่ (สูงสุด)
• Zone A: 350 คน
• Zone B: 520 คน
• Zone C: 410 คน
• รวม: 1,280 คน

🌦 สภาพอากาศ: ท้องฟ้าแจ่มใส (28°C)

🌫 PM2.5: 35 µg/m³ (ดี)

━━━━━━━━━━━━━━━
ข้อมูลนี้ใช้เพื่อสนับสนุนการตัดสินใจของเทศบาล
🐓 Kad Kong Ta Smart Insight
```

---

## 🔧 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_MODE` | `true` | ใช้ Mock Data สำหรับ Demo |
| `POLLING_INTERVAL` | `60000` | ความถี่ดึงข้อมูล (ms) |
| `DAILY_REPORT_HOUR` | `18` | ชั่วโมงส่ง Daily Report |
| `DAILY_REPORT_MINUTE` | `0` | นาทีส่ง Daily Report |

---

## Project Structure

```
backend/
├── src/
│   ├── index.js              # Main server
│   ├── config/index.js       # Configuration
│   ├── db/
│   │   ├── index.js          # Database queries
│   │   └── schema.sql        # Database schema
│   └── services/
│       ├── peopleCountService.js   # จำนวนคน
│       ├── weatherService.js       # Weather & PM2.5
│       ├── dailyReportService.js   # Daily Report
│       └── pollingService.js       # Scheduler

frontend/
├── src/
│   ├── App.jsx               # Main app
│   ├── pages/Dashboard.jsx   # หน้าหลัก
│   └── services/api.jsx      # API calls
```

