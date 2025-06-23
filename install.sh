#!/bin/bash
set -e

# PgForge Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/xar/pgforge.dev/main/install.sh | bash
# Update: curl -fsSL https://raw.githubusercontent.com/xar/pgforge.dev/main/install.sh | bash -s -- --update

REPO="xar/pgforge.dev"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="pgforge"
GITHUB_API="https://api.github.com/repos/$REPO"

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

detect_platform() {
    local platform
    case "$(uname -s)" in
        Linux*)     platform=linux;;
        Darwin*)    platform=darwin;;
        *)          
            print_error "Unsupported platform: $(uname -s)"
            exit 1
            ;;
    esac
    echo "$platform"
}

detect_arch() {
    local arch
    case "$(uname -m)" in
        x86_64)     arch=x64;;
        aarch64|arm64) arch=arm64;;
        *)          
            print_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac
    echo "$arch"
}

get_latest_release() {
    print_info "Fetching latest release information..."
    
    local release_data
    if command -v curl >/dev/null 2>&1; then
        release_data=$(curl -s "$GITHUB_API/releases/latest" 2>/dev/null)
    elif command -v wget >/dev/null 2>&1; then
        release_data=$(wget -qO- "$GITHUB_API/releases/latest" 2>/dev/null)
    else
        print_error "Neither curl nor wget is available. Please install one of them."
        exit 1
    fi
    
    if [ -z "$release_data" ]; then
        print_error "Failed to fetch release information"
        exit 1
    fi
    
    # Extract tag name (version)
    local version
    version=$(echo "$release_data" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | head -n1)
    
    if [ -z "$version" ]; then
        print_error "Could not determine latest version"
        exit 1
    fi
    
    echo "$version"
}

get_current_version() {
    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        "$BINARY_NAME" --version 2>/dev/null | head -n1 | awk '{print $NF}' || echo ""
    else
        echo ""
    fi
}

version_compare() {
    local version1="$1"
    local version2="$2"
    
    # Remove 'v' prefix if present
    version1=$(echo "$version1" | sed 's/^v//')
    version2=$(echo "$version2" | sed 's/^v//')
    
    if [ "$version1" = "$version2" ]; then
        return 0  # Equal
    fi
    
    # Use sort -V for version comparison
    if printf '%s\n%s' "$version1" "$version2" | sort -V -C 2>/dev/null; then
        return 1  # version1 < version2
    else
        return 2  # version1 > version2
    fi
}

download_binary() {
    local version="$1"
    local platform="$2"
    local arch="$3"
    
    print_info "Downloading PgForge $version for $platform-$arch..."
    
    # Construct download URL - adjust this based on your release naming convention
    local binary_name="${BINARY_NAME}-${platform}-${arch}"
    if [ "$platform" = "darwin" ]; then
        binary_name="${BINARY_NAME}-macos-${arch}"
    fi
    
    local download_url="https://github.com/$REPO/releases/download/$version/$binary_name"
    
    # Create temporary directory
    local temp_dir
    temp_dir=$(mktemp -d)
    local temp_file="$temp_dir/$BINARY_NAME"
    
    print_info "Downloading from: $download_url"
    
    if command -v curl >/dev/null 2>&1; then
        if ! curl -L -o "$temp_file" "$download_url" 2>/dev/null; then
            print_error "Failed to download binary from GitHub releases"
            rm -rf "$temp_dir"
            exit 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        if ! wget -O "$temp_file" "$download_url" 2>/dev/null; then
            print_error "Failed to download binary from GitHub releases"
            rm -rf "$temp_dir"
            exit 1
        fi
    fi
    
    # Verify download
    if [ ! -f "$temp_file" ] || [ ! -s "$temp_file" ]; then
        print_error "Downloaded file is empty or missing"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    echo "$temp_file"
}

install_binary() {
    local temp_file="$1"
    local is_update="$2"
    
    if [ "$is_update" = "true" ]; then
        print_info "Updating PgForge binary..."
    else
        print_info "Installing PgForge binary..."
    fi
    
    # Make binary executable
    chmod +x "$temp_file"
    
    # Check if we need sudo for installation
    local use_sudo=""
    if [ ! -w "$INSTALL_DIR" ]; then
        use_sudo="sudo"
        print_info "Administrator privileges required for installation to $INSTALL_DIR"
    fi
    
    # Install binary
    $use_sudo mv "$temp_file" "$INSTALL_DIR/$BINARY_NAME"
    
    # Verify installation
    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        local installed_version
        installed_version=$("$BINARY_NAME" --version 2>/dev/null | head -n1 | awk '{print $NF}' || echo "unknown")
        if [ "$is_update" = "true" ]; then
            print_success "PgForge updated successfully to version $installed_version"
        else
            print_success "PgForge installed successfully: $installed_version"
        fi
    else
        print_error "Installation verification failed"
        exit 1
    fi
}

check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        print_error "Neither curl nor wget is available"
        
        case "$(detect_platform)" in
            linux)
                print_info "On Ubuntu/Debian: sudo apt install curl"
                print_info "On RHEL/CentOS: sudo yum install curl"
                ;;
            darwin)
                print_info "On macOS: curl should be pre-installed, or install via Homebrew: brew install curl"
                ;;
        esac
        exit 1
    fi
    
    print_success "Dependencies satisfied"
}

show_usage() {
    echo "PgForge Installation Script"
    echo ""
    echo "Usage:"
    echo "  Install:  curl -fsSL https://raw.githubusercontent.com/xar/pgforge.dev/main/install.sh | bash"
    echo "  Update:   curl -fsSL https://raw.githubusercontent.com/xar/pgforge.dev/main/install.sh | bash -s -- --update"
    echo ""
    echo "Options:"
    echo "  --update    Update existing installation"
    echo "  --help      Show this help message"
    echo ""
}

print_completion_message() {
    local is_update="$1"
    local current_version="$2"
    
    echo ""
    if [ "$is_update" = "true" ]; then
        echo "🎉 PgForge updated successfully to $current_version!"
    else
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
    fi
    echo "For more information, run: pgforge --help"
    echo ""
    echo "Documentation: https://github.com/$REPO"
    echo ""
}

cleanup() {
    if [ -n "${temp_file:-}" ] && [ -f "$temp_file" ]; then
        rm -f "$temp_file"
    fi
}

main() {
    local is_update=false
    
    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --update)
                is_update=true
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $arg"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    if [ "$is_update" = "true" ]; then
        echo "🔄 PgForge Updater"
        echo "Updating PgForge PostgreSQL Instance Manager..."
    else
        echo "🔨 PgForge Installer"
        echo "Installing PgForge PostgreSQL Instance Manager..."
    fi
    echo ""
    
    check_dependencies
    
    local platform arch latest_version current_version
    platform=$(detect_platform)
    arch=$(detect_arch)
    latest_version=$(get_latest_release)
    current_version=$(get_current_version)
    
    print_info "Latest version: $latest_version"
    
    if [ "$is_update" = "true" ]; then
        if [ -z "$current_version" ]; then
            print_error "PgForge is not currently installed. Use install mode instead."
            exit 1
        fi
        
        print_info "Current version: $current_version"
        
        # Compare versions
        version_compare "$current_version" "$latest_version"
        case $? in
            0)
                print_success "PgForge is already up to date ($current_version)"
                exit 0
                ;;
            1)
                print_info "Update available: $current_version → $latest_version"
                ;;
            2)
                print_warning "Current version ($current_version) is newer than latest release ($latest_version)"
                print_info "Proceeding with installation of latest release..."
                ;;
        esac
    else
        if [ -n "$current_version" ]; then
            print_warning "PgForge is already installed (version $current_version)"
            print_info "Use --update flag to update to the latest version"
            exit 0
        fi
    fi
    
    local temp_file
    temp_file=$(download_binary "$latest_version" "$platform" "$arch")
    install_binary "$temp_file" "$is_update"
    print_completion_message "$is_update" "$latest_version"
}

# Run main function with all arguments
main "$@"