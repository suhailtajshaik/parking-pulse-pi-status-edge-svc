#!/bin/bash

# Simple deployment script for Pi devices
PI_ID=${1:-"blue-gate-pi"}
SERVER_URL=${2:-"192.168.1.112:50051"}

echo "🚀 Deploying Parking Pulse Edge Service"
echo "📍 Pi ID: $PI_ID"
echo "🌐 Server: $SERVER_URL"

# Install dependencies
npm install

# Create systemd service
sudo tee /etc/systemd/system/parking-pulse.service > /dev/null <<EOF
[Unit]
Description=Parking Pulse Edge Service
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
User=pi
Environment=PI_ID=$PI_ID
Environment=SERVER_URL=$SERVER_URL
Environment=INTERVAL=30000
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node pi-monitor.js
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable parking-pulse.service
sudo systemctl start parking-pulse.service

echo "✅ Service deployed and started"
echo "📋 Check status: sudo systemctl status parking-pulse"
echo "📋 View logs: sudo journalctl -u parking-pulse -f"
