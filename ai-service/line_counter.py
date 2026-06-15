#!/usr/bin/env python3
"""
=====================================================
Line Crossing People Counter (YOLOv8 + ByteTrack)
=====================================================
นับคน "เข้า" / "ออก" โดยดูว่า track ID ข้ามเส้นเสมือนทิศไหน
ดึงสตรีมจากกล้อง LPG-B01-Temp-CC-01 (Hikvision NVR) ผ่าน RTSP

หัวใจการทำงาน:
  1. model.track(persist=True) ให้แต่ละคนมี ID ต่อเนื่องข้ามเฟรม
  2. ดูตำแหน่ง "เท้า" (กึ่งกลางขอบล่างของกล่อง) เทียบกับเส้น A-B
  3. เมื่อ ID เปลี่ยนฝั่ง (A->B หรือ B->A) นับ 1 ครั้ง แล้วจำฝั่งล่าสุด → กันนับซ้ำ
  4. RTSP หลุด → reconnect อัตโนมัติแบบ exponential backoff

วิธีใช้:
    # รันกับกล้องจริง (อ่านค่าจาก config.yaml)
    python line_counter.py

    # ทดสอบกับไฟล์วิดีโอแทนกล้อง + เซฟวิดีโอผลลัพธ์
    python line_counter.py --source clip.mp4 --save out.mp4

    # ทดสอบเร็ว ๆ (ประมวลทุกเฟรม ไม่ sample) จำกัดจำนวนเฟรม
    python line_counter.py --source clip.mp4 --all-frames --max-frames 200
"""

import sys
import time
import argparse
from pathlib import Path

import yaml
import cv2
import numpy as np
from ultralytics import YOLO

PERSON_CLASS_ID = 0


# ==================== Geometry / Counting ====================
class LineCounter:
    """นับการข้ามเส้น A-B แยกทิศ เข้า/ออก พร้อม de-dup ตาม track ID"""

    def __init__(self, p_a, p_b, deadzone_px=8.0, invert=False):
        self.ax, self.ay = p_a
        self.bx, self.by = p_b
        self.deadzone = deadzone_px
        self.invert = invert
        self.in_count = 0
        self.out_count = 0
        # track_id -> ฝั่งล่าสุดที่ "มั่นใจ" (+1 หรือ -1)
        self._last_side = {}
        self.crossings = []  # log: (track_id, direction)

    def _signed_distance(self, px, py):
        """ระยะมีเครื่องหมายจากเส้น (บอกฝั่ง + ระยะห่าง)"""
        dx, dy = self.bx - self.ax, self.by - self.ay
        length = (dx * dx + dy * dy) ** 0.5 or 1.0
        # cross product / ความยาวเส้น = ระยะตั้งฉาก มีเครื่องหมาย
        return ((px - self.ax) * dy - (py - self.ay) * dx) / length

    def update(self, track_id, px, py):
        """อัปเดตตำแหน่งของ track หนึ่งตัว คืน direction ถ้าเพิ่งข้าม ('in'/'out') ไม่งั้น None"""
        d = self._signed_distance(px, py)
        if abs(d) < self.deadzone:
            return None  # อยู่ในโซนคร่อมเส้น ยังไม่ชี้ขาด กันการสั่น
        side = 1 if d > 0 else -1
        prev = self._last_side.get(track_id)
        self._last_side[track_id] = side
        if prev is None or prev == side:
            return None  # เพิ่งเห็นครั้งแรก หรือยังอยู่ฝั่งเดิม
        # เปลี่ยนฝั่ง = ข้ามเส้น
        # นิยาม: จากฝั่งลบ(-1, ฝั่ง A) ไปฝั่งบวก(+1, ฝั่ง B) = เข้า
        direction = 'in' if side > prev else 'out'
        if self.invert:
            direction = 'out' if direction == 'in' else 'in'
        if direction == 'in':
            self.in_count += 1
        else:
            self.out_count += 1
        self.crossings.append((track_id, direction))
        return direction

    def forget(self, active_ids):
        """ลืม track ที่หายไปแล้ว เพื่อไม่ให้ dict โตไม่จำกัด"""
        for tid in list(self._last_side.keys()):
            if tid not in active_ids:
                del self._last_side[tid]

    @property
    def net(self):
        return self.in_count - self.out_count


# ==================== Image helpers (edge cases) ====================
def enhance_night(frame):
    """CLAHE บน channel L (LAB) — ช่วยภาพย้อนแสง/มืดให้ contrast ดีขึ้น"""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def build_roi_mask(shape, roi_norm):
    """สร้าง mask จาก polygon normalized (กันบริเวณเต็นท์บัง) — คืน None ถ้า roi ว่าง"""
    if not roi_norm:
        return None
    h, w = shape[:2]
    pts = np.array([[int(x * w), int(y * h)] for x, y in roi_norm], dtype=np.int32)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def point_in_mask(mask, px, py):
    if mask is None:
        return True
    h, w = mask.shape[:2]
    xi, yi = int(min(max(px, 0), w - 1)), int(min(max(py, 0), h - 1))
    return mask[yi, xi] > 0


# ==================== Config ====================
def load_config(config_path: Path):
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    return cfg


def build_rtsp_url(cfg, camera_id):
    """หา RTSP URL ของกล้องจากรายการ cameras ใน config"""
    for cam in cfg.get("cameras", []):
        if cam.get("camera_id") == camera_id:
            return cam.get("rtsp_url")
    return None


# ==================== Stream + reconnect ====================
class RTSPStream:
    """เปิด/อ่าน RTSP พร้อม reconnect แบบ exponential backoff"""

    def __init__(self, source, reconnect_cfg=None, is_file=False):
        self.source = source
        self.is_file = is_file
        rc = reconnect_cfg or {}
        self.max_retries = rc.get("max_retries", 0)
        self.backoff_start = rc.get("backoff_start_s", 2)
        self.backoff_max = rc.get("backoff_max_s", 30)
        self.cap = None
        self.retries = 0

    def open(self):
        if self.is_file:
            self.cap = cv2.VideoCapture(self.source)
        else:
            self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)  # buffer เล็ก เอาเฟรมล่าสุด
        return self.cap.isOpened()

    def reconnect(self):
        """พยายามต่อใหม่ คืน True ถ้าสำเร็จ, False ถ้าเลิกลอง"""
        if self.cap:
            self.cap.release()
        backoff = self.backoff_start
        while True:
            self.retries += 1
            if self.max_retries and self.retries > self.max_retries:
                print(f"[STREAM] ❌ เกินจำนวนครั้งที่ลองต่อใหม่ ({self.max_retries}) — หยุด")
                return False
            print(f"[STREAM] 🔄 reconnect ครั้งที่ {self.retries} (รอ {backoff}s)...")
            time.sleep(backoff)
            if self.open():
                print("[STREAM] ✅ ต่อใหม่สำเร็จ")
                self.retries = 0
                return True
            backoff = min(backoff * 2, self.backoff_max)

    def read(self):
        return self.cap.read() if self.cap else (False, None)

    def get_fps(self):
        fps = self.cap.get(cv2.CAP_PROP_FPS) if self.cap else 0
        return fps if 0 < fps <= 60 else 25.0

    def release(self):
        if self.cap:
            self.cap.release()


# ==================== Main processing ====================
def run(cfg, source=None, save=None, all_frames=False, max_frames=0, show=False):
    lc_cfg = cfg.get("line_counting", {})
    svc = cfg.get("service", {})
    model_name = svc.get("model", "yolov8n.pt")
    confidence = lc_cfg.get("confidence", svc.get("confidence", 0.4))
    sampling_fps = lc_cfg.get("sampling_fps", 0.5)
    tracker = lc_cfg.get("tracker", "bytetrack.yaml")
    min_box_h = lc_cfg.get("min_box_height", 0.05)
    night = lc_cfg.get("night_enhance", False)
    roi_norm = lc_cfg.get("roi", [])
    invert = lc_cfg.get("invert_direction", False)
    deadzone_frac = lc_cfg.get("deadzone", 0.01)
    line = lc_cfg.get("line", {"ax": 0.5, "ay": 0.05, "bx": 0.5, "by": 0.95})

    # source: ไฟล์ทดสอบ หรือ RTSP จาก config
    is_file = source is not None
    if source is None:
        camera_id = lc_cfg.get("camera_id", "LPG-B01-Temp-CC-01")
        source = build_rtsp_url(cfg, camera_id)
        if not source:
            print(f"❌ หา RTSP ของกล้อง {camera_id} ใน config ไม่เจอ")
            return
        print(f"📡 RTSP source: {camera_id}")
    else:
        print(f"🎞️  File source: {source}")

    print(f"🤖 model={model_name}  conf={confidence}  sampling_fps={sampling_fps}  tracker={tracker}")
    model = YOLO(model_name)

    stream = RTSPStream(source, lc_cfg.get("reconnect"), is_file=is_file)
    if not stream.open():
        if is_file:
            print(f"❌ เปิดไฟล์ไม่ได้: {source}")
            return
        print("[STREAM] เปิดสตรีมครั้งแรกไม่สำเร็จ — เข้าสู่โหมด reconnect")
        if not stream.reconnect():
            return

    fps = stream.get_fps()
    sample_interval = 1.0 if all_frames else max(1.0 / sampling_fps, 0.0)

    counter = None
    writer = None
    roi_mask = None
    last_infer = 0.0
    processed = 0
    fail_streak = 0

    print("▶️  เริ่มประมวลผล (Ctrl+C เพื่อหยุด)\n")
    try:
        while True:
            ok, frame = stream.read()
            if not ok or frame is None:
                if is_file:
                    print("\n[STREAM] จบไฟล์")
                    break
                fail_streak += 1
                if fail_streak >= 5:  # อ่านพลาดติดกัน = สตรีมหลุด
                    print("[STREAM] ⚠️ อ่านเฟรมไม่ได้ — พยายาม reconnect")
                    if not stream.reconnect():
                        break
                    fail_streak = 0
                continue
            fail_streak = 0

            now = time.time()
            # sampling ตามเวลา (ประหยัด CPU) — ไฟล์ทดสอบใช้ all_frames ได้
            if not all_frames and (now - last_infer) < sample_interval:
                continue
            last_infer = now

            proc = enhance_night(frame) if night else frame

            # init ตามขนาดเฟรมจริง (ครั้งแรก)
            if counter is None:
                h, w = frame.shape[:2]
                pa = (line["ax"] * w, line["ay"] * h)
                pb = (line["bx"] * w, line["by"] * h)
                counter = LineCounter(pa, pb, deadzone_px=deadzone_frac * w, invert=invert)
                roi_mask = build_roi_mask(frame.shape, roi_norm)
                if save:
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    writer = cv2.VideoWriter(save, fourcc, max(sampling_fps, 1), (w, h))
                print(f"📐 frame {w}x{h} | line A({pa[0]:.0f},{pa[1]:.0f})->B({pb[0]:.0f},{pb[1]:.0f}) | deadzone {counter.deadzone:.0f}px")

            h, w = frame.shape[:2]
            results = model.track(
                proc, persist=True, conf=confidence, classes=[PERSON_CLASS_ID],
                tracker=tracker, verbose=False,
            )
            r = results[0]
            boxes = r.boxes
            active_ids = set()

            if boxes is not None and boxes.id is not None:
                xyxy = boxes.xyxy.cpu().numpy()
                ids = boxes.id.cpu().numpy().astype(int)
                for (x1, y1, x2, y2), tid in zip(xyxy, ids):
                    if (y2 - y1) < min_box_h * h:   # กล่องเล็กเกิน — ข้าม
                        continue
                    fx, fy = (x1 + x2) / 2.0, y2     # จุดเท้า
                    if not point_in_mask(roi_mask, fx, fy):  # นอก ROI (เต็นท์บัง) — ข้าม
                        continue
                    active_ids.add(int(tid))
                    direction = counter.update(int(tid), fx, fy)
                    if save or show:
                        color = (0, 200, 0) if direction == 'in' else (0, 0, 230) if direction == 'out' else (230, 160, 0)
                        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                        cv2.putText(frame, f"id{tid}", (int(x1), int(y1) - 6),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            counter.forget(active_ids)
            processed += 1

            if save or show:
                cv2.line(frame, (int(counter.ax), int(counter.ay)),
                         (int(counter.bx), int(counter.by)), (255, 255, 0), 2)
                cv2.putText(frame, f"IN:{counter.in_count}  OUT:{counter.out_count}  NET:{counter.net}",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                if writer:
                    writer.write(frame)
                if show:
                    cv2.imshow("line_counter", frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break

            if processed % 20 == 0:
                print(f"[{processed}] IN={counter.in_count} OUT={counter.out_count} NET={counter.net} (tracks={len(active_ids)})")
            if max_frames and processed >= max_frames:
                print("\n[STREAM] ถึง max-frames")
                break

    except KeyboardInterrupt:
        print("\n⏹️  หยุดโดยผู้ใช้")
    finally:
        stream.release()
        if writer:
            writer.release()
        if show:
            cv2.destroyAllWindows()

    if counter:
        print("\n" + "=" * 50)
        print(f"สรุป: เข้า(IN)={counter.in_count}  ออก(OUT)={counter.out_count}  คงเหลือสุทธิ(NET)={counter.net}")
        print(f"เฟรมที่ประมวลผล: {processed}")
        print("=" * 50)
        if save:
            print(f"💾 วิดีโอผลลัพธ์: {save}")


def main():
    ap = argparse.ArgumentParser(description="Line crossing people counter (YOLOv8 + tracking)")
    ap.add_argument("--source", default=None, help="ไฟล์วิดีโอสำหรับทดสอบ (ไม่ใส่ = ใช้ RTSP จาก config)")
    ap.add_argument("--save", default=None, help="เซฟวิดีโอผลลัพธ์ (เช่น out.mp4)")
    ap.add_argument("--all-frames", action="store_true", help="ประมวลทุกเฟรม (ไม่ sample) — เหมาะกับทดสอบไฟล์")
    ap.add_argument("--max-frames", type=int, default=0, help="หยุดเมื่อประมวลครบ N เฟรม (0=ไม่จำกัด)")
    ap.add_argument("--show", action="store_true", help="แสดงหน้าต่างวิดีโอ (ต้องมี GUI)")
    args = ap.parse_args()

    config_path = Path(__file__).parent / "config.yaml"
    cfg = load_config(config_path)
    run(cfg, source=args.source, save=args.save,
        all_frames=args.all_frames, max_frames=args.max_frames, show=args.show)


if __name__ == "__main__":
    main()
