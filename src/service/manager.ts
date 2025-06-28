import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, access, unlink } from 'fs/promises';
import { join } from 'path';
import type { PostgreSQLInstanceConfig } from '../config/types.js';

const execAsync = promisify(exec);

export class ServiceManager {
  private systemdPath = '/etc/systemd/system';
  private userSystemdPath: string;

  constructor() {
    // User systemd services path
    this.userSystemdPath = join(process.env.HOME || '/home/' + process.env.USER, '.config/systemd/user');
  }

  /**
   * Check if systemd is available on the system
   */
  async isSystemdAvailable(): Promise<boolean> {
    try {
      await execAsync('systemctl --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Enable service auto-start for an instance
   */
  async enableService(config: PostgreSQLInstanceConfig, useUserService = false): Promise<void> {
    if (!await this.isSystemdAvailable()) {
      throw new Error('systemd is not available on this system');
    }

    const serviceName = this.getServiceName(config.metadata.name);
    const serviceFilePath = await this.createServiceFile(config, useUserService);

    try {
      if (useUserService) {
        // Enable user service
        await execAsync('systemctl --user daemon-reload');
        await execAsync(`systemctl --user enable ${serviceName}`);
      } else {
        // Enable system service (requires sudo)
        await execAsync('sudo systemctl daemon-reload');
        await execAsync(`sudo systemctl enable ${serviceName}`);
      }

      console.log(`Service ${serviceName} enabled successfully`);
    } catch (error) {
      // Clean up service file if enable failed
      try {
        await unlink(serviceFilePath);
      } catch {}
      throw new Error(`Failed to enable service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disable service auto-start for an instance
   */
  async disableService(instanceName: string, useUserService = false): Promise<void> {
    const serviceName = this.getServiceName(instanceName);

    try {
      if (useUserService) {
        await execAsync(`systemctl --user disable ${serviceName}`);
        await execAsync('systemctl --user daemon-reload');
      } else {
        await execAsync(`sudo systemctl disable ${serviceName}`);
        await execAsync('sudo systemctl daemon-reload');
      }

      // Remove service file
      const serviceFilePath = useUserService
        ? join(this.userSystemdPath, `${serviceName}.service`)
        : join(this.systemdPath, `${serviceName}.service`);

      try {
        if (useUserService) {
          await unlink(serviceFilePath);
        } else {
          await execAsync(`sudo rm -f "${serviceFilePath}"`);
        }
      } catch {
        // Service file might not exist, ignore error
      }

      console.log(`Service ${serviceName} disabled successfully`);
    } catch (error) {
      throw new Error(`Failed to disable service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Start service
   */
  async startService(instanceName: string, useUserService = false): Promise<void> {
    const serviceName = this.getServiceName(instanceName);

    try {
      if (useUserService) {
        await execAsync(`systemctl --user start ${serviceName}`);
      } else {
        await execAsync(`sudo systemctl start ${serviceName}`);
      }
    } catch (error) {
      throw new Error(`Failed to start service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stop service
   */
  async stopService(instanceName: string, useUserService = false): Promise<void> {
    const serviceName = this.getServiceName(instanceName);

    try {
      if (useUserService) {
        await execAsync(`systemctl --user stop ${serviceName}`);
      } else {
        await execAsync(`sudo systemctl stop ${serviceName}`);
      }
    } catch (error) {
      throw new Error(`Failed to stop service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get service status
   */
  async getServiceStatus(instanceName: string, useUserService = false): Promise<{
    enabled: boolean;
    active: boolean;
    status: string;
  }> {
    const serviceName = this.getServiceName(instanceName);
    const systemctlCmd = useUserService ? 'systemctl --user' : 'systemctl';

    try {
      // Check if service is enabled
      let enabled = false;
      try {
        const { stdout: enabledOutput } = await execAsync(`${systemctlCmd} is-enabled ${serviceName}`);
        enabled = enabledOutput.trim() === 'enabled';
      } catch {
        // Service not enabled or doesn't exist
      }

      // Check if service is active
      let active = false;
      let status = 'inactive';
      try {
        const { stdout: activeOutput } = await execAsync(`${systemctlCmd} is-active ${serviceName}`);
        status = activeOutput.trim();
        active = status === 'active';
      } catch {
        // Service not active or doesn't exist
      }

      return { enabled, active, status };
    } catch (error) {
      return { enabled: false, active: false, status: 'unknown' };
    }
  }

  /**
   * Create systemd service file for PostgreSQL instance
   */
  private async createServiceFile(config: PostgreSQLInstanceConfig, useUserService = false): Promise<string> {
    const serviceName = this.getServiceName(config.metadata.name);
    const serviceFilePath = useUserService
      ? join(this.userSystemdPath, `${serviceName}.service`)
      : join(this.systemdPath, `${serviceName}.service`);

    // Find PostgreSQL binary
    const postgresPath = await this.findPostgreSQLBinary('postgres', config.spec.version);

    const serviceContent = this.generateServiceFile(config, postgresPath, useUserService);

    if (useUserService) {
      // Ensure user systemd directory exists
      await execAsync(`mkdir -p "${this.userSystemdPath}"`);
      await writeFile(serviceFilePath, serviceContent);
    } else {
      // Write system service file (requires sudo)
      const tempFile = `/tmp/${serviceName}.service`;
      await writeFile(tempFile, serviceContent);
      await execAsync(`sudo mv "${tempFile}" "${serviceFilePath}"`);
      await execAsync(`sudo chown root:root "${serviceFilePath}"`);
      await execAsync(`sudo chmod 644 "${serviceFilePath}"`);
    }

    return serviceFilePath;
  }

  /**
   * Generate systemd service file content
   */
  private generateServiceFile(config: PostgreSQLInstanceConfig, postgresPath: string, useUserService: boolean): string {
    const restartPolicy = config.spec.service?.restartPolicy || 'on-failure';
    const restartSec = config.spec.service?.restartSec || 5;
    const user = useUserService ? process.env.USER || 'postgres' : 'postgres';

    // Generate socket directory path from data directory
    const socketDir = join(config.spec.storage.dataDirectory, 'sockets');
    
    return `[Unit]
Description=PostgreSQL database server for ${config.metadata.name}
Documentation=man:postgres(1)
After=network.target
Wants=network.target

[Service]
Type=notify
User=${user}
ExecStart=${postgresPath} -D ${config.spec.storage.dataDirectory} -k ${socketDir} -p ${config.spec.network.port}
ExecReload=/bin/kill -HUP $MAINPID
ExecStop=/bin/kill -TERM $MAINPID
KillMode=mixed
KillSignal=SIGINT
TimeoutSec=120
TimeoutStopSec=120

# Restart policy
Restart=${restartPolicy}
RestartSec=${restartSec}

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${config.spec.storage.dataDirectory} ${config.spec.storage.logDirectory}

# Environment
Environment=PGDATA=${config.spec.storage.dataDirectory}
Environment=PGPORT=${config.spec.network.port}

[Install]
WantedBy=${useUserService ? 'default.target' : 'multi-user.target'}
`;
  }

  /**
   * Get service name for an instance
   */
  private getServiceName(instanceName: string): string {
    return `pgforge-${instanceName}`;
  }

  /**
   * Find PostgreSQL binary (reused from InstanceManager)
   */
  private async findPostgreSQLBinary(binary: string, version: string): Promise<string> {
    const majorVersion = version.split('.')[0];
    
    const paths = [
      `/usr/lib/postgresql/${version}/bin/${binary}`,
      `/usr/pgsql-${version}/bin/${binary}`,
      `/opt/postgresql/${version}/bin/${binary}`,
      `/usr/lib/postgresql/${majorVersion}/bin/${binary}`,
      `/usr/pgsql-${majorVersion}/bin/${binary}`,
      `/opt/postgresql/${majorVersion}/bin/${binary}`,
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

    // Try using which
    try {
      const { stdout } = await execAsync(`which ${binary}`);
      const whichResult = stdout.trim();
      if (whichResult) {
        return whichResult;
      }
    } catch {}

    throw new Error(`PostgreSQL binary '${binary}' not found for version ${version}`);
  }
}