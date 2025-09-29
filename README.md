# Monitoring Service (Raspberry Pi Edge Service)

A lightweight Node.js monitoring service designed to run on Raspberry Pi devices. This service monitors system health metrics and camera functionality, then reports status to a central monitoring server.

## Overview

This edge service continuously monitors:
- **CPU Temperature**: Uses `vcgencmd` to read processor temperature
- **Camera Status**: Checks camera connectivity and functionality
- **System Uptime**: Tracks how long the Pi has been running
- **Connectivity**: Maintains heartbeat with central server

## Features

- 🌡️ **Temperature Monitoring**: Real-time CPU temperature tracking (Celsius & Fahrenheit)
- 📷 **Camera Health Check**: Detects camera presence and tests functionality
- 🔄 **Automatic Reporting**: Configurable intervals for status updates
- 🛡️ **Error Handling**: Graceful handling of hardware failures
- 📡 **HTTP Communication**: RESTful API communication with central server

## Prerequisites

- Raspberry Pi with Raspberry Pi OS
- Node.js (v14 or higher)
- Camera module (optional, for camera monitoring)
- Network connectivity to central server

## Installation

1. **Clone or copy the service files to your Raspberry Pi**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Ensure required system commands are available:**
   - `vcgencmd` (usually pre-installed on Raspberry Pi OS)
   - `rpicam-still` (for camera testing)

## Configuration

Edit the configuration in `pi-monitor.js`:

```javascript
// Usage section at the bottom of the file
const monitor = new PiMonitor('pi-kitchen', 'http://192.168.1.112:3000');
const monitoringInterval = monitor.startMonitoring(30000); // Every 30 seconds
```

### Configuration Parameters

- **Pi ID**: Unique identifier for this Pi (e.g., 'pi-kitchen', 'pi-garage')
- **Server URL**: URL of the central monitoring server
- **Monitoring Interval**: How often to send updates (milliseconds)

## Usage

### Basic Usage

```bash
node pi-monitor.js
```

### Programmatic Usage

```javascript
const { PiMonitor } = require('./pi-monitor');

// Create monitor instance
const monitor = new PiMonitor('my-pi-id', 'http://central-server:3000');

// Single monitoring cycle
const data = await monitor.monitor();
console.log(data);

// Continuous monitoring
const interval = monitor.startMonitoring(60000); // Every minute

// Stop monitoring
clearInterval(interval);
```

## API Reference

### PiMonitor Class

#### Constructor
```javascript
new PiMonitor(piId, serverUrl)
```
- `piId`: Unique identifier for this Pi
- `serverUrl`: URL of the central monitoring server

#### Methods

##### `getCPUTemperature()`
Returns CPU temperature in Celsius.

##### `checkCamera()`
Checks camera connectivity and functionality. Returns object with:
- `connected`: Boolean indicating if camera is working
- `detected`: Boolean indicating if camera is detected
- `functional`: Boolean indicating if camera can capture images

##### `collectData()`
Collects all monitoring data and returns comprehensive status object.

##### `sendToServer(data)`
Sends monitoring data to the central server via HTTP POST.

##### `monitor()`
Performs one complete monitoring cycle (collect + send).

##### `startMonitoring(intervalMs)`
Starts continuous monitoring with specified interval.

## Data Format

The service sends the following data structure to the central server:

```json
{
  "piId": "pi-kitchen",
  "timestamp": "2025-09-28T10:30:00.000Z",
  "temperature": 45.2,
  "temperatureF": 113.36,
  "camera": {
    "connected": true,
    "detected": true,
    "functional": true
  },
  "status": "online",
  "uptime": 86400
}
```

## Error Handling

The service includes robust error handling:
- **Hardware Failures**: Continues operation even if temperature or camera checks fail
- **Network Issues**: Logs connection errors but continues monitoring
- **Command Failures**: Gracefully handles missing system commands

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```bash
   sudo chmod +x /usr/bin/vcgencmd
   ```

2. **Camera Not Detected**
   - Enable camera in `raspi-config`
   - Check camera cable connection
   - Verify camera module compatibility

3. **Network Connection Issues**
   - Verify central server URL and port
   - Check firewall settings
   - Ensure network connectivity

### Logs

Monitor the service output for status messages:
```bash
node pi-monitor.js
# Output:
# Starting monitoring for pi-kitchen every 30s
# Data sent successfully for pi-kitchen
```

## System Requirements

- **OS**: Raspberry Pi OS (Bullseye or newer recommended)
- **RAM**: Minimum 512MB
- **Storage**: ~50MB for Node.js dependencies
- **Network**: WiFi or Ethernet connection

## Dependencies

- **axios**: HTTP client for API communication
- **child_process**: System command execution
- **fs**: File system operations

## Security Considerations

- Service runs with user privileges (no root required)
- Temporary test files are cleaned up automatically
- Network communication uses standard HTTP (consider HTTPS for production)

## Performance

- **CPU Usage**: < 1% during normal operation
- **Memory Usage**: ~20-30MB
- **Network Usage**: ~1KB per status update
- **Disk I/O**: Minimal (only for camera tests)

## License

ISC License

## Support

For issues related to:
- Raspberry Pi hardware: Check official Raspberry Pi documentation
- Network connectivity: Verify central server configuration
- System commands: Ensure Raspberry Pi OS is up to date
