# Zone Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual-input zone crowd-level visualization (Zone A/B/C cards) to both the frontend (React/Vite) and dashboard (Next.js) apps, backed by a new `zone_estimates` SQLite table and two API endpoints.

**Architecture:** Officers enter crowd-split percentages via a modal in the frontend; the backend stores them and computes per-zone estimated headcounts by multiplying percentage × current total people count; both apps poll `GET /api/zones/current` every 30–60 s and render three colored zone cards.

**Tech Stack:** Node.js/Express + better-sqlite3 (backend), React 18 + Vitest (frontend), Next.js 16 + TypeScript + Tailwind 4 (dashboard)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/src/db/schema.sql` | Add `zone_estimates` table |
| Modify | `backend/src/db/index.js` | Add `getZoneEstimates`, `updateZoneEstimates` queries |
| Modify | `backend/src/index.js` | Add `GET /api/zones/current`, `POST /api/zones/update` routes |
| Modify | `frontend/src/services/api.jsx` | Add `getZoneCurrent()`, `updateZones()` |
| Modify | `frontend/vite.config.js` | Add Vitest `test` block |
| Create | `frontend/src/components/zones/ZoneCard.jsx` | Single zone card UI |
| Create | `frontend/src/components/zones/ZoneCard.test.jsx` | Vitest unit tests for ZoneCard |
| Create | `frontend/src/components/zones/ZoneUpdateModal.jsx` | Officer input modal |
| Create | `frontend/src/components/zones/ZoneHeatmap.jsx` | Container: fetches data, renders cards + modal |
| Modify | `frontend/src/pages/PeoplePage.jsx` | Insert `<ZoneHeatmap>` below counter card |
| Modify | `dashboard/src/lib/api.ts` | Add `getZones()` to `api` object |
| Modify | `dashboard/src/stores/dashboard.ts` | Update `fetchAll` to call `api.getZones()` with fallback |
| Create | `dashboard/src/components/dashboard/ZoneCards.tsx` | Read-only zone card grid for dashboard |
| Modify | `dashboard/src/app/page.tsx` | Import and place `<ZoneCards>` |

---

## Task 1: Add `zone_estimates` table to schema

**Files:**
- Modify: `backend/src/db/schema.sql`

- [ ] **Step 1: Add table definition at end of schema.sql**

Open `backend/src/db/schema.sql` and append after the last `CREATE INDEX` statement:

```sql
-- Zone Estimates (สัดส่วนผู้คนในแต่ละโซน — บันทึกโดยเจ้าหน้าที่)
CREATE TABLE IF NOT EXISTS zone_estimates (
  zone_code   TEXT PRIMARY KEY,   -- 'A', 'B', or 'C'
  percentage  REAL NOT NULL,      -- 0–100; three rows must always sum to 100
  updated_by  TEXT,               -- officer display name
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Restart backend and verify table was created**

```bash
cd backend && node -e "
import('./src/db/index.js').then(({ initDatabase, getDb }) => {
  initDatabase().then(() => {
    const rows = getDb().prepare(\"PRAGMA table_info(zone_estimates)\").all();
    console.log(rows);
    process.exit(0);
  });
});
"
```

Expected output: array with `zone_code`, `percentage`, `updated_by`, `updated_at` columns.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.sql
git commit -m "feat: add zone_estimates table to schema"
```

---

## Task 2: Add DB query methods

**Files:**
- Modify: `backend/src/db/index.js` — add two entries to the `queries` object

- [ ] **Step 1: Add `getZoneEstimates` and `updateZoneEstimates` inside the `queries` object**

Find the closing `};` of `export const queries = {` and insert before it:

```javascript
    // ==================== ZONE ESTIMATES ====================
    getZoneEstimates: () => {
        const rows = getDb().prepare(
            'SELECT * FROM zone_estimates ORDER BY zone_code'
        ).all();
        if (rows.length === 0) {
            return [
                { zone_code: 'A', percentage: 60, updated_by: null, updated_at: null },
                { zone_code: 'B', percentage: 30, updated_by: null, updated_at: null },
                { zone_code: 'C', percentage: 10, updated_by: null, updated_at: null },
            ];
        }
        return rows;
    },

    updateZoneEstimates: (percentages, updatedBy) => {
        const stmt = getDb().prepare(
            'INSERT OR REPLACE INTO zone_estimates (zone_code, percentage, updated_by, updated_at) VALUES (?, ?, ?, ?)'
        );
        const now = new Date().toISOString();
        const insertAll = getDb().transaction((pairs) => {
            for (const [code, pct] of pairs) {
                stmt.run(code, pct, updatedBy, now);
            }
        });
        insertAll(Object.entries(percentages));
    },
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/db/index.js
git commit -m "feat: add getZoneEstimates and updateZoneEstimates DB queries"
```

---

## Task 3: Add backend API routes

**Files:**
- Modify: `backend/src/index.js`

The crowd-level helper and zone names are needed in both routes, so define them once above the routes.

- [ ] **Step 1: Add zone helper constants above the zone routes**

Find the `// ==================== CAMERA API FOR AI SERVICE ====================` comment and insert above it:

```javascript
// ==================== ZONE ESTIMATES API ====================

const ZONE_NAMES = { A: 'ถนนคนเดิน', B: 'สะพานรัษฎา', C: 'ตลาดเก่า' };

function zoneStatusFromCount(count) {
    if (count >= 2501) return { crowd_level: 'crowded',  crowd_label: 'แออัด' };
    if (count >= 1201) return { crowd_level: 'busy',     crowd_label: 'ค่อนข้างแออัด' };
    if (count >= 501)  return { crowd_level: 'moderate', crowd_label: 'ปกติ' };
    return             { crowd_level: 'normal',   crowd_label: 'เบาบาง' };
}

function buildZoneResponse() {
    const current = peopleCountService.getCurrentCount();
    const total = current?.smoothed_count ?? current?.count ?? 0;
    const rows = queries.getZoneEstimates();

    const zones = rows.map((row) => {
        const estimated_count = total > 0
            ? Math.round((row.percentage / 100) * total)
            : null;
        return {
            zone_code: row.zone_code,
            name: ZONE_NAMES[row.zone_code] || row.zone_code,
            percentage: row.percentage,
            estimated_count,
            ...zoneStatusFromCount(estimated_count ?? 0),
        };
    });

    const lastRow = rows.find((r) => r.updated_at);
    return {
        total_people: total,
        updated_by: lastRow?.updated_by ?? null,
        updated_at: lastRow?.updated_at ?? null,
        zones,
    };
}
```

- [ ] **Step 2: Add `GET /api/zones/current` route immediately after the helper block**

```javascript
// GET /api/zones/current — สัดส่วนผู้คนในแต่ละโซน (public)
app.get('/api/zones/current', (req, res) => {
    res.json({ success: true, data: buildZoneResponse() });
});
```

- [ ] **Step 3: Add `POST /api/zones/update` route immediately after**

```javascript
// POST /api/zones/update — อัปเดตสัดส่วนโซน (officer only)
app.post('/api/zones/update', authMiddleware, officerOnlyMiddleware, (req, res) => {
    const { A, B, C } = req.body;

    if (typeof A !== 'number' || typeof B !== 'number' || typeof C !== 'number') {
        return res.status(400).json({
            success: false,
            error: 'A, B, C ต้องเป็นตัวเลข',
        });
    }

    const sum = A + B + C;
    if (Math.abs(sum - 100) > 0.5) {
        return res.status(400).json({
            success: false,
            error: `สัดส่วนรวมต้องเท่ากับ 100 (ได้รับ ${sum.toFixed(1)})`,
        });
    }

    const updatedBy = req.user?.displayName || req.user?.userId || 'เจ้าหน้าที่';
    queries.updateZoneEstimates({ A, B, C }, updatedBy);

    res.json({ success: true, data: buildZoneResponse() });
});
```

- [ ] **Step 4: Verify with curl (start backend first with `cd backend && npm run dev`)**

```bash
# Public endpoint — should return default split (A=60, B=30, C=10)
curl -s http://localhost:3001/api/zones/current | jq '.data.zones'

# Protected endpoint without auth — should return 401
curl -s -X POST http://localhost:3001/api/zones/update \
  -H "Content-Type: application/json" \
  -d '{"A":50,"B":30,"C":20}' | jq '.error'
```

Expected GET output:
```json
[
  { "zone_code": "A", "percentage": 60, "crowd_level": "normal", ... },
  { "zone_code": "B", "percentage": 30, ... },
  { "zone_code": "C", "percentage": 10, ... }
]
```

Expected POST output: `"Unauthorized"` or similar auth error message.

- [ ] **Step 5: Also add the `queries` import at the top of index.js if not already destructured**

Check the imports at the top of `backend/src/index.js`. If `queries` is not already imported, add it:

```javascript
import { initDatabase, queries } from './db/index.js';
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/index.js
git commit -m "feat: add GET /api/zones/current and POST /api/zones/update"
```

---

## Task 4: Frontend API service methods

**Files:**
- Modify: `frontend/src/services/api.jsx`

- [ ] **Step 1: Add `getZoneCurrent` and `updateZones` functions**

In `frontend/src/services/api.jsx`, find the `// =====================================================` block before `// HEALTH CHECK` and insert before it:

```javascript
// =====================================================
// ZONE ESTIMATES APIs
// =====================================================

/**
 * GET /api/zones/current — สัดส่วนผู้คนในแต่ละโซน
 */
export async function getZoneCurrent() {
    const result = await apiFetch('/api/zones/current');
    return result.data;
}

/**
 * POST /api/zones/update — อัปเดตสัดส่วนโซน (officer only)
 * @param {{ A: number, B: number, C: number }} percentages
 */
export async function updateZones(percentages) {
    const sessionToken = localStorage.getItem('forlp_session_token');
    const result = await apiFetch('/api/zones/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(percentages),
    });
    return result.data;
}
```

Also add both to the `api` export object at the bottom of the file:

```javascript
    // Zone Estimates
    getZoneCurrent,
    updateZones,
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.jsx
git commit -m "feat: add getZoneCurrent and updateZones API service methods"
```

---

## Task 5: Configure Vitest + create ZoneCard component

**Files:**
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/components/zones/ZoneCard.jsx`
- Create: `frontend/src/components/zones/ZoneCard.test.jsx`

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend && npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add Vitest config to `frontend/vite.config.js`**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:3001', changeOrigin: true },
            '/line': { target: 'http://localhost:3001', changeOrigin: true },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test-setup.js',
    },
});
```

- [ ] **Step 3: Create `frontend/src/test-setup.js`**

```javascript
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Write the failing test first — `frontend/src/components/zones/ZoneCard.test.jsx`**

```javascript
import { render, screen } from '@testing-library/react';
import ZoneCard from './ZoneCard';

const baseZone = {
    zone_code: 'A',
    name: 'ถนนคนเดิน',
    percentage: 60,
    estimated_count: 154,
    crowd_level: 'busy',
    crowd_label: 'ค่อนข้างแออัด',
};

test('renders zone code and name', () => {
    render(<ZoneCard zone={baseZone} />);
    expect(screen.getByText('โซน A')).toBeInTheDocument();
    expect(screen.getByText('ถนนคนเดิน')).toBeInTheDocument();
});

test('renders estimated count', () => {
    render(<ZoneCard zone={baseZone} />);
    expect(screen.getByText('154 คน')).toBeInTheDocument();
});

test('renders dash when estimated_count is null', () => {
    render(<ZoneCard zone={{ ...baseZone, estimated_count: null }} />);
    expect(screen.getByText('— คน')).toBeInTheDocument();
});

test('renders percentage', () => {
    render(<ZoneCard zone={baseZone} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
});

test('renders crowd label', () => {
    render(<ZoneCard zone={baseZone} />);
    expect(screen.getByText('ค่อนข้างแออัด')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run — expect FAIL because ZoneCard doesn't exist yet**

```bash
cd frontend && npm test -- --run
```

Expected: `Cannot find module './ZoneCard'`

- [ ] **Step 6: Create `frontend/src/components/zones/ZoneCard.jsx`**

```javascript
const COLORS = {
    normal:   { bg: '#f0fff4', border: '#9ae6b4', text: '#276749', bar: '#48bb78' },
    moderate: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', bar: '#f59e0b' },
    busy:     { bg: '#fff7ed', border: '#fdba74', text: '#9a3412', bar: '#f97316' },
    crowded:  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', bar: '#ef4444' },
};

export default function ZoneCard({ zone }) {
    const { zone_code, name, percentage, estimated_count, crowd_label, crowd_level } = zone;
    const c = COLORS[crowd_level] ?? COLORS.normal;

    return (
        <div style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 'var(--border-radius-lg, 12px)',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: c.text }}>โซน {zone_code}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #718096)' }}>{name}</span>
            </div>

            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: c.text }}>
                {estimated_count !== null ? estimated_count.toLocaleString() : '—'} คน
            </div>

            <div style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 4, height: 6 }}>
                <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: c.bar,
                    borderRadius: 4,
                    transition: 'width 0.4s ease',
                }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: c.text }}>● {crowd_label}</span>
                <span style={{ color: 'var(--text-muted, #718096)' }}>{percentage}%</span>
            </div>
        </div>
    );
}
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
cd frontend && npm test -- --run
```

Expected: `5 tests passed`

- [ ] **Step 8: Commit**

```bash
git add frontend/vite.config.js frontend/src/test-setup.js \
        frontend/src/components/zones/ZoneCard.jsx \
        frontend/src/components/zones/ZoneCard.test.jsx
git commit -m "feat: add ZoneCard component with Vitest tests"
```

---

## Task 6: Create ZoneUpdateModal component

**Files:**
- Create: `frontend/src/components/zones/ZoneUpdateModal.jsx`

- [ ] **Step 1: Create the modal**

```javascript
import { useState } from 'react';
import { updateZones } from '../../services/api.jsx';

const ZONE_LABELS = { A: 'โซน A — ถนนคนเดิน', B: 'โซน B — สะพานรัษฎา', C: 'โซน C — ตลาดเก่า' };

export default function ZoneUpdateModal({ currentZones, onClose, onSaved }) {
    const initial = { A: 60, B: 30, C: 10 };
    currentZones?.forEach((z) => { initial[z.zone_code] = z.percentage; });

    const [values, setValues] = useState(initial);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const sum = Number(values.A) + Number(values.B) + Number(values.C);
    const isValid = Math.abs(sum - 100) <= 0.5;

    const handleChange = (zone, val) => {
        setValues((prev) => ({ ...prev, [zone]: Number(val) }));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await updateZones({ A: Number(values.A), B: Number(values.B), C: Number(values.C) });
            onSaved();
        } catch (err) {
            setError(err.message || 'เกิดข้อผิดพลาด');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={{
                background: 'var(--bg-card, #fff)', borderRadius: 'var(--border-radius-lg, 12px)',
                padding: '1.5rem', width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>
                    อัปเดตสัดส่วนโซน
                </h3>

                {(['A', 'B', 'C']).map((zone) => (
                    <div key={zone} style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted, #718096)', marginBottom: 4 }}>
                            {ZONE_LABELS[zone]}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={values[zone]}
                                onChange={(e) => handleChange(zone, e.target.value)}
                                style={{
                                    flex: 1, padding: '8px 12px',
                                    border: '1px solid var(--border-color, #e2e8f0)',
                                    borderRadius: 'var(--border-radius, 8px)',
                                    fontSize: '0.9375rem', fontWeight: 600,
                                    background: 'var(--bg-card, #fff)',
                                    color: 'var(--text-body, #2d3748)',
                                }}
                            />
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted, #718096)', width: 16 }}>%</span>
                        </div>
                    </div>
                ))}

                <p style={{
                    margin: '0.5rem 0 1rem',
                    fontSize: '0.8125rem',
                    color: isValid ? 'var(--status-safe, #38a169)' : 'var(--status-danger, #e53e3e)',
                    fontWeight: 600,
                }}>
                    รวม: {sum.toFixed(0)}% {isValid ? '✓' : '— ต้องรวมเป็น 100'}
                </p>

                {error && (
                    <p style={{ color: 'var(--status-danger, #e53e3e)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                        ⚠ {error}
                    </p>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px', borderRadius: 'var(--border-radius, 8px)',
                            border: '1px solid var(--border-color, #e2e8f0)',
                            background: 'transparent', cursor: 'pointer', fontSize: '0.875rem',
                        }}
                    >
                        ยกเลิก
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid || saving}
                        style={{
                            padding: '8px 16px', borderRadius: 'var(--border-radius, 8px)',
                            border: 'none', background: isValid ? 'var(--color-primary, #3182ce)' : '#cbd5e0',
                            color: 'white', cursor: isValid ? 'pointer' : 'not-allowed',
                            fontSize: '0.875rem', fontWeight: 600,
                        }}
                    >
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/zones/ZoneUpdateModal.jsx
git commit -m "feat: add ZoneUpdateModal component"
```

---

## Task 7: Create ZoneHeatmap container

**Files:**
- Create: `frontend/src/components/zones/ZoneHeatmap.jsx`

- [ ] **Step 1: Create the container**

```javascript
import { useState, useEffect } from 'react';
import { getZoneCurrent } from '../../services/api.jsx';
import ZoneCard from './ZoneCard';
import ZoneUpdateModal from './ZoneUpdateModal';

export default function ZoneHeatmap({ isOfficer = false }) {
    const [zoneData, setZoneData] = useState(null);
    const [isStale, setIsStale] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchZones = async () => {
        try {
            const data = await getZoneCurrent();
            setZoneData(data);
            setIsStale(false);
        } catch {
            setIsStale(true);
        }
    };

    useEffect(() => {
        fetchZones();
        const id = setInterval(fetchZones, 60_000);
        return () => clearInterval(id);
    }, []);

    if (!zoneData) {
        return (
            <section className="section">
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
                    กำลังโหลดข้อมูลโซน...
                </div>
            </section>
        );
    }

    return (
        <section className="section">
            <div className="section-header">
                <h2 className="section-title">ความหนาแน่นตามโซน</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {isStale && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--status-caution, #d69e2e)' }}>
                            ⚠ ข้อมูลเก่า
                        </span>
                    )}
                    {isOfficer && (
                        <button
                            onClick={() => setIsModalOpen(true)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 'var(--border-radius, 8px)',
                                border: '1px solid var(--border-color, #e2e8f0)',
                                background: 'var(--bg-card, #fff)',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                fontWeight: 500,
                            }}
                        >
                            อัปเดตโซน
                        </button>
                    )}
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
            }}>
                {zoneData.zones.map((zone) => (
                    <ZoneCard key={zone.zone_code} zone={zone} />
                ))}
            </div>

            {zoneData.updated_by && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    อัปเดตโดย {zoneData.updated_by} · {new Date(zoneData.updated_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                </p>
            )}

            {isModalOpen && (
                <ZoneUpdateModal
                    currentZones={zoneData.zones}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={() => { setIsModalOpen(false); fetchZones(); }}
                />
            )}
        </section>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/zones/ZoneHeatmap.jsx
git commit -m "feat: add ZoneHeatmap container component"
```

---

## Task 8: Wire ZoneHeatmap into PeoplePage

**Files:**
- Modify: `frontend/src/pages/PeoplePage.jsx`

- [ ] **Step 1: Add imports at the top of PeoplePage.jsx**

Find the existing import block and add:

```javascript
import { useAuth } from '../contexts/AuthContext';
import ZoneHeatmap from '../components/zones/ZoneHeatmap';
```

- [ ] **Step 2: Add `useAuth` call inside the component**

Find `export default function PeoplePage() {` and add after the first line of the function body:

```javascript
    const { user } = useAuth();
    const isOfficer = user?.role === 'officer';
```

- [ ] **Step 3: Insert `<ZoneHeatmap>` below the counter card**

In the JSX, find the `{/* ═══════ HERO COUNTER CARD ═══════ */}` block. After the closing `</div>` of the counter card (search for the first `</div>` that closes `className="counter-card"`), add:

```jsx
            {/* ═══════ ZONE HEATMAP ═══════ */}
            <ZoneHeatmap isOfficer={isOfficer} />
```

- [ ] **Step 4: Start dev server and verify in browser**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` in browser. You should see three zone cards (A/B/C) below the main people counter. Cards should show default split (A=60%, B=30%, C=10%). If logged in as officer, an "อัปเดตโซน" button should appear.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PeoplePage.jsx
git commit -m "feat: integrate ZoneHeatmap into PeoplePage"
```

---

## Task 9: Add `getZones` to dashboard API lib

**Files:**
- Modify: `dashboard/src/lib/api.ts`

The existing `ZoneDensity` type has `{ zone, label, density, capacity, percentage, status }`. We map the backend response to it.

- [ ] **Step 1: Add `getZones` to the `api` object in `dashboard/src/lib/api.ts`**

Find:
```typescript
export const api = {
  getCurrentCount: () => fetcher<PeopleCount>("/api/people/current"),
```

And add `getZones` as a new method:

```typescript
  getZones: async (): Promise<ZoneDensity[]> => {
    const json = await fetch(
      `${API_BASE}/api/zones/current`,
      { cache: "no-store" }
    );
    if (!json.ok) throw new Error(`Zones API ${json.status}`);
    const body = await json.json();
    const data = body.data;
    return (data.zones as Array<{
      zone_code: string;
      name: string;
      percentage: number;
      estimated_count: number | null;
      crowd_level: string;
    }>).map((z) => ({
      zone: z.zone_code,
      label: z.name,
      density: z.estimated_count ?? 0,
      capacity: data.total_people ?? 0,
      percentage: z.percentage,
      status: z.crowd_level as import("@/types").CrowdStatus,
    }));
  },
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/api.ts
git commit -m "feat: add getZones to dashboard API lib"
```

---

## Task 10: Update dashboard store to fetch zones from API

**Files:**
- Modify: `dashboard/src/stores/dashboard.ts`

Currently `zones` is always set from `realZones()` (hardcoded). Update `fetchAll` to try the live API with fallback.

- [ ] **Step 1: Update the `fetchAll` method**

Find this line inside `fetchAll`:
```typescript
      const zones = realZones();
```

Replace it with:
```typescript
      let zones: ZoneDensity[];
      try {
        zones = await api.getZones();
      } catch {
        zones = realZones();
      }
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/stores/dashboard.ts
git commit -m "feat: update dashboard fetchAll to use live zone estimates API"
```

---

## Task 11: Create ZoneCards dashboard component and wire into page

**Files:**
- Create: `dashboard/src/components/dashboard/ZoneCards.tsx`
- Modify: `dashboard/src/app/page.tsx`

- [ ] **Step 1: Create `dashboard/src/components/dashboard/ZoneCards.tsx`**

```typescript
import type { ZoneDensity } from "@/types";

const COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  normal:   { bg: "rgba(72, 187, 120, 0.06)", border: "rgba(72, 187, 120, 0.2)",  text: "#48bb78", bar: "#48bb78" },
  moderate: { bg: "rgba(245, 158, 11, 0.06)", border: "rgba(245, 158, 11, 0.2)",  text: "#f59e0b", bar: "#f59e0b" },
  busy:     { bg: "rgba(249, 115, 22, 0.06)", border: "rgba(249, 115, 22, 0.2)",  text: "#f97316", bar: "#f97316" },
  crowded:  { bg: "rgba(239, 68, 68, 0.06)",  border: "rgba(239, 68, 68, 0.2)",   text: "#ef4444", bar: "#ef4444" },
};

const ZONE_LABEL_TH: Record<string, string> = {
  normal: "เบาบาง", moderate: "ปกติ", busy: "ค่อนข้างแออัด", crowded: "แออัด",
};

function ZoneCard({ zone }: { zone: ZoneDensity }) {
  const c = COLORS[zone.status] ?? COLORS.normal;

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm" style={{ color: c.text }}>
          โซน {zone.zone}
        </span>
        <span className="text-xs text-white/40">{zone.label}</span>
      </div>

      <div className="text-2xl font-extrabold" style={{ color: c.text }}>
        {zone.density > 0 ? zone.density.toLocaleString() : "—"}{" "}
        <span className="text-sm font-normal">คน</span>
      </div>

      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${zone.percentage}%`, background: c.bar }}
        />
      </div>

      <div className="flex justify-between text-xs">
        <span style={{ color: c.text }}>● {ZONE_LABEL_TH[zone.status] ?? zone.status}</span>
        <span className="text-white/40">{zone.percentage}%</span>
      </div>
    </div>
  );
}

export function ZoneCards({ zones }: { zones: ZoneDensity[] }) {
  if (!zones.length) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3 font-thai">
        ความหนาแน่นตามโซน
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {zones.map((z) => (
          <ZoneCard key={z.zone} zone={z} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Import and place `<ZoneCards>` in `dashboard/src/app/page.tsx`**

Add the import at the top of `page.tsx` with the other dashboard component imports:

```typescript
import { ZoneCards } from "@/components/dashboard/ZoneCards";
```

Find the `{/* ─── Top: Key Metrics with Sparklines ─── */}` section. Insert `<ZoneCards>` immediately before it:

```tsx
        {/* ─── Zone Crowd Estimates ─── */}
        <div className="mb-4">
          <ZoneCards zones={zones} />
        </div>
```

- [ ] **Step 3: Start dashboard dev server and verify**

```bash
cd dashboard && npm run dev
```

Open `http://localhost:3000` in browser. You should see three zone cards (A/B/C) above the top metric cards. Cards should update every 30 s via the existing polling hook.

- [ ] **Step 4: Run build to confirm no TypeScript errors**

```bash
cd dashboard && npm run build
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/dashboard/ZoneCards.tsx dashboard/src/app/page.tsx
git commit -m "feat: add ZoneCards to dashboard and wire into page layout"
```

---

## Done

At this point:
- `GET /api/zones/current` serves real or default zone estimates (public)
- `POST /api/zones/update` lets officers update zone splits (officer-auth required)
- Frontend shows zone cards below the main people counter; officers see an "อัปเดตโซน" button
- Dashboard shows read-only zone cards, polling every 30 s with live-data fallback to hardcoded values
- ZoneCard has Vitest unit tests covering count display, null handling, percentage, and crowd label
