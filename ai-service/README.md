# 🎥 AI People Counting Service

ระบบนับจำนวนคนอัตโนมัติด้วย YOLOv8 สำหรับกาดกองต้า

## 📋 Features

- ✅ รองรับ Multi-camera (หลายกล้องพร้อมกัน)
- ✅ YOLOv8 Object Detection
- ✅ RTSP Stream Support
- ✅ Auto-reconnect เมื่อ stream หลุด
- ✅ Smoothing algorithm ลด flicker
- ✅ Prometheus Metrics
- ✅ Health Check API
- ✅ Retry & Backoff สำหรับ Backend
- ✅ Docker & Docker Compose ready

## 🚀 Quick Start

### 1. รันด้วย Docker Compose (แนะนำ)

```bash
# CPU Version
docker-compose up ai-service -d

# GPU Version (ต้องมี NVIDIA Docker)
docker-compose --profile gpu up ai-service-gpu -d
```

### 2. รันแบบ Manual

```bash
cd ai-service

# สร้าง virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# หรือ venv\Scripts\activate  # Windows

# ติดตั้ง dependencies
pip install -r requirements.txt

# รัน service
python src/main.py
```

### 3. รันด้วย Docker เดี่ยว

```bash
cd ai-service

# Build
docker build -t kadkongta-ai-service .

# Run
docker run -d \
  --name ai-service \
  -p 8080:8080 \
  -p 8081:8081 \
  -e BACKEND_ENDPOINT=https://forlp.onrender.com/api/ai/people-count \
  -e BACKEND_API_KEY=kadkongta-ai-secret-2024 \
  kadkongta-ai-service
```

## ⚙️ Configuration

แก้ไขไฟล์ `config.yaml`:

```yaml
service:
  model: "yolov8n.pt"      # Model: yolov8n/s/m/l/x
  device: "cpu"            # หรือ "cuda" สำหรับ GPU
  confidence: 0.4          # Confidence threshold
  send_interval_s: 5       # ส่งข้อมูลทุกกี่วินาที
  backend_endpoint: "https://your-backend.com/api/ai/people-count"
  backend_api_key: "your-api-key"

streams:
  - stream_id: "camera-1"
    rtsp: "rtsp://user:pass@ip:554/path"
    sampling_fps: 1.0
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CONFIG_PATH` | Path to config file | `config.yaml` |
| `BACKEND_ENDPOINT` | Backend API URL | - |
| `BACKEND_API_KEY` | API Key for authentication | - |
| `DEVICE` | `cpu` or `cuda` | `cpu` |
| `MODEL_PATH` | YOLOv8 model file | `yolov8n.pt` |

## 📡 API Endpoints

### Health Check
```bash
curl http://localhost:8081/health
```

Response:
```json
{
  "status": "ok",
  "service": {
    "status": "running",
    "streams": 3,
    "model": "yolov8n.pt",
    "device": "cpu"
  }
}
```

### Stream Status
```bash
curl http://localhost:8081/streams
```

Response:
```json
{
  "streams": [
    {
      "stream_id": "camera-1",
      "status": "running",
      "last_count": 45
    }
  ]
}
```

### Prometheus Metrics
```bash
curl http://localhost:8080/metrics
```

## 📊 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `frames_processed_total` | Counter | จำนวน frame ที่ประมวลผล |
| `people_count_sent_total` | Counter | จำนวนครั้งที่ส่งข้อมูลไป Backend |
| `inference_duration_seconds` | Histogram | เวลาที่ใช้ในการ inference |
| `current_people_count` | Gauge | จำนวนคนปัจจุบัน |
| `errors_total` | Counter | จำนวน errors |
| `stream_status` | Gauge | สถานะการเชื่อมต่อ stream |

## 🔧 Troubleshooting

### Stream ไม่เชื่อมต่อ

1. ตรวจสอบ RTSP URL
2. ตรวจสอบว่ากล้องออนไลน์
3. ตรวจสอบ firewall

```bash
# ทดสอบ RTSP ด้วย ffmpeg
ffmpeg -i "rtsp://user:pass@ip:554/path" -frames:v 1 test.jpg
```

### Backend ไม่ได้รับข้อมูล

1. ตรวจสอบ `backend_endpoint` ใน config
2. ตรวจสอบ `backend_api_key`
3. ดู logs: `docker logs kadkongta-ai-service`

### GPU ไม่ทำงาน

1. ติดตั้ง NVIDIA Docker: `nvidia-docker`
2. ตรวจสอบ CUDA: `nvidia-smi`
3. ใช้ Dockerfile.gpu

## 📁 Project Structure

```
ai-service/
├── config.yaml          # Configuration
├── Dockerfile           # CPU Docker image
├── Dockerfile.gpu       # GPU Docker image
├── requirements.txt     # Python dependencies
├── README.md           # This file
└── src/
    └── main.py         # Main application
```

## 🔒 Security Notes

- อย่า commit `config.yaml` ที่มี credentials จริง
- ใช้ Environment Variables สำหรับ secrets
- RTSP credentials ควรเก็บใน secrets manager

## 📝 License

MIT License - Kad Kong Ta Project
