import { useState, useEffect, useRef } from 'react';

const CAMERA_STREAMS = {
    1: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F301',
    2: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F201',
    3: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F501',
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

    const currentCamera = cameras.find(c => c.id === selectedCamera);

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">กล้องวงจรปิด</h1>
                <p className="page-subtitle">ภาพสดจากพื้นที่ถนนคนเดินกาดกองต้า</p>
            </header>

            <div className="camera-selector">
                {cameras.map((camera) => (
                    <button
                        key={camera.id}
                        onClick={() => setSelectedCamera(camera.id)}
                        className={`camera-btn ${selectedCamera === camera.id ? 'active' : ''}`}
                    >
                        <span className={`camera-status-dot ${camera.status}`}></span>
                        {camera.name}
                    </button>
                ))}
            </div>

            <div ref={containerRef} className="camera-view">
                <iframe
                    src={CAMERA_STREAMS[selectedCamera]}
                    title={currentCamera?.name}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none'
                    }}
                    allow="autoplay; fullscreen"
                    allowFullScreen
                />
                
                <div className="camera-overlay top-left">
                    <span className="live-indicator" style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#22c55e',
                        marginRight: '8px'
                    }}></span>
                    กล้อง: {currentCamera?.name} ({currentCamera?.zone})
                </div>

                <div className="camera-overlay bottom-right">
                    {formatTime(currentTime)}
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
                    คลิกที่กล้องเพื่อดูภาพขยาย หรือกดปุ่ม "ดูเต็มจอ" เพื่อดูภาพเต็มหน้าจอ
                    หากภาพไม่แสดง กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
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