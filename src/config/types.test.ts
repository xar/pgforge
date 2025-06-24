import { describe, test, expect } from 'bun:test';
import type { PostgreSQLInstanceConfig, GlobalConfig } from './types.js';

describe('Configuration Types', () => {
  test('should allow valid PostgreSQL instance config', () => {
    const config: PostgreSQLInstanceConfig = {
      apiVersion: 'v1',
      kind: 'PostgreSQLInstance',
      metadata: {
        name: 'test-db',
        labels: { environment: 'test' },
        annotations: { 'created-by': 'pgforge' }
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
          logDirectory: '/var/log/postgresql',
          walDirectory: '/var/lib/postgresql/wal',
          archiveDirectory: '/var/lib/postgresql/archive'
        },
        database: {
          name: 'testdb',
          owner: 'postgres',
          encoding: 'UTF8',
          locale: 'en_US.UTF-8',
          timezone: 'UTC'
        },
        security: {
          ssl: {
            enabled: true,
            certificatePath: '/etc/ssl/certs/server.crt',
            keyPath: '/etc/ssl/private/server.key'
          },
          authentication: {
            method: 'scram-sha-256',
            allowedHosts: ['127.0.0.1', '::1']
          },
          audit: {
            enabled: true,
            logLevel: 'INFO',
            logConnections: true,
            logDisconnections: true
          }
        },
        performance: {
          sharedBuffers: '256MB',
          effectiveCacheSize: '1GB',
          workMem: '4MB',
          maintenanceWorkMem: '64MB'
        },
        backup: {
          enabled: true,
          schedule: '0 2 * * *',
          retention: '30d',
          compression: true,
          format: 'custom'
        }
      },
      status: {
        state: 'running',
        pid: 12345,
        startTime: '2024-01-01T00:00:00Z',
        version: '15.3',
        connections: 5
      }
    };

    // Type check passes - this validates the type structure
    expect(config.apiVersion).toBe('v1');
    expect(config.kind).toBe('PostgreSQLInstance');
    expect(config.metadata.name).toBe('test-db');
    expect(config.spec.network.port).toBe(5432);
  });

  test('should allow valid global config', () => {
    const config: GlobalConfig = {
      apiVersion: 'v1',
      kind: 'Configuration',
      global: {
        dataRoot: '/var/lib/postgresql/pgforge',
        logRoot: '/var/log/postgresql/pgforge',
        backupRoot: '/var/backups/postgresql/pgforge',
        postgresql: {
          packageManager: 'apt',
          versions: ['15.3', '14.8'],
          defaultVersion: '15.3'
        }
      },
      templates: {
        development: {
          network: {
            port: 5433,
            bindAddress: '127.0.0.1',
            maxConnections: 50
          },
          performance: {
            sharedBuffers: '128MB',
            workMem: '2MB'
          }
        }
      }
    };

    // Type check passes - this validates the type structure
    expect(config.apiVersion).toBe('v1');
    expect(config.kind).toBe('Configuration');
    expect(config.global.postgresql.packageManager).toBe('apt');
    expect(config.templates?.development?.network?.port).toBe(5433);
  });

  test('should enforce authentication method enum', () => {
    const validMethods: Array<'md5' | 'scram-sha-256' | 'trust' | 'peer'> = [
      'md5', 'scram-sha-256', 'trust', 'peer'
    ];

    for (const method of validMethods) {
      const config: PostgreSQLInstanceConfig['spec']['security'] = {
        authentication: { method }
      };
      expect(config.authentication?.method).toBe(method);
    }
  });

  test('should enforce backup format enum', () => {
    const validFormats: Array<'custom' | 'plain' | 'directory' | 'tar'> = [
      'custom', 'plain', 'directory', 'tar'
    ];

    for (const format of validFormats) {
      const config: PostgreSQLInstanceConfig['spec']['backup'] = {
        enabled: true,
        format
      };
      expect(config.format).toBe(format);
    }
  });
});