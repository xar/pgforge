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

### Installation

#### Ubuntu/Debian (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/xar/pgforge/main/install.sh | bash
```

#### Manual Installation
1. Install [Bun](https://bun.sh) runtime
2. Install PostgreSQL
3. Clone this repository
4. Run `bun install && bun run build:binary`
5. Move the `pgforge` binary to your PATH

### Usage

```bash
# Initialize PgForge
pgforge init

# Create your first instance
pgforge create mydb

# Start the instance
pgforge start mydb

# List all instances
pgforge list

# Show instance details
pgforge show mydb

# Get connection info
pgforge connection-string mydb

# Stop the instance
pgforge stop mydb
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

### Prerequisites
- [Bun](https://bun.sh) 1.0+
- PostgreSQL 13+
- Ubuntu 18.04+ / macOS 12+

### Setup
```bash
# Clone the repository
git clone https://github.com/xar/pgforge.git
cd pgforge

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build standalone binary
bun run build:binary
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

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/xar/pgforge/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xar/pgforge/discussions)
- **Documentation**: [Full Specification](ai/specification.md)

---

Built with ❤️ using [Bun](https://bun.sh) and TypeScript
