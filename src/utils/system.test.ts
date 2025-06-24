import { describe, test, expect } from 'bun:test';
import { SYSTEM_REQUIREMENTS } from './system.js';

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
    expect(postgresReq?.minVersion).toBe('15.3');
  });
});