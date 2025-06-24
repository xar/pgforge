import { describe, test, expect } from 'bun:test';
import {
  isValidInstanceName,
  isValidPort,
  isValidBindAddress,
  isValidDatabaseName,
  isValidUserName,
  isValidEncoding,
  isValidMemorySize,
  validateInstanceConfig,
  validatePortAvailable,
  suggestAvailablePort
} from './validation.js';
import type { PostgreSQLInstanceConfig } from '../config/types.js';

describe('Instance Name Validation', () => {
  test('should accept valid instance names', () => {
    expect(isValidInstanceName('mydb')).toBe(true);
    expect(isValidInstanceName('my-db')).toBe(true);
    expect(isValidInstanceName('db1')).toBe(true);
    expect(isValidInstanceName('production-db-01')).toBe(true);
  });

  test('should reject invalid instance names', () => {
    expect(isValidInstanceName('MyDB')).toBe(false); // uppercase
    expect(isValidInstanceName('1db')).toBe(false); // starts with number
    expect(isValidInstanceName('-db')).toBe(false); // starts with hyphen
    expect(isValidInstanceName('db_test')).toBe(false); // underscore
    expect(isValidInstanceName('db.test')).toBe(false); // dot
    expect(isValidInstanceName('')).toBe(false); // empty
    expect(isValidInstanceName('a'.repeat(64))).toBe(false); // too long
  });
});

describe('Port Validation', () => {
  test('should accept valid ports', () => {
    expect(isValidPort(1024)).toBe(true);
    expect(isValidPort(5432)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });

  test('should reject invalid ports', () => {
    expect(isValidPort(80)).toBe(false); // too low
    expect(isValidPort(65536)).toBe(false); // too high
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(1.5)).toBe(false); // decimal
  });
});

describe('Bind Address Validation', () => {
  test('should accept valid bind addresses', () => {
    expect(isValidBindAddress('localhost')).toBe(true);
    expect(isValidBindAddress('*')).toBe(true);
    expect(isValidBindAddress('0.0.0.0')).toBe(true);
    expect(isValidBindAddress('127.0.0.1')).toBe(true);
    expect(isValidBindAddress('192.168.1.1')).toBe(true);
    expect(isValidBindAddress('::1')).toBe(true);
    expect(isValidBindAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
  });

  test('should reject invalid bind addresses', () => {
    expect(isValidBindAddress('256.1.1.1')).toBe(false); // invalid IPv4
    expect(isValidBindAddress('192.168.1')).toBe(false); // incomplete IPv4
    expect(isValidBindAddress('invalid-hostname')).toBe(false);
    expect(isValidBindAddress('')).toBe(false);
  });
});

describe('Database Name Validation', () => {
  test('should accept valid database names', () => {
    expect(isValidDatabaseName('mydb')).toBe(true);
    expect(isValidDatabaseName('my_db')).toBe(true);
    expect(isValidDatabaseName('MyDB')).toBe(true);
    expect(isValidDatabaseName('_test')).toBe(true);
    expect(isValidDatabaseName('database123')).toBe(true);
  });

  test('should reject invalid database names', () => {
    expect(isValidDatabaseName('123db')).toBe(false); // starts with number
    expect(isValidDatabaseName('my-db')).toBe(false); // hyphen
    expect(isValidDatabaseName('my.db')).toBe(false); // dot
    expect(isValidDatabaseName('')).toBe(false); // empty
    expect(isValidDatabaseName('a'.repeat(64))).toBe(false); // too long
  });
});

describe('User Name Validation', () => {
  test('should accept valid user names', () => {
    expect(isValidUserName('postgres')).toBe(true);
    expect(isValidUserName('my_user')).toBe(true);
    expect(isValidUserName('MyUser')).toBe(true);
    expect(isValidUserName('_admin')).toBe(true);
    expect(isValidUserName('user123')).toBe(true);
  });

  test('should reject invalid user names', () => {
    expect(isValidUserName('123user')).toBe(false); // starts with number
    expect(isValidUserName('my-user')).toBe(false); // hyphen
    expect(isValidUserName('my.user')).toBe(false); // dot
    expect(isValidUserName('')).toBe(false); // empty
    expect(isValidUserName('a'.repeat(64))).toBe(false); // too long
  });
});

describe('Encoding Validation', () => {
  test('should accept valid encodings', () => {
    expect(isValidEncoding('UTF8')).toBe(true);
    expect(isValidEncoding('utf8')).toBe(true);
    expect(isValidEncoding('UTF-8')).toBe(true);
    expect(isValidEncoding('LATIN1')).toBе(true);
    expect(isValidEncoding('SQL_ASCII')).toBe(true);
    expect(isValidEncoding('WIN1252')).toBe(true);
  });

  test('should reject invalid encodings', () => {
    expect(isValidEncoding('INVALID')).toBe(false);
    expect(isValidEncoding('')).toBe(false);
    expect(isValidEncoding('UTF-9')).toBe(false);
  });
});

describe('Memory Size Validation', () => {
  test('should accept valid memory sizes', () => {
    expect(isValidMemorySize('128MB')).toBe(true);
    expect(isValidMemorySize('1GB')).toBe(true);
    expect(isValidMemorySize('512kB')).toBe(true);
    expect(isValidMemorySize('2TB')).toBe(true);
    expect(isValidMemorySize('1024B')).toBe(true);
    expect(isValidMemorySize('1.5GB')).toBe(true);
  });

  test('should reject invalid memory sizes', () => {
    expect(isValidMemorySize('128')).toBe(false); // no unit
    expect(isValidMemorySize('128mb')).toBe(false); // lowercase unit
    expect(isValidMemorySize('GB128')).toBe(false); // unit first
    expect(isValidMemorySize('')).toBe(false); // empty
    expect(isValidMemorySize('1.5.5GB')).toBe(false); // invalid decimal
  });
});

describe('Instance Config Validation', () => {
  const validConfig: PostgreSQLInstanceConfig = {
    apiVersion: 'v1',
    kind: 'PostgreSQLInstance',
    metadata: {
      name: 'test-db'
    },
    spec: {
      version: '15.3',
      network: {
        port: 5432,
        bindAddress: '127.0.0.1',
        maxConnections: 100
      },
      storage: {
        dataDirectory: '/var/lib/postgresql/data',
        logDirectory: '/var/log/postgresql'
      },
      database: {
        name: 'testdb',
        owner: 'postgres',
        encoding: 'UTF8',
        locale: 'en_US.UTF-8',
        timezone: 'UTC'
      }
    }
  };

  test('should pass validation for valid config', () => {
    const errors = validateInstanceConfig(validConfig);
    expect(errors).toHaveLength(0);
  });

  test('should fail validation for missing required fields', () => {
    const invalidConfig = { ...validConfig };
    // @ts-ignore
    delete invalidConfig.metadata.name;
    
    const errors = validateInstanceConfig(invalidConfig);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === 'metadata.name')).toBe(true);
  });

  test('should fail validation for invalid port', () => {
    const invalidConfig = {
      ...validConfig,
      spec: {
        ...validConfig.spec,
        network: {
          ...validConfig.spec.network,
          port: 80 // invalid port
        }
      }
    };
    
    const errors = validateInstanceConfig(invalidConfig);
    expect(errors.some(e => e.field === 'spec.network.port')).toBe(true);
  });

  test('should fail validation for invalid authentication method', () => {
    const invalidConfig = {
      ...validConfig,
      spec: {
        ...validConfig.spec,
        security: {
          authentication: {
            method: 'invalid' as any
          }
        }
      }
    };
    
    const errors = validateInstanceConfig(invalidConfig);
    expect(errors.some(e => e.field === 'spec.security.authentication.method')).toBe(true);
  });
});

describe('Port Availability Validation', () => {
  const existingInstances: PostgreSQLInstanceConfig[] = [
    {
      apiVersion: 'v1',
      kind: 'PostgreSQLInstance',
      metadata: { name: 'existing-db' },
      spec: {
        version: '15.3',
        network: { port: 5432, bindAddress: '127.0.0.1', maxConnections: 100 },
        storage: { dataDirectory: '/var/lib/postgresql/data', logDirectory: '/var/log/postgresql' },
        database: { name: 'existing', owner: 'postgres', encoding: 'UTF8', locale: 'en_US.UTF-8', timezone: 'UTC' }
      }
    }
  ];

  test('should detect port conflicts', () => {
    const errors = validatePortAvailable(5432, existingInstances);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('spec.network.port');
  });

  test('should allow available ports', () => {
    const errors = validatePortAvailable(5433, existingInstances);
    expect(errors).toHaveLength(0);
  });

  test('should suggest available port', () => {
    const suggestedPort = suggestAvailablePort(5432, existingInstances);
    expect(suggestedPort).not.toBe(5432);
    expect(suggestedPort).toBeGreaterThan(5432);
  });
});