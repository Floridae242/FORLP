import { useState, useEffect, useRef } from 'react';

const CAMERA_STREAMS = {
    1: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F301',
    2: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F201',
    3: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F501',
};

const CAMERA_TRACKS = {
    1: '301',
    2: '201',
    3: '501',
};

const generatePlaybackUrl = (cameraId, startTime, endTime) => {
    const trackId = CAMERA_TRACKS[cameraId];
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}t${hours}${minutes}${seconds}z`;
    };
    
    const startStr = formatDateTime(startTime);
    const endStr = formatDateTime(endTime);
    
    return `https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2Ftracks%2F${trackId}%3Fstarttime%3D${startStr}%26endtime%3D${endStr}`;
};

// Styles object for cleaner component
const styles = {
    viewModeToggle: {
        display: 'flex',
        gap: '4px',
        marginBottom: '1rem',
        padding: '4px',
        background: 'var(--bg-muted)',
        borderRadius: 'var(--border-radius)',
        width: 'fit-content',
    },
    viewModeBtn: (isActive, mode) => ({
        padding: '10px 20px',
        borderRadius: 'var(--border-radius)',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-main)',
        fontWeight: '500',
        fontSize: '0.875rem',
        transition: 'all 0.15s ease',
        background: isActive 
            ? (mode === 'live' ? 'var(--status-safe)' : 'var(--status-info)') 
            : 'transparent',
        color: isActive ? 'white' : 'var(--text-muted)',
    }),
    playbackPanel: {
        background: 'var(--bg-card)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.25rem',
        marginBottom: '1rem',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-card)',
    },
    playbackTitle: {
        margin: '0 0 1rem 0',
        color: 'var(--text-heading)',
        fontSize: '0.9375rem',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    playbackGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1rem',
        alignItems: 'end',
    },
    inputLabel: {
        display: 'block',
        marginBottom: '6px',
        color: 'var(--text-muted)',
        fontSize: '0.8125rem',
        fontWeight: '500',
    },
    dateInput: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: 'var(--border-radius)',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        color: 'var(--text-body)',
        fontSize: '0.875rem',
        fontFamily: 'var(--font-main)',
    },
    timeSelectGroup: {
        display: 'flex',
        gap: '4px',
    },
    timeSelect: {
        flex: 1,
        padding: '10px 8px',
        borderRadius: 'var(--border-radius)',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        color: 'var(--text-body)',
        fontSize: '0.875rem',
        fontFamily: 'var(--font-main)',
        cursor: 'pointer',
    },
    playButton: {
        width: '100%',
        padding: '10px 16px',
        borderRadius: 'var(--border-radius)',
        border: 'none',
        background: 'var(--color-primary)',
        color: 'white',
        fontFamily: 'var(--font-main)',
        fontWeight: '500',
        cursor: 'pointer',
        fontSize: '0.875rem',
        transition: 'background 0.15s ease',
    },
    playbackStatus: {
        marginTop: '0.75rem',
        padding: '10px 12px',
        background: 'var(--status-safe-bg)',
        borderRadius: 'var(--border-radius)',
        border: '1px solid rgba(47, 133, 90, 0.2)',
        fontSize: '0.8125rem',
        color: 'var(--status-safe)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    emptyPlayback: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2d3748',
        flexDirection: 'column',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
    },
    statusIndicator: (mode) => ({
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: mode === 'live' ? 'var(--status-safe)' : 'var(--status-info)',
        marginRight: '8px',
        animation: mode === 'live' ? 'pulse-dot 2s ease-in-out infinite' : 'none',
    }),
};

export default function CameraPage() {
    const [cameras] = useState([
        { id: 1, name: 'ทางเข้าหลัก', zone: 'โซน A', status: 'online' },
        { id: 2, name: 'บริเวณกลาง', zone: 'โซน B', status: 'online' },
        { id: 3, name: 'ทางออก', zone: 'โซน C', status: 'online' },
    ]);
    const [selectedCamera, setSelectedCamera] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const containerRef = useRef(null);
    
    const [viewMode, setViewMode] = useState('live');
    const [playbackDate, setPlaybackDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [playbackStartHour, setPlaybackStartHour] = useState('18');
    const [playbackStartMinute, setPlaybackStartMinute] = useState('00');
    const [playbackStartSecond, setPlaybackStartSecond] = useState('00');
    const [playbackEndHour, setPlaybackEndHour] = useState('20');
    const [playbackEndMinute, setPlaybackEndMinute] = useState('00');
    const [playbackEndSecond, setPlaybackEndSecond] = useState('00');
    const [playbackUrl, setPlaybackUrl] = useState('');

    const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minuteSecondOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (date) => {
        return date.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + ' น.';
    };

    const formatThaiDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handlePlayback = () => {
        const startDateTime = new Date(playbackDate);
        startDateTime.setHours(
            parseInt(playbackStartHour), 
            parseInt(playbackStartMinute), 
            parseInt(playbackStartSecond)
        );
        
        const endDateTime = new Date(playbackDate);
        endDateTime.setHours(
            parseInt(playbackEndHour), 
            parseInt(playbackEndMinute), 
            parseInt(playbackEndSecond)
        );
        
        if (endDateTime <= startDateTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }
        
        const url = generatePlaybackUrl(selectedCamera, startDateTime, endDateTime);
        setPlaybackUrl(url);
        setViewMode('playback');
    };

    const switchToLive = () => {
        setViewMode('live');
        setPlaybackUrl('');
    };

    const formatPlaybackTime = () => {
        return `${playbackStartHour}:${playbackStartMinute}:${playbackStartSecond} - ${playbackEndHour}:${playbackEndMinute}:${playbackEndSecond}`;
    };

    const currentCamera = cameras.find(c => c.id === selectedCamera);
    const currentStreamUrl = viewMode === 'live' ? CAMERA_STREAMS[selectedCamera] : playbackUrl;

    return (
        <div className="page-container">
            {/* Header */}
            <header className="page-header">
                <h1 className="page-title">กล้องวงจรปิด</h1>
                <p className="page-subtitle">ภาพจากพื้นที่ถนนคนเดินกาดกองต้า</p>
            </header>

            {/* View Mode Toggle */}
            <div style={styles.viewModeToggle}>
                <button
                    onClick={switchToLive}
                    style={styles.viewModeBtn(viewMode === 'live', 'live')}
                >
                    ● ดูสด
                </button>
                <button
                    onClick={() => setViewMode('playback')}
                    style={styles.viewModeBtn(viewMode === 'playback', 'playback')}
                >
                    ◷ ดูย้อนหลัง
                </button>
            </div>

            {/* Playback Controls */}
            {viewMode === 'playback' && (
                <div style={styles.playbackPanel}>
                    <h3 style={styles.playbackTitle}>
                        <span></span> เลือกช่วงเวลาที่ต้องการดู
                    </h3>
                    <div style={styles.playbackGrid}>
                        {/* Date Picker */}
                        <div>
                            <label style={styles.inputLabel}>วันที่</label>
                            <input
                                type="date"
                                value={playbackDate}
                                onChange={(e) => setPlaybackDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                style={styles.dateInput}
                            />
                        </div>
                        
                        {/* Start Time */}
                        <div>
                            <label style={styles.inputLabel}>เวลาเริ่มต้น</label>
                            <div style={styles.timeSelectGroup}>
                                <select
                                    value={playbackStartHour}
                                    onChange={(e) => setPlaybackStartHour(e.target.value)}
                                    style={styles.timeSelect}
                                    aria-label="ชั่วโมงเริ่มต้น"
                                >
                                    {hourOptions.map((hour) => (
                                        <option key={hour} value={hour}>{hour}</option>
                                    ))}
                                </select>
                                <select
                                    value={playbackStartMinute}
                                    onChange={(e) => setPlaybackStartMinute(e.target.value)}
                                    style={styles.timeSelect}
                                    aria-label="นาทีเริ่มต้น"
                                >
                                    {minuteSecondOptions.map((minute) => (
                                        <option key={minute} value={minute}>{minute}</option>
                                    ))}
                                </select>
                                <select
                                    value={playbackStartSecond}
                                    onChange={(e) => setPlaybackStartSecond(e.target.value)}
                                    style={styles.timeSelect}
                                    aria-label="วินาทีเริ่มต้น"
                                >
                                    {minuteSecondOptions.map((second) => (
                                        <option key={second} value={second}>{second}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        {/* End Time */}
                        <div>
                            <label style={styles.inputLabel}>เวลาสิ้นสุด</label>
                            <div style={styles.timeSelectGroup}>
                                <select
                                    value={playbackEndHour}
                                    onChange={(e) => setPlaybackEndHour(e.target.value)}
                                    style={styles.timeSelect}
                                    aria-label="ชั่วโมงสิ้นสุด"
                                >
                                    {hourOptions.map((hour) => (
                                        <option key={hour} value={hour}>{hour}</option>
                                    ))}
                                </select>
                                <select
                                    value={playbackEndMinute}
                                    onChange={(e) => setPlaybackEndMinute(e.target.value)}
                                    style={styles.timeSelect}
                                    aria-label="นาทีสิ้นสุด"
                                >
                                    {minuteSecondOptions.map((minute) => (
                                        <option key={minute} value={minute}>{minute}</option>
                                    ))}
                                </select>
                                <select
                                    value={playbackEndSecond}
                                    onChange={(e) => setPlaybackEndSecond(e.target.value)}
                                    style={styles.timeSelect}
                                    aria-label="วินาทีสิ้นสุด"
                                >
                                    {minuteSecondOptions.map((second) => (
                                        <option key={second} value={second}>{second}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        {/* Play Button */}
                        <div>
                            <label style={{ ...styles.inputLabel, opacity: 0 }}>-</label>
                            <button
                                onClick={handlePlayback}
                                style={styles.playButton}
                                onMouseOver={(e) => e.target.style.background = 'var(--color-primary-light)'}
                                onMouseOut={(e) => e.target.style.background = 'var(--color-primary)'}
                            >
                                ▶ เล่นวิดีโอ
                            </button>
                        </div>
                    </div>
                    
                    {/* Playback Status */}
                    {playbackUrl && (
                        <div style={styles.playbackStatus}>
                            <span>✓</span>
                            <span>กำลังเล่น: {formatThaiDate(playbackDate)} เวลา {formatPlaybackTime()}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Camera Selector */}
            <div className="camera-selector">
                {cameras.map((camera) => (
                    <button
                        key={camera.id}
                        onClick={() => {
                            setSelectedCamera(camera.id);
                            if (viewMode === 'playback' && playbackUrl) {
                                setTimeout(() => handlePlayback(), 100);
                            }
                        }}
                        className={`camera-btn ${selectedCamera === camera.id ? 'active' : ''}`}
                    >
                        <span className={`camera-status-dot ${camera.status}`}></span>
                        {camera.name}
                    </button>
                ))}
            </div>

            {/* Main Camera View */}
            <div ref={containerRef} className="camera-view">
                {(viewMode === 'live' || playbackUrl) ? (
                    <iframe
                        key={currentStreamUrl}
                        src={currentStreamUrl}
                        title={currentCamera?.name}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none'
                        }}
                        allow="autoplay; fullscreen"
                        allowFullScreen
                    />
                ) : (
                    <div style={styles.emptyPlayback}>
                        <div style={{ fontSize: '2.5rem', opacity: 0.5 }}></div>
                        <p style={{ color: 'var(--text-light)', margin: 0, lineHeight: 1.6 }}>
                            เลือกวันที่และเวลา แล้วกด "เล่นวิดีโอ"<br />
                            เพื่อดูภาพย้อนหลัง
                        </p>
                    </div>
                )}
                
                {/* Overlay - Camera Info */}
                <div className="camera-overlay top-left">
                    <span style={styles.statusIndicator(viewMode)}></span>
                    {viewMode === 'live' ? 'LIVE' : 'PLAYBACK'} | {currentCamera?.name} ({currentCamera?.zone})
                </div>

                {/* Overlay - Time */}
                <div className="camera-overlay bottom-right">
                    {viewMode === 'live' ? formatTime(currentTime) : `${formatThaiDate(playbackDate)} ${formatPlaybackTime()}`}
                </div>

                {/* Fullscreen Button */}
                <button onClick={toggleFullscreen} className="camera-fullscreen-btn">
                    {isFullscreen ? '✕ ออกจากเต็มจอ' : '⛶ ดูเต็มจอ'}
                </button>
            </div>

            {/* Camera Grid Section */}
            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">กล้องทั้งหมด</h2>
                    <span className="section-badge">{cameras.length} ตัว</span>
                </div>
                
                <div className="camera-grid">
                    {cameras.map((camera) => (
                        <div
                            key={camera.id}
                            onClick={() => setSelectedCamera(camera.id)}
                            className={`camera-thumbnail ${selectedCamera === camera.id ? 'active' : ''}`}
                        >
                            <div className="camera-thumbnail-preview">
                                <iframe
                                    src={CAMERA_STREAMS[camera.id]}
                                    title={camera.name}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                        pointerEvents: 'none'
                                    }}
                                    allow="autoplay"
                                />
                                {selectedCamera === camera.id && (
                                    <div className="camera-active-badge">กำลังแสดง</div>
                                )}
                            </div>
                            <div className="camera-thumbnail-info">
                                <div className="camera-thumbnail-name">
                                    <span className={`camera-status-dot ${camera.status}`}></span>
                                    {camera.name}
                                </div>
                                <div className="camera-thumbnail-status">
                                    {camera.zone} • {camera.status === 'online' ? 'ออนไลน์' : 'ออฟไลน์'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Usage Guide */}
            <div className="note-box">
                <p className="note-title">คำแนะนำการใช้งาน</p>
                <p className="note-text">
                    <strong>ดูสด:</strong> ดูภาพจากกล้องแบบเรียลไทม์<br />
                    <strong>ดูย้อนหลัง:</strong> เลือกวันที่และช่วงเวลาเพื่อดูภาพที่บันทึกไว้<br />
                    คลิกที่กล้องเพื่อดูภาพขยาย หรือกดปุ่ม "ดูเต็มจอ" เพื่อดูภาพเต็มหน้าจอ
                </p>
            </div>

            {/* Disclaimer */}
            <div className="disclaimer">
                <p className="disclaimer-text">
                    ภาพจากกล้องวงจรปิดใช้เพื่อการปฏิบัติงานของเจ้าหน้าที่เทศบาลเท่านั้น<br />
                    ข้อมูลอาจมีการหน่วงเวลาเล็กน้อยตามสภาพเครือข่าย
                </p>
            </div>
        </div>
    );
}