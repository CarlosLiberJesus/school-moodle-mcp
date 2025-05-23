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

export function setupFileLogger(logDirectoryPath: string, options: LoggerOptions = {}) {
    // logDirectoryPath é o caminho completo para o diretório onde a pasta 'logs' deve ESTAR ou SER CRIADA
    // Ex: E:\MCPs\school-moodle-mcp\logs

    const defaultOptions: Required<LoggerOptions> = {
        logDir: logDirectoryPath, // Usar o caminho diretamente
        logFile: 'mcp_server.log',
        logLevel: getLogLevelFromEnv() || 'info'
    };

    const config = { ...defaultOptions, ...options };
    // config.logDir será agora o 'projectRootLogsDir' que passamos.

    // Create log directory if it doesn't exist
    try {
        // O config.logDir JÁ É o diretório final dos logs (ex: 'E:\MCPs\school-moodle-mcp\logs')
        if (!fs.existsSync(config.logDir)) {
            originalConsoleLog('Logger: Attempting to create log directory:', config.logDir); // Modificado para clareza
            fs.mkdirSync(config.logDir, { recursive: true });
        }
    } catch (error) {
        console.error(`Failed to create log directory at ${config.logDir}: ${error}`); // Adicionar path ao log
        return;
    }

    // Create log file stream
    try {
        const logFilePath = path.join(config.logDir, config.logFile); // Construir o caminho completo para o ficheiro
        originalConsoleLog('Logger: Attempting to create log file at:', logFilePath); // Log do caminho do ficheiro
        logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        isFileLoggingEnabled = true;
        originalConsoleLog('Logger: Successfully logging to file:', logFilePath); // Log de sucesso
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