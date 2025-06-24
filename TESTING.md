# Testing Guide

This document describes the testing setup and procedures for PgForge.

## Testing Framework

PgForge uses Bun's built-in testing framework which provides:
- Fast test execution
- TypeScript support out of the box
- Code coverage reporting
- Watch mode for development

## Running Tests

### Basic Test Commands

```bash
# Run all tests
bun test

# Run tests in watch mode (re-runs on file changes)
bun test --watch

# Run tests with coverage report
bun test --coverage

# Run type checking
bun run typecheck
```

### Development Workflow

1. **During development**: Use `bun test --watch` to automatically run tests as you code
2. **Before committing**: Run `bun test` and `bun run typecheck` to ensure all tests pass
3. **For coverage**: Use `bun test --coverage` to see test coverage metrics

## Test Structure

Tests are located alongside the source files with the `.test.ts` extension:

```
src/
├── config/
│   ├── types.ts
│   └── types.test.ts
├── utils/
│   ├── validation.ts
│   ├── validation.test.ts
│   ├── system.ts
│   └── system.test.ts
└── instance/
    ├── manager.ts
    └── manager.test.ts (to be added)
```

## Current Test Coverage

### ✅ Implemented Tests

- **Validation Functions** (`src/utils/validation.test.ts`)
  - Instance name validation
  - Port number validation
  - Network address validation
  - Database/user name validation
  - Encoding validation
  - Memory size validation
  - Complete configuration validation
  - Port availability checking

- **System Requirements** (`src/utils/system.test.ts`)
  - System requirement definitions
  - Command validation
  - Version requirement checking

- **Configuration Types** (`src/config/types.test.ts`)
  - TypeScript interface validation
  - Enum constraint testing
  - Configuration structure validation

### 🔄 Future Test Areas

- Instance manager operations
- Configuration file parsing
- CLI command integration
- Error handling scenarios
- System integration tests

## Continuous Integration

The project includes a GitHub Actions workflow that runs:

1. **Test Suite**: All unit and integration tests
2. **Type Checking**: TypeScript compilation validation
3. **Build Verification**: Ensures the application builds successfully
4. **Binary Creation**: Tests binary compilation

To set up CI/CD, copy the workflow file:
```bash
cp .github-workflows-ci.yml .github/workflows/ci.yml
```

## Adding New Tests

### 1. Unit Tests
Create `.test.ts` files alongside your source files:

```typescript
import { describe, test, expect } from 'bun:test';
import { yourFunction } from './your-module.js';

describe('Your Module', () => {
  test('should do something', () => {
    expect(yourFunction('input')).toBe('expected');
  });
});
```

### 2. Integration Tests
For testing CLI commands and system interactions:

```typescript
import { describe, test, expect } from 'bun:test';
import { spawn } from 'child_process';

describe('CLI Integration', () => {
  test('should show help', async () => {
    // Test CLI command execution
  });
});
```

## Best Practices

1. **Test Structure**: Use descriptive `describe` blocks and `test` names
2. **Assertions**: Use specific assertions (`toBe`, `toEqual`, `toContain`, etc.)
3. **Edge Cases**: Test both success and failure scenarios
4. **Isolation**: Each test should be independent and not rely on other tests
5. **Mock External Dependencies**: Use mocks for file system, network calls, etc.

## Test Configuration

The test configuration is minimal since Bun handles most setup automatically:

- **Test Files**: `**/*.test.ts`
- **Module Resolution**: Uses the same TypeScript configuration as the main project
- **Import/Export**: ES modules with `.js` extensions in imports (for compatibility)

## Performance

Bun's test runner is extremely fast:
- Typically runs all tests in under 100ms
- Supports parallel test execution
- Hot reloading in watch mode

## Debugging Tests

To debug failing tests:

1. **Verbose Output**: Add `console.log` statements
2. **Isolated Testing**: Run specific test files
3. **Watch Mode**: Use `--watch` to quickly iterate
4. **Type Checking**: Run `bun run typecheck` for TypeScript errors