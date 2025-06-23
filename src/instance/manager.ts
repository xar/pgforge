import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { access, mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { ConfigManager } from '../config/manager.js';
import type { PostgreSQLInstanceConfig } from '../config/types.js';

const execAsync = promisify(exec);

export class InstanceManager {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async createInstance(
    name: string, 
    options: {
      template?: string;
      port?: number;
      version?: string;
      file?: string;
    } = {}
  ): Promise<PostgreSQLInstanceConfig> {
    
    let config: PostgreSQLInstanceConfig;

    if (options.file) {
      // Load from file
      const content = await readFile(options.file, 'utf-8');
      config = JSON.parse(content); // Assume YAML is parsed already
      config.metadata.name = name || config.metadata.name;
    } else {
      // Create new config
      config = this.configManager.createInstanceConfig(name, options);
    }

    // Check if instance already exists
    const existing = await this.configManager.getInstanceConfig(name);
    if (existing) {
      throw new Error(`Instance '${name}' already exists`);
    }

    // Check if port is available  
    const isPortFree = await this.isPortAvailable(config.spec.network.port);
    if (!isPortFree) {
      throw new Error(`Port ${config.spec.network.port} is already in use`);
    }

    // Create directories
    await this.createInstanceDirectories(config);

    // Initialize PostgreSQL data directory
    await this.initializeDatabase(config);

    // Generate configuration files
    await this.generateConfigFiles(config);

    // Save instance configuration
    await this.configManager.saveInstanceConfig(config);

    return config;
  }

  async startInstance(name: string): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    if (config.status?.state === 'running') {
      throw new Error(`Instance '${name}' is already running`);
    }

    // Check if PostgreSQL is installed
    await this.checkPostgreSQLInstalled(config.spec.version);

    // Start PostgreSQL process
    const pid = await this.startPostgreSQLProcess(config);

    // Update status
    config.status = {
      state: 'running',
      pid,
      startTime: new Date().toISOString(),
      version: config.spec.version,
      connections: 0,
    };

    await this.configManager.saveInstanceConfig(config);
  }

  async stopInstance(name: string): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    if (config.status?.state !== 'running') {
      throw new Error(`Instance '${name}' is not running`);
    }

    if (config.status.pid) {
      // Stop PostgreSQL process gracefully
      await this.stopPostgreSQLProcess(config.status.pid);
    }

    // Update status
    config.status = {
      state: 'stopped',
      lastRestart: config.status?.startTime,
      version: config.spec.version,
      connections: 0,
    };

    await this.configManager.saveInstanceConfig(config);
  }

  async restartInstance(name: string): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    if (config.status?.state === 'running') {
      await this.stopInstance(name);
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await this.startInstance(name);
  }

  async getInstanceStatus(name: string): Promise<PostgreSQLInstanceConfig | null> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      return null;
    }

    // Check if process is actually running
    if (config.status?.pid) {
      const isRunning = await this.isProcessRunning(config.status.pid);
      if (!isRunning && config.status.state === 'running') {
        // Process died, update status
        config.status.state = 'stopped';
        await this.configManager.saveInstanceConfig(config);
      }
    }

    return config;
  }

  async listInstances(): Promise<PostgreSQLInstanceConfig[]> {
    const names = await this.configManager.listInstances();
    const instances: PostgreSQLInstanceConfig[] = [];

    for (const name of names) {
      const config = await this.getInstanceStatus(name);
      if (config) {
        instances.push(config);
      }
    }

    return instances;
  }

  async removeInstance(name: string, options: { backup?: boolean; force?: boolean } = {}): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    // Stop instance if running
    if (config.status?.state === 'running') {
      if (!options.force) {
        throw new Error(`Instance '${name}' is running. Stop it first or use --force`);
      }
      await this.stopInstance(name);
    }

    // Create backup if requested
    if (options.backup) {
      await this.createBackup(config);
    }

    // Remove configuration
    await this.configManager.deleteInstance(name);

    // TODO: Remove data directories (be careful!)
    console.log(`Note: Data directories for '${name}' were not removed. Remove manually if needed:`);
    console.log(`  Data: ${config.spec.storage.dataDirectory}`);
    console.log(`  Logs: ${config.spec.storage.logDirectory}`);
  }

  private async createInstanceDirectories(config: PostgreSQLInstanceConfig): Promise<void> {
    const directories = [
      config.spec.storage.dataDirectory,
      config.spec.storage.logDirectory,
    ];

    if (config.spec.storage.archiveDirectory) {
      directories.push(config.spec.storage.archiveDirectory);
    }

    for (const dir of directories) {
      try {
        await access(dir);
      } catch {
        await mkdir(dir, { recursive: true });
      }
    }
  }

  private async initializeDatabase(config: PostgreSQLInstanceConfig): Promise<void> {
    const initdbPath = await this.findPostgreSQLBinary('initdb', config.spec.version);
    
    const command = [
      initdbPath,
      '-D', config.spec.storage.dataDirectory,
      '--auth-local=peer',
      '--auth-host=md5',
      `--encoding=${config.spec.database.encoding}`,
      `--locale=${config.spec.database.locale}`,
    ].join(' ');

    try {
      await execAsync(command);
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  private async generateConfigFiles(config: PostgreSQLInstanceConfig): Promise<void> {
    const configPath = join(config.spec.storage.dataDirectory, 'postgresql.conf');
    const hbaPath = join(config.spec.storage.dataDirectory, 'pg_hba.conf');

    // Generate postgresql.conf
    const postgresqlConf = this.generatePostgreSQLConf(config);
    await writeFile(configPath, postgresqlConf, 'utf-8');

    // Generate pg_hba.conf
    const pgHbaConf = this.generatePgHbaConf(config);
    await writeFile(hbaPath, pgHbaConf, 'utf-8');
  }

  private generatePostgreSQLConf(config: PostgreSQLInstanceConfig): string {
    const lines = [
      '# PostgreSQL configuration generated by PgForge',
      `port = ${config.spec.network.port}`,
      `listen_addresses = '${config.spec.network.bindAddress}'`,
      `max_connections = ${config.spec.network.maxConnections}`,
      '',
      '# Performance settings',
    ];

    if (config.spec.performance?.sharedBuffers) {
      lines.push(`shared_buffers = '${config.spec.performance.sharedBuffers}'`);
    }
    if (config.spec.performance?.effectiveCacheSize) {
      lines.push(`effective_cache_size = '${config.spec.performance.effectiveCacheSize}'`);
    }
    if (config.spec.performance?.workMem) {
      lines.push(`work_mem = '${config.spec.performance.workMem}'`);
    }
    if (config.spec.performance?.maintenanceWorkMem) {
      lines.push(`maintenance_work_mem = '${config.spec.performance.maintenanceWorkMem}'`);
    }

    lines.push('');
    lines.push('# Logging');
    lines.push(`log_directory = '${config.spec.storage.logDirectory}'`);
    lines.push("log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'");
    lines.push('logging_collector = on');

    if (config.spec.security?.ssl?.enabled) {
      lines.push('');
      lines.push('# SSL Configuration');
      lines.push('ssl = on');
    }

    return lines.join('\n') + '\n';
  }

  private generatePgHbaConf(config: PostgreSQLInstanceConfig): string {
    const lines = [
      '# pg_hba.conf generated by PgForge',
      '# TYPE  DATABASE        USER            ADDRESS                 METHOD',
      '',
      '# Local connections',
      'local   all             all                                     peer',
      '',
      '# IPv4 connections',
    ];

    const allowedHosts = config.spec.security?.authentication?.allowedHosts || ['127.0.0.1/32'];
    const method = config.spec.security?.authentication?.method || 'md5';

    for (const host of allowedHosts) {
      lines.push(`host    all             all             ${host}                 ${method}`);
    }

    return lines.join('\n') + '\n';
  }

  private async startPostgreSQLProcess(config: PostgreSQLInstanceConfig): Promise<number> {
    const postgresPath = await this.findPostgreSQLBinary('postgres', config.spec.version);
    
    const args = [
      '-D', config.spec.storage.dataDirectory,
    ];

    const child = spawn(postgresPath, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    // Wait a moment for the process to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify it's running
    if (!child.pid || !(await this.isProcessRunning(child.pid))) {
      throw new Error('Failed to start PostgreSQL process');
    }

    return child.pid;
  }

  private async stopPostgreSQLProcess(pid: number): Promise<void> {
    try {
      process.kill(pid, 'SIGTERM');
      
      // Wait for graceful shutdown (up to 30 seconds)
      for (let i = 0; i < 30; i++) {
        if (!(await this.isProcessRunning(pid))) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Force kill if still running
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      // Process might already be dead
      console.warn(`Warning: Could not stop process ${pid}: ${error}`);
    }
  }

  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`netstat -tulpn | grep :${port}`);
      return stdout.trim() === '';
    } catch {
      return true; // Assume available if netstat fails
    }
  }

  private async checkPostgreSQLInstalled(version: string): Promise<void> {
    try {
      await this.findPostgreSQLBinary('postgres', version);
    } catch {
      throw new Error(`PostgreSQL ${version} is not installed. Install it first.`);
    }
  }

  private async findPostgreSQLBinary(binary: string, version: string): Promise<string> {
    // Common PostgreSQL installation paths
    const paths = [
      `/usr/lib/postgresql/${version}/bin/${binary}`,
      `/usr/pgsql-${version}/bin/${binary}`,
      `/opt/postgresql/${version}/bin/${binary}`,
      `/usr/bin/${binary}`,
      `/usr/local/bin/${binary}`,
    ];

    for (const path of paths) {
      try {
        await access(path);
        return path;
      } catch {
        continue;
      }
    }

    throw new Error(`PostgreSQL binary '${binary}' not found for version ${version}`);
  }

  private async createBackup(config: PostgreSQLInstanceConfig): Promise<void> {
    console.log(`Creating backup for instance '${config.metadata.name}'...`);
    // TODO: Implement backup functionality
    console.log('Backup functionality not yet implemented');
  }
}