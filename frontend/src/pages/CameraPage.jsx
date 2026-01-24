import { useState, useEffect, useRef } from 'react';

const CAMERA_STREAMS = {
    1: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F301',
    2: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F201',
    3: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F501',
};

// Playback track IDs for each camera
const CAMERA_TRACKS = {
    1: '301',
    2: '201',
    3: '501',
};

// Function to generate playback URL
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
    
    // Playback states
    const [viewMode, setViewMode] = useState('live'); // 'live' or 'playback'
    const [playbackDate, setPlaybackDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [playbackStartTime, setPlaybackStartTime] = useState('18:00');
    const [playbackEndTime, setPlaybackEndTime] = useState('20:00');
    const [playbackUrl, setPlaybackUrl] = useState('');

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

    // Handle playback
    const handlePlayback = () => {
        const [startHour, startMin] = playbackStartTime.split(':').map(Number);
        const [endHour, endMin] = playbackEndTime.split(':').map(Number);
        
        const startDateTime = new Date(playbackDate);
        startDateTime.setHours(startHour, startMin, 0);
        
        const endDateTime = new Date(playbackDate);
        endDateTime.setHours(endHour, endMin, 0);
        
        // If end time is before start time, assume it's the next day
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

    const currentCamera = cameras.find(c => c.id === selectedCamera);
    const currentStreamUrl = viewMode === 'live' ? CAMERA_STREAMS[selectedCamera] : playbackUrl;

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">กล้องวงจรปิด</h1>
                <p className="page-subtitle">ภาพสดจากพื้นที่ถนนคนเดินกาดกองต้า</p>
            </header>

            {/* View Mode Toggle */}
            <div className="view-mode-toggle" style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
                padding: '4px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '12px',
                width: 'fit-content'
            }}>
                <button
                    onClick={switchToLive}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        background: viewMode === 'live' ? '#22c55e' : 'transparent',
                        color: viewMode === 'live' ? 'white' : '#9ca3af'
                    }}
                >
                    ดูสด (Live)
                </button>
                <button
                    onClick={() => setViewMode('playback')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        background: viewMode === 'playback' ? '#3b82f6' : 'transparent',
                        color: viewMode === 'playback' ? 'white' : '#9ca3af'
                    }}
                >
                    ⏪ ดูย้อนหลัง (Playback)
                </button>
            </div>

            {/* Playback Controls */}
            {viewMode === 'playback' && (
                <div className="playback-controls" style={{
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '16px',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                    <h3 style={{ 
                        margin: '0 0 16px 0', 
                        color: '#60a5fa',
                        fontSize: '16px',
                        fontWeight: '600'
                    }}>
                        ตั้งค่าการดูย้อนหลัง
                    </h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '16px',
                        alignItems: 'end'
                    }}>
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '6px', 
                                color: '#94a3b8',
                                fontSize: '14px'
                            }}>
                                วันที่
                            </label>
                            <input
                                type="date"
                                value={playbackDate}
                                onChange={(e) => setPlaybackDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.3)',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '6px', 
                                color: '#94a3b8',
                                fontSize: '14px'
                            }}>
                                เวลาเริ่มต้น
                            </label>
                            <input
                                type="time"
                                value={playbackStartTime}
                                onChange={(e) => setPlaybackStartTime(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.3)',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '6px', 
                                color: '#94a3b8',
                                fontSize: '14px'
                            }}>
                                เวลาสิ้นสุด
                            </label>
                            <input
                                type="time"
                                value={playbackEndTime}
                                onChange={(e) => setPlaybackEndTime(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.3)',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <button
                                onClick={handlePlayback}
                                style={{
                                    width: '100%',
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                    color: 'white',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onMouseOver={(e) => {
                                    e.target.style.transform = 'translateY(-2px)';
                                    e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                                }}
                                onMouseOut={(e) => {
                                    e.target.style.transform = 'translateY(0)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            >
                                เล่นวิดีโอ
                            </button>
                        </div>
                    </div>
                    {playbackUrl && (
                        <div style={{
                            marginTop: '12px',
                            padding: '10px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            borderRadius: '8px',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}>
                            <span style={{ color: '#22c55e', fontSize: '13px' }}>
                                ✓ กำลังเล่น: {playbackDate} เวลา {playbackStartTime} - {playbackEndTime}
                            </span>
                        </div>
                    )}
                </div>
            )}

            <div className="camera-selector">
                {cameras.map((camera) => (
                    <button
                        key={camera.id}
                        onClick={() => {
                            setSelectedCamera(camera.id);
                            if (viewMode === 'playback' && playbackUrl) {
                                // Regenerate playback URL for new camera
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
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.5)',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <span style={{ fontSize: '48px' }}>⏪</span>
                        <p style={{ color: '#94a3b8', textAlign: 'center' }}>
                            เลือกวันที่และเวลา แล้วกด "เล่นวิดีโอ" <br/>
                            เพื่อดูภาพย้อนหลัง
                        </p>
                    </div>
                )}
                
                <div className="camera-overlay top-left">
                    <span className="live-indicator" style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: viewMode === 'live' ? '#22c55e' : '#3b82f6',
                        marginRight: '8px',
                        animation: viewMode === 'live' ? 'pulse 2s infinite' : 'none'
                    }}></span>
                    {viewMode === 'live' ? 'LIVE' : 'PLAYBACK'} | กล้อง: {currentCamera?.name} ({currentCamera?.zone})
                </div>

                <div className="camera-overlay bottom-right">
                    {viewMode === 'live' ? formatTime(currentTime) : `${playbackDate} ${playbackStartTime}-${playbackEndTime}`}
                </div>

                <button onClick={toggleFullscreen} className="camera-fullscreen-btn">
                    {isFullscreen ? 'ออกจากเต็มจอ' : 'ดูเต็มจอ'}
                </button>
            </div>

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

            <div className="note-box">
                <p className="note-title">คำแนะนำการใช้งาน</p>
                <p className="note-text">
                    <strong>ดูสด (Live):</strong> ดูภาพจากกล้องแบบเรียลไทม์<br/>
                    <strong>ดูย้อนหลัง (Playback):</strong> เลือกวันที่และช่วงเวลาเพื่อดูภาพที่บันทึกไว้<br/>
                    คลิกที่กล้องเพื่อดูภาพขยาย หรือกดปุ่ม "ดูเต็มจอ" เพื่อดูภาพเต็มหน้าจอ
                </p>
            </div>

            <div className="disclaimer">
                <p className="disclaimer-text">
                    ภาพจากกล้องวงจรปิดใช้เพื่อการปฏิบัติงานของเจ้าหน้าที่เทศบาลเท่านั้น
                </p>
            </div>
        </div>
    );
}