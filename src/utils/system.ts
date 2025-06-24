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

  // First try the standard which approach
  let commandPath = findCommandInPath(requirement.command);
  
  // If not found in PATH, try PostgreSQL-specific locations
  if (!commandPath && (requirement.command === 'postgres' || requirement.command === 'initdb')) {
    commandPath = findPostgreSQLCommand(requirement.command);
  }

  if (!commandPath) {
    result.error = `Command '${requirement.command}' not found in PATH or common PostgreSQL locations`;
    return result;
  }

  result.installed = true;

  // Get version information
  try {
    const version = getCommandVersion(requirement.command, commandPath);
    result.version = version;

    // Check minimum version if specified
    if (requirement.minVersion && version) {
      result.satisfiesMinVersion = compareVersions(version, requirement.minVersion) >= 0;
    }
  } catch (versionError) {
    result.error = `Could not determine version: ${versionError.message}`;
  }

  return result;
}

export function findCommandInPath(command: string): string | null {
  try {
    const whichResult = execSync(`which ${command}`, { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    }).trim();
    
    return whichResult || null;
  } catch (error) {
    return null;
  }
}

function findPostgreSQLCommand(command: string): string | null {
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

  // Try to find PostgreSQL installation using systemctl or service command
  if (command === 'postgres') {
    return findPostgreSQLServerBinary();
  }

  return null;
}

function findPostgreSQLServerBinary(): string | null {
  try {
    // Try to find PostgreSQL service and extract binary path
    const systemctlResult = execSync('systemctl show postgresql --property=ExecStart 2>/dev/null || systemctl show postgresql* --property=ExecStart 2>/dev/null | head -1', {
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (systemctlResult && systemctlResult.includes('ExecStart=')) {
      const execStart = systemctlResult.split('ExecStart=')[1];
      if (execStart) {
        // Extract binary path from systemctl output
        const binaryMatch = execStart.match(/([^\s]+postgres[^\s]*)/);
        if (binaryMatch && existsSync(binaryMatch[1])) {
          return binaryMatch[1];
        }
      }
    }
  } catch {
    // systemctl failed, continue with other methods
  }

  try {
    // Try using ps to find running postgres processes
    const psResult = execSync('ps aux | grep "postgres.*-D" | grep -v grep | head -1', {
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (psResult) {
      const processPath = psResult.split(/\s+/)[10]; // Binary path is typically the 11th field
      if (processPath && processPath.includes('postgres') && existsSync(processPath)) {
        return processPath;
      }
    }
  } catch {
    // ps failed, continue
  }

  return null;
}

export function getCommandVersion(command: string, commandPath?: string): string | null {
  try {
    let versionOutput: string;
    const cmdToRun = commandPath || command;
    
    switch (command) {
      case 'postgres':
        versionOutput = execSync(`"${cmdToRun}" --version`, { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'psql':
        versionOutput = execSync(`"${cmdToRun}" --version`, { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'pg_dump':
        versionOutput = execSync(`"${cmdToRun}" --version`, { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'pg_restore':
        versionOutput = execSync(`"${cmdToRun}" --version`, { encoding: 'utf8', stdio: 'pipe' });
        break;
      case 'initdb':
        versionOutput = execSync(`"${cmdToRun}" --version`, { encoding: 'utf8', stdio: 'pipe' });
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
        const output = execSync('dpkg -l postgresql* | grep "^ii"', { encoding: 'utf8', stdio: 'pipe' });
        result.postgresql = output.includes('postgresql') && (output.includes('postgresql-') || output.includes('postgresql\t'));
      } catch {
        // PostgreSQL package not installed via dpkg, but check for manual installations
        result.postgresql = checkManualPostgreSQLInstallation();
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
        // PostgreSQL package not installed via rpm, but check for manual installations
        result.postgresql = checkManualPostgreSQLInstallation();
      }

      try {
        execSync('rpm -qa | grep postgresql-contrib', { stdio: 'pipe' });
        result.postgresqlContrib = true;
      } catch {
        // PostgreSQL contrib not installed
      }
    } else {
      // No package manager detected, check for manual installation
      result.postgresql = checkManualPostgreSQLInstallation();
    }
  } catch (error) {
    // Error checking packages, try manual detection
    result.postgresql = checkManualPostgreSQLInstallation();
  }

  return result;
}

function checkManualPostgreSQLInstallation(): boolean {
  // Check common PostgreSQL installation directories
  const commonDataDirs = [
    '/var/lib/postgresql',
    '/usr/local/var/postgres',
    '/opt/postgresql',
    '/var/lib/pgsql'
  ];

  for (const dir of commonDataDirs) {
    if (existsSync(dir)) {
      return true;
    }
  }

  // Check if PostgreSQL service exists
  try {
    execSync('systemctl list-unit-files | grep postgresql', { stdio: 'pipe' });
    return true;
  } catch {
    // No systemctl or no postgresql service
  }

  // Check for running PostgreSQL processes
  try {
    execSync('pgrep postgres', { stdio: 'pipe' });
    return true;
  } catch {
    // No running postgres processes
  }

  return false;
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

  // Check PostgreSQL packages and provide better guidance
  const packages = checkPostgreSQLPackages();
  if (!packages.postgresql) {
    // Only warn if we also can't find the binaries
    const serverCheck = checks.find(c => c.requirement.command === 'postgres');
    const initdbCheck = checks.find(c => c.requirement.command === 'initdb');
    
    if (!serverCheck?.installed || !initdbCheck?.installed) {
      result.warnings.push('PostgreSQL server installation not fully detected. Consider adding PostgreSQL bin directory to PATH if installed.');
    }
  }
  if (!packages.postgresqlContrib) {
    result.warnings.push('PostgreSQL contrib package not detected via package manager');
  }

  // Add helpful PATH guidance if server components are missing
  const missingServerComponents = checks.filter(c => 
    !c.installed && (c.requirement.command === 'postgres' || c.requirement.command === 'initdb')
  );
  
  if (missingServerComponents.length > 0) {
    result.warnings.push('If PostgreSQL is installed, try adding its bin directory to your PATH (e.g., export PATH="/usr/lib/postgresql/15/bin:$PATH")');
  }

  return result;
}