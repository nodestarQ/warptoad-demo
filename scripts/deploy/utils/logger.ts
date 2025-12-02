/**
 * Logger Utility
 * 
 * Provides consistent logging with verbosity control:
 * - Normal mode: Essential deployment info
 * - Verbose mode (--verbose flag): Detailed debug information
 * - Colored output for better readability
 */

/**
 * ANSI color codes for terminal output
 */
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

/**
 * Global verbose flag - set via setVerbose()
 */
let isVerbose = false;

/**
 * Set verbose logging mode
 * @param verbose - Enable/disable verbose logging
 */
export function setVerbose(verbose: boolean): void {
    isVerbose = verbose;
    if (verbose) {
        console.log(`${colors.dim}[Verbose mode enabled]${colors.reset}\n`);
    }
}

/**
 * Get current verbose state
 * @returns Current verbose flag value
 */
export function getVerbose(): boolean {
    return isVerbose;
}

/**
 * Log level type
 */
export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

/**
 * Main logging function with level support
 * @param message - Message to log
 * @param level - Log level (default: 'info')
 */
export function log(message: string, level: LogLevel = 'info'): void {
    let prefix = '';
    let color = colors.reset;
    
    switch (level) {
        case 'success':
            prefix = '✅';
            color = colors.green;
            break;
        case 'warning':
            prefix = '⚠️ ';
            color = colors.yellow;
            break;
        case 'error':
            prefix = '❌';
            color = colors.red;
            break;
        case 'debug':
            prefix = '🐛';
            color = colors.dim;
            break;
        case 'info':
        default:
            prefix = 'ℹ️ ';
            color = colors.cyan;
            break;
    }
    
    // Debug logs only show in verbose mode
    if (level === 'debug' && !isVerbose) {
        return;
    }
    
    const formattedMessage = `${color}${prefix} ${message}${colors.reset}`;
    console.log(formattedMessage);
}

/**
 * Log a section header (visually distinct)
 * @param title - Section title
 */
export function logSection(title: string): void {
    const line = '='.repeat(60);
    console.log(`\n${colors.bright}${colors.blue}${line}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}  ${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${line}${colors.reset}\n`);
}

/**
 * Log a subsection header (less prominent than section)
 * @param title - Subsection title
 */
export function logSubsection(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}▸ ${title}${colors.reset}`);
}

/**
 * Log a contract deployment
 * Formats: "Contract Name ................ 0xAddress"
 * @param name - Contract name
 * @param address - Contract address
 */
export function logDeployment(name: string, address: string): void {
    const padding = 40 - name.length;
    const dots = '.'.repeat(Math.max(padding, 2));
    console.log(`  ${colors.bright}${name}${colors.reset} ${colors.dim}${dots}${colors.reset} ${colors.green}${address}${colors.reset}`);
}

/**
 * Log only in verbose mode
 * Useful for detailed debug information
 * @param message - Message to log (only if verbose)
 */
export function logVerbose(message: string): void {
    if (isVerbose) {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`${colors.dim}[${timestamp}] ${message}${colors.reset}`);
    }
}

/**
 * Log a step in a process
 * @param currentStep - Current step number
 * @param totalSteps - Total number of steps
 * @param description - Step description
 */
export function logStep(currentStep: number, totalSteps: number, description: string): void {
    console.log(`\n${colors.bright}[${currentStep}/${totalSteps}]${colors.reset} ${description}`);
}

/**
 * Log an error with stack trace (if available)
 * @param error - Error object or string
 * @param context - Optional context for the error
 */
export function logError(error: unknown, context?: string): void {
    const contextStr = context ? `${context}: ` : '';
    
    if (error instanceof Error) {
        console.error(`${colors.red}❌ ${contextStr}${error.message}${colors.reset}`);
        if (isVerbose && error.stack) {
            console.error(`${colors.dim}${error.stack}${colors.reset}`);
        }
    } else {
        console.error(`${colors.red}❌ ${contextStr}${String(error)}${colors.reset}`);
    }
}

/**
 * Log a warning message
 * @param message - Warning message
 */
export function logWarning(message: string): void {
    console.warn(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

/**
 * Log a success message
 * @param message - Success message
 */
export function logSuccess(message: string): void {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

/**
 * Log progress indicator (spinner-like)
 * @param message - Progress message
 */
export function logProgress(message: string): void {
    process.stdout.write(`${colors.cyan}⏳ ${message}...${colors.reset}\r`);
}

/**
 * Clear progress indicator
 */
export function clearProgress(): void {
    process.stdout.write('\r\x1b[K'); // Clear line
}

/**
 * Log a table (for deployment summaries)
 * @param headers - Table headers
 * @param rows - Table rows (array of arrays)
 */
export function logTable(headers: string[], rows: string[][]): void {
    // Calculate column widths
    const colWidths = headers.map((header, i) => {
        const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
        return Math.max(header.length, maxRowWidth) + 2; // +2 for padding
    });
    
    // Print header
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
    console.log(`\n${colors.bright}${headerRow}${colors.reset}`);
    console.log(colWidths.map(w => '-'.repeat(w)).join('-+-'));
    
    // Print rows
    rows.forEach(row => {
        const formattedRow = row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' | ');
        console.log(formattedRow);
    });
    console.log('');
}

/**
 * Log a box message (for important notices)
 * @param message - Message to display in box
 * @param type - Box type (affects color)
 */
export function logBox(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const lines = message.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const width = maxLength + 4; // +4 for padding
    
    let color = colors.cyan;
    switch (type) {
        case 'success': color = colors.green; break;
        case 'warning': color = colors.yellow; break;
        case 'error': color = colors.red; break;
    }
    
    const topBottom = `${color}${'═'.repeat(width)}${colors.reset}`;
    
    console.log('\n' + topBottom);
    lines.forEach(line => {
        const padding = ' '.repeat(Math.max(0, maxLength - line.length));
        console.log(`${color}║${colors.reset} ${line}${padding} ${color}║${colors.reset}`);
    });
    console.log(topBottom + '\n');
}

/**
 * Parse --verbose flag from command line arguments
 * @returns true if --verbose flag is present
 */
export function parseVerboseFlag(): boolean {
    return process.argv.includes('--verbose') || process.argv.includes('-v');
}
