#!/usr/bin/env python3
"""
=====================================================
People Counting - Accuracy Test (YOLOv8n)
=====================================================
ทดสอบความแม่นยำของการนับคนด้วย YOLOv8n กับภาพ/วิดีโอจริง

ใช้ค่า model + confidence จาก config.yaml (service.model / service.confidence)
นับเฉพาะ class "person" (COCO class id = 0)

วิธีใช้:
    python test_accuracy.py <image_or_video> [--truth N] [--conf 0.4]

ตัวอย่าง:
    # ทดสอบกับเฟรมภาพ
    python test_accuracy.py test_endpoint_3.jpg

    # ใส่จำนวนคนจริงที่นับด้วยตา (ground truth) เพื่อดู % ความแม่นยำ
    python test_accuracy.py test_endpoint_3.jpg --truth 8

    # ทดสอบกับวิดีโอ (สุ่มเฟรมมาวิเคราะห์)
    python test_accuracy.py kadkongta_sat_2000.mp4 --truth 150

ผลลัพธ์: พิมพ์จำนวนคนที่ตรวจพบ + บันทึกภาพที่วาดกรอบไว้ (annotated_*.jpg)
"""

import sys
import argparse
from pathlib import Path

import yaml
import cv2
from ultralytics import YOLO

PERSON_CLASS_ID = 0  # COCO: person
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def load_settings(config_path: Path):
    """อ่าน model + confidence จาก config.yaml (ถ้าไม่เจอใช้ค่า default)"""
    model = "yolov8n.pt"
    confidence = 0.4
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        svc = cfg.get("service", {})
        model = svc.get("model", model)
        confidence = svc.get("confidence", confidence)
    return model, confidence


def detect_people(model, frame, conf):
    """ตรวจจับคนใน 1 เฟรม คืน (จำนวนคน, ผลลัพธ์ดิบสำหรับวาดภาพ)"""
    results = model.predict(
        frame,
        conf=conf,
        classes=[PERSON_CLASS_ID],
        verbose=False,
    )
    r = results[0]
    count = len(r.boxes) if r.boxes is not None else 0
    return count, r


def report_accuracy(detected, truth):
    """พิมพ์ % ความแม่นยำเทียบกับจำนวนจริง (ถ้าระบุ)"""
    if truth is None:
        print("   (ไม่ได้ระบุ --truth จึงไม่สามารถคำนวณ % ความแม่นยำได้)")
        return
    if truth <= 0:
        print("   --truth ต้องมากกว่า 0")
        return
    err = abs(detected - truth)
    acc = max(0.0, (1 - err / truth) * 100)
    print(f"   จำนวนจริง (ground truth): {truth} คน")
    print(f"   ตรวจพบ: {detected} คน  |  คลาดเคลื่อน: {err} คน")
    print(f"   ความแม่นยำ: {acc:.1f}%")


def test_image(model, conf, path: Path, truth):
    frame = cv2.imread(str(path))
    if frame is None:
        print(f"❌ อ่านภาพไม่ได้: {path}")
        return
    count, r = detect_people(model, frame, conf)
    print(f"\n📷 ภาพ: {path.name}  (ขนาด {frame.shape[1]}x{frame.shape[0]})")
    print(f"   ตรวจพบคน: {count} คน  (confidence >= {conf})")
    report_accuracy(count, truth)

    out = path.parent / f"annotated_{path.stem}.jpg"
    cv2.imwrite(str(out), r.plot())
    print(f"   💾 บันทึกภาพที่วาดกรอบ: {out}")


def test_video(model, conf, path: Path, truth, sample_fps=1.0):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        print(f"❌ เปิดวิดีโอไม่ได้: {path}")
        return
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    step = max(1, int(round(fps / sample_fps)))
    counts = []
    idx = 0
    best_frame = None
    best_count = -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            count, r = detect_people(model, frame, conf)
            counts.append(count)
            if count > best_count:
                best_count = count
                best_frame = r.plot()
        idx += 1
    cap.release()

    if not counts:
        print("❌ ไม่มีเฟรมให้วิเคราะห์")
        return

    avg = sum(counts) / len(counts)
    print(f"\n🎬 วิดีโอ: {path.name}")
    print(f"   วิเคราะห์ {len(counts)} เฟรม (สุ่ม ~{sample_fps} fps)")
    print(f"   คนสูงสุด: {max(counts)} | เฉลี่ย: {avg:.1f} | ต่ำสุด: {min(counts)}  (confidence >= {conf})")
    print("   (ใช้ค่าสูงสุด/เฉลี่ยเป็นตัวแทนความหนาแน่นของช่วงเวลานั้น)")
    report_accuracy(max(counts), truth)

    if best_frame is not None:
        out = path.parent / f"annotated_{path.stem}.jpg"
        cv2.imwrite(str(out), best_frame)
        print(f"   💾 บันทึกเฟรมที่คนมากสุด (วาดกรอบ): {out}")


def main():
    parser = argparse.ArgumentParser(description="YOLOv8n People Counting - Accuracy Test")
    parser.add_argument("source", help="ไฟล์ภาพหรือวิดีโอที่จะทดสอบ")
    parser.add_argument("--truth", type=int, default=None, help="จำนวนคนจริงที่นับด้วยตา (สำหรับวัด % ความแม่นยำ)")
    parser.add_argument("--conf", type=float, default=None, help="override confidence threshold")
    args = parser.parse_args()

    src = Path(args.source)
    if not src.exists():
        print(f"❌ ไม่พบไฟล์: {src}")
        sys.exit(1)

    config_path = Path(__file__).parent / "config.yaml"
    model_name, conf = load_settings(config_path)
    if args.conf is not None:
        conf = args.conf

    print(f"🤖 โหลดโมเดล: {model_name}  |  confidence: {conf}")
    model = YOLO(model_name)

    if src.suffix.lower() in VIDEO_EXTS:
        test_video(model, conf, src, args.truth)
    else:
        test_image(model, conf, src, args.truth)


if __name__ == "__main__":
    main()
