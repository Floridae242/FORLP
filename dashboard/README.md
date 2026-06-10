# FORLP Dashboard (เจ้าหน้าที่)

Next.js dashboard สำหรับเจ้าหน้าที่เทศบาลนครลำปาง — ภาพรวมถนนคนเดินกาดกองต้าแบบ Real-time: จำนวนคน, กราฟ traffic, แผนที่, Heatmap รายโซน, และภาพ CCTV

ส่วนหนึ่งของระบบ [Kad Kong Ta Smart Insight](../README.md)

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Zustand (state), Recharts (charts), lucide-react (icons)

## Run

```bash
npm install
npm run dev
```

หมายเหตุ: backend ใช้ port 3000 อยู่แล้ว — ถ้ารันพร้อมกัน Next.js จะเลื่อนไป port ถัดไป (เช่น 3001) อัตโนมัติ

ตั้งค่า API ผ่าน environment variable (ถ้าไม่ตั้ง จะใช้ backend production ที่ `forlp.onrender.com`):

```env
NEXT_PUBLIC_API_URL=http://localhost:3000   # FORLP backend (local)
```

## Structure

```text
src/
├── app/          # App Router (layout, page)
├── components/   # StatCard, TrafficChart, LiveMap, HeatmapGrid, CCTVGrid, ZoneCards
├── hooks/        # useDashboardPolling, useTrafficData, useClock
├── stores/       # Zustand dashboard store
├── lib/          # API client (fetch + polling), notification service, utils
└── types/        # shared TypeScript types
```

ข้อมูลมาจาก FORLP backend (`/api/dashboard`, `/api/people/*`, `/api/zones/current`, `/api/weather/current`) ผ่าน polling — ดู `src/hooks/useDashboardPolling.ts`
