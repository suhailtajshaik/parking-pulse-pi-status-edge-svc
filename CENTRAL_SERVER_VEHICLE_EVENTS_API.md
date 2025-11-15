# 🚗 Central Server - Vehicle Events API Specification

## Overview

This document specifies the API endpoint that the central server must implement to receive vehicle detection events from Raspberry Pi edge devices.

---

## 📡 API Endpoint

### POST `/vehicle-events`

Receives vehicle detection events with optional photo URL.

**Method:** `POST`
**Content-Type:** `application/json`
**Authentication:** Optional (add API key if needed)

---

## 📥 Request Format

### Request Body

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
    "bbox": {
      "x": 320,
      "y": 240,
      "width": 180,
      "height": 120
    },
    "frameWidth": 1920,
    "frameHeight": 1080,
    "trackId": 123
  }
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `piId` | string | Yes | Unique identifier for the Pi device (e.g., "blue-gate-pi") |
| `eventType` | string | Yes | Type of event, always "vehicle_detected" for Phase 1 |
| `eventId` | string | Yes | Unique event identifier (format: "evt_{timestamp}_track{id}") |
| `direction` | string | Yes | Direction of travel: "IN" or "OUT" |
| `timestamp` | number | Yes | Unix timestamp in milliseconds |
| `confidence` | number | Yes | Detection confidence (0.0 to 1.0) |
| `snapshotUrl` | string | No | S3 URL of the vehicle photo (null if S3 upload failed) |
| `fallbackAvailable` | boolean | Yes | True if S3 upload failed but photo is in backup |
| `gateLocation` | string | Yes | Gate/location identifier (e.g., "entrance-1") |
| `metadata` | object | Yes | Additional detection metadata |
| `metadata.bbox` | object | Yes | Bounding box of detected vehicle |
| `metadata.bbox.x` | number | Yes | X coordinate (top-left) |
| `metadata.bbox.y` | number | Yes | Y coordinate (top-left) |
| `metadata.bbox.width` | number | Yes | Width of bounding box |
| `metadata.bbox.height` | number | Yes | Height of bounding box |
| `metadata.frameWidth` | number | Yes | Camera frame width (e.g., 1920) |
| `metadata.frameHeight` | number | Yes | Camera frame height (e.g., 1080) |
| `metadata.trackId` | number | Yes | Object tracker ID |

---

## 📤 Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Event received",
  "eventId": "evt_1699876543210_track123",
  "stored": true
}
```

### Error Responses

**400 Bad Request** - Missing or invalid fields

```json
{
  "success": false,
  "message": "Missing required field: piId",
  "error": "INVALID_REQUEST"
}
```

**500 Internal Server Error** - Server error

```json
{
  "success": false,
  "message": "Failed to store event",
  "error": "DATABASE_ERROR"
}
```

---

## 💻 Implementation Examples

### Node.js (Express)

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/vehicle-events', async (req, res) => {
  try {
    const event = req.body;

    // Validate required fields
    const requiredFields = ['piId', 'eventType', 'eventId', 'direction', 'timestamp'];
    for (const field of requiredFields) {
      if (!event[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
          error: 'INVALID_REQUEST'
        });
      }
    }

    // Validate direction
    if (!['IN', 'OUT'].includes(event.direction)) {
      return res.status(400).json({
        success: false,
        message: 'Direction must be "IN" or "OUT"',
        error: 'INVALID_DIRECTION'
      });
    }

    // Store event in database
    await storeVehicleEvent(event);

    // Check for alerts (optional)
    const alerts = await checkVehicleAlerts(event);

    // Respond
    res.json({
      success: true,
      message: 'Event received',
      eventId: event.eventId,
      stored: true,
      alerts: alerts.length > 0 ? alerts : undefined
    });

    // Log event
    console.log(`📊 Vehicle ${event.direction}: ${event.piId} at ${event.gateLocation}`);
    console.log(`   Event ID: ${event.eventId}`);
    console.log(`   Confidence: ${(event.confidence * 100).toFixed(1)}%`);
    console.log(`   Photo: ${event.snapshotUrl || 'N/A (S3 failed)'}`);

  } catch (error) {
    console.error('Error processing vehicle event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store event',
      error: 'DATABASE_ERROR'
    });
  }
});

async function storeVehicleEvent(event) {
  // Database storage implementation
  // Example with MongoDB:
  /*
  await VehicleEvent.create({
    piId: event.piId,
    eventId: event.eventId,
    eventType: event.eventType,
    direction: event.direction,
    timestamp: new Date(event.timestamp),
    confidence: event.confidence,
    snapshotUrl: event.snapshotUrl,
    fallbackAvailable: event.fallbackAvailable,
    gateLocation: event.gateLocation,
    bbox: event.metadata.bbox,
    frameWidth: event.metadata.frameWidth,
    frameHeight: event.metadata.frameHeight,
    trackId: event.metadata.trackId,
    receivedAt: new Date()
  });
  */

  // Example with PostgreSQL:
  /*
  await db.query(
    `INSERT INTO vehicle_events
     (pi_id, event_id, event_type, direction, timestamp, confidence,
      snapshot_url, fallback_available, gate_location, bbox, frame_width,
      frame_height, track_id, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
    [event.piId, event.eventId, event.eventType, event.direction,
     new Date(event.timestamp), event.confidence, event.snapshotUrl,
     event.fallbackAvailable, event.gateLocation,
     JSON.stringify(event.metadata.bbox), event.metadata.frameWidth,
     event.metadata.frameHeight, event.metadata.trackId]
  );
  */
}

async function checkVehicleAlerts(event) {
  const alerts = [];

  // Example: Alert if confidence is low
  if (event.confidence < 0.8) {
    alerts.push({
      type: 'LOW_CONFIDENCE',
      message: `Low confidence detection: ${(event.confidence * 100).toFixed(1)}%`,
      severity: 'warning'
    });
  }

  // Example: Alert if S3 upload failed
  if (event.fallbackAvailable && !event.snapshotUrl) {
    alerts.push({
      type: 'PHOTO_UPLOAD_FAILED',
      message: 'Photo upload to S3 failed - available in backup',
      severity: 'warning'
    });
  }

  return alerts;
}

app.listen(3000, () => {
  console.log('Vehicle events API listening on port 3000');
});
```

### Python (Flask)

```python
from flask import Flask, request, jsonify
from datetime import datetime
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/vehicle-events', methods=['POST'])
def receive_vehicle_event():
    try:
        event = request.get_json()

        # Validate required fields
        required_fields = ['piId', 'eventType', 'eventId', 'direction', 'timestamp']
        for field in required_fields:
            if field not in event:
                return jsonify({
                    'success': False,
                    'message': f'Missing required field: {field}',
                    'error': 'INVALID_REQUEST'
                }), 400

        # Validate direction
        if event['direction'] not in ['IN', 'OUT']:
            return jsonify({
                'success': False,
                'message': 'Direction must be "IN" or "OUT"',
                'error': 'INVALID_DIRECTION'
            }), 400

        # Store event
        store_vehicle_event(event)

        # Log
        logging.info(f"📊 Vehicle {event['direction']}: {event['piId']} at {event['gateLocation']}")
        logging.info(f"   Event ID: {event['eventId']}")
        logging.info(f"   Confidence: {event['confidence'] * 100:.1f}%")
        logging.info(f"   Photo: {event.get('snapshotUrl', 'N/A (S3 failed)')}")

        return jsonify({
            'success': True,
            'message': 'Event received',
            'eventId': event['eventId'],
            'stored': True
        }), 200

    except Exception as e:
        logging.error(f'Error processing vehicle event: {e}')
        return jsonify({
            'success': False,
            'message': 'Failed to store event',
            'error': 'DATABASE_ERROR'
        }), 500

def store_vehicle_event(event):
    # Database storage implementation
    pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)
```

---

## 🗄️ Database Schema

### Recommended Database Schema

#### SQL (PostgreSQL)

```sql
CREATE TABLE vehicle_events (
    id SERIAL PRIMARY KEY,
    pi_id VARCHAR(50) NOT NULL,
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    timestamp TIMESTAMPTZ NOT NULL,
    confidence DECIMAL(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    snapshot_url TEXT,
    fallback_available BOOLEAN DEFAULT FALSE,
    gate_location VARCHAR(100) NOT NULL,
    bbox_x INT,
    bbox_y INT,
    bbox_width INT,
    bbox_height INT,
    frame_width INT,
    frame_height INT,
    track_id INT,
    received_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_pi_id (pi_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_direction (direction),
    INDEX idx_gate_location (gate_location)
);
```

#### NoSQL (MongoDB)

```javascript
{
  _id: ObjectId,
  piId: String,
  eventId: String,  // unique index
  eventType: String,
  direction: String,  // "IN" or "OUT"
  timestamp: Date,
  confidence: Number,
  snapshotUrl: String,
  fallbackAvailable: Boolean,
  gateLocation: String,
  bbox: {
    x: Number,
    y: Number,
    width: Number,
    height: Number
  },
  frameWidth: Number,
  frameHeight: Number,
  trackId: Number,
  receivedAt: Date
}

// Indexes
db.vehicle_events.createIndex({ eventId: 1 }, { unique: true });
db.vehicle_events.createIndex({ piId: 1, timestamp: -1 });
db.vehicle_events.createIndex({ direction: 1 });
db.vehicle_events.createIndex({ gateLocation: 1, timestamp: -1 });
```

---

## 📊 Analytics Queries

### Count vehicles by direction (last 24 hours)

**PostgreSQL:**
```sql
SELECT
    gate_location,
    direction,
    COUNT(*) as count
FROM vehicle_events
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY gate_location, direction
ORDER BY gate_location, direction;
```

**MongoDB:**
```javascript
db.vehicle_events.aggregate([
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: { gateLocation: "$gateLocation", direction: "$direction" },
      count: { $sum: 1 }
    }
  },
  { $sort: { "_id.gateLocation": 1, "_id.direction": 1 } }
]);
```

### Average confidence by gate

**PostgreSQL:**
```sql
SELECT
    gate_location,
    AVG(confidence) as avg_confidence,
    COUNT(*) as total_events
FROM vehicle_events
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY gate_location;
```

---

## 🔍 Testing

### Using curl

```bash
curl -X POST http://localhost:3000/vehicle-events \
  -H "Content-Type: application/json" \
  -d '{
    "piId": "test-pi",
    "eventType": "vehicle_detected",
    "eventId": "test_evt_123",
    "direction": "IN",
    "timestamp": 1699876543210,
    "confidence": 0.95,
    "snapshotUrl": "https://s3.amazonaws.com/test.jpg",
    "fallbackAvailable": false,
    "gateLocation": "entrance-1",
    "metadata": {
      "bbox": {"x": 100, "y": 100, "width": 200, "height": 150},
      "frameWidth": 1920,
      "frameHeight": 1080,
      "trackId": 123
    }
  }'
```

### Expected Response

```json
{
  "success": true,
  "message": "Event received",
  "eventId": "test_evt_123",
  "stored": true
}
```

---

## 📈 Monitoring

### Metrics to Track

- **Events per minute** - Traffic volume
- **IN vs OUT ratio** - Parking occupancy trend
- **Average confidence** - Detection quality
- **Failed S3 uploads** - Infrastructure health
- **Response latency** - API performance

### Example Monitoring Query

```sql
-- Events per hour (last 24 hours)
SELECT
    DATE_TRUNC('hour', timestamp) as hour,
    COUNT(*) as events,
    AVG(confidence) as avg_confidence,
    SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END) as entries,
    SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END) as exits
FROM vehicle_events
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## 🔐 Security Considerations

### Authentication (Optional)

Add API key authentication:

```javascript
app.post('/vehicle-events', authenticateApiKey, async (req, res) => {
  // ...
});

function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || !validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
      error: 'INVALID_API_KEY'
    });
  }

  next();
}
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    success: false,
    message: 'Too many requests',
    error: 'RATE_LIMIT_EXCEEDED'
  }
});

app.use('/vehicle-events', limiter);
```

---

**Version:** 3.0.0
**Last Updated:** 2024-11-15
