/**
 * Vehicle Detection Service Configuration
 */

const config = {
  // Service Identity
  PI_ID: process.env.PI_ID || 'blue-gate-pi',
  GATE_LOCATION: process.env.GATE_LOCATION || 'entrance-1',

  // Central Server
  SERVER_URL: process.env.SERVER_URL || 'http://192.168.1.112:3000',
  VEHICLE_EVENT_ENDPOINT: process.env.VEHICLE_EVENT_ENDPOINT || '/vehicle-events',

  // AWS S3 Configuration
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  S3_BUCKET: process.env.S3_BUCKET || 'parking-pulse-photos',
  S3_PREFIX: process.env.S3_PREFIX || 'vehicle-events',

  // Detection Settings
  DETECTION_LINE_Y: parseInt(process.env.DETECTION_LINE_Y) || 540,  // Middle of 1080p
  MIN_CONFIDENCE: parseFloat(process.env.MIN_CONFIDENCE) || 0.7,
  FRAME_RATE: parseInt(process.env.FRAME_RATE) || 10,
  CAMERA_WIDTH: parseInt(process.env.CAMERA_WIDTH) || 1920,
  CAMERA_HEIGHT: parseInt(process.env.CAMERA_HEIGHT) || 1080,

  // Model Settings
  MODEL_PATH: process.env.MODEL_PATH || '/opt/parking-pulse/models/yolov8m.hef',

  // Event Processing
  EVENT_QUEUE_DIR: process.env.EVENT_QUEUE_DIR || '/tmp/vehicle-events',
  BACKUP_DIR: process.env.BACKUP_DIR || '/var/parking-pulse/backup',
  MAX_S3_RETRIES: parseInt(process.env.MAX_S3_RETRIES) || 3,
  S3_RETRY_DELAY: parseInt(process.env.S3_RETRY_DELAY) || 2000,
  MAX_EVENT_RETRIES: parseInt(process.env.MAX_EVENT_RETRIES) || 5,
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 1000,

  // Debug
  DEBUG_MODE: process.env.DEBUG_MODE === 'true',
  NODE_ENV: process.env.NODE_ENV || 'production'
};

// Validation
function validateConfig() {
  const errors = [];

  // Validate PI_ID
  if (!config.PI_ID || config.PI_ID.length === 0) {
    errors.push('PI_ID is required');
  }

  // Validate SERVER_URL
  if (!config.SERVER_URL.startsWith('http://') && !config.SERVER_URL.startsWith('https://')) {
    errors.push('SERVER_URL must start with http:// or https://');
  }

  // Validate detection line (should be within frame height)
  if (config.DETECTION_LINE_Y < 0 || config.DETECTION_LINE_Y > config.CAMERA_HEIGHT) {
    errors.push(`DETECTION_LINE_Y (${config.DETECTION_LINE_Y}) must be between 0 and ${config.CAMERA_HEIGHT}`);
  }

  // Validate confidence threshold
  if (config.MIN_CONFIDENCE < 0 || config.MIN_CONFIDENCE > 1) {
    errors.push('MIN_CONFIDENCE must be between 0 and 1');
  }

  // Validate AWS credentials if S3 is intended to be used
  if (config.S3_BUCKET && (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY)) {
    console.warn('⚠️  WARNING: S3_BUCKET is set but AWS credentials are missing');
    console.warn('   S3 upload will be disabled. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to enable');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }
}

// Run validation
validateConfig();

// Export configuration
module.exports = config;
