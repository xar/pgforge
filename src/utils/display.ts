import chalk from 'chalk';
import type { PostgreSQLInstanceConfig } from '../config/types.js';

export function displayInstanceTable(instances: PostgreSQLInstanceConfig[]): void {
  if (instances.length === 0) {
    console.log(chalk.gray('No instances found. Use "pgforge create" to create one.'));
    return;
  }

  console.log();
  console.log(chalk.bold('PostgreSQL Instances:'));
  console.log(chalk.gray('─'.repeat(80)));

  const headers = ['NAME', 'STATUS', 'VERSION', 'PORT', 'DATABASE', 'AUTO-START'];
  const headerRow = headers.map(h => chalk.bold(h)).join('  ');
  console.log(headerRow);
  console.log(chalk.gray('─'.repeat(95)));

  for (const instance of instances) {
    const name = instance.metadata.name;
    const status = getStatusDisplay(instance.status?.state || 'unknown');
    const version = instance.spec.version;
    const port = instance.spec.network.port.toString();
    const database = instance.spec.database.name;
    const autoStart = getAutoStartDisplay(instance);

    const row = [
      chalk.cyan(name.padEnd(15)),
      status.padEnd(15),
      version.padEnd(8),
      port.padEnd(6),
      database.padEnd(20),
      autoStart.padEnd(12),
    ].join('  ');

    console.log(row);
  }

  console.log();
}

export function displayInstanceDetails(instance: PostgreSQLInstanceConfig): void {
  console.log();
  console.log(chalk.bold(`Instance: ${chalk.cyan(instance.metadata.name)}`));
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.bold('Status:'));
  console.log(`  State: ${getStatusDisplay(instance.status?.state || 'unknown')}`);
  if (instance.status?.pid) {
    console.log(`  PID: ${instance.status.pid}`);
  }
  if (instance.status?.startTime) {
    console.log(`  Started: ${new Date(instance.status.startTime).toLocaleString()}`);
  }
  if (instance.status?.connections !== undefined) {
    console.log(`  Connections: ${instance.status.connections}`);
  }

  // Display service status if available
  if (instance.status?.service) {
    console.log();
    console.log(chalk.bold('Service:'));
    console.log(`  Auto-start: ${instance.status.service.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
    console.log(`  Service Active: ${instance.status.service.active ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Service Status: ${chalk.yellow(instance.status.service.status || 'unknown')}`);
  } else if (instance.spec.service?.enabled) {
    console.log();
    console.log(chalk.bold('Service:'));
    console.log(`  Auto-start: ${chalk.green('Enabled')}`);
    console.log(`  Service Status: ${chalk.gray('Check with: pgforge service-status ' + instance.metadata.name)}`);
  }

  console.log();
  console.log(chalk.bold('Configuration:'));
  console.log(`  Version: ${instance.spec.version}`);
  console.log(`  Port: ${instance.spec.network.port}`);
  console.log(`  Bind Address: ${instance.spec.network.bindAddress}`);
  console.log(`  Max Connections: ${instance.spec.network.maxConnections}`);

  console.log();
  console.log(chalk.bold('Database:'));
  console.log(`  Name: ${instance.spec.database.name}`);
  console.log(`  Owner: ${instance.spec.database.owner}`);
  console.log(`  Encoding: ${instance.spec.database.encoding}`);
  console.log(`  Locale: ${instance.spec.database.locale}`);

  console.log();
  console.log(chalk.bold('Storage:'));
  console.log(`  Data Directory: ${instance.spec.storage.dataDirectory}`);
  console.log(`  Log Directory: ${instance.spec.storage.logDirectory}`);

  if (instance.spec.security?.ssl?.enabled) {
    console.log();
    console.log(chalk.bold('Security:'));
    console.log(`  SSL: ${chalk.green('Enabled')}`);
    console.log(`  Auth Method: ${instance.spec.security.authentication?.method || 'md5'}`);
  }

  if (instance.spec.backup?.enabled) {
    console.log();
    console.log(chalk.bold('Backup:'));
    console.log(`  Enabled: ${chalk.green('Yes')}`);
    console.log(`  Schedule: ${instance.spec.backup.schedule || 'Not configured'}`);
    console.log(`  Retention: ${instance.spec.backup.retention || 'Not configured'}`);
  }

  console.log();
}

export function displaySystemStatus(): void {
  console.log();
  console.log(chalk.bold('PgForge System Status'));
  console.log(chalk.gray('─'.repeat(30)));
  
  console.log(`Version: ${chalk.cyan('0.1.0')}`);
  console.log(`Config Directory: ${chalk.gray('~/.pgforge')}`);
  console.log(`Runtime: ${chalk.green('Bun ' + process.version)}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  
  console.log();
}

export function getStatusDisplay(state: string): string {
  switch (state) {
    case 'running':
      return chalk.green('●') + ' Running';
    case 'stopped':
      return chalk.red('●') + ' Stopped';
    case 'starting':
      return chalk.yellow('●') + ' Starting';
    case 'stopping':
      return chalk.yellow('●') + ' Stopping';
    case 'error':
      return chalk.red('●') + ' Error';
    default:
      return chalk.gray('●') + ' Unknown';
  }
}

export function getAutoStartDisplay(instance: PostgreSQLInstanceConfig): string {
  if (instance.status?.service?.enabled) {
    return chalk.green('✓ Enabled');
  } else if (instance.spec.service?.enabled) {
    return chalk.yellow('✓ Configured');
  } else {
    return chalk.gray('✗ Disabled');
  }
}

export function displayConnectionInfo(instance: PostgreSQLInstanceConfig): void {
  console.log();
  console.log(chalk.bold(`Connection Information for ${chalk.cyan(instance.metadata.name)}`));
  console.log(chalk.gray('─'.repeat(50)));

  const host = instance.spec.network.bindAddress === '0.0.0.0' ? 'localhost' : instance.spec.network.bindAddress;
  const port = instance.spec.network.port;
  const database = instance.spec.database.name;
  const user = instance.spec.database.owner;

  console.log(chalk.bold('Connection String (URI):'));
  console.log(chalk.gray(`postgresql://${user}@${host}:${port}/${database}`));

  console.log();
  console.log(chalk.bold('Individual Parameters:'));
  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`Database: ${database}`);
  console.log(`User: ${user}`);

  console.log();
  console.log(chalk.bold('psql Command:'));
  console.log(chalk.gray(`psql -h ${host} -p ${port} -U ${user} -d ${database}`));

  console.log();
}

export function formatAsJson(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function formatAsYaml(data: any): string {
  const YAML = require('yaml');
  return YAML.stringify(data, { indent: 2 });
}