#!/bin/bash

# ========================================================================
# Parking Pulse Edge Service - Initialization Script
# ========================================================================
# This script sets up all prerequisites for running the parking pulse
# edge service on a fresh Raspbian OS installation.
#
# Prerequisites installed:
# - Node.js (via NVM)
# - Camera modules and libraries
# - System utilities
#
# Usage:
#   chmod +x init.sh
#   ./init.sh
# ========================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_VERSION="20"  # LTS version
NVM_VERSION="v0.39.7"

# ========================================================================
# Helper Functions
# ========================================================================

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

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if running on Raspberry Pi
check_raspberry_pi() {
    if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null && ! grep -q "BCM" /proc/cpuinfo 2>/dev/null; then
        print_warning "This doesn't appear to be a Raspberry Pi"
        print_info "Continuing anyway for testing purposes..."
        return 1
    fi
    return 0
}

# ========================================================================
# Main Installation Steps
# ========================================================================

print_header "Parking Pulse Edge Service - System Initialization"

echo "This script will install:"
echo "  - Node.js ${NODE_VERSION} (via NVM)"
echo "  - Camera libraries and utilities"
echo "  - Required system packages"
echo ""
read -p "Continue with installation? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Installation cancelled"
    exit 1
fi

# Check if running on Raspberry Pi
IS_RASPBERRY_PI=false
if check_raspberry_pi; then
    IS_RASPBERRY_PI=true
    print_success "Detected Raspberry Pi hardware"
fi

# ========================================================================
# Step 1: System Update
# ========================================================================

print_header "Step 1: Updating System Packages"
print_info "Running apt-get update and upgrade..."

sudo apt-get update -y
sudo apt-get upgrade -y

print_success "System packages updated"

# ========================================================================
# Step 2: Install System Dependencies
# ========================================================================

print_header "Step 2: Installing System Dependencies"

# Required packages
PACKAGES=(
    "curl"
    "wget"
    "git"
    "build-essential"
    "libssl-dev"
)

# Camera-related packages (Raspberry Pi specific)
if [ "$IS_RASPBERRY_PI" = true ]; then
    PACKAGES+=(
        "libcamera-dev"
        "libcamera-apps"
        "libcamera-tools"
        "rpicam-apps"
    )
fi

print_info "Installing: ${PACKAGES[*]}"
sudo apt-get install -y "${PACKAGES[@]}"

print_success "System dependencies installed"

# ========================================================================
# Step 3: Install NVM (Node Version Manager)
# ========================================================================

print_header "Step 3: Installing NVM (Node Version Manager)"

# Check if NVM is already installed
if [ -d "$HOME/.nvm" ]; then
    print_warning "NVM is already installed at $HOME/.nvm"
    print_info "Skipping NVM installation..."
else
    print_info "Downloading and installing NVM ${NVM_VERSION}..."

    curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash

    print_success "NVM installed"
fi

# Load NVM into current session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# ========================================================================
# Step 4: Install Node.js
# ========================================================================

print_header "Step 4: Installing Node.js ${NODE_VERSION}"

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node -v)
    print_warning "Node.js ${CURRENT_NODE_VERSION} is already installed"
    print_info "Installing Node.js ${NODE_VERSION} anyway..."
fi

print_info "Installing Node.js ${NODE_VERSION} via NVM..."
nvm install "${NODE_VERSION}"
nvm use "${NODE_VERSION}"
nvm alias default "${NODE_VERSION}"

# Verify installation
NODE_INSTALLED_VERSION=$(node -v)
NPM_INSTALLED_VERSION=$(npm -v)

print_success "Node.js ${NODE_INSTALLED_VERSION} installed"
print_success "npm ${NPM_INSTALLED_VERSION} installed"

# ========================================================================
# Step 5: Configure Camera (Raspberry Pi only)
# ========================================================================

if [ "$IS_RASPBERRY_PI" = true ]; then
    print_header "Step 5: Configuring Camera"

    # Enable camera interface if not already enabled
    if ! grep -q "^start_x=1" /boot/config.txt 2>/dev/null && ! grep -q "^camera_auto_detect=1" /boot/config.txt 2>/dev/null; then
        print_info "Camera interface may need to be enabled"
        print_warning "Please run 'sudo raspi-config' and enable the camera under 'Interface Options'"
    else
        print_success "Camera interface appears to be enabled"
    fi

    # Add user to video group for camera access
    print_info "Adding user '$(whoami)' to 'video' group for camera access..."
    sudo usermod -a -G video "$(whoami)"

    print_success "Camera configuration complete"
    print_warning "You may need to reboot for camera permissions to take effect"
else
    print_header "Step 5: Configuring Camera"
    print_warning "Not running on Raspberry Pi - skipping camera configuration"
fi

# ========================================================================
# Step 6: Install Project Dependencies
# ========================================================================

print_header "Step 6: Installing Project Dependencies"

# Check if we're in the project directory
if [ -f "package.json" ]; then
    print_info "Installing npm packages..."
    npm install
    print_success "Project dependencies installed"
else
    print_warning "No package.json found in current directory"
    print_info "Run 'npm install' from the project directory after cloning"
fi

# ========================================================================
# Step 7: Verify Installation
# ========================================================================

print_header "Step 7: Verifying Installation"

# Verify Node.js
if command -v node &> /dev/null; then
    print_success "Node.js: $(node -v)"
else
    print_error "Node.js not found"
fi

# Verify npm
if command -v npm &> /dev/null; then
    print_success "npm: $(npm -v)"
else
    print_error "npm not found"
fi

# Verify NVM
if [ -s "$NVM_DIR/nvm.sh" ]; then
    print_success "NVM: installed at $NVM_DIR"
else
    print_error "NVM not found"
fi

# Verify camera utilities (Raspberry Pi only)
if [ "$IS_RASPBERRY_PI" = true ]; then
    if command -v vcgencmd &> /dev/null; then
        print_success "vcgencmd: available"
    else
        print_warning "vcgencmd: not found (may not be in PATH)"
    fi

    if command -v rpicam-still &> /dev/null; then
        print_success "rpicam-still: available"
    else
        print_warning "rpicam-still: not found"
    fi

    if command -v libcamera-hello &> /dev/null; then
        print_success "libcamera-hello: available"
    else
        print_warning "libcamera-hello: not found"
    fi
fi

# ========================================================================
# Step 8: Next Steps
# ========================================================================

print_header "Installation Complete!"

echo -e "\n${GREEN}✓ All prerequisites have been installed successfully!${NC}\n"

print_info "Next steps:"
echo "  1. Clone the project repository (if not already done):"
echo "     git clone <repository-url>"
echo ""
echo "  2. Navigate to the project directory:"
echo "     cd parking-pulse-pi-status-edge-svc"
echo ""
echo "  3. Run the deployment script:"
echo "     ./deploy.sh <pi-id> <server-url>"
echo "     Example: ./deploy.sh blue-gate-pi http://192.168.1.112:3000"
echo ""
echo "  4. Or use the device-specific scripts:"
echo "     ./deploy-blue-gate.sh  # For Blue Gate Pi"
echo "     ./deploy-pink-gate.sh  # For Pink Gate Pi"
echo ""

if [ "$IS_RASPBERRY_PI" = true ]; then
    print_warning "IMPORTANT: You may need to reboot for camera permissions to take effect"
    echo ""
    read -p "Reboot now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Rebooting system..."
        sudo reboot
    else
        print_info "Please reboot manually when ready: sudo reboot"
    fi
fi

print_info "To activate NVM in new terminal sessions, run:"
echo "  source ~/.bashrc"
echo ""

print_success "Setup complete! 🎉"
