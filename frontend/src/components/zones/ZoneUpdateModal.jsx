import { useState } from 'react';
import { updateZones } from '../../services/api.jsx';

const ZONE_LABELS = { A: 'โซน A — ถนนคนเดิน', B: 'โซน B — สะพานรัษฎา', C: 'โซน C — ตลาดเก่า' };

export default function ZoneUpdateModal({ currentZones, onClose, onSaved }) {
    const initial = {
        A: currentZones?.find((z) => z.zone_code === 'A')?.percentage ?? 60,
        B: currentZones?.find((z) => z.zone_code === 'B')?.percentage ?? 30,
        C: currentZones?.find((z) => z.zone_code === 'C')?.percentage ?? 10,
    };

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
