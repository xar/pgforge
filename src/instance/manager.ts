import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { access, mkdir, writeFile, readFile, readdir, rmdir, unlink, stat } from 'fs/promises';
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

    // Create socket directory after initdb to avoid conflicts
    await this.createSocketDirectory(config);

    // Create database and user with password
    await this.createDatabaseAndUser(config);

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

  private async createDatabaseAndUser(config: PostgreSQLInstanceConfig): Promise<void> {
    // Generate a secure password for the database user
    const password = this.generateSecurePassword();
    config.spec.database.password = password;

    // Start PostgreSQL temporarily to create database and user
    const postgresPath = await this.findPostgreSQLBinary('postgres', config.spec.version);
    const psqlPath = await this.findPostgreSQLBinary('psql', config.spec.version);
    
    // Start PostgreSQL in background
    const tempProcess = spawn(postgresPath, [
      '-D', config.spec.storage.dataDirectory,
      '-p', config.spec.network.port.toString(),
      '-c', 'listen_addresses=127.0.0.1',
    ], {
      detached: false,
      stdio: 'ignore',
    });

    try {
      // Wait for PostgreSQL to start
      await this.waitForPostgreSQLReady(config.spec.network.port, config.spec.version);

      // Create the database
      await execAsync(`${psqlPath} -h 127.0.0.1 -p ${config.spec.network.port} -U postgres -d postgres -c "CREATE DATABASE \\"${config.spec.database.name}\\""`);

      // Create the user with password
      await execAsync(`${psqlPath} -h 127.0.0.1 -p ${config.spec.network.port} -U postgres -d postgres -c "CREATE USER \\"${config.spec.database.owner}\\" WITH PASSWORD '${password}'"`);

      // Grant privileges to the user on the database
      await execAsync(`${psqlPath} -h 127.0.0.1 -p ${config.spec.network.port} -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \\"${config.spec.database.name}\\" TO \\"${config.spec.database.owner}\\""`);

      // Grant the user permission to create schemas in the database
      await execAsync(`${psqlPath} -h 127.0.0.1 -p ${config.spec.network.port} -U postgres -d "${config.spec.database.name}" -c "GRANT CREATE ON SCHEMA public TO \\"${config.spec.database.owner}\\""`);

    } catch (error) {
      throw new Error(`Failed to create database and user: ${error}`);
    } finally {
      // Stop the temporary PostgreSQL process
      if (tempProcess && tempProcess.pid) {
        try {
          process.kill(tempProcess.pid, 'SIGTERM');
          // Wait for process to exit
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch {
          // If SIGTERM doesn't work, try SIGKILL
          try {
            process.kill(tempProcess.pid, 'SIGKILL');
          } catch {
            // Process already dead, ignore
          }
        }
      }
    }
  }

  private generateSecurePassword(length: number = 16): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    
    // Use crypto.randomBytes for cryptographically secure random generation
    const bytes = randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      password += characters[bytes[i] % characters.length];
    }
    
    return password;
  }

  private async waitForPostgreSQLReady(port: number, version: string, maxAttempts: number = 30): Promise<void> {
    const psqlPath = await this.findPostgreSQLBinary('psql', version);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await execAsync(`${psqlPath} -h 127.0.0.1 -p ${port} -U postgres -d postgres -c "SELECT 1"`, { 
          timeout: 2000 
        });
        return; // Connection successful
      } catch {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`PostgreSQL did not become ready after ${maxAttempts} attempts`);
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

  private async createSocketDirectory(config: PostgreSQLInstanceConfig): Promise<void> {
    const socketDirectory = join(config.spec.storage.dataDirectory, 'sockets');
    
    try {
      await access(socketDirectory);
    } catch {
      await mkdir(socketDirectory, { recursive: true });
    }
  }

  private async initializeDatabase(config: PostgreSQLInstanceConfig): Promise<void> {
    const initdbPath = await this.findPostgreSQLBinary('initdb', config.spec.version);
    
    // Check if data directory exists and is not empty
    await this.ensureDataDirectoryIsEmpty(config.spec.storage.dataDirectory);
    
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

  private async ensureDataDirectoryIsEmpty(dataDirectory: string): Promise<void> {
    try {
      await access(dataDirectory);
      
      // Directory exists, check if it's empty
      const files = await readdir(dataDirectory);
      
      if (files.length > 0) {
        // Check if this looks like a partial pgforge installation
        const isPartialInstallation = await this.detectPartialInstallation(dataDirectory, files);
        
        if (isPartialInstallation) {
          // Automatically clean up partial installation
          console.log(`Detected partial installation in '${dataDirectory}', cleaning up...`);
          await this.cleanupDirectory(dataDirectory);
          return;
        }
        
        // Directory contains unrecognized files - require manual intervention
        throw new Error(
          `Data directory '${dataDirectory}' exists and contains files that don't appear to be from a failed pgforge installation. ` +
          `Please manually review and remove the directory if safe: rm -rf "${dataDirectory}"\n` +
          `Files found: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` (and ${files.length - 5} more)` : ''}`
        );
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, which is fine
        return;
      }
      throw error;
    }
  }

  private async detectPartialInstallation(dataDirectory: string, files: string[]): Promise<boolean> {
    // Files that indicate a PostgreSQL/pgforge installation attempt
    const pgforgeIndicators = [
      'postgresql.conf',
      'pg_hba.conf',
      'PG_VERSION',
      'postmaster.pid',
      'postmaster.opts',
      'sockets',
      'pg_stat',
      'pg_xact',
      'pg_wal',
      'base',
      'global',
      'pg_tblspc'
    ];

    // Check if the directory contains only recognized PostgreSQL/pgforge files
    const recognizedFiles = files.filter(file => 
      pgforgeIndicators.some(indicator => file.startsWith(indicator))
    );

    // If most files are recognized as PostgreSQL-related, consider it a partial installation
    const recognitionRatio = recognizedFiles.length / files.length;
    
    // Also check for specific pgforge markers
    const hasPgforgeMarkers = files.some(file => 
      file === 'postgresql.conf' || file === 'pg_hba.conf'
    );

    // If there's a postgresql.conf file, check if it contains pgforge signature
    if (hasPgforgeMarkers) {
      try {
        const configPath = join(dataDirectory, 'postgresql.conf');
        await access(configPath);
        const configContent = await readFile(configPath, 'utf-8');
        
        // Check for pgforge signature in the config file
        if (configContent.includes('PostgreSQL configuration generated by PgForge')) {
          return true;
        }
      } catch {
        // Ignore errors reading config file
      }
    }

    // Consider it a partial installation if:
    // 1. Most files are PostgreSQL-related (80% or more), OR
    // 2. There are clear PostgreSQL indicators and few other files
    return recognitionRatio >= 0.8 || (recognizedFiles.length >= 3 && files.length <= 10);
  }

  private async cleanupDirectory(dataDirectory: string): Promise<void> {
    try {
      // Recursively remove all contents of the directory
      const files = await readdir(dataDirectory);
      
      for (const file of files) {
        const filePath = join(dataDirectory, file);
        const fileStat = await stat(filePath);
        
        if (fileStat.isDirectory()) {
          await this.removeDirectoryRecursive(filePath);
        } else {
          await unlink(filePath);
        }
      }
    } catch (error) {
      throw new Error(`Failed to cleanup directory '${dataDirectory}': ${error}`);
    }
  }

  private async removeDirectoryRecursive(dirPath: string): Promise<void> {
    const files = await readdir(dirPath);
    
    for (const file of files) {
      const filePath = join(dirPath, file);
      const fileStat = await stat(filePath);
      
      if (fileStat.isDirectory()) {
        await this.removeDirectoryRecursive(filePath);
      } else {
        await unlink(filePath);
      }
    }
    
    await rmdir(dirPath);
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
    // Create socket directory path within the instance data directory
    const socketDirectory = join(config.spec.storage.dataDirectory, 'sockets');
    
    const lines = [
      '# PostgreSQL configuration generated by PgForge',
      `port = ${config.spec.network.port}`,
      `listen_addresses = '${config.spec.network.bindAddress}'`,
      `max_connections = ${config.spec.network.maxConnections}`,
      '',
      '# Socket configuration - avoid system permission issues',
      `unix_socket_directories = '${socketDirectory}'`,
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
    // Extract major version from full version (e.g., "15.13" -> "15")
    const majorVersion = version.split('.')[0];
    
    // Common PostgreSQL installation paths, ordered by preference
    const paths = [
      // Try exact version first
      `/usr/lib/postgresql/${version}/bin/${binary}`,
      `/usr/pgsql-${version}/bin/${binary}`,
      `/opt/postgresql/${version}/bin/${binary}`,
      // Try major version
      `/usr/lib/postgresql/${majorVersion}/bin/${binary}`,
      `/usr/pgsql-${majorVersion}/bin/${binary}`,
      `/opt/postgresql/${majorVersion}/bin/${binary}`,
      // Try generic paths
      `/usr/bin/${binary}`,
      `/usr/local/bin/${binary}`,
      `/usr/local/pgsql/bin/${binary}`,
      `/opt/postgresql/bin/${binary}`,
    ];

    for (const path of paths) {
      try {
        await access(path);
        return path;
      } catch {
        continue;
      }
    }

    // If we can't find the binary in version-specific paths, try to find it dynamically
    // using the same logic as the system check
    try {
      const { execSync } = await import('child_process');
      const whichResult = execSync(`which ${binary}`, { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      }).trim();
      
      if (whichResult) {
        return whichResult;
      }
    } catch {
      // which command failed, continue with original error
    }

    throw new Error(`PostgreSQL binary '${binary}' not found for version ${version}. Tried paths: ${paths.join(', ')}`);
  }

  private async createBackup(config: PostgreSQLInstanceConfig): Promise<void> {
    console.log(`Creating backup for instance '${config.metadata.name}'...`);
    // TODO: Implement backup functionality
    console.log('Backup functionality not yet implemented');
  }
}