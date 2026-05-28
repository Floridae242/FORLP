/**
 * @param {{ zone: { zone_code: string, name: string, percentage: number, estimated_count: number|null, crowd_label: string, crowd_level: string } }} props
 */
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
                <span style={{ color: c.text }}><span aria-hidden="true">● </span><span>{crowd_label}</span></span>
                <span style={{ color: 'var(--text-muted, #718096)' }}>{percentage}%</span>
            </div>
        </div>
    );
}
