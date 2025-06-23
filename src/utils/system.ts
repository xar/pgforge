import { execSync } from 'child_process';
import { existsSync } from 'fs';

export interface SystemRequirement {
  name: string;
  command: string;
  description: string;
  required: boolean;
  minVersion?: string;
}

export interface SystemCheckResult {
  requirement: SystemRequirement;
  installed: boolean;
  version?: string;
  error?: string;
  satisfiesMinVersion?: boolean;
}

export const SYSTEM_REQUIREMENTS: SystemRequirement[] = [
  {
    name: 'PostgreSQL Server',
    command: 'postgres',
    description: 'PostgreSQL database server',
    required: true,
    minVersion: '15.3'
  },
  {
    name: 'PostgreSQL Client',
    command: 'psql',
    description: 'PostgreSQL command-line client',
    required: true
  },
  {
    name: 'pg_dump',
    command: 'pg_dump',
    description: 'PostgreSQL backup utility',
    required: true
  },
  {
    name: 'pg_restore',
    command: 'pg_restore',
    description: 'PostgreSQL restore utility',
    required: true
  },
  {
    name: 'initdb',
    command: 'initdb',
    description: 'PostgreSQL database cluster initialization',
    required: true
  }
];

export function checkSystemRequirements(): SystemCheckResult[] {
  return SYSTEM_REQUIREMENTS.map(requirement => checkRequirement(requirement));
}

export function checkRequirement(requirement: SystemRequirement): SystemCheckResult {
  const result: SystemCheckResult = {
    requirement,
    installed: false
  };

  try {
    // Check if command exists
    const whichResult = execSync(`which ${requirement.command}`, { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    }).trim();
    
    if (!whichResult) {
      result.error = `Command '${requirement.command}' not found`;
      return result;
    }

    result.installed = true;

    // Get version information
    try {
      const version = getCommandVersion(requirement.command);
      result.version = version;

      // Check minimum version if specified
      if (requirement.minVersion && version) {
        result.satisfiesMinVersion = compareVersions(version, requirement.minVersion) >= 0;
      }
    } catch (versionError) {
      result.error = `Could not determine version: ${versionError.message}`;
    }

  } catch (error) {
    result.error = `Command '${requirement.command}' not found in PATH`;
  }

  return result;
}

export function getCommandVersion(command: string): string | null {
  try {
    let versionOutput: string;
    
    switch (command) {
      case 'postgres':
        versionOutput = execSync('postgres --version', { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'psql':
        versionOutput = execSync('psql --version', { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'pg_dump':
        versionOutput = execSync('pg_dump --version', { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'pg_restore':
        versionOutput = execSync('pg_restore --version', { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'initdb':
        versionOutput = execSync('initdb --version', { encoding: 'utf8', stdio: 'pipe' });
        break;
      default:
        return null;
    }

    // Extract version number from output
    const versionMatch = versionOutput.match(/(\d+\.\d+(?:\.\d+)?)/);
    return versionMatch ? versionMatch[1] : null;
  } catch (error) {
    return null;
  }
}

export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

export function checkPostgreSQLPackages(): { postgresql: boolean; postgresqlContrib: boolean } {
  const result = {
    postgresql: false,
    postgresqlContrib: false
  };

  try {
    // Check if we're on a Debian/Ubuntu system
    if (existsSync('/usr/bin/dpkg')) {
      try {
        execSync('dpkg -l postgresql* | grep "^ii"', { stdio: 'pipe' });
        result.postgresql = true;
      } catch {
        // PostgreSQL package not installed
      }

      try {
        execSync('dpkg -l postgresql-contrib* | grep "^ii"', { stdio: 'pipe' });
        result.postgresqlContrib = true;
      } catch {
        // PostgreSQL contrib not installed
      }
    }
    // Check if we're on a RedHat/CentOS system
    else if (existsSync('/usr/bin/rpm')) {
      try {
        execSync('rpm -qa | grep postgresql-server', { stdio: 'pipe' });
        result.postgresql = true;
      } catch {
        // PostgreSQL package not installed
      }

      try {
        execSync('rpm -qa | grep postgresql-contrib', { stdio: 'pipe' });
        result.postgresqlContrib = true;
      } catch {
        // PostgreSQL contrib not installed
      }
    }
  } catch (error) {
    // Error checking packages
  }

  return result;
}

export function getInstallationInstructions(): {
  postgresql: string[];
  postgresqlContrib: string[];
} {
  const instructions = {
    postgresql: [] as string[],
    postgresqlContrib: [] as string[]
  };

  // Determine package manager and provide appropriate instructions
  if (existsSync('/usr/bin/apt')) {
    // Ubuntu/Debian
    instructions.postgresql = [
      '# Add PostgreSQL official APT repository for latest version',
      'wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -',
      'echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list',
      'sudo apt update',
      'sudo apt install postgresql-15 postgresql-client-15'
    ];
    
    instructions.postgresqlContrib = [
      'sudo apt install postgresql-contrib-15'
    ];
  } else if (existsSync('/usr/bin/yum')) {
    // CentOS/RHEL
    instructions.postgresql = [
      '# Add PostgreSQL official repository for latest version',
      'sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm',
      'sudo yum install -y postgresql15-server postgresql15'
    ];
    
    instructions.postgresqlContrib = [
      'sudo yum install -y postgresql15-contrib'
    ];
  } else if (existsSync('/usr/bin/dnf')) {
    // Fedora
    instructions.postgresql = [
      '# Add PostgreSQL official repository for latest version',
      'sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/F-36-x86_64/pgdg-fedora-repo-latest.noarch.rpm',
      'sudo dnf install -y postgresql15-server postgresql15'
    ];
    
    instructions.postgresqlContrib = [
      'sudo dnf install -y postgresql15-contrib'
    ];
  }

  return instructions;
}

export function validateSystemForPgForge(): {
  ready: boolean;
  issues: string[];
  warnings: string[];
} {
  const result = {
    ready: true,
    issues: [] as string[],
    warnings: [] as string[]
  };

  // Check system requirements
  const checks = checkSystemRequirements();
  
  for (const check of checks) {
    if (!check.installed && check.requirement.required) {
      result.ready = false;
      result.issues.push(`Missing required dependency: ${check.requirement.name} (${check.requirement.command})`);
    } else if (check.installed && check.requirement.minVersion && check.satisfiesMinVersion === false) {
      result.ready = false;
      result.issues.push(
        `${check.requirement.name} version ${check.version} is below minimum required version ${check.requirement.minVersion}`
      );
    } else if (check.installed && check.error) {
      result.warnings.push(`Warning with ${check.requirement.name}: ${check.error}`);
    }
  }

  // Check PostgreSQL packages
  const packages = checkPostgreSQLPackages();
  if (!packages.postgresql) {
    result.warnings.push('PostgreSQL package not detected via package manager (may be installed manually)');
  }
  if (!packages.postgresqlContrib) {
    result.warnings.push('PostgreSQL contrib package not detected via package manager');
  }

  return result;
}