#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { version } from './package.json';
import { InstanceManager } from './src/instance/manager.js';
import { ConfigManager } from './src/config/manager.js';
import { displayInstanceTable, displayInstanceDetails, displaySystemStatus, displayConnectionInfo, formatAsJson, formatAsYaml } from './src/utils/display.js';
import { validateInstanceConfig, isValidInstanceName } from './src/utils/validation.js';
import { validateSystemForPgForge, checkSystemRequirements, getInstallationInstructions } from './src/utils/system.js';

const program = new Command();
const instanceManager = new InstanceManager();
const configManager = new ConfigManager();

program
  .name('pgforge')
  .description('Modern PostgreSQL instance manager')
  .version(version, '-v, --version', 'display version number');

// Create command
program
  .command('create [name]')
  .description('create a new PostgreSQL instance')
  .option('-t, --template <template>', 'use a template (development, production, testing)')
  .option('-f, --file <file>', 'create from configuration file')
  .option('-p, --port <port>', 'specify port number', parseInt)
  .option('--version <version>', 'PostgreSQL version to use')
  .action(async (name, options) => {
    const spinner = ora('Checking system requirements...').start();
    
    try {
      // Check system requirements before creating instance
      const validation = validateSystemForPgForge();
      if (!validation.ready) {
        spinner.fail('System requirements not met. Run "pgforge check" for details.');
        process.exit(1);
      }
      
      spinner.text = 'Creating PostgreSQL instance...';
      
      if (!name && !options.file) {
        spinner.fail('Instance name is required');
        process.exit(1);
      }

      if (name && !isValidInstanceName(name)) {
        spinner.fail('Invalid instance name. Use lowercase letters, numbers, and hyphens only.');
        process.exit(1);
      }

      const config = await instanceManager.createInstance(name, options);
      
      // Validate configuration
      const errors = validateInstanceConfig(config);
      if (errors.length > 0) {
        spinner.fail('Configuration validation failed:');
        errors.forEach(error => console.log(chalk.red(`  ${error.field}: ${error.message}`)));
        process.exit(1);
      }

      spinner.succeed(`Instance '${config.metadata.name}' created successfully`);
      
      console.log();
      console.log(chalk.bold('Instance Details:'));
      console.log(`  Name: ${chalk.cyan(config.metadata.name)}`);
      console.log(`  Version: ${config.spec.version}`);
      console.log(`  Port: ${config.spec.network.port}`);
      console.log(`  Database: ${config.spec.database.name}`);
      console.log(`  Data Directory: ${config.spec.storage.dataDirectory}`);
      
      console.log();
      console.log(chalk.gray('Next steps:'));
      console.log(chalk.gray(`  Start the instance: ${chalk.white('pgforge start ' + config.metadata.name)}`));
      console.log(chalk.gray(`  View details: ${chalk.white('pgforge show ' + config.metadata.name)}`));
      
    } catch (error) {
      spinner.fail(`Failed to create instance: ${error.message}`);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('list all PostgreSQL instances')
  .option('--status <status>', 'filter by status (running, stopped)')
  .option('--format <format>', 'output format (table, json, yaml)', 'table')
  .action(async (options) => {
    const spinner = ora('Loading instances...').start();
    
    try {
      let instances = await instanceManager.listInstances();
      
      // Filter by status if specified
      if (options.status) {
        instances = instances.filter(instance => 
          instance.status?.state === options.status
        );
      }

      spinner.stop();

      if (options.format === 'json') {
        console.log(formatAsJson(instances));
      } else if (options.format === 'yaml') {
        console.log(formatAsYaml(instances));
      } else {
        displayInstanceTable(instances);
      }
      
    } catch (error) {
      spinner.fail(`Failed to list instances: ${error.message}`);
      process.exit(1);
    }
  });

// Start command
program
  .command('start <name>')
  .description('start a PostgreSQL instance')
  .action(async (name) => {
    const spinner = ora(`Starting instance '${name}'...`).start();
    
    try {
      await instanceManager.startInstance(name);
      spinner.succeed(`Instance '${name}' started successfully`);
      
      const config = await instanceManager.getInstanceStatus(name);
      if (config) {
        console.log();
        console.log(chalk.gray('Connection information:'));
        console.log(chalk.gray(`  psql -h ${config.spec.network.bindAddress} -p ${config.spec.network.port} -U ${config.spec.database.owner} -d ${config.spec.database.name}`));
      }
      
    } catch (error) {
      spinner.fail(`Failed to start instance: ${error.message}`);
      process.exit(1);
    }
  });

// Stop command
program
  .command('stop <name>')
  .description('stop a PostgreSQL instance')
  .action(async (name) => {
    const spinner = ora(`Stopping instance '${name}'...`).start();
    
    try {
      await instanceManager.stopInstance(name);
      spinner.succeed(`Instance '${name}' stopped successfully`);
      
    } catch (error) {
      spinner.fail(`Failed to stop instance: ${error.message}`);
      process.exit(1);
    }
  });

// Restart command
program
  .command('restart <name>')
  .description('restart a PostgreSQL instance')
  .action(async (name) => {
    const spinner = ora(`Restarting instance '${name}'...`).start();
    
    try {
      await instanceManager.restartInstance(name);
      spinner.succeed(`Instance '${name}' restarted successfully`);
      
    } catch (error) {
      spinner.fail(`Failed to restart instance: ${error.message}`);
      process.exit(1);
    }
  });

// Show/describe command
program
  .command('show <name>')
  .alias('describe')
  .description('show detailed information about an instance')
  .action(async (name) => {
    const spinner = ora(`Loading instance details...`).start();
    
    try {
      const config = await instanceManager.getInstanceStatus(name);
      
      if (!config) {
        spinner.fail(`Instance '${name}' not found`);
        process.exit(1);
      }

      spinner.stop();
      displayInstanceDetails(config);
      
    } catch (error) {
      spinner.fail(`Failed to show instance details: ${error.message}`);
      process.exit(1);
    }
  });

// Remove command
program
  .command('remove <name>')
  .alias('rm')
  .description('remove a PostgreSQL instance')
  .option('--backup', 'create backup before removal')
  .option('--force', 'force removal without confirmation')
  .action(async (name, options) => {
    const spinner = ora(`Removing instance '${name}'...`).start();
    
    try {
      await instanceManager.removeInstance(name, options);
      spinner.succeed(`Instance '${name}' removed successfully`);
      
    } catch (error) {
      spinner.fail(`Failed to remove instance: ${error.message}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status [name]')
  .description('show status of instance(s)')
  .action(async (name) => {
    if (name) {
      const spinner = ora(`Checking status of '${name}'...`).start();
      
      try {
        const config = await instanceManager.getInstanceStatus(name);
        
        if (!config) {
          spinner.fail(`Instance '${name}' not found`);
          process.exit(1);
        }

        spinner.stop();
        displayInstanceDetails(config);
        
      } catch (error) {
        spinner.fail(`Failed to get status: ${error.message}`);
        process.exit(1);
      }
    } else {
      displaySystemStatus();
      
      try {
        const instances = await instanceManager.listInstances();
        if (instances.length > 0) {
          console.log(chalk.bold('Instances:'));
          displayInstanceTable(instances);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to load instances: ${error.message}`));
      }
    }
  });

// Connection command
program
  .command('connection-string <name>')
  .description('get connection string for an instance')
  .option('--format <format>', 'output format (uri, env, json)', 'uri')
  .action(async (name, options) => {
    try {
      const config = await instanceManager.getInstanceStatus(name);
      
      if (!config) {
        console.log(chalk.red(`Instance '${name}' not found`));
        process.exit(1);
      }

      if (options.format === 'uri') {
        const host = config.spec.network.bindAddress === '0.0.0.0' ? 'localhost' : config.spec.network.bindAddress;
        const uri = `postgresql://${config.spec.database.owner}@${host}:${config.spec.network.port}/${config.spec.database.name}`;
        console.log(uri);
      } else if (options.format === 'env') {
        const host = config.spec.network.bindAddress === '0.0.0.0' ? 'localhost' : config.spec.network.bindAddress;
        console.log(`PGHOST=${host}`);
        console.log(`PGPORT=${config.spec.network.port}`);
        console.log(`PGDATABASE=${config.spec.database.name}`);
        console.log(`PGUSER=${config.spec.database.owner}`);
      } else if (options.format === 'json') {
        const host = config.spec.network.bindAddress === '0.0.0.0' ? 'localhost' : config.spec.network.bindAddress;
        const connectionInfo = {
          host,
          port: config.spec.network.port,
          database: config.spec.database.name,
          user: config.spec.database.owner,
          uri: `postgresql://${config.spec.database.owner}@${host}:${config.spec.network.port}/${config.spec.database.name}`
        };
        console.log(formatAsJson(connectionInfo));
      } else {
        displayConnectionInfo(config);
      }
      
    } catch (error) {
      console.log(chalk.red(`Failed to get connection info: ${error.message}`));
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('initialize PgForge configuration')
  .action(async () => {
    const spinner = ora('Initializing PgForge...').start();
    
    try {
      await configManager.ensureConfigDirectory();
      
      // Create default global config if it doesn't exist
      try {
        await configManager.getGlobalConfig();
      } catch {
        const defaultConfig = {
          apiVersion: 'v1',
          kind: 'Configuration',
          global: {
            dataRoot: '/var/lib/postgresql/pgforge',
            logRoot: '/var/log/postgresql/pgforge', 
            backupRoot: '/var/backups/postgresql/pgforge',
            postgresql: {
              packageManager: 'apt' as const,
              versions: ['15.3', '14.8', '13.11'],
              defaultVersion: '15.3',
            },
          },
        };
        await configManager.saveGlobalConfig(defaultConfig);
      }

      spinner.succeed('PgForge initialized successfully');
      
      console.log();
      console.log(chalk.bold('Configuration directory created:'));
      console.log(chalk.gray('  ~/.pgforge/'));
      console.log(chalk.gray('  ~/.pgforge/config.yaml'));
      console.log(chalk.gray('  ~/.pgforge/instances/'));
      
      console.log();
      console.log(chalk.bold('Next steps:'));
      console.log(chalk.gray(`  Create an instance: ${chalk.white('pgforge create mydb')}`));
      console.log(chalk.gray(`  List instances: ${chalk.white('pgforge list')}`));
      
    } catch (error) {
      spinner.fail(`Failed to initialize: ${error.message}`);
      process.exit(1);
    }
  });

// Check command
program
  .command('check')
  .description('check system requirements and dependencies')
  .option('--verbose', 'show detailed information')
  .action(async (options) => {
    const spinner = ora('Checking system requirements...').start();
    
    try {
      const validation = validateSystemForPgForge();
      const checks = checkSystemRequirements();
      
      spinner.stop();
      
      console.log(chalk.bold('System Requirements Check'));
      console.log('='.repeat(50));
      console.log();
      
      // Show individual requirement checks
      for (const check of checks) {
        const status = check.installed ? 
          (check.satisfiesMinVersion !== false ? chalk.green('✓') : chalk.yellow('⚠')) : 
          chalk.red('✗');
        
        let line = `${status} ${check.requirement.name}`;
        
        if (check.installed && check.version) {
          line += chalk.gray(` (v${check.version})`);
          
          if (check.requirement.minVersion) {
            if (check.satisfiesMinVersion === false) {
              line += chalk.yellow(` - requires v${check.requirement.minVersion}+`);
            }
          }
        }
        
        console.log(line);
        
        if (options.verbose && check.error) {
          console.log(chalk.gray(`    ${check.error}`));
        }
      }
      
      console.log();
      
      // Show overall status
      if (validation.ready) {
        console.log(chalk.green('✓ System is ready for PgForge'));
      } else {
        console.log(chalk.red('✗ System requires attention before using PgForge'));
        
        if (validation.issues.length > 0) {
          console.log();
          console.log(chalk.bold('Issues to resolve:'));
          validation.issues.forEach(issue => {
            console.log(chalk.red(`  • ${issue}`));
          });
        }
      }
      
      if (validation.warnings.length > 0) {
        console.log();
        console.log(chalk.bold('Warnings:'));
        validation.warnings.forEach(warning => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }
      
      // Show installation instructions if needed
      if (!validation.ready) {
        console.log();
        console.log(chalk.bold('Installation Instructions:'));
        console.log(chalk.gray('To install PostgreSQL 15.3+ with contrib packages:'));
        console.log();
        
        const instructions = getInstallationInstructions();
        if (instructions.postgresql.length > 0) {
          instructions.postgresql.forEach(cmd => {
            if (cmd.startsWith('#')) {
              console.log(chalk.gray(cmd));
            } else {
              console.log(chalk.cyan(cmd));
            }
          });
          console.log();
          instructions.postgresqlContrib.forEach(cmd => {
            console.log(chalk.cyan(cmd));
          });
        } else {
          console.log(chalk.yellow('Manual installation required - package manager not detected'));
          console.log(chalk.gray('Please visit: https://www.postgresql.org/download/'));
        }
        
        console.log();
        console.log(chalk.gray('After installation, run: pgforge check'));
      }
      
    } catch (error) {
      spinner.fail(`Failed to check system requirements: ${error.message}`);
      process.exit(1);
    }
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str))
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}