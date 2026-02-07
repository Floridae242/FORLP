#!/usr/bin/env python3
"""
AI Video Analytics Agent - People Counting from CCTV Playback
"""

import os
import sys
import json
import time
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

import cv2
import numpy as np
import requests
from ultralytics import YOLO

# Configuration
GO2RTC_BASE_URL = "https://iocpiramid.com:8085"
RTSP_USER = "admin"
RTSP_PASS = "P1r@m1dnvrLpg"
RTSP_IP = "10.0.10.3"
RTSP_PORT = 554
TRACK_ID = "201"
CAMERA_ID = "CAM201"

# YOLOv8 Settings
MODEL_PATH = "yolov8n.pt"
CONFIDENCE = 0.4
PERSON_CLASS_ID = 0


def get_time_range():
    """คำนวณช่วงเวลา: current - 5 minutes ถึง current - 1 second"""
    now = datetime.now()
    end_time = now - timedelta(seconds=1)
    start_time = now - timedelta(minutes=5)
    return start_time, end_time


def build_playback_rtsp_url(start_time: datetime, end_time: datetime) -> str:
    """สร้าง RTSP URL สำหรับ Playback"""
    # Format: YYYYMMDDtHHMMSSz
    start_str = start_time.strftime("%Y%m%dt%H%M%Sz")
    end_str = end_time.strftime("%Y%m%dt%H%M%Sz")
    
    rtsp_url = (
        f"rtsp://{RTSP_USER}:{RTSP_PASS}@{RTSP_IP}:{RTSP_PORT}"
        f"/Streaming/tracks/{TRACK_ID}"
        f"?starttime={start_str}&endtime={end_str}"
    )
    return rtsp_url


def build_go2rtc_stream_url(rtsp_url: str) -> str:
    """สร้าง go2rtc stream URL"""
    encoded_rtsp = urllib.parse.quote(rtsp_url, safe='')
    return f"{GO2RTC_BASE_URL}/api/stream.mp4?src={encoded_rtsp}"


def fetch_frames_from_playback(start_time: datetime, end_time: datetime, sampling_fps: float = 0.5) -> list:
    """ดึง frames จาก Playback API"""
    frames = []
    cap = None
    
    try:
        rtsp_url = build_playback_rtsp_url(start_time, end_time)
        stream_url = build_go2rtc_stream_url(rtsp_url)
        
        print(f"[INFO] Connecting to playback stream...")
        print(f"[INFO] Time range: {start_time.strftime('%H:%M:%S')} -> {end_time.strftime('%H:%M:%S')}")
        
        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)
        
        if not cap.isOpened():
            print("[ERROR] Cannot open playback stream")
            return []
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or fps > 60:
            fps = 25
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"[INFO] Video: {width}x{height} @ {fps:.1f}fps")
        
        # คำนวณจำนวน frames ที่ต้องการ
        duration_seconds = (end_time - start_time).total_seconds()
        target_frames = int(duration_seconds * sampling_fps)
        target_frames = min(target_frames, 150)  # จำกัดไม่เกิน 150 frames
        
        frame_interval = max(1, int(fps / sampling_fps))
        
        print(f"[INFO] Fetching ~{target_frames} frames (sampling {sampling_fps} fps)...")
        
        frame_count = 0
        read_count = 0
        start_fetch = time.time()
        timeout = 120  # 2 minutes timeout
        
        while frame_count < target_frames:
            ret, frame = cap.read()
            
            if not ret:
                break
            
            read_count += 1
            
            if read_count % frame_interval == 0:
                frames.append(frame.copy())
                frame_count += 1
            
            if time.time() - start_fetch > timeout:
                print("[WARN] Timeout reached")
                break
        
        fetch_time = time.time() - start_fetch
        print(f"[INFO] Captured {len(frames)} frames in {fetch_time:.1f}s")
        
    except Exception as e:
        print(f"[ERROR] Stream fetch error: {e}")
    finally:
        if cap:
            cap.release()
    
    return frames


def detect_people(model: YOLO, frames: list) -> dict:
    """ตรวจจับคนในทุก frame และสรุปผล"""
    counts = []
    max_count = 0
    
    print(f"[INFO] Running YOLOv8 detection on {len(frames)} frames...")
    
    for i, frame in enumerate(frames):
        try:
            results = model.predict(
                frame,
                device="cpu",
                conf=CONFIDENCE,
                classes=[PERSON_CLASS_ID],
                verbose=False
            )
            
            count = 0
            if results and len(results) > 0:
                boxes = results[0].boxes
                if boxes is not None:
                    count = len(boxes)
            
            counts.append(count)
            max_count = max(max_count, count)
            
            # Progress
            if (i + 1) % 30 == 0:
                print(f"[INFO] Processed {i+1}/{len(frames)} frames...")
                
        except Exception as e:
            print(f"[ERROR] Detection error on frame {i}: {e}")
            counts.append(0)
    
    # คำนวณสถิติ
    if counts:
        avg_count = sum(counts) / len(counts)
        min_count = min(counts)
    else:
        avg_count = 0
        min_count = 0
    
    return {
        "max": max_count,
        "avg": round(avg_count, 1),
        "min": min_count,
        "frames_analyzed": len(counts),
        "all_counts": counts
    }


def determine_confidence(stats: dict) -> str:
    """กำหนดระดับความมั่นใจ"""
    frames = stats["frames_analyzed"]
    
    if frames >= 100:
        return "high"
    elif frames >= 50:
        return "medium"
    else:
        return "low"


def generate_notes(stats: dict) -> str:
    """สร้างหมายเหตุจากผลการวิเคราะห์"""
    notes = []
    
    max_count = stats["max"]
    avg_count = stats["avg"]
    
    if max_count == 0:
        notes.append("No people detected in the scene")
    elif max_count >= 50:
        notes.append("High crowd density detected")
    elif max_count >= 20:
        notes.append("Moderate crowd detected")
    elif max_count >= 5:
        notes.append("Light foot traffic")
    else:
        notes.append("Very few people in the area")
    
    # ตรวจสอบความแปรปรวน
    if max_count > 0 and avg_count > 0:
        variance = max_count / avg_count
        if variance > 2:
            notes.append("High movement variation observed")
    
    return ". ".join(notes)


def run_people_counting():
    """Main function - รัน People Counting"""
    
    # 1. คำนวณช่วงเวลา
    start_time, end_time = get_time_range()
    
    print("=" * 60)
    print("AI Video Analytics Agent - People Counting")
    print("=" * 60)
    print(f"Camera: {CAMERA_ID}")
    print(f"Analysis Period: {start_time.strftime('%Y-%m-%dT%H:%M:%S')} -> {end_time.strftime('%Y-%m-%dT%H:%M:%S')}")
    print("=" * 60)
    
    # 2. โหลด YOLOv8 model
    print("[INFO] Loading YOLOv8 model...")
    model_paths = [
        MODEL_PATH,
        Path(__file__).parent.parent / MODEL_PATH,
        Path(__file__).parent / MODEL_PATH
    ]
    
    model = None
    for path in model_paths:
        if Path(path).exists():
            model = YOLO(str(path))
            break
    
    if model is None:
        print("[INFO] Downloading YOLOv8 model...")
        model = YOLO(MODEL_PATH)
    
    print("[INFO] Model loaded successfully")
    
    # 3. ดึง frames จาก Playback
    frames = fetch_frames_from_playback(start_time, end_time, sampling_fps=0.5)
    
    if not frames:
        # ส่งผลลัพธ์ว่าไม่มีข้อมูล
        result = {
            "camera_id": CAMERA_ID,
            "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "end_time": end_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "people_count": 0,
            "confidence": "low",
            "notes": "Unable to fetch video frames from playback API"
        }
        print("\n" + "=" * 60)
        print("RESULT:")
        print(json.dumps(result, indent=2))
        return result
    
    # 4. ตรวจจับคน
    stats = detect_people(model, frames)
    
    # 5. สร้างผลลัพธ์
    confidence = determine_confidence(stats)
    notes = generate_notes(stats)
    
    result = {
        "camera_id": CAMERA_ID,
        "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "end_time": end_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "people_count": stats["max"],
        "confidence": confidence,
        "notes": notes,
        "statistics": {
            "max": stats["max"],
            "avg": stats["avg"],
            "min": stats["min"],
            "frames_analyzed": stats["frames_analyzed"]
        }
    }
    
    print("\n" + "=" * 60)
    print("RESULT:")
    print(json.dumps(result, indent=2))
    print("=" * 60)
    
    return result


if __name__ == "__main__":
    run_people_counting()
