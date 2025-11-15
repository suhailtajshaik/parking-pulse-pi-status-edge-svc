#!/usr/bin/env node

/**
 * Event Processor Service
 * Monitors event queue, uploads photos to S3, and sends events to central server
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration from environment variables
const PI_ID = process.env.PI_ID || 'blue-gate-pi';
const SERVER_URL = process.env.SERVER_URL || 'http://192.168.1.112:3000';
const VEHICLE_EVENT_ENDPOINT = process.env.VEHICLE_EVENT_ENDPOINT || '/vehicle-events';
const EVENT_QUEUE_DIR = process.env.EVENT_QUEUE_DIR || '/tmp/vehicle-events';
const BACKUP_DIR = process.env.BACKUP_DIR || '/var/parking-pulse/backup';
const MAX_S3_RETRIES = parseInt(process.env.MAX_S3_RETRIES) || 3;
const S3_RETRY_DELAY = parseInt(process.env.S3_RETRY_DELAY) || 2000;
const MAX_EVENT_RETRIES = parseInt(process.env.MAX_EVENT_RETRIES) || 5;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 1000;  // 1 second

// AWS S3 Configuration
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || 'parking-pulse-photos';
const S3_PREFIX = process.env.S3_PREFIX || 'vehicle-events';

// Try to load AWS SDK (optional dependency)
let AWS;
let S3_AVAILABLE = false;

try {
  AWS = require('aws-sdk');
  S3_AVAILABLE = true;

  // Configure AWS
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    AWS.config.update({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION
    });
  }
} catch (error) {
  console.warn('⚠️  AWS SDK not available - S3 upload disabled');
  console.warn('   Install with: npm install aws-sdk');
}

// Ensure directories exist
[EVENT_QUEUE_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Parse server URL into components
 */
function parseServerUrl(url) {
  const urlPattern = /^(https?):\/\/([^:\/]+):?(\d+)?/;
  const match = url.match(urlPattern);

  if (!match) {
    throw new Error(`Invalid SERVER_URL: ${url}`);
  }

  return {
    protocol: match[1] + ':',
    hostname: match[2],
    port: match[3] || (match[1] === 'https' ? '443' : '80')
  };
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload file to S3 with retry logic
 */
async function uploadToS3WithRetry(filePath, s3Key, maxRetries = MAX_S3_RETRIES) {
  if (!S3_AVAILABLE) {
    console.warn('⚠️  S3 upload skipped - AWS SDK not available');
    return { success: false, url: null, error: 'AWS SDK not available' };
  }

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.warn('⚠️  S3 upload skipped - AWS credentials not configured');
    return { success: false, url: null, error: 'AWS credentials missing' };
  }

  const s3 = new AWS.S3();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Uploading to S3 (attempt ${attempt}/${maxRetries}): ${s3Key}`);

      const fileContent = fs.readFileSync(filePath);

      const params = {
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'AES256'
      };

      const result = await s3.upload(params).promise();
      const url = result.Location;

      console.log(`✅ S3 upload successful: ${url}`);
      return { success: true, url };

    } catch (error) {
      console.error(`❌ S3 upload attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        const delay = S3_RETRY_DELAY * Math.pow(2, attempt - 1);  // Exponential backoff
        console.log(`   Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  return { success: false, url: null, error: 'Max retries exceeded' };
}

/**
 * Send event to central server
 */
async function sendEventToServer(eventData) {
  return new Promise((resolve, reject) => {
    const serverConfig = parseServerUrl(SERVER_URL);
    const httpModule = serverConfig.protocol === 'https:' ? https : http;

    const postData = JSON.stringify(eventData);

    const options = {
      hostname: serverConfig.hostname,
      port: serverConfig.port,
      path: VEHICLE_EVENT_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = httpModule.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(responseData);
            resolve({ success: true, response });
          } catch (error) {
            resolve({ success: true, response: responseData });
          }
        } else {
          reject(new Error(`Server returned ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Process a single event
 */
async function processEvent(eventJsonPath) {
  const eventId = path.basename(eventJsonPath, '.json');
  console.log(`\n📋 Processing event: ${eventId}`);

  try {
    // Read event data
    const eventData = JSON.parse(fs.readFileSync(eventJsonPath, 'utf8'));
    const snapshotPath = eventData.snapshotPath;

    // Verify snapshot exists
    if (!fs.existsSync(snapshotPath)) {
      console.error(`❌ Snapshot not found: ${snapshotPath}`);
      return false;
    }

    // Prepare S3 key
    const date = new Date(eventData.timestamp);
    const dateFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const s3Key = `${S3_PREFIX}/${PI_ID}/${dateFolder}/${eventId}.jpg`;

    // Upload to S3
    const s3Result = await uploadToS3WithRetry(snapshotPath, s3Key);

    // Prepare event payload for central server
    const eventPayload = {
      piId: PI_ID,
      eventType: 'vehicle_detected',
      eventId: eventData.eventId,
      direction: eventData.direction,
      timestamp: eventData.timestamp,
      confidence: eventData.confidence,
      snapshotUrl: s3Result.url,
      fallbackAvailable: !s3Result.success,
      gateLocation: eventData.gateLocation,
      metadata: {
        bbox: eventData.bbox,
        frameWidth: eventData.frameWidth,
        frameHeight: eventData.frameHeight,
        trackId: eventData.trackId
      }
    };

    // Send event to central server
    console.log(`📡 Sending event to server: ${SERVER_URL}${VEHICLE_EVENT_ENDPOINT}`);

    try {
      const serverResult = await sendEventToServer(eventPayload);
      console.log(`✅ Event sent successfully:`, serverResult.response);

      // Clean up local files on success
      if (s3Result.success) {
        // S3 upload succeeded - safe to delete
        fs.unlinkSync(eventJsonPath);
        fs.unlinkSync(snapshotPath);
        console.log(`🗑️  Local files deleted (uploaded to S3)`);
      } else {
        // S3 failed but event sent - move to backup
        const backupJsonPath = path.join(BACKUP_DIR, `${eventId}.json`);
        const backupImagePath = path.join(BACKUP_DIR, `${eventId}.jpg`);

        fs.renameSync(eventJsonPath, backupJsonPath);
        fs.renameSync(snapshotPath, backupImagePath);

        console.log(`📦 Files moved to backup (S3 upload failed)`);
      }

      return true;

    } catch (serverError) {
      console.error(`❌ Failed to send event to server:`, serverError.message);

      // Move to backup for retry later
      const backupJsonPath = path.join(BACKUP_DIR, `${eventId}.json`);
      const backupImagePath = path.join(BACKUP_DIR, `${eventId}.jpg`);

      fs.renameSync(eventJsonPath, backupJsonPath);
      fs.renameSync(snapshotPath, backupImagePath);

      console.log(`📦 Files moved to backup (will retry later)`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error processing event ${eventId}:`, error.message);
    return false;
  }
}

/**
 * Process all events in queue
 */
async function processQueue() {
  try {
    const files = fs.readdirSync(EVENT_QUEUE_DIR);
    const eventFiles = files.filter(f => f.endsWith('.json'));

    if (eventFiles.length > 0) {
      console.log(`📬 Found ${eventFiles.length} event(s) in queue`);

      for (const eventFile of eventFiles) {
        const eventJsonPath = path.join(EVENT_QUEUE_DIR, eventFile);
        await processEvent(eventJsonPath);
      }
    }

  } catch (error) {
    console.error('❌ Error processing queue:', error.message);
  }
}

/**
 * Retry failed events from backup
 */
async function retryBackupEvents() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const eventFiles = files.filter(f => f.endsWith('.json'));

    if (eventFiles.length > 0) {
      console.log(`\n🔄 Retrying ${eventFiles.length} backup event(s)...`);

      // Only retry oldest 5 to avoid overwhelming the system
      const toRetry = eventFiles.slice(0, 5);

      for (const eventFile of toRetry) {
        const backupJsonPath = path.join(BACKUP_DIR, eventFile);

        // Move back to queue
        const queueJsonPath = path.join(EVENT_QUEUE_DIR, eventFile);
        fs.renameSync(backupJsonPath, queueJsonPath);

        // Move snapshot too
        const eventId = path.basename(eventFile, '.json');
        const backupImagePath = path.join(BACKUP_DIR, `${eventId}.jpg`);
        const queueImagePath = path.join(EVENT_QUEUE_DIR, `${eventId}.jpg`);

        if (fs.existsSync(backupImagePath)) {
          fs.renameSync(backupImagePath, queueImagePath);
        }

        // Process immediately
        await processEvent(queueJsonPath);
      }
    }

  } catch (error) {
    console.error('❌ Error retrying backup events:', error.message);
  }
}

/**
 * Main service loop
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  📤 Event Processor Service Starting...');
  console.log('='.repeat(60));
  console.log(`  Pi ID: ${PI_ID}`);
  console.log(`  Server: ${SERVER_URL}${VEHICLE_EVENT_ENDPOINT}`);
  console.log(`  Event Queue: ${EVENT_QUEUE_DIR}`);
  console.log(`  Backup Dir: ${BACKUP_DIR}`);
  console.log(`  S3 Bucket: ${S3_BUCKET}`);
  console.log(`  S3 Available: ${S3_AVAILABLE}`);
  console.log(`  Poll Interval: ${POLL_INTERVAL}ms`);
  console.log('='.repeat(60) + '\n');

  let processedCount = 0;
  let errorCount = 0;
  let retryCount = 0;

  // Main loop
  while (true) {
    try {
      // Process new events in queue
      await processQueue();
      processedCount++;

      // Retry backup events every 10 iterations (every ~10 seconds if POLL_INTERVAL=1000)
      if (processedCount % 10 === 0) {
        await retryBackupEvents();
        retryCount++;
      }

      // Print stats every 60 iterations (~1 minute)
      if (processedCount % 60 === 0) {
        const queueSize = fs.readdirSync(EVENT_QUEUE_DIR).filter(f => f.endsWith('.json')).length;
        const backupSize = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).length;

        console.log(`\n📊 Stats: Processed=${processedCount}, Errors=${errorCount}, Retries=${retryCount}`);
        console.log(`   Queue: ${queueSize} events, Backup: ${backupSize} events\n`);
      }

    } catch (error) {
      console.error('❌ Error in main loop:', error.message);
      errorCount++;
    }

    // Wait before next iteration
    await sleep(POLL_INTERVAL);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down event processor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down event processor...');
  process.exit(0);
});

// Start service
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
