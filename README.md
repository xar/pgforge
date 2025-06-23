# PgForge - PostgreSQL Instance Manager

**Tagline**: "Forge your PostgreSQL instances with precision"

PgForge is a modern, cross-platform CLI tool built with Bun that simplifies the creation, management, and orchestration of multiple PostgreSQL instances on a single machine.

## ✨ Features

- **Instance-First Approach**: Manage multiple PostgreSQL instances, not just versions
- **YAML Configuration**: Declarative configuration as code
- **Templates**: Pre-built templates for development, production, and testing
- **Process Management**: Start, stop, restart instances with ease
- **Built-in Validation**: Configuration validation and error checking
- **Modern CLI**: Rich, colorful interface with progress indicators

## 🚀 Quick Start

### Prerequisites

Before installing PgForge, ensure you have PostgreSQL installed on your system:

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

#### macOS
```bash
# Using Homebrew
brew install postgresql@15
brew services start postgresql@15

# Or using PostgreSQL.app
# Download from https://postgresapp.com/
```

### Installation

#### Download Pre-built Binary (Recommended)

1. **Download the appropriate binary** from the [latest release](https://github.com/xar/pgforge/releases/latest):
   - **Linux (x64)**: `pgforge-linux-x64`
   - **macOS (Intel)**: `pgforge-darwin-x64`  
   - **macOS (Apple Silicon)**: `pgforge-darwin-arm64`

2. **Make it executable and install**:
   ```bash
   # For Linux
   chmod +x pgforge-linux-x64
   sudo mv pgforge-linux-x64 /usr/local/bin/pgforge
   
   # For macOS (Intel)
   chmod +x pgforge-darwin-x64
   sudo mv pgforge-darwin-x64 /usr/local/bin/pgforge
   
   # For macOS (Apple Silicon)
   chmod +x pgforge-darwin-arm64
   sudo mv pgforge-darwin-arm64 /usr/local/bin/pgforge
   ```

3. **Verify installation**:
   ```bash
   pgforge --version
   ```

#### Alternative: Install Script (Coming Soon)
```bash
curl -fsSL https://raw.githubusercontent.com/xar/pgforge/main/install.sh | bash
```

### Getting Started

After installation, follow these steps to create your first PostgreSQL instance:

#### 1. Initialize PgForge
```bash
pgforge init
```
This creates the configuration directory (`~/.pgforge/`) and sets up default templates.

#### 2. Create Your First Instance
```bash
# Create a basic development instance
pgforge create mydb

# Or use a template for specific use cases
pgforge create devdb --template development
pgforge create proddb --template production
```

#### 3. Start and Use Your Instance
```bash
# Start the instance
pgforge start mydb

# Get connection information
pgforge connection-string mydb
# Output: postgresql://postgres@localhost:5432/mydb

# Connect using psql
psql $(pgforge connection-string mydb)
```

#### 4. Manage Your Instances
```bash
# List all instances
pgforge list

# Show detailed instance information
pgforge show mydb

# Stop an instance
pgforge stop mydb

# Restart an instance
pgforge restart mydb
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `pgforge init` | Initialize PgForge configuration |
| `pgforge create <name>` | Create a new PostgreSQL instance |
| `pgforge list` | List all instances |
| `pgforge start <name>` | Start an instance |
| `pgforge stop <name>` | Stop an instance |
| `pgforge restart <name>` | Restart an instance |
| `pgforge show <name>` | Show instance details |
| `pgforge remove <name>` | Remove an instance |
| `pgforge status [name]` | Show status information |
| `pgforge connection-string <name>` | Get connection information |

## 🎯 Templates

Use templates to quickly create instances with predefined configurations:

```bash
# Development instance (minimal security, no backups)
pgforge create devdb --template development

# Production instance (SSL, backups, optimized settings)
pgforge create proddb --template production

# Testing instance (lightweight, no persistence)
pgforge create testdb --template testing
```

## ⚙️ Configuration

PgForge uses YAML configuration files stored in `~/.pgforge/`:

- `~/.pgforge/config.yaml` - Global configuration
- `~/.pgforge/instances/*.yaml` - Instance configurations

### Example Instance Configuration

```yaml
apiVersion: v1
kind: PostgreSQLInstance
metadata:
  name: myapp-db
  labels:
    environment: production
spec:
  version: "15.3"
  network:
    port: 5433
    bindAddress: "127.0.0.1"
    maxConnections: 200
  storage:
    dataDirectory: "/var/lib/postgresql/pgforge/myapp-db"
    logDirectory: "/var/log/postgresql/pgforge/myapp-db"
  database:
    name: myapp_production
    owner: myapp_user
    encoding: UTF8
  security:
    ssl:
      enabled: true
    authentication:
      method: md5
      allowedHosts:
        - "127.0.0.1/32"
```

## 🛠️ Development

> **Note**: This section is for contributors who want to build PgForge from source. End users should use the [pre-built binaries](#installation) instead.

### Prerequisites for Development
- [Bun](https://bun.sh) 1.0+
- PostgreSQL 13+
- Ubuntu 18.04+ / macOS 12+

### Development Setup
```bash
# Clone the repository
git clone https://github.com/xar/pgforge.git
cd pgforge

# Install dependencies
bun install

# Run in development mode
bun run --watch index.ts

# Build standalone binary
bun build index.ts --compile --outfile pgforge
```

### Project Structure
```
pgforge/
├── src/
│   ├── config/          # Configuration management
│   ├── instance/        # Instance management
│   └── utils/           # Utilities and helpers
├── ai/
│   └── specification.md # Full project specification
├── index.ts             # Main CLI entry point
└── install.sh           # Ubuntu installation script
```

## 🗺️ Roadmap

This is the **first version (v0.1.0)** focusing on core functionality:

### ✅ Phase 1 - Core Foundation (v0.1.0)
- Basic instance creation and management
- YAML configuration schema
- Start/stop/restart operations
- Template system
- Installation scripts

### 🔄 Phase 2 - Enhanced Features (v0.2.0)
- Advanced monitoring and health checks
- Backup and recovery system
- Performance auto-tuning
- CLI improvements and UX enhancements

### 🚀 Phase 3 - Enterprise Features (v0.3.0+)
- Replication and clustering
- Advanced security features
- API and webhook support
- CI/CD integrations

## 🤝 Contributing

We welcome contributions! Please see our [specification document](ai/specification.md) for the full vision and roadmap.

## 📄 License

MIT License - see LICENSE file for details.

## 🔧 Troubleshooting

### Common Issues

#### PostgreSQL Not Found
If you get "PostgreSQL not found" errors:
```bash
# Check if PostgreSQL is installed
which psql

# Ubuntu/Debian: Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# macOS: Install via Homebrew
brew install postgresql@15
```

#### Permission Denied
If you get permission errors:
```bash
# Make sure the binary is executable
chmod +x /usr/local/bin/pgforge

# Check if /usr/local/bin is in your PATH
echo $PATH
```

#### Port Already in Use
If the default port (5432) is already in use:
```bash
# Create instance with custom port
pgforge create mydb --port 5433

# Or edit the instance configuration
pgforge show mydb --config
```

### Uninstalling

To completely remove PgForge:
```bash
# Stop all instances
pgforge list --format json | jq -r '.[].name' | xargs -I {} pgforge stop {}

# Remove binary
sudo rm /usr/local/bin/pgforge

# Remove configuration (optional - this deletes all your instance configs)
rm -rf ~/.pgforge
```

## 🆘 Support

- **Issues**: [Report bugs or request features](https://github.com/xar/pgforge/issues)
- **Discussions**: [Community discussions and Q&A](https://github.com/xar/pgforge/discussions)
- **Documentation**: [Full project specification](ai/specification.md)

### Getting Help

When reporting issues, please include:
- Your operating system and version
- PgForge version (`pgforge --version`)
- PostgreSQL version (`psql --version`)
- Full error message or command output

---

Built with ❤️ using [Bun](https://bun.sh) and TypeScript
