const { exec } = require('child_process');
const fs = require('fs');
const axios = require('axios');

class PiMonitor {
  constructor(piId, serverUrl) {
    this.piId = piId;
    this.serverUrl = serverUrl;
  }

  // Check CPU temperature
  async getCPUTemperature() {
    return new Promise((resolve, reject) => {
      exec('/usr/bin/vcgencmd measure_temp', (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        // Parse "temp=42.0'C" to get numeric value
        const tempMatch = stdout.match(/temp=([0-9.]+)/);
        const celsius = tempMatch ? parseFloat(tempMatch[1]) : null;
        resolve(celsius);
      });
    });
  }

  // Check if camera is connected and working
  async checkCamera() {
    return new Promise((resolve) => {
      // First check if camera is detected
      exec('/usr/bin/vcgencmd get_camera', (error, stdout) => {
        if (error) {
          resolve({ connected: false, error: error.message });
          return;
        }
        
        // Parse output like "supported=1 detected=1"
        const detected = stdout.includes('detected=1');
        
        if (!detected) {
          resolve({ connected: false, detected: false });
          return;
        }

        // Test camera functionality with a quick capture
        exec('rpicam-still -o /tmp/test_camera.jpg --timeout 1000', (captureError) => {
          const testImageExists = fs.existsSync('/tmp/test_camera.jpg');
          
          // Clean up test file
          if (testImageExists) {
            fs.unlinkSync('/tmp/test_camera.jpg');
          }
          
          resolve({
            connected: !captureError && testImageExists,
            detected: true,
            functional: !captureError && testImageExists
          });
        });
      });
    });
  }

  // Collect all monitoring data
  async collectData() {
    try {
      const [temperature, cameraStatus] = await Promise.all([
        this.getCPUTemperature(),
        this.checkCamera()
      ]);

      return {
        piId: this.piId,
        timestamp: new Date().toISOString(),
        temperature: temperature,
        temperatureF: temperature ? (temperature * 1.8) + 32 : null,
        camera: cameraStatus,
        status: 'online',
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        piId: this.piId,
        timestamp: new Date().toISOString(),
        error: error.message,
        status: 'error'
      };
    }
  }

  // Send data to central server
  async sendToServer(data) {
    try {
      await axios.post(`${this.serverUrl}/pi-status`, data, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`Data sent successfully for ${this.piId}`);
    } catch (error) {
      console.error(`Failed to send data for ${this.piId}:`, error.message);
    }
  }

  // Run monitoring cycle
  async monitor() {
    const data = await this.collectData();
    await this.sendToServer(data);
    return data;
  }

  // Start continuous monitoring
  startMonitoring(intervalMs = 60000) {
    console.log(`Starting monitoring for ${this.piId} every ${intervalMs/1000}s`);
    
    // Send initial status
    this.monitor();
    
    // Set up interval
    return setInterval(() => {
      this.monitor();
    }, intervalMs);
  }
}

// Usage
const monitor = new PiMonitor('pi-kitchen', 'http://192.168.1.112:3000');
const monitoringInterval = monitor.startMonitoring(30000); // Every 30 seconds
