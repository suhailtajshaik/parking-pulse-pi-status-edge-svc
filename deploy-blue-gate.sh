#!/bin/bash

# Deployment script for Blue Gate Pi
# Run this script on the blue-gate-pi Raspberry Pi

echo "🔵 Deploying Parking Pulse Edge Service for Blue Gate Pi"

# Set environment variables
export PI_ID="blue-gate-pi"
export PI_COLOR="blue"
export PI_LOCATION="Blue Gate"
export PI_DESCRIPTION="Parking monitoring at Blue Gate entrance"
export SERVER_URL="http://192.168.1.112:3000"
export MONITORING_INTERVAL="10000"
export NODE_ENV="production"

# Create systemd service file
sudo tee /etc/systemd/system/parking-pulse-blue.service > /dev/null <<EOF
[Unit]
Description=Parking Pulse Edge Service - Blue Gate
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=5
User=pi
Environment=PI_ID=blue-gate-pi
Environment=PI_COLOR=blue
Environment=PI_LOCATION="Blue Gate"
Environment=SERVER_URL=http://192.168.1.112:3000
Environment=MONITORING_INTERVAL=10000
Environment=NODE_ENV=production
WorkingDirectory=/home/pi/parking-pulse-edge
ExecStart=/usr/bin/node pi-monitor.js
StandardOutput=journal
StandardError=journal
SyslogIdentifier=parking-pulse-blue

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable parking-pulse-blue.service

echo "✅ Blue Gate Pi service configured"
echo "📋 To start the service: sudo systemctl start parking-pulse-blue"
echo "📋 To check status: sudo systemctl status parking-pulse-blue"
echo "📋 To view logs: sudo journalctl -u parking-pulse-blue -f"

# Test configuration
echo "🧪 Testing configuration..."
node -e "
const config = require('./config');
console.log('Pi ID:', config.PI_ID);
console.log('Location:', config.LOCATION);
console.log('Server URL:', config.SERVER_URL);
console.log('✅ Configuration looks good!');
"
