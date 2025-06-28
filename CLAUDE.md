# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PgForge is a modern, cross-platform CLI tool built with Bun that simplifies the creation, management, and orchestration of multiple PostgreSQL instances. The project is a fully-featured application with a complete command structure, modular architecture, and comprehensive testing.

## Development Commands

### Running the Application
```bash
# Install dependencies
bun install

# Run the main application
bun run start
# or
bun run index.ts

# Run with hot reload during development
bun run dev
# or
bun run --watch index.ts
```

### Testing
```bash
# Run all tests
bun test

# Run tests with watch mode
bun test --watch

# Run tests with coverage
bun test --coverage

# Run type checking
bun run typecheck
```

### Building
```bash
# Build for production
bun run build

# Build standalone binary
bun run build:binary
```

## Architecture

### Current Structure
- `index.ts` - Main CLI entry point with full command structure using Commander.js
- `src/` - Core application modules
  - `config/` - Configuration management and types
  - `instance/` - PostgreSQL instance management
  - `utils/` - Utility functions (validation, system checks, display)
- `ai/specification.md` - Comprehensive specification document
- `TESTING.md` - Testing guide and procedures

### Technology Stack
- **Runtime**: Bun (fast JavaScript runtime, package manager, and bundler)
- **Language**: TypeScript with modern ES features and strict type checking
- **CLI Framework**: Commander.js for command parsing and structure
- **UI Libraries**: Chalk (colors), Ora (spinners), YAML parsing
- **Target**: Cross-platform CLI tool (Linux, macOS)
- **Output**: Standalone binary executable

### Key Design Principles
- **Instance-First**: Manage PostgreSQL instances, not just versions
- **Configuration as Code**: YAML-based declarative configuration
- **Security by Default**: SSL, secure defaults, proper validation
- **Developer Experience**: Rich CLI with colors, spinners, helpful error messages
- **Modular Architecture**: Clean separation of concerns across modules

## Code Architecture

### Command Structure
The CLI is built with Commander.js providing these main commands:
- `create` - Create new PostgreSQL instances with templates
- `list/ls` - List instances with filtering and formatting options
- `start/stop/restart` - Instance lifecycle management
- `show/describe` - Display detailed instance information
- `remove/rm` - Remove instances with backup options
- `status` - Show system and instance status
- `connection-string` - Get connection information in various formats
- `init` - Initialize PgForge configuration
- `check` - System requirements validation

### Core Modules

#### Configuration Management (`src/config/`)
- `types.ts` - TypeScript interfaces for configuration schema
- `manager.ts` - Configuration file management and validation
- Handles global config and per-instance YAML configurations

#### Instance Management (`src/instance/`)
- `manager.ts` - Core instance lifecycle operations
- Handles creation, starting/stopping, status checking
- Integrates with system commands and PostgreSQL binaries

#### Utilities (`src/utils/`)
- `validation.ts` - Input validation functions (names, ports, configs)
- `system.ts` - System requirements checking and PostgreSQL detection
- `display.ts` - Formatted output for tables, JSON, YAML

### Testing Strategy
- Uses Bun's built-in testing framework
- Test files located alongside source (`.test.ts` files)
- Current coverage includes validation, system checks, and type definitions
- See `TESTING.md` for detailed testing procedures

### Development Workflow
1. **Make changes** to source files in `src/`
2. **Run tests** with `bun test --watch` during development
3. **Test CLI commands** with `bun run dev <command>`
4. **Type check** with `bun run typecheck`
5. **Build binary** with `bun run build:binary` for testing

### Configuration System
- Global config: `~/.pgforge/config.yaml`
- Instance configs: `~/.pgforge/instances/<name>.yaml`
- Templates system for development, production, testing scenarios
- YAML validation with proper error reporting

### Error Handling
- Comprehensive input validation with helpful error messages
- System requirement checking before operations
- Graceful failure handling with appropriate exit codes
- User-friendly error display with Chalk formatting