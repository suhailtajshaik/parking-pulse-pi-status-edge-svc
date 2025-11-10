# 🔄 Central Server Migration Guide
## From gRPC to HTTP Implementation

This document describes the changes required in the **central server** to receive data from the updated Raspberry Pi edge devices, which now use HTTP instead of gRPC.

---

## 📋 **Overview of Changes**

### What Changed in the Edge Service (Raspberry Pi)

| Aspect | Before (gRPC) | After (HTTP) |
|--------|---------------|--------------|
| **Protocol** | gRPC over HTTP/2 | HTTP/HTTPS (REST-like) |
| **Port** | Custom (e.g., 50051) | Standard HTTP (e.g., 3000) |
| **Data Format** | Protocol Buffers | JSON |
| **Content Type** | `application/grpc` | `application/json` |
| **Method** | gRPC `ReportStatus` | HTTP `POST /pi-status` |
| **Dependencies** | @grpc/grpc-js, proto files | Zero (built-in Node.js modules) |

### Why the Change?

- **Simplicity**: HTTP/JSON is simpler to debug and test (curl, Postman)
- **Zero Dependencies**: No gRPC libraries needed
- **Universal Support**: Better firewall/proxy compatibility
- **Easier Development**: No proto file compilation required
- **Smaller Footprint**: Reduced memory usage on Raspberry Pi

---

## 🎯 **Required Central Server Changes**

### 1. Remove gRPC Server Implementation

**Before (gRPC):**
```javascript
// Old gRPC server implementation
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('parking.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const parkingProto = grpc.loadPackageDefinition(packageDefinition).parking;

const server = new grpc.Server();

server.addService(parkingProto.ParkingService.service, {
  ReportStatus: (call, callback) => {
    const data = call.request;
    // Process data...
    callback(null, { success: true, message: 'Status received' });
  }
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC Server running on port 50051');
  server.start();
});
```

### 2. Add HTTP Server Implementation

**After (HTTP):**
```javascript
// New HTTP server implementation
const http = require('http');

const server = http.createServer((req, res) => {
  // CORS headers (if needed for web dashboard)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle POST /pi-status endpoint
  if (req.method === 'POST' && req.url === '/pi-status') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // Validate required fields
        if (!data.piId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Missing piId' }));
          return;
        }

        // Process the data (store in database, check alerts, etc.)
        processDeviceStatus(data);

        // Send success response
        const response = {
          success: true,
          message: 'Status received',
          alerts: checkAlerts(data) // Optional: return any alerts
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));

      } catch (error) {
        console.error('Error processing request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Internal server error' }));
      }
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Request error' }));
    });

  } else if (req.method === 'HEAD' && req.url === '/') {
    // Health check endpoint (used by Pi devices on startup)
    res.writeHead(200);
    res.end();

  } else {
    // Handle unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Not found' }));
  }
});

server.listen(3000, '0.0.0.0', () => {
  console.log('HTTP Server running on port 3000');
});

// Helper function to process device status
function processDeviceStatus(data) {
  console.log(`📊 Received status from ${data.piId}:`);
  console.log(`   Temperature: ${data.temperatureC}°C (${data.temperatureF}°F)`);
  console.log(`   Camera: ${data.cameraOk ? 'OK' : 'Failed'}`);
  console.log(`   Uptime: ${data.uptime}s`);
  console.log(`   Timestamp: ${new Date(data.timestamp).toISOString()}`);

  // Store in database, send to message queue, etc.
  // Your existing business logic here
}

// Helper function to check for alerts
function checkAlerts(data) {
  const alerts = [];

  // High temperature alert
  if (data.temperatureC > 70) {
    alerts.push({
      message: `High temperature detected: ${data.temperatureC}°C`,
      severity: 'warning'
    });
  }

  // Critical temperature alert
  if (data.temperatureC > 80) {
    alerts.push({
      message: `CRITICAL temperature: ${data.temperatureC}°C - throttling may occur`,
      severity: 'critical'
    });
  }

  // Camera failure alert
  if (!data.cameraOk) {
    alerts.push({
      message: 'Camera is not responding',
      severity: 'warning'
    });
  }

  return alerts;
}
```

### 3. Express.js Implementation (Alternative)

If you're using Express.js, the implementation is simpler:

```javascript
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// CORS (if needed)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check endpoint
app.head('/', (req, res) => {
  res.sendStatus(200);
});

// Main endpoint to receive device status
app.post('/pi-status', (req, res) => {
  const data = req.body;

  // Validate required fields
  if (!data.piId) {
    return res.status(400).json({
      success: false,
      message: 'Missing piId'
    });
  }

  try {
    // Process the data
    processDeviceStatus(data);

    // Check for alerts
    const alerts = checkAlerts(data);

    // Send response
    res.json({
      success: true,
      message: 'Status received',
      alerts: alerts.length > 0 ? alerts : undefined
    });

  } catch (error) {
    console.error('Error processing device status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

function processDeviceStatus(data) {
  console.log(`📊 Received status from ${data.piId}:`);
  console.log(`   Temperature: ${data.temperatureC}°C (${data.temperatureF}°F)`);
  console.log(`   Camera: ${data.cameraOk ? 'OK' : 'Failed'}`);
  console.log(`   Uptime: ${data.uptime}s`);

  // Your database/storage logic here
  // Example:
  // await DeviceStatus.create({
  //   piId: data.piId,
  //   temperatureC: data.temperatureC,
  //   temperatureF: data.temperatureF,
  //   cameraOk: data.cameraOk,
  //   systemOnline: data.systemOnline,
  //   uptime: data.uptime,
  //   timestamp: new Date(data.timestamp)
  // });
}

function checkAlerts(data) {
  const alerts = [];

  if (data.temperatureC > 70) {
    alerts.push({
      message: `High temperature: ${data.temperatureC}°C`,
      severity: 'warning'
    });
  }

  if (!data.cameraOk) {
    alerts.push({
      message: 'Camera failure detected',
      severity: 'warning'
    });
  }

  return alerts;
}
```

---

## 📡 **Request/Response Specification**

### HTTP Request from Raspberry Pi

**Method:** `POST`
**Endpoint:** `/pi-status`
**Content-Type:** `application/json`
**Frequency:** Every 10 seconds (configurable)

**Request Body:**
```json
{
  "piId": "blue-gate-pi",
  "temperatureC": 45.2,
  "temperatureF": 113.36,
  "cameraOk": true,
  "systemOnline": true,
  "uptime": 86400,
  "timestamp": 1699876543210
}
```

### Field Descriptions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `piId` | string | Unique identifier for the Pi device | `"blue-gate-pi"` |
| `temperatureC` | number | CPU temperature in Celsius | `45.2` |
| `temperatureF` | number | CPU temperature in Fahrenheit | `113.36` |
| `cameraOk` | boolean | Camera status (true = working, false = failed) | `true` |
| `systemOnline` | boolean | System online status (always true when sending) | `true` |
| `uptime` | number | Service uptime in seconds | `86400` |
| `timestamp` | number | Unix timestamp in milliseconds | `1699876543210` |

### HTTP Response to Raspberry Pi

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Status received",
  "alerts": [
    {
      "message": "High temperature detected: 72.5°C",
      "severity": "warning"
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Missing piId"
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "success": false,
  "message": "Internal server error"
}
```

### Response Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | Yes | Indicates if request was processed successfully |
| `message` | string | Yes | Human-readable message |
| `alerts` | array | No | Optional array of alert objects to display on Pi |

**Alert Object:**
| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Alert message to display |
| `severity` | string | Alert level: "info", "warning", "critical" |

---

## 🔄 **Migration Checklist**

### Step 1: Update Dependencies
```bash
# Remove gRPC dependencies
npm uninstall @grpc/grpc-js @grpc/proto-loader

# If using Express (optional but recommended)
npm install express
```

### Step 2: Update Server Code
- [ ] Remove gRPC server initialization
- [ ] Remove proto file loading
- [ ] Add HTTP server (native or Express)
- [ ] Add `/pi-status` POST endpoint
- [ ] Add health check endpoint (HEAD `/`)
- [ ] Update data processing logic for JSON format

### Step 3: Update Data Processing
- [ ] Update database schema if needed (add temperatureF field)
- [ ] Update alert logic to use new field names
- [ ] Update dashboard queries to use new data structure
- [ ] Add timestamp handling (was not in original gRPC)

### Step 4: Update Configuration
- [ ] Change port from 50051 → 3000 (or your preferred HTTP port)
- [ ] Update firewall rules for HTTP port
- [ ] Update nginx/reverse proxy configuration (if applicable)
- [ ] Update environment variables

### Step 5: Update Monitoring & Logging
- [ ] Update monitoring to check HTTP endpoint instead of gRPC
- [ ] Update log parsing for HTTP format
- [ ] Update metrics collection

### Step 6: Testing
- [ ] Test with curl: `curl -X POST http://localhost:3000/pi-status -H "Content-Type: application/json" -d '{"piId":"test","temperatureC":45.2,"temperatureF":113.36,"cameraOk":true,"systemOnline":true,"uptime":100,"timestamp":1699876543210}'`
- [ ] Test health check: `curl -I http://localhost:3000/`
- [ ] Verify database writes
- [ ] Verify alert triggers
- [ ] Test with actual Pi device

---

## 📊 **Data Mapping (gRPC vs HTTP)**

### Before (gRPC Protocol Buffer)
```protobuf
message DeviceStatus {
  string pi_id = 1;
  double temperature = 2;  // Only Celsius
  bool camera_ok = 3;
  bool system_online = 4;
  int64 uptime = 5;
  // No timestamp field
}
```

### After (HTTP JSON)
```json
{
  "piId": "string",
  "temperatureC": "number",    // NEW: Explicit Celsius
  "temperatureF": "number",    // NEW: Added Fahrenheit
  "cameraOk": "boolean",
  "systemOnline": "boolean",
  "uptime": "number",
  "timestamp": "number"        // NEW: Unix timestamp in ms
}
```

### Key Differences

| Aspect | gRPC | HTTP/JSON |
|--------|------|-----------|
| Temperature | Single value (Celsius) | Both Celsius and Fahrenheit |
| Timestamp | Not included | Unix timestamp in milliseconds |
| Field names | snake_case (pi_id) | camelCase (piId) |
| Data type | Protocol Buffer types | JSON types |

---

## 🔧 **Database Schema Updates**

If you're storing this data, update your database schema:

### SQL Example
```sql
-- Add new column for Fahrenheit temperature
ALTER TABLE device_status
ADD COLUMN temperature_f DECIMAL(5,2);

-- Add timestamp column (if not already present)
ALTER TABLE device_status
ADD COLUMN device_timestamp BIGINT;

-- Rename temperature to temperature_c for clarity
ALTER TABLE device_status
RENAME COLUMN temperature TO temperature_c;

-- Update existing data (if needed)
UPDATE device_status
SET temperature_f = (temperature_c * 9/5) + 32
WHERE temperature_f IS NULL;
```

### MongoDB Example
```javascript
// No schema changes needed for MongoDB
// Just update your application code to handle new fields

// Example document structure
{
  piId: "blue-gate-pi",
  temperatureC: 45.2,
  temperatureF: 113.36,  // New field
  cameraOk: true,
  systemOnline: true,
  uptime: 86400,
  timestamp: 1699876543210,  // New field
  receivedAt: ISODate("2023-11-13T12:34:56.789Z")
}
```

---

## 🧪 **Testing the New Endpoint**

### Using curl
```bash
# Test POST request
curl -X POST http://localhost:3000/pi-status \
  -H "Content-Type: application/json" \
  -d '{
    "piId": "test-pi",
    "temperatureC": 45.2,
    "temperatureF": 113.36,
    "cameraOk": true,
    "systemOnline": true,
    "uptime": 86400,
    "timestamp": 1699876543210
  }'

# Expected response:
# {"success":true,"message":"Status received"}

# Test health check
curl -I http://localhost:3000/

# Expected response:
# HTTP/1.1 200 OK
```

### Using Postman
1. Create new POST request to `http://your-server:3000/pi-status`
2. Set Headers: `Content-Type: application/json`
3. Set Body (raw JSON):
```json
{
  "piId": "test-pi",
  "temperatureC": 45.2,
  "temperatureF": 113.36,
  "cameraOk": true,
  "systemOnline": true,
  "uptime": 86400,
  "timestamp": 1699876543210
}
```
4. Send request and verify 200 OK response

### Using JavaScript (Node.js)
```javascript
const http = require('http');

const data = JSON.stringify({
  piId: 'test-pi',
  temperatureC: 45.2,
  temperatureF: 113.36,
  cameraOk: true,
  systemOnline: true,
  uptime: 86400,
  timestamp: Date.now()
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/pi-status',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);

  res.on('data', (chunk) => {
    console.log(`Response: ${chunk}`);
  });
});

req.on('error', (error) => {
  console.error(`Error: ${error.message}`);
});

req.write(data);
req.end();
```

---

## 🚀 **Deployment Steps**

### Step 1: Prepare Central Server
```bash
# 1. Backup current gRPC implementation
cp server.js server.js.grpc.backup

# 2. Update server code with HTTP implementation
# (Use one of the examples above)

# 3. Update port configuration
# Old: PORT=50051
# New: PORT=3000
```

### Step 2: Deploy New Server Version
```bash
# 1. Stop old gRPC server
pm2 stop parking-pulse-server  # or your process manager

# 2. Update firewall (if needed)
sudo ufw allow 3000/tcp
sudo ufw delete allow 50051/tcp  # Remove old port

# 3. Start new HTTP server
pm2 start server.js --name parking-pulse-server

# 4. Verify server is running
curl -I http://localhost:3000/
```

### Step 3: Update Raspberry Pi Devices
The Pi devices have already been updated with the new HTTP implementation. If you need to deploy to multiple devices:

```bash
# On each Raspberry Pi
cd parking-pulse-pi-status-edge-svc
git pull origin development

# Update SERVER_URL in deploy scripts
# From: SERVER_URL="192.168.1.112:50051"
# To:   SERVER_URL="http://192.168.1.112:3000"

# Redeploy
./deploy.sh <pi-id> http://192.168.1.112:3000
```

### Step 4: Monitor Migration
```bash
# Watch server logs
pm2 logs parking-pulse-server

# Watch Pi logs
sudo journalctl -u parking-pulse -f

# Verify data is being received
# Check your database or logs for incoming data every 10s
```

---

## 🔍 **Troubleshooting**

### Issue: Pi devices can't connect to server

**Check:**
```bash
# On central server
netstat -tlnp | grep 3000
# Should show server listening on port 3000

# From Pi device
curl -I http://192.168.1.112:3000/
# Should return 200 OK

# Test POST
curl -X POST http://192.168.1.112:3000/pi-status \
  -H "Content-Type: application/json" \
  -d '{"piId":"test","temperatureC":45,"temperatureF":113,"cameraOk":true,"systemOnline":true,"uptime":100,"timestamp":1699876543210}'
```

### Issue: CORS errors (if using web dashboard)

**Solution:** Add CORS headers to server response:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

### Issue: Data not saving to database

**Check:**
- Verify field names match your database schema (camelCase vs snake_case)
- Check for new fields: `temperatureF`, `timestamp`
- Verify data types (temperature is now a float, timestamp is a large integer)

---

## 📚 **Additional Resources**

### Example Full Server Implementation
See the `examples/` directory in this repository for:
- `central-server-http.js` - Standalone HTTP server
- `central-server-express.js` - Express.js implementation
- `central-server-fastify.js` - Fastify implementation (high performance)

### Performance Comparison

| Metric | gRPC | HTTP/JSON |
|--------|------|-----------|
| Message Size | ~50 bytes | ~200 bytes |
| Latency | 10-20ms | 15-25ms |
| CPU Usage | Low | Very Low |
| Memory Usage | 50-80MB | 20-40MB |
| Debugging | Complex | Easy (curl, browser) |

For our use case (3 fields every 10s), HTTP/JSON is perfectly adequate and much simpler.

---

## ✅ **Summary**

**Before (gRPC):**
- Complex setup with proto files
- Port 50051
- Protocol Buffers
- gRPC dependencies
- Single temperature value (Celsius)
- No timestamp

**After (HTTP):**
- Simple JSON over HTTP
- Port 3000 (configurable)
- Standard REST-like API
- Zero dependencies (or just Express)
- Dual temperature (Celsius + Fahrenheit)
- Timestamp included
- Easy to test and debug

**Benefits:**
✅ Simpler implementation
✅ Easier debugging
✅ Better firewall compatibility
✅ Smaller footprint
✅ More data (temperature F + timestamp)
✅ Universal tooling support

---

**Questions?** Check the main [README.md](README.md) for edge service documentation or create an issue in the repository.
