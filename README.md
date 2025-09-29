# 🚗 Parking Pulse Edge Service (Raspberry Pi)

A lightweight gRPC-based monitoring service for Raspberry Pi devices that reports system health metrics to a central server.

## 📊 **System Overview**

```
┌─────────────────┐    gRPC (50051)    ┌─────────────────┐
│   Raspberry Pi  │ ──────────────────► │  Central Server │
│                 │                    │                 │
│  • Temperature  │    Every 30s       │  • Data Storage │
│  • Camera       │                    │  • Alerts       │
│  • Uptime       │                    │  • Dashboard    │
└─────────────────┘                    └─────────────────┘
```

## 🚀 **Quick Start**

### 1. Install Dependencies
```bash
cd parking-pulse-pi-status-edge-svc
npm install
```

### 2. Run the Service

#### Development Mode (Manual Testing)
```bash
# Basic run with default settings
PI_ID=blue-gate-pi SERVER_URL=192.168.1.112:50051 node pi-monitor.js

# Run with custom settings
PI_ID=pink-gate-pi SERVER_URL=192.168.1.112:50051 INTERVAL=30000 node pi-monitor.js

# Run in background for testing
PI_ID=blue-gate-pi SERVER_URL=192.168.1.112:50051 node pi-monitor.js &

# Stop background process
# Find process: ps aux | grep pi-monitor
# Kill process: kill <PID>
# Or: pkill -f pi-monitor
```

#### Production Mode (System Service)
```bash
# Deploy Blue Gate Pi
./deploy.sh blue-gate-pi 192.168.1.112:50051

# Deploy Pink Gate Pi
./deploy.sh pink-gate-pi 192.168.1.112:50051

# The deployment script will:
# - Install dependencies
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

# View live logs
sudo journalctl -u parking-pulse -f

# Test connection manually
curl -X POST http://192.168.1.112:3000/pi-status \
  -H "Content-Type: application/json" \
  -d '{"piId":"test","temperature":45,"cameraOk":true}'
```

## 🔧 **Configuration**

### Environment Variables
```bash
# Required
PI_ID=blue-gate-pi              # Unique Pi identifier
SERVER_URL=192.168.1.112:50051  # Central server gRPC endpoint

# Optional
INTERVAL=30000                  # Reporting interval (ms)
NODE_ENV=production            # Environment mode
```

### Supported Pi IDs
- `blue-gate-pi` - Blue gate entrance monitoring
- `pink-gate-pi` - Pink gate entrance monitoring
- `test-pi` - Testing and development

## 📡 **Service Commands**

### Development & Testing
```bash
# Run with debug output
PI_ID=blue-gate-pi SERVER_URL=localhost:50051 INTERVAL=10000 node pi-monitor.js

# Test different configurations
PI_ID=test-pi SERVER_URL=192.168.1.112:50051 node pi-monitor.js

# Run multiple instances (testing)
PI_ID=blue-gate-pi SERVER_URL=localhost:50051 node pi-monitor.js &
PI_ID=pink-gate-pi SERVER_URL=localhost:50051 node pi-monitor.js &
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
./deploy.sh blue-gate-pi 192.168.1.112:50051

# Update deployment (after code changes)
git pull
npm install
sudo systemctl restart parking-pulse

# Redeploy with new configuration
./deploy.sh blue-gate-pi 192.168.1.100:50051  # New server IP
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
telnet 192.168.1.112 50051    # Test gRPC port
```

### Common Issues & Solutions

#### 1. **gRPC Connection Failed**
```bash
# Check server accessibility
ping 192.168.1.112
telnet 192.168.1.112 50051

# Verify server URL format
SERVER_URL=192.168.1.112:50051  # Correct
SERVER_URL=http://192.168.1.112:50051  # Wrong (no http://)
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

## 📊 **Data Format**

The service sends the following data via gRPC:

```javascript
{
  piId: "blue-gate-pi",
  temperature: 45.2,        // Celsius
  cameraOk: true,          // Camera functional
  uptime: 86400            // Seconds since service start
}
```

## 🎯 **Features**

### ✅ **Hardware Monitoring**
- **CPU Temperature**: Real-time temperature via `vcgencmd`
- **Camera Status**: Detection and functionality testing
- **System Uptime**: Service runtime tracking
- **Mock Data**: Works on non-Pi systems for development

### ✅ **Communication**
- **gRPC Protocol**: Efficient binary communication
- **Auto-retry**: Handles connection failures gracefully
- **Configurable Intervals**: Adjustable reporting frequency
- **Error Handling**: Continues operation despite hardware failures

### ✅ **Deployment**
- **Systemd Integration**: Auto-start on boot
- **Service Management**: Standard Linux service controls
- **Easy Configuration**: Environment-based setup
- **Production Ready**: Logging and error handling

## 🔧 **File Structure**

```
parking-pulse-pi-status-edge-svc/
├── pi-monitor.js           # Main service (80 lines)
├── proto/parking.proto     # gRPC definitions (50 lines)
├── deploy.sh              # Deployment script (45 lines)
├── package.json           # Dependencies (15 lines)
└── README.md             # This file
```

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
SERVER_URL="192.168.1.200:50051"
INTERVAL="60000"  # 1 minute

export PI_ID SERVER_URL INTERVAL
./deploy.sh $PI_ID $SERVER_URL
```

### Development Mode
```bash
# Run with mock hardware (non-Pi systems)
MOCK_HARDWARE=true PI_ID=dev-pi SERVER_URL=localhost:50051 node pi-monitor.js

# Debug mode with verbose logging
DEBUG=true PI_ID=debug-pi SERVER_URL=localhost:50051 node pi-monitor.js
```

## 📈 **Performance**

- **CPU Usage**: < 1% during normal operation
- **Memory Usage**: ~15-20MB
- **Network Usage**: ~100 bytes per report (every 30s)
- **Disk I/O**: Minimal (only for camera tests)

## 🔒 **Security**

- **No Root Required**: Runs as regular user (pi)
- **Local Hardware Only**: Only accesses local sensors
- **Network Communication**: gRPC over TCP (consider VPN for production)
- **No Data Storage**: Stateless operation

## 🎯 **Next Steps**

1. **Deploy to Production**: Use deployment script on actual Pi devices
2. **Monitor Dashboard**: Check central server dashboard for data
3. **Customize Alerts**: Adjust temperature thresholds as needed
4. **Scale Up**: Add more Pi devices with unique IDs

---

**Status**: ✅ **Production Ready**  
**Protocol**: gRPC (efficient binary communication)  
**Deployment**: Systemd service with auto-restart  
**Monitoring**: Real-time hardware status reporting