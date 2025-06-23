#!/bin/bash
set -e

# PgForge Installation Script for Ubuntu
# Usage: curl -fsSL https://raw.githubusercontent.com/xar/pgforge/main/install.sh | bash

PGFORGE_VERSION="0.1.0"
INSTALL_DIR="/usr/local/bin"
BUN_VERSION="1.0.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    print_info "Checking system requirements..."
    
    # Check if running on Ubuntu/Debian
    if ! command -v apt &> /dev/null; then
        print_error "This installer requires apt package manager (Ubuntu/Debian)"
        exit 1
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            BUN_ARCH="x64"
            ;;
        aarch64|arm64)
            BUN_ARCH="aarch64"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
    
    print_success "System requirements met"
}

install_dependencies() {
    print_info "Installing system dependencies..."
    
    # Update package list
    sudo apt update
    
    # Install required packages
    sudo apt install -y \
        curl \
        unzip \
        ca-certificates \
        gnupg \
        lsb-release
    
    print_success "System dependencies installed"
}

install_bun() {
    print_info "Installing Bun runtime..."
    
    # Check if Bun is already installed
    if command -v bun &> /dev/null; then
        BUN_CURRENT=$(bun --version)
        print_info "Bun $BUN_CURRENT is already installed"
        return 0
    fi
    
    # Install Bun
    curl -fsSL https://bun.sh/install | bash
    
    # Add Bun to PATH for current session
    export PATH="$HOME/.bun/bin:$PATH"
    
    # Verify installation
    if command -v bun &> /dev/null; then
        BUN_INSTALLED=$(bun --version)
        print_success "Bun $BUN_INSTALLED installed successfully"
    else
        print_error "Failed to install Bun"
        exit 1
    fi
}

check_postgresql_version() {
    local version="$1"
    local min_version="15.3"
    
    # Compare versions using sort -V
    if [[ "$(printf '%s\n' "$min_version" "$version" | sort -V | head -n1)" = "$min_version" ]]; then
        return 0  # Version is >= 15.3
    else
        return 1  # Version is < 15.3
    fi
}

install_postgresql() {
    print_info "Installing PostgreSQL..."
    
    # Check if PostgreSQL is already installed
    if command -v postgres &> /dev/null; then
        PG_VERSION=$(postgres --version | cut -d' ' -f3)
        print_info "PostgreSQL $PG_VERSION is already installed"
        
        # Check if version meets minimum requirements
        if check_postgresql_version "$PG_VERSION"; then
            print_success "PostgreSQL version meets minimum requirements (15.3+)"
        else
            print_warning "PostgreSQL $PG_VERSION is below minimum required version 15.3"
            print_info "Installing PostgreSQL 15 from official repository..."
            install_postgresql_15
        fi
        return 0
    fi
    
    # Install PostgreSQL 15+ from official repository
    install_postgresql_15
}

install_postgresql_15() {
    print_info "Adding PostgreSQL official APT repository..."
    
    # Install required packages for repository setup
    sudo apt update
    sudo apt install -y wget ca-certificates
    
    # Add PostgreSQL signing key
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
    
    # Add PostgreSQL APT repository
    RELEASE=$(lsb_release -cs)
    echo "deb http://apt.postgresql.org/pub/repos/apt/ ${RELEASE}-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
    
    # Update package list
    sudo apt update
    
    # Install PostgreSQL 15 and contrib packages
    sudo apt install -y \
        postgresql-15 \
        postgresql-contrib-15 \
        postgresql-client-15 \
        postgresql-15-dev
    
    # Update alternatives to make pg 15 default
    sudo update-alternatives --install /usr/bin/postgres postgres /usr/lib/postgresql/15/bin/postgres 150
    sudo update-alternatives --install /usr/bin/psql psql /usr/lib/postgresql/15/bin/psql 150
    sudo update-alternatives --install /usr/bin/pg_dump pg_dump /usr/lib/postgresql/15/bin/pg_dump 150
    sudo update-alternatives --install /usr/bin/pg_restore pg_restore /usr/lib/postgresql/15/bin/pg_restore 150
    sudo update-alternatives --install /usr/bin/initdb initdb /usr/lib/postgresql/15/bin/initdb 150
    
    # Verify installation
    if command -v postgres &> /dev/null; then
        PG_VERSION=$(postgres --version | cut -d' ' -f3)
        if check_postgresql_version "$PG_VERSION"; then
            print_success "PostgreSQL $PG_VERSION installed successfully (meets minimum requirements)"
        else
            print_error "Installed PostgreSQL $PG_VERSION but still below minimum version"
            exit 1
        fi
    else
        print_error "Failed to install PostgreSQL"
        exit 1
    fi
    
    # Stop default PostgreSQL service (we'll manage instances manually)
    sudo systemctl stop postgresql || true
    sudo systemctl disable postgresql || true
    
    print_info "Default PostgreSQL service disabled (PgForge will manage instances)"
}

download_pgforge() {
    print_info "Downloading PgForge..."
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Download the latest release or build from source
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        # If we have GitHub token, try to download from releases
        print_info "Attempting to download from GitHub releases..."
        curl -L -H "Authorization: token $GITHUB_TOKEN" \
             -o pgforge.tar.gz \
             "https://api.github.com/repos/xar/pgforge/tarball/main" || {
            print_warning "Failed to download from releases, building from source..."
            download_and_build_source
        }
    else
        download_and_build_source
    fi
}

download_and_build_source() {
    print_info "Building PgForge from source..."
    
    # Download source code
    curl -L -o pgforge.tar.gz \
         "https://github.com/xar/pgforge/archive/main.tar.gz"
    
    # Extract
    tar -xzf pgforge.tar.gz
    cd pgforge-main
    
    # Install dependencies
    bun install
    
    # Build binary
    bun run build:binary
    
    # Move binary to temp location
    mv pgforge ../pgforge-binary
}

install_pgforge_binary() {
    print_info "Installing PgForge binary..."
    
    # Make sure we have the binary
    if [[ ! -f "pgforge-binary" ]]; then
        print_error "PgForge binary not found"
        exit 1
    fi
    
    # Make binary executable
    chmod +x pgforge-binary
    
    # Install to system location
    sudo mv pgforge-binary "$INSTALL_DIR/pgforge"
    
    # Verify installation
    if command -v pgforge &> /dev/null; then
        PGFORGE_VERSION_INSTALLED=$(pgforge --version)
        print_success "PgForge installed successfully: $PGFORGE_VERSION_INSTALLED"
    else
        print_error "Failed to install PgForge binary"
        exit 1
    fi
}

setup_directories() {
    print_info "Setting up PgForge directories..."
    
    # Create system directories with proper permissions
    sudo mkdir -p /var/lib/postgresql/pgforge
    sudo mkdir -p /var/log/postgresql/pgforge
    sudo mkdir -p /var/backups/postgresql/pgforge
    
    # Set ownership to current user (for development) or postgres user (for production)
    if [[ "$EUID" -eq 0 ]]; then
        # Running as root, use postgres user
        sudo chown -R postgres:postgres /var/lib/postgresql/pgforge
        sudo chown -R postgres:postgres /var/log/postgresql/pgforge
        sudo chown -R postgres:postgres /var/backups/postgresql/pgforge
    else
        # Running as regular user, make directories accessible
        sudo chown -R $USER:$USER /var/lib/postgresql/pgforge
        sudo chown -R $USER:$USER /var/log/postgresql/pgforge
        sudo chown -R $USER:$USER /var/backups/postgresql/pgforge
    fi
    
    print_success "Directories created and configured"
}

initialize_pgforge() {
    print_info "Initializing PgForge..."
    
    # Initialize PgForge configuration
    pgforge init
    
    print_success "PgForge initialized"
}

cleanup() {
    print_info "Cleaning up temporary files..."
    
    # Remove temporary directory
    if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
    
    print_success "Cleanup completed"
}

print_completion_message() {
    echo ""
    echo "🎉 PgForge installation completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Create your first PostgreSQL instance:"
    echo "     pgforge create mydb"
    echo ""
    echo "  2. Start the instance:"
    echo "     pgforge start mydb"
    echo ""
    echo "  3. Connect to your database:"
    echo "     pgforge connection-string mydb"
    echo ""
    echo "For more information, run: pgforge --help"
    echo ""
    echo "Documentation: https://github.com/xar/pgforge"
    echo ""
}

main() {
    echo "🔨 PgForge Installer v$PGFORGE_VERSION"
    echo "Installing PgForge PostgreSQL Instance Manager..."
    echo ""
    
    check_requirements
    install_dependencies
    install_bun
    install_postgresql
    download_pgforge
    install_pgforge_binary
    setup_directories
    initialize_pgforge
    cleanup
    print_completion_message
}

# Run main function
main "$@"