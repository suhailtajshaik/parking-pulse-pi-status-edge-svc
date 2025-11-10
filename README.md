# 🚗 Parking Pulse Edge Service (Raspberry Pi)

A lightweight HTTP-based monitoring service for Raspberry Pi devices that reports system health metrics to a central server.

## 📊 **System Overview**

```
┌─────────────────┐    HTTP POST       ┌─────────────────┐
│   Raspberry Pi  │ ──────────────────► │  Central Server │
│                 │   (Port 3000)      │                 │
│  • Temperature  │    Every 10s       │  • Data Storage │
│  • Camera       │    JSON Payload    │  • Alerts       │
│  • System Status│                    │  • Dashboard    │
└─────────────────┘                    └─────────────────┘
```

## 🚀 **Quick Start**

### 1. Install Dependencies
```bash
cd parking-pulse-pi-status-edge-svc
npm install  # No external dependencies, but updates package-lock.json
```

**Note:** This service uses only Node.js built-in modules (`http`, `https`, `child_process`), so no external dependencies are required!

### 2. Run the Service

#### Development Mode (Manual Testing)
```bash
# Basic run with default settings
PI_ID=blue-gate-pi SERVER_URL=http://192.168.1.112:3000 node pi-monitor.js

# Run with custom settings
PI_ID=pink-gate-pi SERVER_URL=http://192.168.1.112:3000 INTERVAL=30000 node pi-monitor.js

# Run with HTTPS
PI_ID=blue-gate-pi SERVER_URL=https://myserver.com:3000 node pi-monitor.js

# Run in background for testing
PI_ID=blue-gate-pi SERVER_URL=http://192.168.1.112:3000 node pi-monitor.js &

# Stop background process
# Find process: ps aux | grep pi-monitor
# Kill process: kill <PID>
# Or: pkill -f pi-monitor
```

#### Production Mode (System Service)
```bash
# Deploy Blue Gate Pi
./deploy.sh blue-gate-pi http://192.168.1.112:3000

# Deploy Pink Gate Pi
./deploy.sh pink-gate-pi http://192.168.1.112:3000

# Or use device-specific scripts
./deploy-blue-gate.sh
./deploy-pink-gate.sh

# The deployment script will:
# - Create systemd service
# - Enable auto-start on boot
# - Start the service immediately
```

### 3. Start/Stop Service (Production)

#### Start Service
```bash
# Start the service
sudo systemctl start parking-pulse

# Enable auto-start on boot
sudo systemctl enable parking-pulse

# Check if running
sudo systemctl status parking-pulse
```

#### Stop Service
```bash
# Stop the service
sudo systemctl stop parking-pulse

# Disable auto-start on boot
sudo systemctl disable parking-pulse

# Restart service
sudo systemctl restart parking-pulse
```

### 4. Verify Operation
```bash
# Check service status
sudo systemctl status parking-pulse

# View live logs (you should see startup health check)
sudo journalctl -u parking-pulse -f

# Expected startup logs:
# ═══════════════════════════════════════════════════════════
#   Parking Pulse Edge Service - Starting...
# ═══════════════════════════════════════════════════════════
#
# 🔍 Checking server health: http://192.168.1.112:3000
# ✅ Server is reachable (attempt 1/3)
#
# 🚀 Starting blue-gate-pi monitor
#    Reporting to: http://192.168.1.112:3000/pi-status
#    Interval: 10000ms (10s)
#    Timeout: 5000ms

# Test connection manually
curl -X POST http://192.168.1.112:3000/pi-status \
  -H "Content-Type: application/json" \
  -d '{"piId":"test","temperature":45,"cameraOk":true}'
```

## 🔧 **Configuration**

### Environment Variables
```bash
# Required
PI_ID=blue-gate-pi                      # Unique Pi identifier
SERVER_URL=http://192.168.1.112:3000    # Central server HTTP endpoint

# Optional
INTERVAL=10000                          # Reporting interval (ms, default: 10000)
HTTP_TIMEOUT=5000                       # HTTP request timeout (ms, default: 5000)
HEALTH_CHECK_RETRIES=3                  # Server health check retries (default: 3)
HEALTH_CHECK_DELAY=2000                 # Delay between health check retries (ms, default: 2000)
NODE_ENV=production                     # Environment mode
```

### Supported Pi IDs
- `blue-gate-pi` - Blue gate entrance monitoring
- `pink-gate-pi` - Pink gate entrance monitoring
- `test-pi` - Testing and development

## 📡 **Service Commands**

### Development & Testing
```bash
# Run with debug output and shorter interval
PI_ID=blue-gate-pi SERVER_URL=http://localhost:3000 INTERVAL=10000 node pi-monitor.js

# Test different configurations
PI_ID=test-pi SERVER_URL=http://192.168.1.112:3000 node pi-monitor.js

# Test with HTTPS
PI_ID=test-pi SERVER_URL=https://myserver.com:3000 node pi-monitor.js

# Run multiple instances (testing)
PI_ID=blue-gate-pi SERVER_URL=http://localhost:3000 node pi-monitor.js &
PI_ID=pink-gate-pi SERVER_URL=http://localhost:3000 node pi-monitor.js &
```

### Production Service Management

#### Service Control
```bash
# Start service
sudo systemctl start parking-pulse

# Stop service
sudo systemctl stop parking-pulse

# Restart service
sudo systemctl restart parking-pulse

# Check service status
sudo systemctl status parking-pulse
```

#### Auto-Start Configuration
```bash
# Enable auto-start on boot
sudo systemctl enable parking-pulse

# Disable auto-start on boot
sudo systemctl disable parking-pulse

# Check if enabled
sudo systemctl is-enabled parking-pulse
```

#### View Logs
```bash
# View live logs (real-time)
sudo journalctl -u parking-pulse -f

# View recent logs
sudo journalctl -u parking-pulse --since "1 hour ago"
sudo journalctl -u parking-pulse --since "today"

# View last 50 log entries
sudo journalctl -u parking-pulse -n 50
```

### Deployment Commands
```bash
# Initial deployment
./deploy.sh blue-gate-pi http://192.168.1.112:3000

# Update deployment (after code changes)
git pull
sudo systemctl restart parking-pulse

# Redeploy with new configuration
./deploy.sh blue-gate-pi http://192.168.1.100:3000  # New server IP
```

## 🔍 **Monitoring & Troubleshooting**

### Check System Health
```bash
# Verify Pi hardware
vcgencmd measure_temp          # Check temperature sensor
vcgencmd get_camera           # Check camera detection
rpicam-still -o test.jpg      # Test camera capture

# Check network connectivity
ping 192.168.1.112            # Ping central server
curl -I http://192.168.1.112:3000/pi-status  # Test HTTP endpoint

# Test sending data manually
curl -X POST http://192.168.1.112:3000/pi-status \
  -H "Content-Type: application/json" \
  -d '{"piId":"test","temperatureC":45.2,"temperatureF":113.36,"cameraOk":true,"systemOnline":true,"uptime":100,"timestamp":1699876543210}'
```

### Common Issues & Solutions

#### 1. **HTTP Connection Failed**
```bash
# Check server accessibility
ping 192.168.1.112
curl -I http://192.168.1.112:3000/pi-status

# Verify server URL format
SERVER_URL=http://192.168.1.112:3000     # Correct
SERVER_URL=https://192.168.1.112:3000    # Correct (for HTTPS)
SERVER_URL=192.168.1.112:3000            # Wrong (missing protocol)

# Check firewall rules
sudo ufw status                          # Check if firewall is blocking
```

#### 2. **Temperature Sensor Not Available**
```bash
# On non-Pi systems (development)
# Service will show: "⚠️ Temperature sensor not available (non-Pi system)"
# This is normal and uses mock data

# On Pi systems
sudo raspi-config  # Enable hardware interfaces
```

#### 3. **Camera Issues**
```bash
# Enable camera
sudo raspi-config  # Interface Options > Camera > Enable

# Test camera
vcgencmd get_camera
rpicam-still -o test.jpg

# Check camera cable connection
```

#### 4. **Service Won't Start**
```bash
# Check service logs
sudo journalctl -u parking-pulse -n 50

# Verify file permissions
ls -la /home/pi/parking-pulse/
chmod +x /home/pi/parking-pulse/pi-monitor.js

# Check Node.js installation
node --version
npm --version
```

#### 5. **Server Health Check Failing**
```bash
# The service performs a health check on startup
# If server is unreachable, you'll see:
# ⚠️  Server unreachable (attempt 1/3), retrying in 2000ms...
# ⚠️  WARNING: Server is unreachable after 3 attempts

# This is OK - the service will still start and retry every 10s

# To customize health check behavior:
HEALTH_CHECK_RETRIES=5 HEALTH_CHECK_DELAY=3000 node pi-monitor.js

# To skip health check (not recommended):
HEALTH_CHECK_RETRIES=0 node pi-monitor.js

# Verify server is actually running:
curl -I http://192.168.1.112:3000/pi-status
```

## 📊 **Data Format**

The service sends the following JSON data via HTTP POST to `/pi-status`:

```javascript
{
  piId: "blue-gate-pi",        // Unique Pi identifier
  temperatureC: 45.2,          // CPU temperature in Celsius
  temperatureF: 113.36,        // CPU temperature in Fahrenheit
  cameraOk: true,              // Camera status (true/false)
  systemOnline: true,          // System online status (always true when sending)
  uptime: 86400,               // Seconds since service start
  timestamp: 1699876543210     // Unix timestamp (milliseconds)
}
```

**Server Response Format:**
```javascript
{
  success: true,
  message: "Status received",
  alerts: [                   // Optional array of alerts
    {
      message: "High temperature detected",
      severity: "warning"
    }
  ]
}
```

## 🎯 **Features**

### ✅ **Hardware Monitoring**
- **CPU Temperature**: Real-time temperature via `vcgencmd` (reported in both Celsius and Fahrenheit)
- **Camera Status**: Detection and functionality testing
- **System Status**: Online/offline tracking
- **System Uptime**: Service runtime tracking
- **Timestamp**: Unix timestamp with each report for accurate time tracking
- **Mock Data**: Works on non-Pi systems for development

### ✅ **Communication**
- **HTTP/HTTPS Protocol**: Simple, universal JSON-based communication
- **Zero Dependencies**: Uses only Node.js built-in modules
- **Server Health Check**: Verifies server connectivity before starting (with retry logic)
- **Timeout Handling**: Configurable HTTP request timeouts
- **Error Handling**: Continues operation despite connection failures
- **Configurable Intervals**: Adjustable reporting frequency (default: 10s)
- **Alert Support**: Receives and displays server alerts
- **Dual Temperature Format**: Sends both Celsius and Fahrenheit for international compatibility
- **Resilient Design**: Starts even if server is unreachable (will retry on interval)

### ✅ **Deployment**
- **Systemd Integration**: Auto-start on boot
- **Service Management**: Standard Linux service controls
- **Easy Configuration**: Environment-based setup
- **Production Ready**: Comprehensive logging and error handling
- **No Build Step**: Direct Node.js execution

## 🔧 **File Structure**

```
parking-pulse-pi-status-edge-svc/
├── pi-monitor.js           # Main monitoring service (~185 lines)
├── config.js              # Configuration module (91 lines)
├── deploy.sh              # Generic deployment script
├── deploy-blue-gate.sh    # Blue gate deployment script
├── deploy-pink-gate.sh    # Pink gate deployment script
├── package.json           # Package metadata (no external dependencies!)
└── README.md             # This file
```

**Total Code**: ~275 lines of production-ready code with zero external dependencies!

## 🚨 **Alert Triggers**

The service will trigger alerts on the central server for:
- **High Temperature**: > 70°C (configurable)
- **Camera Failure**: Camera disconnected or non-functional
- **Offline Status**: No reports for > 2 minutes

## 🎛️ **Advanced Configuration**

### Custom Deployment Script
```bash
#!/bin/bash
# Custom deployment for specific Pi

PI_ID="custom-pi"
SERVER_URL="http://192.168.1.200:3000"
INTERVAL="60000"  # 1 minute
HTTP_TIMEOUT="10000"  # 10 seconds

export PI_ID SERVER_URL INTERVAL HTTP_TIMEOUT
./deploy.sh $PI_ID $SERVER_URL
```

### Development Mode
```bash
# Run with mock hardware (non-Pi systems)
PI_ID=dev-pi SERVER_URL=http://localhost:3000 node pi-monitor.js

# Run with custom timeout
PI_ID=test-pi SERVER_URL=http://localhost:3000 HTTP_TIMEOUT=10000 node pi-monitor.js

# Run with high-frequency reporting for testing
PI_ID=test-pi SERVER_URL=http://localhost:3000 INTERVAL=5000 node pi-monitor.js
```

## 📈 **Performance**

- **CPU Usage**: < 1% during normal operation
- **Memory Usage**: ~10-15MB (reduced from gRPC version!)
- **Network Usage**: ~200-300 bytes per report (JSON, every 10s)
- **Disk I/O**: Minimal (only for camera tests)
- **Startup Time**: Instant (no dependency loading)
- **Reporting Frequency**: Every 10 seconds (configurable via INTERVAL env var)

## 🔒 **Security**

- **No Root Required**: Runs as regular user (pi)
- **Local Hardware Only**: Only accesses local sensors
- **HTTPS Support**: Use HTTPS URLs for encrypted communication
- **Network Communication**: Standard HTTP/HTTPS over TCP
- **No Data Storage**: Stateless operation
- **Timeout Protection**: Configurable HTTP timeouts prevent hanging
- **Error Isolation**: Continues operation despite connection failures

## 🎯 **Next Steps**

1. **Deploy to Production**: Use deployment script on actual Pi devices
2. **Monitor Dashboard**: Check central server dashboard for data
3. **Customize Alerts**: Adjust temperature thresholds as needed
4. **Scale Up**: Add more Pi devices with unique IDs

---

**Status**: ✅ **Production Ready**
**Version**: 2.2.0 (HTTP Implementation with Dual Temperature Format & Server Health Check)
**Protocol**: HTTP/HTTPS (simple JSON communication)
**Dependencies**: Zero external dependencies
**Deployment**: Systemd service with auto-restart
**Monitoring**: Real-time hardware status reporting every 10 seconds
**Reliability**: Server health check on startup with automatic retry logic