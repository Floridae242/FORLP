#!/usr/bin/env python3
"""
=============================================================================
AI People Counting Service - Playback Mode
=============================================================================
วิเคราะห์วิดีโอย้อนหลัง (Playback) แทน Realtime RTSP Stream

ทำไมใช้ Playback Mode?
- ✅ ข้อมูลเสถียร ไม่หลุดเหมือน live stream
- ✅ ลดภาระ GPU/CPU (ประมวลผลเป็น batch)
- ✅ เหมาะกับการสรุปเชิงสถิติ (Daily Report)
- ✅ ลด latency และ network issues

API Playback Format:
rtsp://user:pass@ip:554/Streaming/tracks/201?starttime=YYYYMMDDtHHMMSSz&endtime=YYYYMMDDtHHMMSSz
=============================================================================
"""

import os
import sys
import time
import signal
import logging
import subprocess
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from pathlib import Path

import yaml
import cv2
import numpy as np
import requests
from ultralytics import YOLO

# Prometheus metrics (optional)
PROMETHEUS_AVAILABLE = False
PEOPLE_COUNT = None
PEOPLE_MAX = None
PEOPLE_AVG = None
FRAMES_PROCESSED = None
WINDOWS_PROCESSED = None
PLAYBACK_FETCH_TIME = None
INFERENCE_TIME = None
ERRORS_TOTAL = None
BACKEND_SEND_TIME = None
start_http_server = None

try:
    from prometheus_client import start_http_server as _start_http_server, Counter, Gauge, Histogram
    PROMETHEUS_AVAILABLE = True
    start_http_server = _start_http_server
    PEOPLE_COUNT = Gauge('people_count', 'Current people count', ['camera_id'])
    PEOPLE_MAX = Gauge('people_max', 'Max people in window', ['camera_id'])
    PEOPLE_AVG = Gauge('people_avg', 'Average people in window', ['camera_id'])
    FRAMES_PROCESSED = Counter('frames_processed_total', 'Total frames processed', ['camera_id'])
    WINDOWS_PROCESSED = Counter('windows_processed_total', 'Total playback windows processed', ['camera_id'])
    PLAYBACK_FETCH_TIME = Histogram('playback_fetch_seconds', 'Time to fetch playback video', ['camera_id'])
    INFERENCE_TIME = Histogram('inference_seconds', 'YOLOv8 inference time per frame', ['camera_id'])
    ERRORS_TOTAL = Counter('errors_total', 'Total errors', ['camera_id', 'error_type'])
    BACKEND_SEND_TIME = Histogram('backend_send_seconds', 'Time to send data to backend', ['camera_id'])
except ImportError:
    pass

# ==================== Logging Setup ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-7s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ==================== Data Classes ====================
@dataclass
class PlaybackConfig:
    """Configuration สำหรับ Playback Mode"""
    enabled: bool = True
    go2rtc_base_url: str = "https://iocpiramid.com:8085"
    window_duration_minutes: int = 5
    delay_minutes: int = 1
    interval_minutes: int = 5
    sampling_fps: float = 1.0
    timeout_seconds: int = 120
    verify_ssl: bool = False


@dataclass
class CameraConfig:
    """Configuration สำหรับกล้องแต่ละตัว"""
    camera_id: str
    rtsp_ip: str
    rtsp_port: int = 554
    rtsp_username: str = "admin"
    rtsp_password: str = ""
    track_id: str = "201"
    confidence: float = 0.4
    enabled: bool = True
    rtsp_url: str = ""  # RTSP URL ที่ register ไว้ใน go2rtc (optional)


@dataclass
class ServiceConfig:
    """Configuration หลักของ Service"""
    model: str = "yolov8n.pt"
    device: str = "cpu"
    confidence: float = 0.4
    backend_endpoint: str = ""
    backend_api_key: str = ""
    send_interval_s: int = 5
    metrics_port: int = 8080


@dataclass
class WindowResult:
    """ผลลัพธ์การวิเคราะห์ 1 playback window"""
    camera_id: str
    window_start: datetime
    window_end: datetime
    max_people: int = 0
    avg_people: float = 0.0
    min_people: int = 0
    frames_processed: int = 0
    sampling_fps: float = 1.0
    source_type: str = "playback"
    frame_counts: List[int] = field(default_factory=list)


# ==================== Configuration Loader ====================
class ConfigLoader:
    """โหลด configuration จาก YAML file"""
    
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.raw_config = {}
        self.load()
    
    def load(self):
        """Load configuration from YAML file"""
        # Try multiple paths
        paths_to_try = [
            self.config_path,
            Path(__file__).parent.parent / "config.yaml",
            Path("/app/config.yaml"),
            Path("./config.yaml")
        ]
        
        for path in paths_to_try:
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    self.raw_config = yaml.safe_load(f) or {}
                    logger.info(f"✅ Loaded config from: {path}")
                    return
            except FileNotFoundError:
                continue
            except Exception as e:
                logger.warning(f"Error loading {path}: {e}")
        
        logger.warning("⚠️ No config file found, using defaults")
        self.raw_config = {}
    
    def get_service_config(self) -> ServiceConfig:
        """Get service configuration"""
        svc = self.raw_config.get('service', {})
        return ServiceConfig(
            model=svc.get('model', 'yolov8n.pt'),
            device=svc.get('device', 'cpu'),
            confidence=svc.get('confidence', 0.4),
            backend_endpoint=svc.get('backend_endpoint', ''),
            backend_api_key=svc.get('backend_api_key', ''),
            send_interval_s=svc.get('send_interval_s', 5)
        )

    def get_playback_config(self) -> PlaybackConfig:
        """Get playback configuration"""
        pb = self.raw_config.get('playback', {})
        return PlaybackConfig(
            enabled=pb.get('enabled', True),
            go2rtc_base_url=pb.get('go2rtc_base_url', 'https://iocpiramid.com:8085'),
            window_duration_minutes=pb.get('window_duration_minutes', 5),
            delay_minutes=pb.get('delay_minutes', 1),
            interval_minutes=pb.get('interval_minutes', 5),
            sampling_fps=pb.get('sampling_fps', 1.0),
            timeout_seconds=pb.get('timeout_seconds', 120),
            verify_ssl=pb.get('verify_ssl', False)
        )
    
    def get_cameras(self) -> List[CameraConfig]:
        """Get camera configurations"""
        cameras = []
        
        # Load from 'cameras' section (Playback Mode)
        for cam in self.raw_config.get('cameras', []):
            if cam.get('enabled', True):
                cameras.append(CameraConfig(
                    camera_id=cam.get('camera_id', 'unknown'),
                    rtsp_ip=cam.get('rtsp_ip', ''),
                    rtsp_port=cam.get('rtsp_port', 554),
                    rtsp_username=cam.get('rtsp_username', 'admin'),
                    rtsp_password=cam.get('rtsp_password', ''),
                    track_id=str(cam.get('track_id', '201')),
                    confidence=cam.get('confidence', 0.4),
                    enabled=cam.get('enabled', True)
                ))
        
        # Fallback: Load from 'streams' section
        if not cameras:
            for i, stream in enumerate(self.raw_config.get('streams', [])):
                rtsp_url = stream.get('rtsp', '')
                if rtsp_url:
                    # Parse RTSP URL to extract credentials
                    cameras.append(CameraConfig(
                        camera_id=stream.get('stream_id', f'camera-{i+1}'),
                        rtsp_ip=self._extract_ip_from_rtsp(rtsp_url),
                        rtsp_username=self._extract_user_from_rtsp(rtsp_url),
                        rtsp_password=self._extract_pass_from_rtsp(rtsp_url),
                        track_id=self._extract_track_from_rtsp(rtsp_url),
                        confidence=stream.get('confidence', 0.4)
                    ))
        
        return cameras
    
    def _extract_ip_from_rtsp(self, url: str) -> str:
        """Extract IP from RTSP URL"""
        try:
            # rtsp://user:pass@IP:port/...
            at_pos = url.find('@')
            if at_pos > 0:
                rest = url[at_pos+1:]
                colon_pos = rest.find(':')
                if colon_pos > 0:
                    return rest[:colon_pos]
            return ""
        except:
            return ""
    
    def _extract_user_from_rtsp(self, url: str) -> str:
        try:
            start = url.find('://') + 3
            end = url.find(':', start)
            return url[start:end]
        except:
            return "admin"
    
    def _extract_pass_from_rtsp(self, url: str) -> str:
        try:
            start = url.find(':', url.find('://')+3) + 1
            end = url.find('@')
            return url[start:end]
        except:
            return ""
    
    def _extract_track_from_rtsp(self, url: str) -> str:
        try:
            if 'Channels/' in url:
                return url.split('Channels/')[1].split('?')[0].split('/')[0]
            return "201"
        except:
            return "201"


# ==================== Playback Video Fetcher ====================
class PlaybackFetcher:
    """
    ดึงวิดีโอจาก Playback API ผ่าน go2rtc proxy
    
    วิธีการ:
    1. ใช้ go2rtc snapshot API ดึงภาพเป็น frames
    2. ดึงหลาย frames ตาม sampling rate
    """
    
    def __init__(self, config: PlaybackConfig):
        self.config = config
        self.base_url = config.go2rtc_base_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = config.verify_ssl
    
    def build_playback_rtsp_url(self, camera: CameraConfig, start_time: datetime, end_time: datetime) -> str:
        """
        สร้าง RTSP URL พร้อม starttime และ endtime
        
        Format ตาม Hikvision Playback:
        - starttime=YYYYMMDDtHHMMSSz (lowercase 't' และ 'z')
        - endtime=YYYYMMDDtHHMMSSz
        """
        start_str = start_time.strftime("%Y%m%dt%H%M%Sz")
        end_str = end_time.strftime("%Y%m%dt%H%M%Sz")
        
        rtsp_url = (
            f"rtsp://{camera.rtsp_username}:{camera.rtsp_password}@"
            f"{camera.rtsp_ip}:{camera.rtsp_port}/Streaming/tracks/{camera.track_id}"
            f"?starttime={start_str}&endtime={end_str}"
        )
        
        return rtsp_url
    
    def build_live_rtsp_url(self, camera: CameraConfig) -> str:
        """สร้าง RTSP URL สำหรับ live stream (ไม่มี playback params)"""
        return (
            f"rtsp://{camera.rtsp_username}:{camera.rtsp_password}@"
            f"{camera.rtsp_ip}:{camera.rtsp_port}/Streaming/Channels/{camera.track_id}"
        )
    
    def build_go2rtc_snapshot_url(self, rtsp_url: str) -> str:
        """
        สร้าง go2rtc snapshot URL
        ใช้ /api/frame.jpeg endpoint
        """
        encoded_rtsp = urllib.parse.quote(rtsp_url, safe='')
        return f"{self.base_url}/api/frame.jpeg?src={encoded_rtsp}"
    
    def fetch_single_snapshot(self, camera: CameraConfig, use_playback: bool = False, 
                               start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> Optional[np.ndarray]:
        """
        ดึง snapshot 1 frame จาก go2rtc
        """
        try:
            if use_playback and start_time and end_time:
                rtsp_url = self.build_playback_rtsp_url(camera, start_time, end_time)
            else:
                rtsp_url = self.build_live_rtsp_url(camera)
            
            snapshot_url = self.build_go2rtc_snapshot_url(rtsp_url)
            
            response = self.session.get(snapshot_url, timeout=15)
            
            if response.status_code == 200:
                # Decode JPEG to numpy array
                img_array = np.frombuffer(response.content, dtype=np.uint8)
                frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                return frame
            else:
                logger.warning(f"[{camera.camera_id}] Snapshot error: HTTP {response.status_code}")
                return None
                
        except requests.Timeout:
            logger.warning(f"[{camera.camera_id}] Snapshot timeout")
            return None
        except Exception as e:
            logger.error(f"[{camera.camera_id}] Snapshot error: {e}")
            return None
    
    def fetch_frames_via_snapshots(self, camera: CameraConfig, start_time: datetime, end_time: datetime) -> List[np.ndarray]:
        """
        ดึง frames โดยใช้ go2rtc stream.ts API
        
        หมายเหตุ: stream.mp4 ส่งภาพดำมา ต้องใช้ stream.ts แทน
        """
        frames = []
        cap = None
        
        try:
            # สร้าง RTSP URL สำหรับ live stream
            rtsp_url = self.build_live_rtsp_url(camera)
            encoded_rtsp = urllib.parse.quote(rtsp_url, safe='')
            
            # ใช้ stream.ts endpoint (stream.mp4 ส่งภาพดำ)
            stream_url = f"{self.base_url}/api/stream.ts?src={encoded_rtsp}"
            
            duration_seconds = (end_time - start_time).total_seconds()
            target_frames = int(duration_seconds * self.config.sampling_fps)
            target_frames = min(target_frames, 60)  # Limit frames
            
            if target_frames <= 0:
                target_frames = 30
            
            logger.info(f"[{camera.camera_id}] 🎬 Fetching {target_frames} frames via go2rtc stream.ts")
            
            start_fetch = time.time()
            
            # Open stream via OpenCV
            cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)
            
            if not cap.isOpened():
                logger.warning(f"[{camera.camera_id}] ⚠️ Cannot open go2rtc stream.ts")
                return []
            
            # Get video properties
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0 or fps > 100:
                fps = 25  # Default fallback
            
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            if width > 0 and height > 0:
                logger.info(f"[{camera.camera_id}] 📐 Video: {width}x{height} @ {fps:.1f}fps")
            
            # Skip first 30 frames to wait for keyframe (avoid black frames)
            logger.info(f"[{camera.camera_id}] ⏳ Skipping initial frames (waiting for keyframe)...")
            for _ in range(30):
                cap.read()
            
            # Calculate frame interval for sampling
            frame_interval = max(1, int(fps / self.config.sampling_fps))
            
            frame_count = 0
            read_count = 0
            black_count = 0
            
            while frame_count < target_frames:
                ret, frame = cap.read()
                
                if not ret:
                    if frame_count == 0:
                        logger.warning(f"[{camera.camera_id}] ⚠️ No frames from stream")
                    break
                
                read_count += 1
                
                # Log first frame info
                if read_count == 1 and (width == 0 or height == 0):
                    h, w = frame.shape[:2]
                    logger.info(f"[{camera.camera_id}] 📐 Frame size: {w}x{h}")
                
                # Sample frames according to interval
                if read_count % frame_interval == 0:
                    # Check if frame is not black (mean > 5)
                    mean_val = np.mean(frame)
                    if mean_val > 5:
                        frames.append(frame.copy())
                        frame_count += 1
                    else:
                        black_count += 1
                        # Skip too many black frames
                        if black_count > 20:
                            logger.warning(f"[{camera.camera_id}] ⚠️ Too many black frames, stopping")
                            break
                
                # Timeout check
                elapsed = time.time() - start_fetch
                if elapsed > self.config.timeout_seconds:
                    logger.warning(f"[{camera.camera_id}] ⏱️ Timeout after {elapsed:.1f}s")
                    break
            
            fetch_time = time.time() - start_fetch
            
            if PROMETHEUS_AVAILABLE:
                PLAYBACK_FETCH_TIME.labels(camera_id=camera.camera_id).observe(fetch_time)
            
            if frames:
                logger.info(f"[{camera.camera_id}] ✅ Captured {len(frames)} frames in {fetch_time:.1f}s (skipped {black_count} black frames)")
            else:
                logger.warning(f"[{camera.camera_id}] ⚠️ No valid frames captured")
            
        except Exception as e:
            logger.error(f"[{camera.camera_id}] ❌ Stream fetch error: {e}")
            if PROMETHEUS_AVAILABLE:
                ERRORS_TOTAL.labels(camera_id=camera.camera_id, error_type='stream_error').inc()
        
        finally:
            if cap:
                cap.release()
        
        return frames
    
    def fetch_frames_via_go2rtc(self, camera: CameraConfig, start_time: datetime, end_time: datetime) -> List[np.ndarray]:
        """
        ดึง frames ผ่าน go2rtc stream API
        """
        frames = []
        cap = None
        
        try:
            # ลองใช้ live stream ผ่าน go2rtc
            rtsp_url = self.build_live_rtsp_url(camera)
            encoded_rtsp = urllib.parse.quote(rtsp_url, safe='')
            
            # ลอง WebRTC stream
            stream_url = f"{self.base_url}/api/stream.mp4?src={encoded_rtsp}"
            
            logger.info(f"[{camera.camera_id}] 🎬 Trying go2rtc stream...")
            
            cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
            
            if not cap.isOpened():
                logger.warning(f"[{camera.camera_id}] ⚠️ Cannot open go2rtc stream")
                return []
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0 or fps > 60:
                fps = 25
            
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            logger.info(f"[{camera.camera_id}] 📐 Video: {width}x{height} @ {fps:.1f}fps")
            
            duration_seconds = (end_time - start_time).total_seconds()
            frame_interval = max(1, int(fps / self.config.sampling_fps))
            max_frames = int(duration_seconds * self.config.sampling_fps)
            max_frames = min(max_frames, 100)
            
            start_fetch = time.time()
            frame_count = 0
            read_count = 0
            
            while frame_count < max_frames:
                ret, frame = cap.read()
                
                if not ret:
                    break
                
                read_count += 1
                
                if read_count % frame_interval == 0:
                    frames.append(frame.copy())
                    frame_count += 1
                
                if time.time() - start_fetch > self.config.timeout_seconds:
                    break
            
            fetch_time = time.time() - start_fetch
            
            if frames:
                logger.info(f"[{camera.camera_id}] ✅ go2rtc: {len(frames)} frames in {fetch_time:.1f}s")
            
        except Exception as e:
            logger.error(f"[{camera.camera_id}] ❌ go2rtc error: {e}")
        finally:
            if cap:
                cap.release()
        
        return frames
    
    def fetch_frames(self, camera: CameraConfig, start_time: datetime, end_time: datetime) -> List[np.ndarray]:
        """
        ดึง frames - ลองหลายวิธี
        
        Priority:
        1. go2rtc snapshot API (เสถียรที่สุด)
        2. go2rtc stream API
        """
        # ใช้ snapshot API เป็นหลัก (เสถียรกว่า)
        frames = self.fetch_frames_via_snapshots(camera, start_time, end_time)
        
        # Fallback to stream
        if not frames:
            logger.info(f"[{camera.camera_id}] 🔄 Trying go2rtc stream...")
            frames = self.fetch_frames_via_go2rtc(camera, start_time, end_time)
        
        return frames


# ==================== YOLOv8 People Detector ====================
class PeopleDetector:
    """
    ตรวจจับคนด้วย YOLOv8
    
    - ใช้เฉพาะ class "person" (class_id = 0)
    - Configurable confidence threshold
    - รองรับทั้ง CPU และ GPU
    """
    
    PERSON_CLASS_ID = 0  # COCO class ID for person
    
    def __init__(self, model_path: str = "yolov8n.pt", device: str = "cpu", confidence: float = 0.4):
        self.model_path = model_path
        self.device = device
        self.confidence = confidence
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load YOLOv8 model"""
        try:
            logger.info(f"🤖 Loading YOLOv8 model: {self.model_path}")
            logger.info(f"   Device: {self.device}")
            
            # Check if model file exists
            model_paths = [
                self.model_path,
                Path(__file__).parent.parent / self.model_path,
                Path("/app") / self.model_path
            ]
            
            model_file = None
            for path in model_paths:
                if Path(path).exists():
                    model_file = str(path)
                    break
            
            if model_file:
                self.model = YOLO(model_file)
            else:
                # Download from ultralytics
                logger.info(f"   Downloading {self.model_path} from Ultralytics...")
                self.model = YOLO(self.model_path)
            
            # Warm up model
            logger.info("   Warming up model...")
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            self.model.predict(dummy, device=self.device, verbose=False)
            
            logger.info("✅ YOLOv8 model loaded successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to load YOLOv8 model: {e}")
            raise
    
    def detect(self, frame: np.ndarray, confidence: Optional[float] = None) -> int:
        """
        ตรวจจับคนใน frame
        
        Args:
            frame: BGR image (numpy array)
            confidence: Override confidence threshold
            
        Returns:
            จำนวนคนที่ตรวจพบ
        """
        if self.model is None:
            return 0
        
        conf = confidence or self.confidence
        
        try:
            results = self.model.predict(
                frame,
                device=self.device,
                conf=conf,
                classes=[self.PERSON_CLASS_ID],  # Only detect persons
                verbose=False
            )
            
            if results and len(results) > 0:
                boxes = results[0].boxes
                if boxes is not None:
                    return len(boxes)
            
            return 0
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return 0
    
    def detect_batch(self, frames: List[np.ndarray], camera_id: str = "unknown") -> List[int]:
        """
        ตรวจจับคนใน batch ของ frames
        
        Args:
            frames: List of BGR images
            camera_id: For logging and metrics
            
        Returns:
            List of people counts per frame
        """
        counts = []
        
        for i, frame in enumerate(frames):
            start_time = time.time()
            
            count = self.detect(frame)
            counts.append(count)
            
            inference_time = time.time() - start_time
            
            if PROMETHEUS_AVAILABLE:
                INFERENCE_TIME.labels(camera_id=camera_id).observe(inference_time)
                FRAMES_PROCESSED.labels(camera_id=camera_id).inc()
            
            # Log progress every 50 frames
            if (i + 1) % 50 == 0:
                logger.info(f"[{camera_id}] 🔍 Processed {i+1}/{len(frames)} frames...")
        
        return counts


# ==================== Backend Sender ====================
class BackendSender:
    """
    ส่งผลลัพธ์ไป Backend API
    
    Payload format:
    {
        "camera_id": "CCTV-201",
        "window_start": "2026-02-03T12:39:00Z",
        "window_end": "2026-02-03T12:59:00Z",
        "max_people": 128,
        "avg_people": 94,
        "frames_processed": 120,
        "sampling_fps": 1,
        "source_type": "playback"
    }
    """
    
    def __init__(self, endpoint: str, api_key: str = ""):
        self.endpoint = endpoint
        self.api_key = api_key
        self.session = requests.Session()
        
        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'AI-PeopleCount-Service/2.0'
        })
        
        if api_key:
            self.session.headers['X-API-Key'] = api_key
    
    def send(self, result: WindowResult) -> bool:
        """
        ส่งผลลัพธ์ไป Backend
        
        Args:
            result: WindowResult object
            
        Returns:
            True if successful
        """
        if not self.endpoint:
            logger.warning("⚠️ Backend endpoint not configured")
            return False
        
        payload = {
            "camera_id": result.camera_id,
            "window_start": result.window_start.isoformat() + "Z",
            "window_end": result.window_end.isoformat() + "Z",
            "max_people": result.max_people,
            "avg_people": round(result.avg_people, 1),
            "min_people": result.min_people,
            "frames_processed": result.frames_processed,
            "sampling_fps": result.sampling_fps,
            "source_type": result.source_type,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z"
        }
        
        try:
            start_time = time.time()
            
            response = self.session.post(
                self.endpoint,
                json=payload,
                timeout=30
            )
            
            send_time = time.time() - start_time
            
            if PROMETHEUS_AVAILABLE:
                BACKEND_SEND_TIME.labels(camera_id=result.camera_id).observe(send_time)
            
            if response.status_code == 200:
                logger.info(f"[{result.camera_id}] 📤 Sent to backend: max={result.max_people}, avg={result.avg_people:.1f}")
                return True
            else:
                logger.error(f"[{result.camera_id}] ❌ Backend error: {response.status_code} - {response.text[:100]}")
                return False
                
        except requests.Timeout:
            logger.error(f"[{result.camera_id}] ❌ Backend timeout")
            if PROMETHEUS_AVAILABLE:
                ERRORS_TOTAL.labels(camera_id=result.camera_id, error_type='backend_timeout').inc()
            return False
            
        except Exception as e:
            logger.error(f"[{result.camera_id}] ❌ Backend error: {e}")
            if PROMETHEUS_AVAILABLE:
                ERRORS_TOTAL.labels(camera_id=result.camera_id, error_type='backend_error').inc()
            return False
    
    def send_simple(self, camera_id: str, count: int, timestamp: Optional[str] = None) -> bool:
        """
        ส่งค่า count แบบง่าย (สำหรับ backward compatibility)
        """
        if not self.endpoint:
            return False
        
        payload = {
            "camera_id": camera_id,
            "count": count,
            "timestamp": timestamp or datetime.now(timezone.utc).isoformat() + "Z",
            "source_type": "playback"
        }
        
        try:
            response = self.session.post(self.endpoint, json=payload, timeout=30)
            return response.status_code == 200
        except:
            return False


# ==================== Playback Window Processor ====================
class PlaybackProcessor:
    """
    ประมวลผล Playback Window
    
    Logic:
    1. คำนวณ time window (ย้อนหลัง X นาที)
    2. ดึง playback video จากกล้อง
    3. วิเคราะห์ด้วย YOLOv8
    4. สรุปผลเป็น max/avg/min
    5. ส่งไป Backend
    """
    
    def __init__(
        self,
        playback_config: PlaybackConfig,
        service_config: ServiceConfig,
        cameras: List[CameraConfig]
    ):
        self.playback_config = playback_config
        self.service_config = service_config
        self.cameras = cameras
        
        # Initialize components
        self.fetcher = PlaybackFetcher(playback_config)
        self.detector = PeopleDetector(
            model_path=service_config.model,
            device=service_config.device,
            confidence=service_config.confidence
        )
        self.sender = BackendSender(
            endpoint=service_config.backend_endpoint,
            api_key=service_config.backend_api_key
        )
    
    def calculate_time_window(self) -> tuple:
        """
        คำนวณ time window สำหรับ playback
        
        Logic:
        - end_time = now - delay_minutes (เช่น 1 นาที เพื่อให้ recording เสร็จ)
        - start_time = end_time - window_duration_minutes (เช่น 5 นาที)
        
        Returns:
            (start_time, end_time) in UTC
        """
        now = datetime.now(timezone.utc)
        
        end_time = now - timedelta(minutes=self.playback_config.delay_minutes)
        start_time = end_time - timedelta(minutes=self.playback_config.window_duration_minutes)
        
        # Remove timezone info for RTSP URL (ใช้ z suffix แทน)
        start_time = start_time.replace(tzinfo=None)
        end_time = end_time.replace(tzinfo=None)
        
        return start_time, end_time
    
    def process_camera(self, camera: CameraConfig) -> Optional[WindowResult]:
        """
        ประมวลผล 1 กล้อง
        
        Returns:
            WindowResult or None if failed
        """
        start_time, end_time = self.calculate_time_window()
        
        logger.info(f"")
        logger.info(f"{'='*60}")
        logger.info(f"[{camera.camera_id}] 🎥 Processing Playback Window")
        logger.info(f"[{camera.camera_id}]    Time: {start_time.strftime('%Y-%m-%d %H:%M:%S')} → {end_time.strftime('%H:%M:%S')} UTC")
        logger.info(f"{'='*60}")
        
        result = WindowResult(
            camera_id=camera.camera_id,
            window_start=start_time,
            window_end=end_time,
            sampling_fps=self.playback_config.sampling_fps
        )
        
        try:
            # Step 1: Fetch frames from playback
            frames = self.fetcher.fetch_frames(camera, start_time, end_time)
            
            if not frames:
                logger.warning(f"[{camera.camera_id}] ⚠️ No frames captured, skipping window")
                if PROMETHEUS_AVAILABLE:
                    ERRORS_TOTAL.labels(camera_id=camera.camera_id, error_type='no_frames').inc()
                return None
            
            # Step 2: Detect people in each frame
            logger.info(f"[{camera.camera_id}] 🔍 Running YOLOv8 on {len(frames)} frames...")
            
            start_detect = time.time()
            counts = self.detector.detect_batch(frames, camera.camera_id)
            detect_time = time.time() - start_detect
            
            # Step 3: Calculate statistics
            result.frame_counts = counts
            result.frames_processed = len(counts)
            result.max_people = max(counts) if counts else 0
            result.min_people = min(counts) if counts else 0
            result.avg_people = sum(counts) / len(counts) if counts else 0
            
            logger.info(f"[{camera.camera_id}] 📊 Results:")
            logger.info(f"[{camera.camera_id}]    Frames: {result.frames_processed}")
            logger.info(f"[{camera.camera_id}]    Max: {result.max_people} | Avg: {result.avg_people:.1f} | Min: {result.min_people}")
            logger.info(f"[{camera.camera_id}]    Detection time: {detect_time:.1f}s")
            
            # Update Prometheus metrics
            if PROMETHEUS_AVAILABLE:
                PEOPLE_MAX.labels(camera_id=camera.camera_id).set(result.max_people)
                PEOPLE_AVG.labels(camera_id=camera.camera_id).set(result.avg_people)
                PEOPLE_COUNT.labels(camera_id=camera.camera_id).set(result.max_people)
                WINDOWS_PROCESSED.labels(camera_id=camera.camera_id).inc()
            
            # Step 4: Send to backend
            self.sender.send(result)
            
            return result
            
        except Exception as e:
            logger.error(f"[{camera.camera_id}] ❌ Processing error: {e}")
            if PROMETHEUS_AVAILABLE:
                ERRORS_TOTAL.labels(camera_id=camera.camera_id, error_type='processing_error').inc()
            return None
    
    def process_all_cameras(self) -> List[WindowResult]:
        """
        ประมวลผลทุกกล้อง
        
        Returns:
            List of WindowResults
        """
        results = []
        
        for camera in self.cameras:
            if not camera.enabled:
                continue
            
            result = self.process_camera(camera)
            if result:
                results.append(result)
        
        return results


# ==================== Main Service ====================
class PeopleCountingService:
    """
    Main Service - รัน Playback Mode Scheduler
    
    ทำงานเป็น loop:
    1. ทุก X นาที (interval_minutes)
    2. ดึง playback ย้อนหลัง
    3. วิเคราะห์และส่งผล
    """
    
    def __init__(self):
        self.running = False
        self.config_loader = ConfigLoader()
        
        # Load configurations
        self.service_config = self.config_loader.get_service_config()
        self.playback_config = self.config_loader.get_playback_config()
        self.cameras = self.config_loader.get_cameras()
        
        # Initialize processor
        self.processor = PlaybackProcessor(
            playback_config=self.playback_config,
            service_config=self.service_config,
            cameras=self.cameras
        )
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info("\n🛑 Shutdown signal received...")
        self.running = False
    
    def print_config(self):
        """Print configuration summary"""
        logger.info("")
        logger.info("=" * 70)
        logger.info("🚀 AI People Counting Service - PLAYBACK MODE")
        logger.info("=" * 70)
        logger.info("")
        logger.info("📋 Configuration:")
        logger.info(f"   Model: {self.service_config.model}")
        logger.info(f"   Device: {self.service_config.device}")
        logger.info(f"   Confidence: {self.service_config.confidence}")
        logger.info("")
        logger.info("⏰ Playback Settings:")
        logger.info(f"   Window Duration: {self.playback_config.window_duration_minutes} minutes")
        logger.info(f"   Delay: {self.playback_config.delay_minutes} minute(s)")
        logger.info(f"   Interval: Every {self.playback_config.interval_minutes} minutes")
        logger.info(f"   Sampling FPS: {self.playback_config.sampling_fps}")
        logger.info("")
        logger.info("📹 Cameras:")
        for cam in self.cameras:
            status = "✅" if cam.enabled else "❌"
            logger.info(f"   {status} {cam.camera_id} @ {cam.rtsp_ip} (track {cam.track_id})")
        logger.info("")
        logger.info("🔗 Backend:")
        logger.info(f"   Endpoint: {self.service_config.backend_endpoint or 'Not configured'}")
        logger.info("")
        logger.info("=" * 70)
        logger.info("")
    
    def run_once(self):
        """Run one processing cycle"""
        logger.info("🔄 Starting processing cycle...")
        results = self.processor.process_all_cameras()
        logger.info(f"✅ Processed {len(results)} cameras")
        return results
    
    def run(self):
        """
        Main service loop
        
        ทำงานทุก interval_minutes
        """
        self.print_config()
        
        if not self.cameras:
            logger.error("❌ No cameras configured!")
            return
        
        if not self.playback_config.enabled:
            logger.error("❌ Playback mode is disabled in config!")
            return
        
        # Start Prometheus metrics server
        if PROMETHEUS_AVAILABLE:
            try:
                start_http_server(self.service_config.metrics_port)
                logger.info(f"📊 Prometheus metrics at :{self.service_config.metrics_port}/metrics")
            except Exception as e:
                logger.warning(f"⚠️ Could not start metrics server: {e}")
        
        self.running = True
        interval_seconds = self.service_config.send_interval_s
        
        logger.info(f"🏃 Service started! Processing every {interval_seconds} seconds...")
        logger.info("")
        
        # Run first cycle immediately
        self.run_once()
        
        # Main loop
        while self.running:
            try:
                # Wait for next interval
                logger.info(f"💤 Sleeping for {interval_seconds} seconds...")
                
                # Sleep in small chunks to respond to signals faster
                for _ in range(interval_seconds):
                    if not self.running:
                        break
                    time.sleep(1)
                
                if self.running:
                    self.run_once()
                    
            except KeyboardInterrupt:
                logger.info("\n🛑 Interrupted by user")
                break
            except Exception as e:
                logger.error(f"❌ Loop error: {e}")
                time.sleep(60)  # Wait before retry
        
        logger.info("👋 Service stopped")


# ==================== Entry Point ====================
def main():
    """Main entry point"""
    service = PeopleCountingService()
    service.run()


if __name__ == "__main__":
    main()
