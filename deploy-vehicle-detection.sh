#!/bin/bash

# ========================================================================
# Vehicle Detection Service Deployment Script
# ========================================================================
# Deploys both vehicle-detector.py and event-processor.js as systemd services
#
# Usage:
#   ./deploy-vehicle-detection.sh <pi-id> <server-url> <aws-access-key> <aws-secret-key> [s3-bucket]
#
# Example:
#   ./deploy-vehicle-detection.sh blue-gate-pi http://192.168.1.112:3000 AKIA... secret... parking-pulse-photos
# ========================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check arguments
if [ "$#" -lt 4 ]; then
    print_error "Usage: $0 <pi-id> <server-url> <aws-access-key> <aws-secret-key> [s3-bucket]"
    echo ""
    echo "Example:"
    echo "  $0 blue-gate-pi http://192.168.1.112:3000 AKIA... secret... parking-pulse-photos"
    exit 1
fi

PI_ID=$1
SERVER_URL=$2
AWS_ACCESS_KEY_ID=$3
AWS_SECRET_ACCESS_KEY=$4
S3_BUCKET=${5:-"parking-pulse-photos"}
GATE_LOCATION=${6:-"entrance-1"}

print_header "Vehicle Detection Service Deployment"

echo "Configuration:"
echo "  Pi ID: $PI_ID"
echo "  Server URL: $SERVER_URL"
echo "  S3 Bucket: $S3_BUCKET"
echo "  Gate Location: $GATE_LOCATION"
echo ""

# Get current directory
INSTALL_DIR=$(pwd)

# ========================================================================
# Step 1: Install Python Dependencies
# ========================================================================

print_header "Step 1: Installing Python Dependencies"

if [ -f "requirements.txt" ]; then
    print_info "Installing Python packages..."
    pip3 install -r requirements.txt
    print_success "Python dependencies installed"
else
    print_warning "requirements.txt not found - skipping Python dependencies"
fi

# ========================================================================
# Step 2: Install Node.js Dependencies
# ========================================================================

print_header "Step 2: Installing Node.js Dependencies"

if [ -f "package.json" ]; then
    print_info "Installing npm packages..."
    npm install
    print_success "Node.js dependencies installed"
else
    print_warning "package.json not found - skipping Node.js dependencies"
fi

# ========================================================================
# Step 3: Create Directories
# ========================================================================

print_header "Step 3: Creating Directories"

sudo mkdir -p /tmp/vehicle-events
sudo mkdir -p /var/parking-pulse/backup
sudo mkdir -p /opt/parking-pulse/models
sudo chown -R $USER:$USER /tmp/vehicle-events
sudo chown -R $USER:$USER /var/parking-pulse

print_success "Directories created"

# ========================================================================
# Step 4: Create Vehicle Detector Systemd Service
# ========================================================================

print_header "Step 4: Creating Vehicle Detector Service"

cat > /tmp/parking-pulse-vehicle-detector.service <<EOF
[Unit]
Description=Parking Pulse Vehicle Detector (${PI_ID})
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${INSTALL_DIR}
Environment="PI_ID=${PI_ID}"
Environment="GATE_LOCATION=${GATE_LOCATION}"
Environment="SERVER_URL=${SERVER_URL}"
Environment="DETECTION_LINE_Y=540"
Environment="MIN_CONFIDENCE=0.7"
Environment="FRAME_RATE=24"
Environment="CAMERA_WIDTH=1920"
Environment="CAMERA_HEIGHT=1080"
Environment="MODEL_PATH=/opt/parking-pulse/models/yolov8m.hef"
Environment="EVENT_QUEUE_DIR=/tmp/vehicle-events"
Environment="DEBUG_MODE=false"
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/vehicle-detector.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo mv /tmp/parking-pulse-vehicle-detector.service /etc/systemd/system/
print_success "Vehicle detector service created"

# ========================================================================
# Step 5: Create Event Processor Systemd Service
# ========================================================================

print_header "Step 5: Creating Event Processor Service"

cat > /tmp/parking-pulse-event-processor.service <<EOF
[Unit]
Description=Parking Pulse Event Processor (${PI_ID})
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${INSTALL_DIR}
Environment="PI_ID=${PI_ID}"
Environment="SERVER_URL=${SERVER_URL}"
Environment="VEHICLE_EVENT_ENDPOINT=/vehicle-events"
Environment="AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}"
Environment="AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}"
Environment="AWS_REGION=us-east-1"
Environment="S3_BUCKET=${S3_BUCKET}"
Environment="S3_PREFIX=vehicle-events"
Environment="EVENT_QUEUE_DIR=/tmp/vehicle-events"
Environment="BACKUP_DIR=/var/parking-pulse/backup"
Environment="MAX_S3_RETRIES=3"
Environment="S3_RETRY_DELAY=2000"
Environment="POLL_INTERVAL=1000"
ExecStart=/usr/bin/node ${INSTALL_DIR}/event-processor.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo mv /tmp/parking-pulse-event-processor.service /etc/systemd/system/
print_success "Event processor service created"

# ========================================================================
# Step 6: Download YOLOv8 Hailo Model (if not exists)
# ========================================================================

print_header "Step 6: Checking YOLOv8 Model"

MODEL_PATH="/opt/parking-pulse/models/yolov8m.hef"

if [ ! -f "$MODEL_PATH" ]; then
    print_warning "YOLOv8 Hailo model not found at $MODEL_PATH"
    print_info "You need to download or compile the YOLOv8 model for Hailo-8L"
    print_info "Visit: https://hailo.ai/developer-zone/model-zoo/"
    print_info "Or compile using Hailo Dataflow Compiler"
else
    print_success "YOLOv8 model found: $MODEL_PATH"
fi

# ========================================================================
# Step 7: Enable and Start Services
# ========================================================================

print_header "Step 7: Enabling and Starting Services"

sudo systemctl daemon-reload

# Enable services
sudo systemctl enable parking-pulse-vehicle-detector.service
sudo systemctl enable parking-pulse-event-processor.service

print_success "Services enabled"

# Start services
sudo systemctl start parking-pulse-vehicle-detector.service
sudo systemctl start parking-pulse-event-processor.service

print_success "Services started"

# ========================================================================
# Step 8: Verify Services
# ========================================================================

print_header "Step 8: Verifying Services"

sleep 2

# Check vehicle detector status
if sudo systemctl is-active --quiet parking-pulse-vehicle-detector.service; then
    print_success "Vehicle detector service is running"
else
    print_error "Vehicle detector service failed to start"
    echo ""
    echo "Check logs with:"
    echo "  sudo journalctl -u parking-pulse-vehicle-detector -n 50"
fi

# Check event processor status
if sudo systemctl is-active --quiet parking-pulse-event-processor.service; then
    print_success "Event processor service is running"
else
    print_error "Event processor service failed to start"
    echo ""
    echo "Check logs with:"
    echo "  sudo journalctl -u parking-pulse-event-processor -n 50"
fi

# ========================================================================
# Deployment Complete
# ========================================================================

print_header "Deployment Complete!"

echo -e "\n${GREEN}✓ Vehicle detection services deployed successfully!${NC}\n"

echo "Service Management:"
echo "  Vehicle Detector:"
echo "    sudo systemctl status parking-pulse-vehicle-detector"
echo "    sudo systemctl stop parking-pulse-vehicle-detector"
echo "    sudo systemctl restart parking-pulse-vehicle-detector"
echo "    sudo journalctl -u parking-pulse-vehicle-detector -f"
echo ""
echo "  Event Processor:"
echo "    sudo systemctl status parking-pulse-event-processor"
echo "    sudo systemctl stop parking-pulse-event-processor"
echo "    sudo systemctl restart parking-pulse-event-processor"
echo "    sudo journalctl -u parking-pulse-event-processor -f"
echo ""

echo "Configuration:"
echo "  Event Queue: /tmp/vehicle-events"
echo "  Backup: /var/parking-pulse/backup"
echo "  Model: /opt/parking-pulse/models/yolov8m.hef"
echo ""

if [ ! -f "$MODEL_PATH" ]; then
    print_warning "IMPORTANT: Download YOLOv8 Hailo model to $MODEL_PATH before starting"
fi

print_success "Deployment finished! 🎉"
