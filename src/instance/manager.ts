import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { access, mkdir, writeFile, readFile, readdir, rmdir, unlink, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { ConfigManager } from '../config/manager.js';
import { ServiceManager } from '../service/manager.js';
import type { PostgreSQLInstanceConfig } from '../config/types.js';

const execAsync = promisify(exec);

export class InstanceManager {
  private configManager: ConfigManager;
  private serviceManager: ServiceManager;

  constructor() {
    this.configManager = new ConfigManager();
    this.serviceManager = new ServiceManager();
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
    
    console.log(`Creating PostgreSQL instance '${name}'...`);
    
    let config: PostgreSQLInstanceConfig;

    if (options.file) {
      // Load from file
      console.log(`Loading configuration from file: ${options.file}`);
      const content = await readFile(options.file, 'utf-8');
      config = JSON.parse(content); // Assume YAML is parsed already
      config.metadata.name = name || config.metadata.name;
    } else {
      // Create new config
      console.log('Creating new instance configuration...');
      config = this.configManager.createInstanceConfig(name, options);
    }

    console.log(`Instance configuration:`);
    console.log(`  Name: ${config.metadata.name}`);
    console.log(`  Version: ${config.spec.version}`);
    console.log(`  Port: ${config.spec.network.port}`);
    console.log(`  Data directory: ${config.spec.storage.dataDirectory}`);

    // Check if instance already exists
    const existing = await this.configManager.getInstanceConfig(name);
    if (existing) {
      throw new Error(`Instance '${name}' already exists`);
    }

    // Check if port is available  
    console.log(`Checking if port ${config.spec.network.port} is available...`);
    const isPortFree = await this.isPortAvailable(config.spec.network.port);
    if (!isPortFree) {
      throw new Error(`Port ${config.spec.network.port} is already in use`);
    }

    // Create directories
    console.log('Creating instance directories...');
    await this.createInstanceDirectories(config);

    // Initialize PostgreSQL data directory
    await this.initializeDatabase(config);

    // Create socket directory after initdb to avoid conflicts
    console.log('Creating socket directory...');
    await this.createSocketDirectory(config);

    // Create database and user with password
    await this.createDatabaseAndUser(config);

    // Generate configuration files
    console.log('Generating PostgreSQL configuration files...');
    await this.generateConfigFiles(config);

    // Save instance configuration
    console.log('Saving instance configuration...');
    await this.configManager.saveInstanceConfig(config);

    console.log(`PostgreSQL instance '${name}' created successfully!`);
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

    if (config.status?.pid) {
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
      if (!isRunning && config.status?.state === 'running') {
        // Process died, update status
        config.status!.state = 'stopped';
        await this.configManager.saveInstanceConfig(config);
      }
    }

    // Check service status if service is enabled
    if (config.spec.service?.enabled && await this.serviceManager.isSystemdAvailable()) {
      try {
        const serviceStatus = await this.serviceManager.getServiceStatus(name, false);
        
        // Update config with service status
        if (!config.status) {
          config.status = {
            state: 'stopped',
            version: config.spec.version,
            connections: 0,
          };
        }
        config.status.service = serviceStatus;
        
        // If service is active but config shows stopped, update it
        if (serviceStatus.active && config.status.state === 'stopped') {
          config.status.state = 'running';
          config.status.startTime = new Date().toISOString();
        } else if (!serviceStatus.active && config.status.state === 'running') {
          config.status.state = 'stopped';
          config.status.lastRestart = config.status.startTime;
          config.status.startTime = undefined;
        }
        
        await this.configManager.saveInstanceConfig(config);
      } catch (error) {
        // Service status check failed, don't fail the whole operation
        console.warn(`Warning: Could not check service status for '${name}': ${error}`);
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
    console.log('Creating database and user with password...');
    
    // Generate a secure password for the database user
    const password = this.generateSecurePassword();
    config.spec.database.password = password;

    // Start PostgreSQL temporarily to create database and user
    const postgresPath = await this.findPostgreSQLBinary('postgres', config.spec.version);
    const psqlPath = await this.findPostgreSQLBinary('psql', config.spec.version);
    
    console.log(`Starting temporary PostgreSQL instance on port ${config.spec.network.port}...`);
    console.log(`PostgreSQL binary: ${postgresPath}`);
    console.log(`Data directory: ${config.spec.storage.dataDirectory}`);
    
    // Start PostgreSQL in background with user-local socket directory
    const socketDirectory = join(config.spec.storage.dataDirectory, 'sockets');
    const tempProcess = spawn(postgresPath, [
      '-D', config.spec.storage.dataDirectory,
      '-p', config.spec.network.port.toString(),
      '-c', `listen_addresses=${config.spec.network.bindAddress}`,
      '-c', `unix_socket_directories=${socketDirectory}`,
    ], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout and stderr for debugging
    });

    // Capture stderr output for debugging
    let stderrOutput = '';
    if (tempProcess.stderr) {
      tempProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrOutput += output;
        // Log PostgreSQL startup messages for debugging
        if (output.includes('FATAL') || output.includes('ERROR')) {
          console.log(`PostgreSQL stderr: ${output.trim()}`);
        }
      });
    }

    try {
      console.log(`Temporary PostgreSQL process started with PID: ${tempProcess.pid}`);
      
      // Wait for PostgreSQL to start
      await this.waitForPostgreSQLReady(config.spec.network.port, config.spec.version, socketDirectory);

      console.log('PostgreSQL is ready, creating database and user...');

      // First, set a password for the postgres superuser
      console.log('Setting password for postgres superuser...');
      const postgresPassword = this.generateSecurePassword();
      await this.execAsyncWithLogging(`${psqlPath} -h "${socketDirectory}" -p ${config.spec.network.port} -U postgres -d postgres -c "ALTER USER postgres PASSWORD '${postgresPassword}'"`);

      // Create the database
      console.log(`Creating database: ${config.spec.database.name}`);
      await this.execAsyncWithLogging(`${psqlPath} -h "${socketDirectory}" -p ${config.spec.network.port} -U postgres -d postgres -c "CREATE DATABASE \\"${config.spec.database.name}\\""`);

      // Create the user with password
      console.log(`Creating user: ${config.spec.database.owner}`);
      await this.execAsyncWithLogging(`${psqlPath} -h "${socketDirectory}" -p ${config.spec.network.port} -U postgres -d postgres -c "CREATE USER \\"${config.spec.database.owner}\\" WITH PASSWORD '${password}'"`);

      // Grant privileges to the user on the database
      console.log(`Granting database privileges...`);
      await this.execAsyncWithLogging(`${psqlPath} -h "${socketDirectory}" -p ${config.spec.network.port} -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \\"${config.spec.database.name}\\" TO \\"${config.spec.database.owner}\\""`);

      // Grant the user permission to create schemas in the database
      console.log(`Granting schema creation privileges...`);
      await this.execAsyncWithLogging(`${psqlPath} -h "${socketDirectory}" -p ${config.spec.network.port} -U postgres -d "${config.spec.database.name}" -c "GRANT CREATE ON SCHEMA public TO \\"${config.spec.database.owner}\\""`);

      console.log('Database and user created successfully');

    } catch (error) {
      let errorMessage = `Failed to create database and user: ${error}`;
      
      // Include PostgreSQL stderr output in error if available
      if (stderrOutput.trim()) {
        errorMessage += `\n\nPostgreSQL stderr output:\n${stderrOutput.trim()}`;
      }
      
      throw new Error(errorMessage);
    } finally {
      // Stop the temporary PostgreSQL process
      console.log('Stopping temporary PostgreSQL instance...');
      if (tempProcess && tempProcess.pid) {
        try {
          console.log(`Sending SIGTERM to PostgreSQL process ${tempProcess.pid}`);
          process.kill(tempProcess.pid, 'SIGTERM');
          // Wait for process to exit
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if process still exists
          if (await this.isProcessRunning(tempProcess.pid)) {
            console.log(`Process ${tempProcess.pid} still running, sending SIGKILL`);
            process.kill(tempProcess.pid, 'SIGKILL');
          } else {
            console.log(`Temporary PostgreSQL process ${tempProcess.pid} stopped gracefully`);
          }
        } catch (killError) {
          // If SIGTERM doesn't work, try SIGKILL
          try {
            console.log(`Failed to stop with SIGTERM (${killError}), trying SIGKILL...`);
            process.kill(tempProcess.pid, 'SIGKILL');
          } catch (killKillError) {
            // Process already dead, ignore
            console.log(`Process ${tempProcess.pid} already terminated`);
          }
        }
      }
    }
  }

  private async execAsyncWithLogging(command: string, options?: any): Promise<{ stdout: string; stderr: string }> {
    try {
      console.log(`Executing: ${command.replace(/PASSWORD '[^']*'/g, "PASSWORD '[REDACTED]'")}`);
      const result = await execAsync(command, options);
      return {
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? (error.message || 'Unknown error') : String(error);
      console.error(`Command failed: ${command.replace(/PASSWORD '[^']*'/g, "PASSWORD '[REDACTED]'")}`);
      console.error(`Error: ${errorMsg}`);
      throw error;
    }
  }

  private generateSecurePassword(length: number = 16): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    
    // Use crypto.randomBytes for cryptographically secure random generation
    const bytes = randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      const byte = bytes[i];
      if (byte === undefined) {
        throw new Error('Failed to generate secure random bytes');
      }
      password += characters[byte % characters.length];
    }
    
    return password;
  }

  private async waitForPostgreSQLReady(port: number, version: string, socketDirectory: string, maxAttempts: number = 30): Promise<void> {
    const psqlPath = await this.findPostgreSQLBinary('psql', version);
    let lastError: any = null;
    
    console.log(`Waiting for PostgreSQL to become ready on port ${port}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Use Unix socket connection to avoid password authentication during temporary startup
        const command = `${psqlPath} -h "${socketDirectory}" -p ${port} -U postgres -d postgres -c "SELECT 1"`;
        console.log(`Attempt ${attempt}/${maxAttempts}: Testing PostgreSQL connection...`);
        
        await execAsync(command, { 
          timeout: 2000 
        });
        
        console.log(`PostgreSQL is ready after ${attempt} attempt(s)`);
        return; // Connection successful
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (attempt === 1 || attempt % 5 === 0 || attempt === maxAttempts) {
          // Log error on first attempt, every 5th attempt, and last attempt
          console.log(`Attempt ${attempt}/${maxAttempts} failed: ${errorMsg}`);
        }
        
        // Wait before retrying (except on last attempt)
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // Enhanced error message with troubleshooting information
    const errorDetails = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `PostgreSQL did not become ready after ${maxAttempts} attempts (${maxAttempts} seconds). ` +
      `Last error: ${errorDetails}\n\n` +
      `Troubleshooting:\n` +
      `1. Check if PostgreSQL process is running: ps aux | grep postgres\n` +
      `2. Check PostgreSQL logs for startup errors\n` +
      `3. Verify port ${port} is not blocked by firewall\n` +
      `4. Check for permission issues with data directory`
    );
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
    console.log('Initializing PostgreSQL database...');
    
    const initdbPath = await this.findPostgreSQLBinary('initdb', config.spec.version);
    console.log(`Using initdb binary: ${initdbPath}`);
    
    // Check if data directory exists and is not empty
    await this.ensureDataDirectoryIsEmpty(config.spec.storage.dataDirectory);
    
    const command = [
      initdbPath,
      '-D', config.spec.storage.dataDirectory,
      '--username=postgres',
      '--auth-local=trust',
      '--auth-host=md5',
      `--encoding=${config.spec.database.encoding}`,
      `--locale=${config.spec.database.locale}`,
    ].join(' ');

    try {
      console.log(`Initializing database cluster in: ${config.spec.storage.dataDirectory}`);
      await this.execAsyncWithLogging(command);
      console.log('Database initialization completed successfully');
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
      '# Local connections - use md5 for password authentication',
      'local   all             all                                     md5',
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
    console.log('Starting PostgreSQL process...');
    
    const postgresPath = await this.findPostgreSQLBinary('postgres', config.spec.version);
    console.log(`Using PostgreSQL binary: ${postgresPath}`);
    
    const args = [
      '-D', config.spec.storage.dataDirectory,
    ];

    console.log(`Starting PostgreSQL with args: ${args.join(' ')}`);

    const child = spawn(postgresPath, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    console.log(`PostgreSQL process spawned with PID: ${child.pid}`);

    // Wait a moment for the process to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify it's running
    if (!child.pid) {
      throw new Error('Failed to start PostgreSQL process: No PID assigned');
    }
    
    const isRunning = await this.isProcessRunning(child.pid);
    if (!isRunning) {
      throw new Error(`Failed to start PostgreSQL process: Process ${child.pid} exited immediately. Check PostgreSQL logs for errors.`);
    }

    console.log(`PostgreSQL process ${child.pid} started successfully`);
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

  /**
   * Enable service auto-start for an instance
   */
  async enableService(name: string, useUserService = false): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    // Check if systemd is available
    if (!await this.serviceManager.isSystemdAvailable()) {
      throw new Error('systemd is not available on this system. Service management requires systemd.');
    }

    // Update configuration to enable service
    config.spec.service = {
      enabled: true,
      autoStart: true,
      restartPolicy: 'on-failure',
      restartSec: 5,
      ...config.spec.service
    };

    // Enable the service
    await this.serviceManager.enableService(config, useUserService);

    // Update instance configuration
    await this.configManager.saveInstanceConfig(config);

    console.log(`Service auto-start enabled for instance '${name}'`);
  }

  /**
   * Disable service auto-start for an instance
   */
  async disableService(name: string, useUserService = false): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    // Disable the service
    await this.serviceManager.disableService(name, useUserService);

    // Update configuration to disable service
    if (config.spec.service) {
      config.spec.service.enabled = false;
      config.spec.service.autoStart = false;
    }

    // Update instance configuration
    await this.configManager.saveInstanceConfig(config);

    console.log(`Service auto-start disabled for instance '${name}'`);
  }

  /**
   * Get service status for an instance
   */
  async getServiceStatus(name: string, useUserService = false): Promise<{
    enabled: boolean;
    active: boolean;
    status: string;
  }> {
    return await this.serviceManager.getServiceStatus(name, useUserService);
  }

  /**
   * Start instance using service (if enabled) or direct process
   */
  async startInstanceWithService(name: string, useUserService = false): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    if (config.spec.service?.enabled && await this.serviceManager.isSystemdAvailable()) {
      // Start using systemd service
      await this.serviceManager.startService(name, useUserService);
      
      // Wait for service to start and update status
      await new Promise(resolve => setTimeout(resolve, 2000));
      const serviceStatus = await this.serviceManager.getServiceStatus(name, useUserService);
      
      config.status = {
        state: serviceStatus.active ? 'running' : 'stopped',
        startTime: serviceStatus.active ? new Date().toISOString() : undefined,
        version: config.spec.version,
        connections: 0,
        service: serviceStatus,
      };
    } else {
      // Start using direct process (existing method)
      await this.startInstance(name);
    }
  }

  /**
   * Stop instance using service (if enabled) or direct process
   */
  async stopInstanceWithService(name: string, useUserService = false): Promise<void> {
    const config = await this.configManager.getInstanceConfig(name);
    if (!config) {
      throw new Error(`Instance '${name}' not found`);
    }

    if (config.spec.service?.enabled && await this.serviceManager.isSystemdAvailable()) {
      // Stop using systemd service
      await this.serviceManager.stopService(name, useUserService);
      
      // Update status
      const serviceStatus = await this.serviceManager.getServiceStatus(name, useUserService);
      config.status = {
        state: 'stopped',
        lastRestart: config.status?.startTime,
        version: config.spec.version,
        connections: 0,
        service: serviceStatus,
      };
    } else {
      // Stop using direct process (existing method)
      await this.stopInstance(name);
    }
  }
}