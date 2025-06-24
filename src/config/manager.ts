import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import * as YAML from 'yaml';
import type { PostgreSQLInstanceConfig, GlobalConfig, InstanceTemplate } from './types.js';
import { getCommandVersion, findCommandInPath } from '../utils/system.js';

export class ConfigManager {
  private configDir: string;
  private instancesDir: string;
  private globalConfigPath: string;

  constructor() {
    this.configDir = join(homedir(), '.pgforge');
    this.instancesDir = join(this.configDir, 'instances');
    this.globalConfigPath = join(this.configDir, 'config.yaml');
  }

  async ensureConfigDirectory(): Promise<void> {
    try {
      await access(this.configDir);
    } catch {
      await mkdir(this.configDir, { recursive: true });
    }

    try {
      await access(this.instancesDir);
    } catch {
      await mkdir(this.instancesDir, { recursive: true });
    }
  }

  async getGlobalConfig(): Promise<GlobalConfig> {
    try {
      const content = await readFile(this.globalConfigPath, 'utf-8');
      return YAML.parse(content) as GlobalConfig;
    } catch {
      // Return default config if file doesn't exist
      return this.getDefaultGlobalConfig();
    }
  }

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    await this.ensureConfigDirectory();
    const yamlContent = YAML.stringify(config, { indent: 2 });
    await writeFile(this.globalConfigPath, yamlContent, 'utf-8');
  }

  async getInstanceConfig(name: string): Promise<PostgreSQLInstanceConfig | null> {
    try {
      const configPath = join(this.instancesDir, `${name}.yaml`);
      const content = await readFile(configPath, 'utf-8');
      return YAML.parse(content) as PostgreSQLInstanceConfig;
    } catch {
      return null;
    }
  }

  async saveInstanceConfig(config: PostgreSQLInstanceConfig): Promise<void> {
    await this.ensureConfigDirectory();
    const configPath = join(this.instancesDir, `${config.metadata.name}.yaml`);
    const yamlContent = YAML.stringify(config, { indent: 2 });
    await writeFile(configPath, yamlContent, 'utf-8');
  }

  async listInstances(): Promise<string[]> {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(this.instancesDir);
      return files
        .filter(file => file.endsWith('.yaml'))
        .map(file => file.slice(0, -5)); // Remove .yaml extension
    } catch {
      return [];
    }
  }

  async deleteInstance(name: string): Promise<boolean> {
    try {
      const { unlink } = await import('fs/promises');
      const configPath = join(this.instancesDir, `${name}.yaml`);
      await unlink(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private detectInstalledPostgreSQLVersion(): string | null {
    // Try to detect the installed PostgreSQL version using the same logic as the check command
    try {
      // First try standard command in PATH
      let commandPath = findCommandInPath('postgres');
      
      // If not found in PATH, try PostgreSQL-specific locations
      if (!commandPath) {
        commandPath = this.findPostgreSQLCommand('postgres');
      }

      if (commandPath) {
        return getCommandVersion('postgres', commandPath);
      }
    } catch (error) {
      // Fallback to detecting via initdb if postgres binary isn't found
      try {
        let commandPath = findCommandInPath('initdb');
        if (!commandPath) {
          commandPath = this.findPostgreSQLCommand('initdb');
        }
        if (commandPath) {
          return getCommandVersion('initdb', commandPath);
        }
      } catch {
        // Ignore errors
      }
    }
    return null;
  }

  private findPostgreSQLCommand(command: string): string | null {
    // Common PostgreSQL installation paths
    const commonPaths = [
      // Ubuntu/Debian style
      '/usr/lib/postgresql/15/bin',
      '/usr/lib/postgresql/14/bin',
      '/usr/lib/postgresql/13/bin',
      '/usr/lib/postgresql/12/bin',
      // RHEL/CentOS style
      '/usr/pgsql-15/bin',
      '/usr/pgsql-14/bin',
      '/usr/pgsql-13/bin',
      '/usr/pgsql-12/bin',
      // Alternative locations
      '/usr/local/pgsql/bin',
      '/opt/postgresql/bin',
      '/usr/bin'
    ];

    for (const path of commonPaths) {
      const fullPath = `${path}/${command}`;
      if (existsSync(fullPath)) {
        try {
          // Test if the binary is executable
          execSync(`test -x "${fullPath}"`, { stdio: 'pipe' });
          return fullPath;
        } catch {
          // Binary exists but not executable
          continue;
        }
      }
    }

    return null;
  }

  createInstanceConfig(
    name: string,
    options: {
      template?: string;
      port?: number;
      version?: string;
    } = {}
  ): PostgreSQLInstanceConfig {
    const globalConfig = this.getDefaultGlobalConfig();
    const template = options.template ? this.getTemplate(options.template) : null;
    
    const defaultPort = options.port || 5432;
    const version = options.version || this.detectInstalledPostgreSQLVersion() || globalConfig.global.postgresql.defaultVersion;

    const config: PostgreSQLInstanceConfig = {
      apiVersion: 'v1',
      kind: 'PostgreSQLInstance',
      metadata: {
        name,
        labels: {
          environment: template?.name || 'custom',
        },
        annotations: {
          description: `PostgreSQL instance: ${name}`,
          created: new Date().toISOString(),
        },
      },
      spec: {
        version,
        network: {
          port: defaultPort,
          bindAddress: '127.0.0.1',
          maxConnections: 100,
        },
        storage: {
          dataDirectory: join(globalConfig.global.dataRoot, name),
          logDirectory: join(globalConfig.global.logRoot, name),
        },
        database: {
          name: `${name}_db`,
          owner: `${name}_user`,
          encoding: 'UTF8',
          locale: 'en_US.UTF-8',
          timezone: 'UTC',
        },
        security: {
          ssl: {
            enabled: true,
          },
          authentication: {
            method: 'md5',
            allowedHosts: ['127.0.0.1/32', '::1/128'],
          },
          audit: {
            enabled: false,
          },
        },
        performance: {
          sharedBuffers: '128MB',
          effectiveCacheSize: '512MB',
          workMem: '4MB',
          maintenanceWorkMem: '64MB',
        },
        backup: {
          enabled: false,
        },
      },
      status: {
        state: 'stopped',
      },
    };

    // Apply template if specified
    if (template) {
      this.mergeTemplateIntoConfig(config, template);
    }

    return config;
  }

  private getDefaultGlobalConfig(): GlobalConfig {
    return {
      apiVersion: 'v1',
      kind: 'Configuration',
      global: {
        dataRoot: '/var/lib/postgresql/pgforge',
        logRoot: '/var/log/postgresql/pgforge',
        backupRoot: '/var/backups/postgresql/pgforge',
        postgresql: {
          packageManager: 'apt',
          versions: ['15.3', '14.8', '13.11'],
          defaultVersion: '15.3',
        },
      },
      templates: {
        development: {
          performance: {
            sharedBuffers: '64MB',
            workMem: '2MB',
          },
          security: {
            ssl: {
              enabled: false,
            },
            audit: {
              enabled: false,
            },
          },
          backup: {
            enabled: false,
          },
        },
        production: {
          performance: {
            sharedBuffers: '256MB',
            workMem: '8MB',
            maintenanceWorkMem: '128MB',
          },
          security: {
            ssl: {
              enabled: true,
            },
            audit: {
              enabled: true,
            },
          },
          backup: {
            enabled: true,
            schedule: '0 2 * * *',
            retention: '7d',
          },
        },
        testing: {
          network: {
            port: 5433,
            bindAddress: '127.0.0.1',
            maxConnections: 50,
          },
          backup: {
            enabled: false,
          },
        },
      },
    };
  }

  private getTemplate(templateName: string): InstanceTemplate | null {
    const globalConfig = this.getDefaultGlobalConfig();
    const templateSpec = globalConfig.templates?.[templateName];
    
    if (!templateSpec) {
      return null;
    }

    return {
      name: templateName,
      spec: templateSpec,
    };
  }

  private mergeTemplateIntoConfig(config: PostgreSQLInstanceConfig, template: InstanceTemplate): void {
    // Simple deep merge of template spec into config spec
    this.deepMerge(config.spec, template.spec);
  }

  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}