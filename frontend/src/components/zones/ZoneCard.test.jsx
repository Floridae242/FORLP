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

test('renders without crashing when crowd_level is unknown', () => {
    render(<ZoneCard zone={{ ...baseZone, crowd_level: 'unknown_value' }} />);
    expect(screen.getByText('โซน A')).toBeInTheDocument();
});
