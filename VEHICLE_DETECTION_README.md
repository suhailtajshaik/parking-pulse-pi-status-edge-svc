# 🚗 Vehicle Detection System - User Guide

## Overview

The **Vehicle Detection System** is an AI-powered service that detects vehicles entering and exiting your parking lot gate using YOLOv8 on Raspberry Pi 5 with Hailo-8L AI accelerator.

### Features
- ✅ Real-time vehicle detection with YOLOv8
- ✅ Direction detection (IN/OUT) using line-crossing algorithm
- ✅ Automatic photo capture of each event
- ✅ S3 upload with retry mechanism
- ✅ Event transmission to central server
- ✅ Fallback for failed S3 uploads
- ✅ Independent from health monitoring service
- ✅ Production-ready with systemd integration

---

## 📋 Prerequisites

### Hardware Requirements
- **Raspberry Pi 5** (recommended) or Pi 4
- **AI Camera** connected to CSI port
- **Hailo-8L AI Accelerator (13 TOPS Hat)** installed
- **Cooling system** (active cooling recommended)
- **Power supply** - 5V 5A recommended

### Software Requirements
- **Raspbian OS** (Bullseye or newer)
- **Node.js** 14+ (install via NVM - see main README)
- **Python** 3.11+
- **Hailo SDK** 4.16+ ([Download from Hailo](https://hailo.ai/developer-zone/))
- **YOLOv8 Hailo Model** (.hef file)

### Cloud Requirements
- **AWS Account** with S3 access (optional but recommended)
- **S3 Bucket** for photo storage
- **IAM User** with S3 write permissions

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install Python dependencies
pip3 install -r requirements.txt

# Install Node.js dependencies
npm install

# Install Hailo SDK (follow Hailo documentation)
# https://hailo.ai/developer-zone/documentation/
```

### 2. Download YOLOv8 Hailo Model

```bash
# Create models directory
sudo mkdir -p /opt/parking-pulse/models

# Download pre-compiled YOLOv8 model for Hailo-8L
# Option 1: From Hailo Model Zoo
wget https://hailo-model-zoo.s3.amazonaws.com/ModelZoo/Compiled/v2.10.0/hailo8l/yolov8m.hef \
  -O /opt/parking-pulse/models/yolov8m.hef

# Option 2: Compile your own using Hailo Dataflow Compiler
# (See Hailo documentation for custom model compilation)
```

### 3. Configure AWS Credentials

```bash
# Set environment variables
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"

# Or create ~/.aws/credentials file
aws configure
```

### 4. Deploy Services

```bash
# Deploy with all parameters
./deploy-vehicle-detection.sh \
  blue-gate-pi \
  http://192.168.1.112:3000 \
  AKIA... \
  your-secret-key \
  parking-pulse-photos

# Arguments:
#   1. Pi ID (e.g., blue-gate-pi)
#   2. Central server URL
#   3. AWS Access Key ID
#   4. AWS Secret Access Key
#   5. S3 Bucket name (optional, default: parking-pulse-photos)
```

---

## ⚙️ Configuration

### Environment Variables

All configuration is done via environment variables. These are set in the systemd service files during deployment.

#### Vehicle Detector Service

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_ID` | `blue-gate-pi` | Unique identifier for this Pi |
| `GATE_LOCATION` | `entrance-1` | Gate location identifier |
| `DETECTION_LINE_Y` | `540` | Y coordinate of detection line (0-1080) |
| `MIN_CONFIDENCE` | `0.7` | Minimum detection confidence (0-1) |
| `FRAME_RATE` | `24` | Frames per second to process |
| `CAMERA_WIDTH` | `1920` | Camera resolution width |
| `CAMERA_HEIGHT` | `1080` | Camera resolution height |
| `MODEL_PATH` | `/opt/parking-pulse/models/yolov8m.hef` | Path to YOLOv8 Hailo model |
| `EVENT_QUEUE_DIR` | `/tmp/vehicle-events` | Event queue directory |
| `DEBUG_MODE` | `false` | Enable debug visualization |

#### Event Processor Service

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_ID` | `blue-gate-pi` | Unique identifier for this Pi |
| `SERVER_URL` | `http://192.168.1.112:3000` | Central server URL |
| `VEHICLE_EVENT_ENDPOINT` | `/vehicle-events` | API endpoint for events |
| `AWS_ACCESS_KEY_ID` | - | AWS access key (required for S3) |
| `AWS_SECRET_ACCESS_KEY` | - | AWS secret key (required for S3) |
| `AWS_REGION` | `us-east-1` | AWS region |
| `S3_BUCKET` | `parking-pulse-photos` | S3 bucket name |
| `S3_PREFIX` | `vehicle-events` | S3 key prefix |
| `EVENT_QUEUE_DIR` | `/tmp/vehicle-events` | Event queue directory |
| `BACKUP_DIR` | `/var/parking-pulse/backup` | Backup directory |
| `MAX_S3_RETRIES` | `3` | S3 upload retry attempts |
| `S3_RETRY_DELAY` | `2000` | Base retry delay (ms) |
| `POLL_INTERVAL` | `1000` | Queue poll interval (ms) |

### Adjusting Detection Line

The detection line is a horizontal line across the camera frame. Vehicles crossing this line trigger an event.

```
Camera View (1080p):
┌─────────────────────────────────┐  y=0 (top)
│                                 │
│         Parking Lot             │
│              ▲                  │
│              │ EXIT (OUT)       │
│              │                  │
│  ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─    │  y=540 (DETECTION_LINE_Y)
│              │                  │
│              │ ENTRY (IN)       │
│              ▼                  │
│         Street/Outside          │
│                                 │
└─────────────────────────────────┘  y=1080 (bottom)
```

To adjust, set `DETECTION_LINE_Y` to desired pixel coordinate:
- `DETECTION_LINE_Y=270` - Upper third of frame
- `DETECTION_LINE_Y=540` - Middle of frame (default)
- `DETECTION_LINE_Y=810` - Lower third of frame

---

## 🔧 Service Management

Two systemd services are deployed:

### 1. Vehicle Detector (`parking-pulse-vehicle-detector.service`)

Runs YOLOv8 inference and detects vehicles

```bash
# Start
sudo systemctl start parking-pulse-vehicle-detector

# Stop
sudo systemctl stop parking-pulse-vehicle-detector

# Restart
sudo systemctl restart parking-pulse-vehicle-detector

# Status
sudo systemctl status parking-pulse-vehicle-detector

# Logs (real-time)
sudo journalctl -u parking-pulse-vehicle-detector -f

# Logs (last 100 lines)
sudo journalctl -u parking-pulse-vehicle-detector -n 100
```

### 2. Event Processor (`parking-pulse-event-processor.service`)

Uploads photos to S3 and sends events to central server

```bash
# Start
sudo systemctl start parking-pulse-event-processor

# Stop
sudo systemctl stop parking-pulse-event-processor

# Restart
sudo systemctl restart parking-pulse-event-processor

# Status
sudo systemctl status parking-pulse-event-processor

# Logs (real-time)
sudo journalctl -u parking-pulse-event-processor -f

# Logs (last 100 lines)
sudo journalctl -u parking-pulse-event-processor -n 100
```

### Start/Stop Both Services

```bash
# Start both
sudo systemctl start parking-pulse-vehicle-detector parking-pulse-event-processor

# Stop both
sudo systemctl stop parking-pulse-vehicle-detector parking-pulse-event-processor

# Restart both
sudo systemctl restart parking-pulse-vehicle-detector parking-pulse-event-processor
```

---

## 📊 Event Data Format

### Event Queue (JSON)

Events are written to `/tmp/vehicle-events/` as JSON files:

```json
{
  "eventId": "evt_1699876543210_track123",
  "trackId": 123,
  "direction": "IN",
  "timestamp": 1699876543210,
  "confidence": 0.95,
  "bbox": {
    "x": 320,
    "y": 240,
    "width": 180,
    "height": 120
  },
  "piId": "blue-gate-pi",
  "gateLocation": "entrance-1",
  "frameWidth": 1920,
  "frameHeight": 1080,
  "snapshotPath": "/tmp/vehicle-events/evt_1699876543210_track123.jpg"
}
```

### Sent to Central Server

```json
{
  "piId": "blue-gate-pi",
  "eventType": "vehicle_detected",
  "eventId": "evt_1699876543210_track123",
  "direction": "IN",
  "timestamp": 1699876543210,
  "confidence": 0.95,
  "snapshotUrl": "https://parking-pulse-photos.s3.amazonaws.com/vehicle-events/blue-gate-pi/2024-11-13/evt_1699876543210_track123.jpg",
  "fallbackAvailable": false,
  "gateLocation": "entrance-1",
  "metadata": {
    "bbox": {"x": 320, "y": 240, "width": 180, "height": 120},
    "frameWidth": 1920,
    "frameHeight": 1080,
    "trackId": 123
  }
}
```

---

## 🧪 Testing

### Test Vehicle Detector (Without Services)

```bash
# Run detector in debug mode (shows visualization)
DEBUG_MODE=true \
PI_ID=test-pi \
DETECTION_LINE_Y=540 \
python3 vehicle-detector.py
```

### Test Event Processor (Without Services)

```bash
# Run event processor manually
PI_ID=test-pi \
SERVER_URL=http://192.168.1.112:3000 \
AWS_ACCESS_KEY_ID=AKIA... \
AWS_SECRET_ACCESS_KEY=secret... \
node event-processor.js
```

### Test S3 Upload

```bash
# Create test event
mkdir -p /tmp/vehicle-events
cat > /tmp/vehicle-events/test_event.json <<EOF
{
  "eventId": "test_event",
  "trackId": 1,
  "direction": "IN",
  "timestamp": $(date +%s)000,
  "confidence": 0.95,
  "bbox": {"x": 100, "y": 100, "width": 200, "height": 150},
  "piId": "test-pi",
  "gateLocation": "test",
  "frameWidth": 1920,
  "frameHeight": 1080,
  "snapshotPath": "/tmp/vehicle-events/test_event.jpg"
}
EOF

# Create test image
convert -size 200x150 xc:blue /tmp/vehicle-events/test_event.jpg

# Event processor will pick it up automatically
```

---

## 🐛 Troubleshooting

### Camera Not Detected

```bash
# Check camera connection
vcgencmd get_camera

# Expected output: supported=1 detected=1

# Test camera capture
rpicam-still -o test.jpg

# Check camera permissions
groups  # Should include 'video'
```

### Hailo Device Not Found

```bash
# Check Hailo device
lspci | grep Hailo

# Expected output: Hailo device information

# Check Hailo runtime
hailortcli fw-control identify

# Reinstall Hailo SDK if needed
```

### YOLOv8 Model Not Loading

```bash
# Verify model file exists
ls -lh /opt/parking-pulse/models/yolov8m.hef

# Check model format (should be .hef for Hailo)
file /opt/parking-pulse/models/yolov8m.hef

# Download correct model
wget https://hailo-model-zoo.s3.amazonaws.com/ModelZoo/Compiled/v2.10.0/hailo8l/yolov8m.hef \
  -O /opt/parking-pulse/models/yolov8m.hef
```

### S3 Upload Failing

```bash
# Test AWS credentials
aws s3 ls s3://parking-pulse-photos/

# If this works, credentials are correct

# Check S3 bucket permissions
aws s3api get-bucket-acl --bucket parking-pulse-photos

# Test manual upload
aws s3 cp test.jpg s3://parking-pulse-photos/test/test.jpg
```

### Events Not Reaching Central Server

```bash
# Test server connectivity
curl -X POST http://192.168.1.112:3000/vehicle-events \
  -H "Content-Type: application/json" \
  -d '{"piId":"test","eventType":"vehicle_detected","direction":"IN","timestamp":1699876543210}'

# Check firewall
ping 192.168.1.112
telnet 192.168.1.112 3000

# Check event processor logs
sudo journalctl -u parking-pulse-event-processor -n 100
```

### No Detections

```bash
# Check if camera is working
rpicam-still -o test.jpg

# Run in debug mode to see visualization
DEBUG_MODE=true python3 vehicle-detector.py

# Lower confidence threshold temporarily
MIN_CONFIDENCE=0.5 python3 vehicle-detector.py

# Check frame rate
# If too high, Pi might be struggling
FRAME_RATE=5 python3 vehicle-detector.py
```

---

## 📈 Performance Tuning

### Optimize Frame Rate

- **Default:** 24 FPS - Standard video frame rate for smooth tracking
- **High accuracy:** 30 FPS - Maximum smoothness, higher CPU usage
- **Power saving:** 10-15 FPS - Reduced processing, lower power consumption
- **Battery/minimal:** 5 FPS - Minimal processing, lowest power

```bash
# Edit systemd service
sudo systemctl edit parking-pulse-vehicle-detector

# Add:
[Service]
Environment="FRAME_RATE=30"
```

### Adjust Confidence Threshold

- **Default:** 0.7 - Good balance
- **Fewer false positives:** 0.8-0.9 - Only very confident detections
- **More detections:** 0.5-0.6 - May include more false positives

### Camera Resolution

- **1920x1080** (default) - Best accuracy
- **1280x720** - Good accuracy, less processing
- **640x480** - Fastest, reduced accuracy

---

## 🔐 Security Best Practices

### AWS Credentials

- ✅ Use IAM user with S3-only permissions
- ✅ Rotate access keys regularly
- ✅ Use environment variables (not hardcoded)
- ✅ Enable S3 bucket encryption
- ✅ Set lifecycle policy to auto-delete old photos

### S3 Bucket Policy (Example)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PiUploadOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:user/parking-pulse-pi"
      },
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::parking-pulse-photos/vehicle-events/*"
    }
  ]
}
```

### Photo Retention

```bash
# Set S3 lifecycle policy to delete photos after 30 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket parking-pulse-photos \
  --lifecycle-configuration file://lifecycle.json

# lifecycle.json:
{
  "Rules": [{
    "Id": "DeleteOldPhotos",
    "Status": "Enabled",
    "Prefix": "vehicle-events/",
    "Expiration": {"Days": 30}
  }]
}
```

---

## 📚 Additional Resources

- **Architecture Document:** See `VEHICLE_DETECTION_ARCHITECTURE.md`
- **Hailo Documentation:** https://hailo.ai/developer-zone/
- **YOLOv8 Documentation:** https://docs.ultralytics.com/
- **AWS S3 Documentation:** https://docs.aws.amazon.com/s3/

---

## 🛣️ Roadmap (Phase 2)

Future enhancements planned:

- ✅ License plate recognition (ALPR)
- ✅ EV vehicle identification
- ✅ Handicapped vehicle identification
- ✅ Vehicle make/model recognition
- ✅ Analytics dashboard
- ✅ Real-time alerts for specific vehicles

---

**Version:** 3.0.0 (Phase 1 - Vehicle Detection)
**Status:** ✅ Production Ready
