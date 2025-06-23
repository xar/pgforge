# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PgForge is a modern, cross-platform CLI tool built with Bun that simplifies the creation, management, and orchestration of multiple PostgreSQL instances. The project is in early development, currently containing only a basic "Hello via Bun!" example in the main entry point.

## Development Commands

### Running the Application
```bash
# Install dependencies
bun install

# Run the main application
bun run index.ts

# Run with hot reload during development
bun run --watch index.ts
```

### Testing
```bash
# Run tests (when test files are created)
bun test

# Run tests with watch mode
bun test --watch
```

### Building
```bash
# Build for production (when build configuration is set up)
bun build index.ts --outdir ./dist

# Build as standalone executable (when configured)
bun build index.ts --compile --outfile pgforge
```

## Architecture

### Current Structure
- `index.ts` - Main entry point (currently a simple "Hello via Bun!" example)
- `ai/specification.md` - Comprehensive specification document outlining the full vision for PgForge
- `package.json` - Minimal configuration with Bun TypeScript setup
- `tsconfig.json` - TypeScript configuration optimized for Bun runtime

### Technology Stack
- **Runtime**: Bun (fast JavaScript runtime, package manager, and bundler)
- **Language**: TypeScript with modern ES features
- **Target**: Cross-platform CLI tool (Linux, macOS)
- **Output**: Standalone binary executable

### Key Design Principles
Based on the specification document, PgForge follows these principles:
- **Instance-First**: Manage PostgreSQL instances, not just versions
- **Configuration as Code**: YAML-based declarative configuration
- **Security by Default**: Automated SSL, secure defaults, audit logging
- **Developer Experience**: Interactive setup, rich CLI interface
- **Production Ready**: Backup automation, monitoring, log management

## Development Notes

### Project Status
This is a very early-stage project. The current codebase contains only a basic example, but the `ai/specification.md` file contains a comprehensive vision for a full-featured PostgreSQL instance management tool.

### TypeScript Configuration
The project uses modern TypeScript settings optimized for Bun:
- ES modules with bundler resolution
- Strict type checking enabled
- No emit (Bun handles compilation)
- Modern lib targeting (ESNext)

### Future Implementation Areas
According to the specification, the main areas to be implemented include:
- CLI command structure with subcommands (create, start, stop, list, etc.)
- YAML configuration schema for PostgreSQL instances
- Instance lifecycle management
- Backup and recovery systems
- Monitoring and health checks
- Security features (SSL, authentication, audit logging)
- Template system for different deployment scenarios