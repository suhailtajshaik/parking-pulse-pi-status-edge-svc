const { exec } = require('child_process');
const http = require('http');
const https = require('https');

// Configuration
const PI_ID = process.env.PI_ID || 'blue-gate-pi';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const INTERVAL = parseInt(process.env.INTERVAL) || 30000;
const HTTP_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT) || 5000;

// Parse server URL
function parseServerUrl(url) {
  try {
    const urlObj = new URL(url);
    return {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 3000),
      path: '/pi-status'
    };
  } catch (error) {
    console.error('❌ Invalid SERVER_URL format. Use http://hostname:port or https://hostname:port');
    process.exit(1);
  }
}

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

  // Send status to server via HTTP POST
  async sendStatus() {
    try {
      const [temperature, cameraOk] = await Promise.all([
        this.getTemperature(),
        this.checkCamera()
      ]);

      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      const payload = {
        piId: this.piId,
        temperature: parseFloat(temperature.toFixed(2)),
        cameraOk: cameraOk,
        systemOnline: true,
        uptime: uptime,
        timestamp: Date.now()
      };

      const jsonData = JSON.stringify(payload);
      const serverConfig = parseServerUrl(SERVER_URL);
      const httpModule = serverConfig.protocol === 'https:' ? https : http;

      const options = {
        hostname: serverConfig.hostname,
        port: serverConfig.port,
        path: serverConfig.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonData),
          'User-Agent': `PiMonitor/${PI_ID}`
        },
        timeout: HTTP_TIMEOUT
      };

      console.log(`📤 Sending HTTP request to ${serverConfig.protocol}//${serverConfig.hostname}:${serverConfig.port}${serverConfig.path}`);
      console.log(`   Data: ${this.piId} | ${temperature.toFixed(1)}°C | Camera: ${cameraOk ? '✅' : '❌'} | Uptime: ${uptime}s`);

      const req = httpModule.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`✅ Status sent successfully (${res.statusCode})`);

            // Parse server response for alerts
            try {
              const response = JSON.parse(responseData);
              if (response.alerts && Array.isArray(response.alerts) && response.alerts.length > 0) {
                response.alerts.forEach(alert => {
                  console.log(`🚨 ALERT: ${alert.message} (${alert.severity || 'info'})`);
                });
              }
            } catch (parseError) {
              // Response may not be JSON, that's okay
            }
          } else {
            console.warn(`⚠️  Server responded with status ${res.statusCode}`);
          }
        });
      });

      req.on('error', (error) => {
        console.error(`❌ HTTP request error: ${error.message}`);
        console.error(`   Failed to connect to ${serverConfig.hostname}:${serverConfig.port}`);
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`❌ HTTP request timeout (${HTTP_TIMEOUT}ms)`);
      });

      req.write(jsonData);
      req.end();

    } catch (error) {
      console.error('❌ Monitor error:', error.message);
    }
  }

  // Start monitoring
  start() {
    const serverConfig = parseServerUrl(SERVER_URL);
    console.log(`🚀 Starting ${this.piId} monitor`);
    console.log(`   Reporting to: ${serverConfig.protocol}//${serverConfig.hostname}:${serverConfig.port}${serverConfig.path}`);
    console.log(`   Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);
    console.log(`   Timeout: ${HTTP_TIMEOUT}ms`);

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
  console.log('\n🛑 Shutting down gracefully...');
  clearInterval(interval);
  console.log('✅ Monitor stopped');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  console.error('   Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});