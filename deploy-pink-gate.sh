#!/bin/bash

# Deployment script for Pink Gate Pi
# Run this script on the pink-gate-pi Raspberry Pi

echo "🩷 Deploying Parking Pulse Edge Service for Pink Gate Pi"

# Set environment variables
export PI_ID="pink-gate-pi"
export PI_COLOR="pink"
export PI_LOCATION="Pink Gate"
export PI_DESCRIPTION="Parking monitoring at Pink Gate entrance"
export SERVER_URL="http://192.168.1.112:3000"
export MONITORING_INTERVAL="30000"
export NODE_ENV="production"

# Create systemd service file
sudo tee /etc/systemd/system/parking-pulse-pink.service > /dev/null <<EOF
[Unit]
Description=Parking Pulse Edge Service - Pink Gate
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=5
User=pi
Environment=PI_ID=pink-gate-pi
Environment=PI_COLOR=pink
Environment=PI_LOCATION="Pink Gate"
Environment=SERVER_URL=http://192.168.1.112:3000
Environment=MONITORING_INTERVAL=30000
Environment=NODE_ENV=production
WorkingDirectory=/home/pi/parking-pulse-edge
ExecStart=/usr/bin/node pi-monitor.js
StandardOutput=journal
StandardError=journal
SyslogIdentifier=parking-pulse-pink

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable parking-pulse-pink.service

echo "✅ Pink Gate Pi service configured"
echo "📋 To start the service: sudo systemctl start parking-pulse-pink"
echo "📋 To check status: sudo systemctl status parking-pulse-pink"
echo "📋 To view logs: sudo journalctl -u parking-pulse-pink -f"

# Test configuration
echo "🧪 Testing configuration..."
node -e "
const config = require('./config');
console.log('Pi ID:', config.PI_ID);
console.log('Location:', config.LOCATION);
console.log('Server URL:', config.SERVER_URL);
console.log('✅ Configuration looks good!');
"
