const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { exec } = require('child_process');
const fs = require('fs');

// Load gRPC proto
const packageDefinition = protoLoader.loadSync('./proto/parking.proto');
const parking = grpc.loadPackageDefinition(packageDefinition).parking;

// Configuration
const PI_ID = process.env.PI_ID || 'blue-gate-pi';
const SERVER_URL = process.env.SERVER_URL || 'localhost:50051';
const INTERVAL = parseInt(process.env.INTERVAL) || 30000;

// Create gRPC client
const client = new parking.ParkingService(SERVER_URL, grpc.credentials.createInsecure());

class SimplePiMonitor {
  constructor(piId) {
    this.piId = piId;
    this.startTime = Date.now();
  }

  // Get CPU temperature
  async getTemperature() {
    return new Promise((resolve) => {
      exec('/usr/bin/vcgencmd measure_temp', (error, stdout) => {
        if (error) {
          console.log('⚠️  Temperature sensor not available (non-Pi system)');
          resolve(Math.random() * 20 + 40); // Mock data for testing
          return;
        }
        const match = stdout.match(/temp=([0-9.]+)/);
        resolve(match ? parseFloat(match[1]) : 45.0);
      });
    });
  }

  // Check camera
  async checkCamera() {
    return new Promise((resolve) => {
      exec('/usr/bin/vcgencmd get_camera', (error, stdout) => {
        if (error) {
          console.log('⚠️  Camera check not available (non-Pi system)');
          resolve(Math.random() > 0.3); // Mock data for testing
          return;
        }
        resolve(stdout.includes('detected=1'));
      });
    });
  }

  // Send status to server
  async sendStatus() {
    try {
      const [temperature, cameraOk] = await Promise.all([
        this.getTemperature(),
        this.checkCamera()
      ]);

      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      const request = {
        piId: this.piId,
        temperature,
        cameraOk: cameraOk,
        uptime
      };

      console.log('📤 Sending gRPC request:', request);

      client.reportStatus(request, (error, response) => {
        if (error) {
          console.error(`❌ gRPC error:`, error.message);
          return;
        }

        console.log(`✅ ${this.piId}: ${temperature.toFixed(1)}°C, Camera: ${cameraOk ? '✅' : '❌'}`);
        
        if (response.alerts && response.alerts.length > 0) {
          response.alerts.forEach(alert => {
            console.log(`🚨 ALERT: ${alert.message} (${alert.severity})`);
          });
        }
      });

    } catch (error) {
      console.error('❌ Monitor error:', error);
    }
  }

  // Start monitoring
  start() {
    console.log(`🚀 Starting ${this.piId} monitor (gRPC to ${SERVER_URL})`);
    
    // Send initial status
    this.sendStatus();
    
    // Set up interval
    return setInterval(() => {
      this.sendStatus();
    }, INTERVAL);
  }
}

// Start monitoring
const monitor = new SimplePiMonitor(PI_ID);
const interval = monitor.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  clearInterval(interval);
  client.close();
  process.exit(0);
});