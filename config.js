// Configuration for Parking Pulse Edge Service
// This file should be customized for each Raspberry Pi deployment

// Get Pi ID from environment variable or default based on hostname
const os = require('os');
const hostname = os.hostname();

// Default Pi ID mapping based on hostname or environment
let defaultPiId = 'unknown-pi';
if (hostname.includes('blue') || process.env.PI_COLOR === 'blue') {
  defaultPiId = 'blue-gate-pi';
} else if (hostname.includes('pink') || process.env.PI_COLOR === 'pink') {
  defaultPiId = 'pink-gate-pi';
}

const config = {
  // Pi Identity - CUSTOMIZE THIS FOR EACH PI
  PI_ID: process.env.PI_ID || defaultPiId,
  
  // Central Server Configuration
  SERVER_URL: process.env.SERVER_URL || 'http://192.168.1.112:3000',
  
  // Monitoring Configuration
  MONITORING_INTERVAL: parseInt(process.env.MONITORING_INTERVAL) || 10000, // 10 seconds
  
  // System Commands (Raspberry Pi specific)
  TEMP_COMMAND: '/usr/bin/vcgencmd measure_temp',
  CAMERA_CHECK_COMMAND: '/usr/bin/vcgencmd get_camera',
  CAMERA_CAPTURE_COMMAND: 'rpicam-still',
  
  // Camera Test Configuration
  CAMERA_TEST_PATH: '/tmp/test_camera.jpg',
  CAMERA_TEST_TIMEOUT: 1000, // 1 second
  
  // HTTP Configuration
  HTTP_TIMEOUT: 5000, // 5 seconds
  
  // Retry Configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // 2 seconds
  
  // Logging Configuration
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Alert Thresholds (local monitoring)
  TEMP_WARNING_THRESHOLD: 65, // Celsius
  TEMP_CRITICAL_THRESHOLD: 75, // Celsius
  
  // Health Check Configuration
  HEALTH_CHECK_INTERVAL: 60000, // 1 minute
  
  // Pi-specific Configuration
  LOCATION: process.env.PI_LOCATION || (defaultPiId.includes('blue') ? 'Blue Gate' : 'Pink Gate'),
  DESCRIPTION: process.env.PI_DESCRIPTION || `Parking monitoring at ${process.env.PI_LOCATION || 'gate'}`,
  
  // Feature Flags
  ENABLE_CAMERA_MONITORING: process.env.ENABLE_CAMERA !== 'false',
  ENABLE_TEMPERATURE_MONITORING: process.env.ENABLE_TEMPERATURE !== 'false',
  ENABLE_LOCAL_ALERTS: process.env.ENABLE_LOCAL_ALERTS === 'true',
  
  // Development/Debug
  DEBUG_MODE: process.env.NODE_ENV === 'development',
  MOCK_HARDWARE: process.env.MOCK_HARDWARE === 'true' // For testing on non-Pi systems
};

// Validation
if (!config.PI_ID || config.PI_ID === 'unknown-pi') {
  console.warn('⚠️  PI_ID not properly configured. Please set PI_ID environment variable or update config.js');
}

if (!config.SERVER_URL.startsWith('http://') && !config.SERVER_URL.startsWith('https://')) {
  console.error('❌ Invalid SERVER_URL. Must start with http:// or https://');
  console.error(`   Current value: ${config.SERVER_URL}`);
  process.exit(1);
}

// Display configuration on startup
if (config.DEBUG_MODE) {
  console.log('🔧 Edge Service Configuration:', {
    piId: config.PI_ID,
    serverUrl: config.SERVER_URL,
    interval: config.MONITORING_INTERVAL,
    location: config.LOCATION,
    features: {
      camera: config.ENABLE_CAMERA_MONITORING,
      temperature: config.ENABLE_TEMPERATURE_MONITORING,
      alerts: config.ENABLE_LOCAL_ALERTS
    }
  });
}

module.exports = config;
