export interface PostgreSQLInstanceConfig {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    version: string;
    network: {
      port: number;
      bindAddress: string;
      maxConnections: number;
    };
    storage: {
      dataDirectory: string;
      logDirectory: string;
      walDirectory?: string;
      archiveDirectory?: string;
    };
    database: {
      name: string;
      owner: string;
      password?: string;
      encoding: string;
      locale: string;
      timezone: string;
    };
    security?: {
      ssl?: {
        enabled: boolean;
        certificatePath?: string;
        keyPath?: string;
        ciphers?: string;
      };
      authentication?: {
        method: 'md5' | 'scram-sha-256' | 'trust' | 'peer';
        allowedHosts?: string[];
      };
      audit?: {
        enabled: boolean;
        logLevel?: string;
        logConnections?: boolean;
        logDisconnections?: boolean;
        logStatements?: string[];
      };
    };
    performance?: {
      sharedBuffers?: string;
      effectiveCacheSize?: string;
      workMem?: string;
      maintenanceWorkMem?: string;
      walBuffers?: string;
      checkpointCompletionTarget?: number;
      randomPageCost?: number;
    };
    backup?: {
      enabled: boolean;
      schedule?: string;
      retention?: string;
      compression?: boolean;
      format?: 'custom' | 'plain' | 'directory' | 'tar';
      destination?: string;
    };
  };
  status?: {
    state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
    pid?: number;
    startTime?: string;
    lastRestart?: string;
    version?: string;
    dataSize?: string;
    connections?: number;
  };
}

export interface GlobalConfig {
  apiVersion: string;
  kind: string;
  global: {
    dataRoot: string;
    logRoot: string;
    backupRoot: string;
    postgresql: {
      packageManager: 'apt' | 'yum' | 'brew' | 'manual';
      versions: string[];
      defaultVersion: string;
    };
  };
  templates?: Record<string, Partial<PostgreSQLInstanceConfig['spec']>>;
}

export interface InstanceTemplate {
  name: string;
  description?: string;
  spec: Partial<PostgreSQLInstanceConfig['spec']>;
}