import type { PostgreSQLInstanceConfig } from '../config/types.js';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateInstanceConfig(config: PostgreSQLInstanceConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate required fields
  if (!config.metadata?.name || config.metadata.name.trim() === '') {
    errors.push({ field: 'metadata.name', message: 'Instance name is required' });
  }

  if (!config.spec?.version) {
    errors.push({ field: 'spec.version', message: 'PostgreSQL version is required' });
  }

  // Validate instance name format
  if (config.metadata?.name && !isValidInstanceName(config.metadata.name)) {
    errors.push({ 
      field: 'metadata.name', 
      message: 'Instance name must contain only lowercase letters, numbers, and hyphens' 
    });
  }

  // Validate port
  if (config.spec?.network?.port) {
    if (!isValidPort(config.spec.network.port)) {
      errors.push({ 
        field: 'spec.network.port', 
        message: 'Port must be between 1024 and 65535' 
      });
    }
  }

  // Validate bind address
  if (config.spec?.network?.bindAddress && !isValidBindAddress(config.spec.network.bindAddress)) {
    errors.push({ 
      field: 'spec.network.bindAddress', 
      message: 'Invalid bind address format' 
    });
  }

  // Validate max connections
  if (config.spec?.network?.maxConnections !== undefined) {
    if (config.spec.network.maxConnections < 1 || config.spec.network.maxConnections > 10000) {
      errors.push({ 
        field: 'spec.network.maxConnections', 
        message: 'Max connections must be between 1 and 10000' 
      });
    }
  }

  // Validate database name
  if (config.spec?.database?.name && !isValidDatabaseName(config.spec.database.name)) {
    errors.push({ 
      field: 'spec.database.name', 
      message: 'Database name must contain only letters, numbers, and underscores' 
    });
  }

  // Validate user name
  if (config.spec?.database?.owner && !isValidUserName(config.spec.database.owner)) {
    errors.push({ 
      field: 'spec.database.owner', 
      message: 'User name must contain only letters, numbers, and underscores' 
    });
  }

  // Validate encoding
  if (config.spec?.database?.encoding && !isValidEncoding(config.spec.database.encoding)) {
    errors.push({ 
      field: 'spec.database.encoding', 
      message: 'Invalid encoding. Use UTF8, LATIN1, etc.' 
    });
  }

  // Validate authentication method
  if (config.spec?.security?.authentication?.method) {
    const validMethods = ['md5', 'scram-sha-256', 'trust', 'peer'];
    if (!validMethods.includes(config.spec.security.authentication.method)) {
      errors.push({ 
        field: 'spec.security.authentication.method', 
        message: `Authentication method must be one of: ${validMethods.join(', ')}` 
      });
    }
  }

  // Validate memory settings
  if (config.spec?.performance) {
    const memoryFields = ['sharedBuffers', 'effectiveCacheSize', 'workMem', 'maintenanceWorkMem', 'walBuffers'];
    
    for (const field of memoryFields) {
      const value = (config.spec.performance as any)[field];
      if (value && !isValidMemorySize(value)) {
        errors.push({ 
          field: `spec.performance.${field}`, 
          message: 'Invalid memory size format. Use format like "128MB", "1GB", etc.' 
        });
      }
    }
  }

  // Validate backup format
  if (config.spec?.backup?.format) {
    const validFormats = ['custom', 'plain', 'directory', 'tar'];
    if (!validFormats.includes(config.spec.backup.format)) {
      errors.push({ 
        field: 'spec.backup.format', 
        message: `Backup format must be one of: ${validFormats.join(', ')}` 
      });
    }
  }

  return errors;
}

export function isValidInstanceName(name: string): boolean {
  // Allow lowercase letters, numbers, and hyphens
  // Must start with a letter
  return /^[a-z][a-z0-9-]*$/.test(name) && name.length <= 63;
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

export function isValidBindAddress(address: string): boolean {
  // Basic validation for IP addresses and hostnames
  if (address === 'localhost' || address === '*' || address === '0.0.0.0') {
    return true;
  }
  
  // IPv4 validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(address)) {
    const parts = address.split('.');
    return parts.every(part => {
      const num = parseInt(part);
      return num >= 0 && num <= 255;
    });
  }
  
  // IPv6 validation (basic)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (ipv6Regex.test(address) || address === '::1') {
    return true;
  }
  
  return false;
}

export function isValidDatabaseName(name: string): boolean {
  // PostgreSQL database name rules
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 63;
}

export function isValidUserName(name: string): boolean {
  // PostgreSQL user name rules
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 63;
}

export function isValidEncoding(encoding: string): boolean {
  const validEncodings = [
    'UTF8', 'UTF-8', 'UNICODE',
    'LATIN1', 'LATIN2', 'LATIN3', 'LATIN4', 'LATIN5', 'LATIN6', 'LATIN7', 'LATIN8', 'LATIN9', 'LATIN10',
    'ISO_8859_5', 'ISO_8859_6', 'ISO_8859_7', 'ISO_8859_8',
    'KOI8R', 'KOI8U',
    'WIN1250', 'WIN1251', 'WIN1252', 'WIN1253', 'WIN1254', 'WIN1255', 'WIN1256', 'WIN1257', 'WIN1258',
    'SQL_ASCII'
  ];
  
  return validEncodings.includes(encoding.toUpperCase());
}

export function isValidMemorySize(size: string): boolean {
  // Validate PostgreSQL memory size format (e.g., "128MB", "1GB", "512kB")
  return /^\d+(\.\d+)?(kB|MB|GB|TB|B)$/.test(size);
}

export function validatePortAvailable(port: number, existingInstances: PostgreSQLInstanceConfig[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const conflictingInstance = existingInstances.find(instance => 
    instance.spec.network.port === port
  );
  
  if (conflictingInstance) {
    errors.push({
      field: 'spec.network.port',
      message: `Port ${port} is already used by instance '${conflictingInstance.metadata.name}'`
    });
  }
  
  return errors;
}

export function suggestAvailablePort(preferredPort: number, existingInstances: PostgreSQLInstanceConfig[]): number {
  const usedPorts = new Set(existingInstances.map(instance => instance.spec.network.port));
  
  let port = preferredPort;
  while (usedPorts.has(port)) {
    port++;
    if (port > 65535) {
      port = 5432; // Start over from default PostgreSQL port
    }
    if (port === preferredPort) {
      throw new Error('No available ports found');
    }
  }
  
  return port;
}