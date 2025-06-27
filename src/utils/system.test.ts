import { describe, test, expect } from 'bun:test';
import { SYSTEM_REQUIREMENTS, getUserDirectories } from './system.js';
import { homedir } from 'os';
import { join } from 'path';

describe('System Requirements', () => {
  test('should define required PostgreSQL components', () => {
    const requiredComponents = [
      'PostgreSQL Server',
      'PostgreSQL Client', 
      'pg_dump',
      'pg_restore',
      'initdb'
    ];

    for (const component of requiredComponents) {
      const requirement = SYSTEM_REQUIREMENTS.find(req => req.name === component);
      expect(requirement).toBeDefined();
      expect(requirement?.required).toBe(true);
    }
  });

  test('should have valid command names', () => {
    for (const req of SYSTEM_REQUIREMENTS) {
      expect(req.command).toBeTruthy();
      expect(typeof req.command).toBe('string');
      expect(req.command.length).toBeGreaterThan(0);
    }
  });

  test('should have descriptions for all requirements', () => {
    for (const req of SYSTEM_REQUIREMENTS) {
      expect(req.description).toBeTruthy();
      expect(typeof req.description).toBe('string');
      expect(req.description.length).toBeGreaterThan(0);
    }
  });

  test('should specify minimum version for PostgreSQL Server', () => {
    const postgresReq = SYSTEM_REQUIREMENTS.find(req => req.name === 'PostgreSQL Server');
    expect(postgresReq?.minVersion).toBeTruthy();
    expect(postgresReq?.minVersion).toBe('17.0');
  });
});

describe('User Directories', () => {
  test('should return user-local directories following XDG spec', () => {
    const dirs = getUserDirectories();
    
    // Test that all required directory properties are present
    expect(dirs.dataRoot).toBeDefined();
    expect(dirs.logRoot).toBeDefined(); 
    expect(dirs.backupRoot).toBeDefined();
    
    // Test that directories are under user home (when XDG_DATA_HOME is not set)
    const originalXdgDataHome = process.env.XDG_DATA_HOME;
    delete process.env.XDG_DATA_HOME;
    
    const dirsDefault = getUserDirectories();
    expect(dirsDefault.dataRoot).toContain(homedir());
    expect(dirsDefault.dataRoot).toContain('.local/share/pgforge');
    expect(dirsDefault.logRoot).toBe(join(dirsDefault.dataRoot, 'logs'));
    expect(dirsDefault.backupRoot).toBe(join(dirsDefault.dataRoot, 'backups'));
    
    // Restore original XDG_DATA_HOME
    if (originalXdgDataHome) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }
  });
  
  test('should respect XDG_DATA_HOME environment variable', () => {
    const originalXdgDataHome = process.env.XDG_DATA_HOME;
    const testXdgDataHome = '/tmp/test-xdg';
    
    process.env.XDG_DATA_HOME = testXdgDataHome;
    
    const dirs = getUserDirectories();
    expect(dirs.dataRoot).toBe(join(testXdgDataHome, 'pgforge'));
    expect(dirs.logRoot).toBe(join(testXdgDataHome, 'pgforge', 'logs'));
    expect(dirs.backupRoot).toBe(join(testXdgDataHome, 'pgforge', 'backups'));
    
    // Restore original XDG_DATA_HOME
    if (originalXdgDataHome) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }
  });
});