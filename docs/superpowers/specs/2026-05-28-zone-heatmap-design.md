# Zone Heatmap — Design Spec
**Date:** 2026-05-28  
**Project:** FORLP — Kad Kong Ta Smart Insight  
**Status:** Approved

---

## Overview

Add a zone crowd-level visualization to both the frontend (React/Vite) and dashboard (Next.js) apps. Officers manually enter estimated crowd splits across Zone A, B, and C via an input modal. Both apps display three colored zone cards derived from that split applied to the current total people count.

---

## Data Layer

### New SQLite table: `zone_estimates`

```sql
CREATE TABLE IF NOT EXISTS zone_estimates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_code   TEXT NOT NULL,      -- 'A', 'B', or 'C'
  percentage  REAL NOT NULL,      -- 0–100; three rows must sum to 100
  updated_by  TEXT,               -- officer display name from LINE login
  updated_at  TEXT NOT NULL       -- ISO 8601 timestamp
);
```

Three rows are maintained (one per zone). On first write all three are inserted; on subsequent writes all three are replaced.

### Default split

If no rows exist yet, the API returns a default split of **A=60%, B=30%, C=10%** so cards are never empty.

### Computed fields (not stored)

- `estimated_count` = `ROUND((percentage / 100) * current_total_people_count)`
- `crowd_level` derived from estimated_count using existing status thresholds (normal / moderate / busy / crowded)

---

## API Endpoints

### `GET /api/zones/current`
- **Auth:** public (no token required)
- **Returns:**
```json
{
  "success": true,
  "data": {
    "total_people": 256,
    "updated_by": "Officer Tle",
    "updated_at": "2026-05-28T19:23:00.000Z",
    "zones": [
      { "zone_code": "A", "name": "ถนนคนเดิน", "percentage": 60, "estimated_count": 154, "crowd_level": "busy", "crowd_label": "ค่อนข้างแออัด" },
      { "zone_code": "B", "name": "สะพานรัษฎา", "percentage": 30, "estimated_count": 77,  "crowd_level": "moderate", "crowd_label": "ปกติ" },
      { "zone_code": "C", "name": "ตลาดเก่า",   "percentage": 10, "estimated_count": 26,  "crowd_level": "normal",   "crowd_label": "เบาบาง" }
    ]
  }
}
```

### `POST /api/zones/update`
- **Auth:** `authMiddleware + officerOnlyMiddleware`
- **Body:** `{ "A": 60, "B": 30, "C": 10 }`
- **Validation:** values must be numbers 0–100; A+B+C must equal 100 (±0.5 tolerance for float rounding)
- **On success:** upserts all three rows, returns updated zone data
- **On validation failure:** 400 with descriptive error message

---

## Frontend (React/Vite)

### New files
- `src/components/zones/ZoneHeatmap.jsx` — container, fetches `/api/zones/current`, renders three `ZoneCard`s
- `src/components/zones/ZoneCard.jsx` — single card component
- `src/components/zones/ZoneUpdateModal.jsx` — officer-only input modal

### Placement
Inserted in `PeoplePage.jsx` directly below the existing main count card, above the charts/stats section.

### `ZoneCard` display
Each card shows:
- Zone letter badge + Thai zone name
- Estimated headcount (or `—` if total is 0/unavailable)
- Thin progress bar showing percentage of total
- Crowd level label in Thai
- Background color intensity: green (normal) → yellow (moderate) → orange (busy) → red (crowded)

### `ZoneUpdateModal`
- Visible only when `user.role === 'officer'` (from `AuthContext`)
- Three numeric inputs for A%, B%, C%
- Live validation: shows running sum, disables submit until sum equals 100
- On save: POST to `/api/zones/update`, closes modal, refreshes zone cards
- Footer shows last updated by + timestamp

### Polling
`ZoneHeatmap` polls `/api/zones/current` every 60 seconds. On fetch failure, retains last known data and shows a small stale indicator.

---

## Dashboard (Next.js)

### New file
- `src/components/dashboard/ZoneCards.tsx` — read-only zone card grid

### Placement
Slotted into the main `page.tsx` grid between the people count widget and the CCTV grid.

### Behaviour
- Read-only (no officer input on the dashboard)
- Polls `/api/zones/current` every 30s via the existing polling pattern (`useDashboardPolling`)
- Same card visual as frontend

---

## Error Handling

| Situation | Behaviour |
|-----------|-----------|
| No zone estimates in DB | Returns default A=60%, B=30%, C=10% |
| Total people count is 0 or unavailable | Cards show `—` for count; percentage bars still render |
| Sum ≠ 100 on submit | Frontend blocks submit with inline error; backend returns 400 if bypassed |
| API fetch failure | Cards retain last known data; stale indicator shown |
| Two officers update simultaneously | Last-write-wins; `updated_by` reflects latest writer |

---

## Out of Scope

- Per-camera independent AI counting (future: multi-zone AI)
- Zone estimate history chart
- Zone edit history log
- Map/SVG overlay visualization
