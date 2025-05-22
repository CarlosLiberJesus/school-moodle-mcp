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
    logLevel: 'info'
  };

  const config = { ...defaultOptions, ...options };
  
  const logDir = config.logDir;
  const logFilePath = path.join(logDir, config.logFile);

  try {
    // Garantir que o diretório existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      originalConsoleLog('Logger: Log directory created:', logDir);
    }

    // Criar stream de log
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    isFileLoggingEnabled = true;

    // Configurar eventos do stream
    logStream.on('error', (err) => {
      originalConsoleError('Logger: Error writing to log stream:', err);
      isFileLoggingEnabled = false;
    });
    
    logStream.on('open', () => {
      originalConsoleLog('Logger: Log stream opened successfully:', logFilePath);
    });

    // Configurar funções de logging
    setupLoggingFunctions(config.logLevel);

  } catch (error: any) {
    originalConsoleError('Logger: Error setting up file logger:', error.message);
    isFileLoggingEnabled = false;
  }
}

function setupLoggingFunctions(logLevel: LoggerOptions['logLevel']) {
  const createLogger = (originalConsoleFunc: (...args: any[]) => void, prefix: string) => {
    return (...args: any[]) => {
      const timestamp = new Date().toISOString();
      const formattedMessage = `${timestamp} [${prefix}] ${util.format(...args)}`;
      
      // Escrever para o ficheiro se logStream estiver definido e habilitado
      if (logStream && isFileLoggingEnabled) {
        logStream.write(formattedMessage + '\n');
      }
      
      // Escrever para a consola original
      originalConsoleFunc(formattedMessage);
    };
  };

  // Configurar funções de logging
  console.log = createLogger(originalConsoleLog, 'INFO');
  console.error = createLogger(originalConsoleError, 'ERROR');
  console.warn = createLogger(originalConsoleWarn, 'WARN');
  console.info = createLogger(originalConsoleInfo, 'INFO');
  
  // Se debug estiver habilitado, configurar também
  if (logLevel === 'debug') {
    console.debug = createLogger(originalConsoleLog, 'DEBUG');
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