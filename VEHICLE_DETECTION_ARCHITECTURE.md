# 🚗 Vehicle Detection System Architecture
## Parking Gate Entry/Exit Detection with YOLOv8 + Hailo-8L

---

## 📋 **Overview**

This document describes the architecture of the vehicle detection system for detecting cars entering and exiting an indoor parking lot gate using YOLOv8 on Raspberry Pi 5 with Hailo-8L AI accelerator.

### Hardware Setup
- **Raspberry Pi 5** - Main processing unit
- **AI Camera** - Video capture
- **Hailo-8L AI Accelerator (13 TOPS Hat)** - Hardware acceleration for YOLOv8 inference
- **Cooling System** - For sustained performance

### Software Stack
- **YOLOv8** - Object detection model (car detection)
- **Hailo Runtime** - Hailo-8L inference engine
- **Node.js** - Service orchestration and API communication
- **Python** - AI/ML pipeline (YOLOv8 + tracking)
- **AWS SDK** - S3 photo upload
- **Object Tracking** - Direction detection (SORT algorithm)

---

## 🎯 **System Requirements**

### Phase 1: Basic Vehicle Detection
- ✅ Detect cars entering the parking lot
- ✅ Detect cars exiting the parking lot
- ✅ Determine direction of travel (IN/OUT)
- ✅ Capture photo of each event
- ✅ Upload photo to S3 bucket
- ✅ Send event to central server with S3 URL
- ✅ Fallback mechanism if S3 upload fails

### Phase 2: Advanced Detection (Future)
- ⏳ License plate recognition
- ⏳ Identify EV vehicles (from plate patterns or markers)
- ⏳ Identify handicapped vehicles (from plate patterns)
- ⏳ Vehicle make/model recognition

---

## 🏗️ **System Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                    Raspberry Pi 5 + Hailo-8L                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐       ┌────────────────────────┐        │
│  │  AI Camera   │──────▶│  vehicle-detector.py   │        │
│  │   (1080p)    │       │  - YOLOv8 + Hailo      │        │
│  └──────────────┘       │  - Object Tracking     │        │
│                         │  - Direction Detection │        │
│                         └──────────┬─────────────┘        │
│                                    │                       │
│                         ┌──────────▼─────────────┐        │
│                         │  Event Queue (JSON)    │        │
│                         │  /tmp/vehicle-events/  │        │
│                         └──────────┬─────────────┘        │
│                                    │                       │
│                         ┌──────────▼─────────────┐        │
│                         │  event-processor.js    │        │
│                         │  - Photo upload to S3  │        │
│                         │  - Event transmission  │        │
│                         │  - Retry logic         │        │
│                         └──────────┬─────────────┘        │
│                                    │                       │
└────────────────────────────────────┼─────────────────────────┘
                                     │
                    ┌────────────────┴─────────────────┐
                    │                                  │
             ┌──────▼──────┐                  ┌────────▼────────┐
             │  AWS S3     │                  │ Central Server  │
             │  (Photos)   │                  │  (Events API)   │
             └─────────────┘                  └─────────────────┘
```

---

## 🔧 **Component Design**

### 1. Vehicle Detection Service (`vehicle-detector.py`)

**Purpose:** Real-time vehicle detection and tracking

**Key Features:**
- Captures video frames from AI camera
- Runs YOLOv8 inference on Hailo-8L (hardware accelerated)
- Tracks detected vehicles across frames
- Determines direction of travel (IN/OUT)
- Saves event data and snapshot to queue

**Technology:**
- Python 3.11+
- Hailo SDK/Runtime
- YOLOv8 (Hailo-optimized model)
- OpenCV for camera capture
- SORT (Simple Online Realtime Tracking) for object tracking

**Pseudo-code:**
```python
while True:
    frame = capture_frame()
    detections = yolo_detect(frame, model)  # Runs on Hailo

    for detection in detections:
        if detection.class == "car":
            track_id = tracker.update(detection)
            direction = calculate_direction(track_id, detection.centroid)

            if direction in ["IN", "OUT"] and not already_logged(track_id):
                event = {
                    "trackId": track_id,
                    "direction": direction,
                    "timestamp": current_time(),
                    "confidence": detection.confidence,
                    "snapshot": save_snapshot(frame, detection.bbox)
                }
                queue_event(event)
```

### 2. Event Processor (`event-processor.js`)

**Purpose:** Process queued events, upload photos, send to central server

**Key Features:**
- Monitors event queue directory
- Uploads snapshots to S3 (with retry)
- Sends event data to central server
- Implements fallback for failed S3 uploads
- Maintains local backup of failed events

**Technology:**
- Node.js (native modules + AWS SDK)
- File system watcher
- HTTP client for central server
- AWS S3 SDK

**Flow:**
```
1. Watch /tmp/vehicle-events/ for new event files
2. Read event JSON + snapshot image
3. Upload snapshot to S3 (3 retries with exponential backoff)
   ├─ Success: Get S3 URL
   └─ Failure: Use local fallback URL or null
4. Send event to central server:
   {
     "piId": "blue-gate-pi",
     "eventType": "vehicle_detected",
     "direction": "IN" | "OUT",
     "timestamp": 1699876543210,
     "confidence": 0.95,
     "snapshotUrl": "https://s3.../image.jpg" | null,
     "trackId": "track_123",
     "fallbackAvailable": true
   }
5. On success: Delete local event file
6. On failure: Move to retry queue
```

### 3. Direction Detection Algorithm

**Approach:** Virtual line crossing detection

```
Camera View:
┌─────────────────────────────────────┐
│                                     │
│         Parking Lot                 │
│              ▲                      │
│              │ EXIT                │
│              │                     │
│    ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─  Detection Line
│              │                     │
│              │ ENTRY               │
│              ▼                      │
│         Street/Outside              │
│                                     │
└─────────────────────────────────────┘

Direction Detection:
- Track vehicle centroid (x, y) across frames
- Define detection line (e.g., y = 400 in 1080p frame)
- If centroid crosses line from bottom→top: ENTRY (IN)
- If centroid crosses line from top→bottom: EXIT (OUT)
- Only trigger event once per track ID
```

**Implementation:**
```python
class DirectionDetector:
    def __init__(self, detection_line_y=400):
        self.detection_line = detection_line_y
        self.tracks = {}  # {track_id: [previous_y, current_y, logged]}

    def update(self, track_id, centroid_y):
        if track_id not in self.tracks:
            self.tracks[track_id] = [centroid_y, centroid_y, False]
            return None

        prev_y = self.tracks[track_id][1]
        self.tracks[track_id][0] = prev_y
        self.tracks[track_id][1] = centroid_y

        # Check if crossed detection line
        if not self.tracks[track_id][2]:  # Not yet logged
            if prev_y > self.detection_line and centroid_y <= self.detection_line:
                self.tracks[track_id][2] = True
                return "IN"  # Crossed from bottom to top (entry)
            elif prev_y < self.detection_line and centroid_y >= self.detection_line:
                self.tracks[track_id][2] = True
                return "OUT"  # Crossed from top to bottom (exit)

        return None
```

---

## 📡 **Data Formats**

### Event Queue Format (JSON)
```json
{
  "eventId": "evt_1699876543210_track123",
  "trackId": "track_123",
  "direction": "IN",
  "timestamp": 1699876543210,
  "confidence": 0.95,
  "bbox": {
    "x": 320,
    "y": 240,
    "width": 180,
    "height": 120
  },
  "snapshotPath": "/tmp/vehicle-events/evt_1699876543210_track123.jpg"
}
```

### Event Sent to Central Server
```json
{
  "piId": "blue-gate-pi",
  "eventType": "vehicle_detected",
  "eventId": "evt_1699876543210_track123",
  "direction": "IN",
  "timestamp": 1699876543210,
  "confidence": 0.95,
  "snapshotUrl": "https://parking-pulse-photos.s3.amazonaws.com/blue-gate/2024-11-13/evt_1699876543210_track123.jpg",
  "fallbackAvailable": false,
  "metadata": {
    "bbox": {"x": 320, "y": 240, "width": 180, "height": 120},
    "frameWidth": 1920,
    "frameHeight": 1080
  }
}
```

### Central Server Response
```json
{
  "success": true,
  "message": "Event received",
  "eventId": "evt_1699876543210_track123",
  "stored": true
}
```

---

## 🔄 **Retry and Fallback Mechanism**

### S3 Upload Retry Logic
```javascript
async function uploadToS3WithRetry(filePath, s3Key, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = await uploadToS3(filePath, s3Key);
      return { success: true, url };
    } catch (error) {
      console.error(`S3 upload attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
        await sleep(delay);
      }
    }
  }

  // All retries failed
  return { success: false, url: null };
}
```

### Event Transmission Fallback
```javascript
async function sendEvent(event) {
  // Try to upload snapshot to S3
  const s3Result = await uploadToS3WithRetry(
    event.snapshotPath,
    `${PI_ID}/${dateFolder}/${event.eventId}.jpg`
  );

  const eventData = {
    ...event,
    snapshotUrl: s3Result.url,
    fallbackAvailable: !s3Result.success
  };

  // Send event to central server (always send, even if S3 failed)
  try {
    await sendToServer(eventData);

    // Clean up local files on success
    if (s3Result.success) {
      deleteLocalFiles(event);
    } else {
      // Move to backup directory for manual upload later
      moveToBackup(event);
    }
  } catch (error) {
    // Queue for retry
    moveToRetryQueue(event);
  }
}
```

---

## 📦 **Dependencies**

### Python Dependencies
```txt
opencv-python>=4.8.0
numpy>=1.24.0
hailo-platform>=4.16.0  # Hailo SDK
ultralytics>=8.0.0      # YOLOv8
sort-tracker>=1.0.0     # Object tracking
```

### Node.js Dependencies
```json
{
  "dependencies": {
    "aws-sdk": "^2.1498.0",
    "chokidar": "^3.5.3"
  }
}
```

### System Dependencies
- Hailo SDK and runtime (for Hailo-8L)
- Python 3.11+
- Node.js 20+
- libcamera (camera support)
- OpenCV dependencies

---

## ⚙️ **Configuration**

### Environment Variables
```bash
# Service Identity
PI_ID=blue-gate-pi
GATE_LOCATION=entrance-1

# Central Server
SERVER_URL=http://192.168.1.112:3000
VEHICLE_EVENT_ENDPOINT=/vehicle-events

# AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=parking-pulse-photos
S3_PREFIX=vehicle-events

# Detection Settings
DETECTION_LINE_Y=400        # Y coordinate of detection line (0-1080)
MIN_CONFIDENCE=0.7          # Minimum detection confidence (0-1)
FRAME_RATE=24               # Frames per second to process
CAMERA_RESOLUTION=1920x1080 # Camera resolution

# Event Processing
MAX_S3_RETRIES=3
S3_RETRY_DELAY=2000        # Base delay in ms
MAX_EVENT_RETRIES=5
EVENT_QUEUE_DIR=/tmp/vehicle-events
BACKUP_DIR=/var/parking-pulse/backup
```

---

## 🚀 **Deployment**

### Installation Steps

1. **Install Hailo SDK**
```bash
# Install Hailo runtime and drivers
sudo apt-get install hailo-all
```

2. **Install Python Dependencies**
```bash
pip3 install opencv-python numpy ultralytics
```

3. **Download YOLOv8 Hailo Model**
```bash
# Download pre-compiled Hailo model
wget https://hailo-model-zoo.s3.amazonaws.com/ModelZoo/Compiled/v2.10.0/hailo8l/yolov8m.hef
mv yolov8m.hef /opt/parking-pulse/models/
```

4. **Install Node.js Dependencies**
```bash
npm install aws-sdk chokidar
```

5. **Configure AWS Credentials**
```bash
aws configure
# Or set environment variables in systemd service
```

6. **Deploy Services**
```bash
./deploy-vehicle-detection.sh blue-gate-pi
```

### Systemd Services

Two services will run independently:

**1. Health Monitoring** (`parking-pulse.service`)
- Sends system health metrics every 10s
- Already deployed

**2. Vehicle Detection** (`parking-pulse-vehicle.service`)
- Runs vehicle detection pipeline
- New service

---

## 📊 **Performance Expectations**

### Hailo-8L Performance
- **Inference Speed**: ~30-60 FPS for YOLOv8m on Hailo-8L
- **Detection Latency**: <50ms per frame
- **Power Consumption**: ~2.5W additional (Hailo hat)
- **Accuracy**: >90% for vehicle detection in good lighting

### Processing Pipeline
- **Frame Processing**: 24 FPS (configurable)
- **Event Latency**: <500ms from detection to queue
- **S3 Upload Time**: 1-3 seconds per image
- **Total Event Processing**: 2-5 seconds from detection to server notification

### Resource Usage
- **CPU**: 20-40% (Pi 5)
- **Memory**: 500MB-1GB (YOLOv8 + tracking)
- **Disk**: 100MB for queue buffer
- **Network**: ~200KB per event (with photo)

---

## 🔍 **Monitoring and Logging**

### Metrics to Track
- Detections per minute
- IN vs OUT ratio
- Average confidence scores
- S3 upload success rate
- Event transmission success rate
- Processing latency

### Log Format
```
2024-11-13 10:34:56 [INFO] Vehicle detected: track_123, confidence=0.95
2024-11-13 10:34:56 [INFO] Direction: IN (crossed line at y=400)
2024-11-13 10:34:57 [INFO] Snapshot saved: evt_1699876543210_track123.jpg
2024-11-13 10:34:59 [INFO] S3 upload successful: https://s3.../evt_1699876543210_track123.jpg
2024-11-13 10:35:00 [INFO] Event sent to server: evt_1699876543210_track123
2024-11-13 10:35:00 [SUCCESS] Event processed in 4.2s
```

---

## 🛣️ **Future Enhancements (Phase 2)**

### License Plate Recognition
- Use ALPR (Automatic License Plate Recognition) model
- Extract plate number and state
- Identify EV plates (special prefixes/suffixes)
- Identify handicapped plates (special symbols)

### Advanced Analytics
- Vehicle counting and statistics
- Peak hour analysis
- Average stay duration (match IN/OUT events)
- Suspicious activity detection (repeated entries/exits)

### Edge Intelligence
- Local caching of frequent visitors
- Whitelist/blacklist checking
- Real-time alerts for specific plates
- Privacy-preserving plate hashing

---

## 🔐 **Security and Privacy**

### Photo Storage
- S3 bucket with private access only
- Signed URLs with 24-hour expiration
- Automatic deletion after 30 days (configurable)
- Encryption at rest (S3 server-side encryption)

### Data Protection
- No PII in logs
- Plate numbers hashed in Phase 2
- GDPR compliance considerations
- Secure API communication (HTTPS)

### Access Control
- AWS IAM roles for S3 access
- Central server authentication
- API key rotation
- Audit logging

---

## ✅ **Testing Strategy**

### Unit Tests
- Direction detection logic
- S3 upload/retry mechanism
- Event queue processing

### Integration Tests
- End-to-end pipeline with test videos
- S3 upload and retrieval
- Central server communication

### Field Tests
- Real-world detection accuracy
- False positive/negative rates
- Performance under various lighting conditions
- Network failure scenarios

---

## 📚 **References**

- [Hailo-8L Documentation](https://hailo.ai/products/hailo-8l-ai-accelerators/)
- [YOLOv8 Documentation](https://docs.ultralytics.com/)
- [SORT Tracking Algorithm](https://github.com/abewley/sort)
- [AWS S3 SDK](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-examples.html)
- [Raspberry Pi Camera Documentation](https://www.raspberrypi.com/documentation/accessories/camera.html)

---

**Status**: 📐 Design Phase
**Next Step**: Implement vehicle-detector.py with YOLOv8 + Hailo integration
