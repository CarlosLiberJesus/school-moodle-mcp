// lib/logger.ts
import fs from 'fs';
import util from 'util';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import { dirname } from 'path';

// Guardar referências às funções originais da consola
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

let logStream: fs.WriteStream;
let isFileLoggingEnabled = false;

export interface LoggerOptions {
    logDir?: string;
    logFile?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export function setupFileLogger(baseDir: string, options: LoggerOptions = {}) {
    const defaultOptions: Required<LoggerOptions> = {
        logDir: path.join(baseDir, 'logs'),
        logFile: 'mcp_server.log',
        logLevel: getLogLevelFromEnv() || 'info'
    };

    const config = { ...defaultOptions, ...options };

    // Create log directory if it doesn't exist
    try {
        if (!fs.existsSync(config.logDir)) {
            fs.mkdirSync(config.logDir, { recursive: true });
        }
    } catch (error) {
        console.error(`Failed to create log directory: ${error}`);
        return;
    }

    // Create log file stream
    try {
        logStream = fs.createWriteStream(path.join(config.logDir, config.logFile), { flags: 'a' });
        isFileLoggingEnabled = true;
    } catch (error) {
        console.error(`Failed to create log file: ${error}`);
        return;
    }

    // Helper function to format log messages
    function formatLog(level: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : arg
        ).join(' ');
        return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    }

    // Override console methods
    console.log = function(...args: any[]) {
        const logMessage = formatLog('info', ...args);
        originalConsoleLog.apply(console, args);
        if (isFileLoggingEnabled) {
            logStream.write(logMessage);
        }
    };

    console.error = function(...args: any[]) {
        const logMessage = formatLog('error', ...args);
        originalConsoleError.apply(console, args);
        if (isFileLoggingEnabled) {
            logStream.write(logMessage);
        }
    };

    console.warn = function(...args: any[]) {
        const logMessage = formatLog('warn', ...args);
        originalConsoleWarn.apply(console, args);
        if (isFileLoggingEnabled) {
            logStream.write(logMessage);
        }
    };

    console.info = function(...args: any[]) {
        const logMessage = formatLog('info', ...args);
        originalConsoleInfo.apply(console, args);
        if (isFileLoggingEnabled) {
            logStream.write(logMessage);
        }
    };
}

// Helper function to safely get log level from environment
function getLogLevelFromEnv(): 'debug' | 'info' | 'warn' | 'error' | undefined {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    switch (envLevel) {
        case 'debug':
        case 'info':
        case 'warn':
        case 'error':
            return envLevel;
        default:
            return undefined;
    }
}

// Exportar funções originais
export { originalConsoleLog, originalConsoleError, originalConsoleWarn, originalConsoleInfo };

// Exportar utilitários
export function isFileLoggingActive(): boolean {
    return isFileLoggingEnabled;
}

export function getLogFilePath(): string | null {
    if (!logStream) return null;
    return logStream.path as string;
}