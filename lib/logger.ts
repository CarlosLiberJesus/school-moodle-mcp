// src/lib/logger.ts
import fs from 'fs';
import util from 'util';
import path from 'path';

// Não precisamos de fileURLToPath e dirname aqui se for importado no index.ts que já os tem.
// Mas se este ficheiro for executado independentemente, eles seriam necessários.
// Por agora, vamos assumir que __dirname global (do entry point) ou process.cwd() são suficientes
// ou que o path é relativo ao ponto de execução.
// Para robustez, idealmente, passaria o __dirname do entry point para uma função de setup.

// Guardar referências às funções originais da consola ANTES de as sobrescrever
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

let logStream: fs.WriteStream;

export function setupFileLogger(baseDir: string) { // baseDir seria o __dirname do script principal
    const logDir = path.resolve(baseDir, '..', 'logs');
    const logFilePath = path.join(logDir, 'mcp_server.log');

    originalConsoleLog('Logger: Current working directory:', process.cwd());
    originalConsoleLog('Logger: Script base directory for logs:', baseDir);
    originalConsoleLog('Logger: Attempting to create log directory:', logDir);

    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
            originalConsoleLog('Logger: Log directory created:', logDir);
        }

        logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        originalConsoleLog('Logger: Logging to file:', logFilePath);

        logStream.on('error', (err) => {
            originalConsoleError('Logger: Error writing to log stream:', err);
        });
        logStream.on('open', () => {
            originalConsoleLog('Logger: Log stream opened successfully for file:', logFilePath);
        });

    } catch (error: any) {
        originalConsoleError('Logger: Error setting up file logger, falling back to console only:', error.message);
        //logStream = process.stdout; // Fallback
        logStream = undefined as any; // Fallback: disable file logging by setting logStream to undefined
        // Melhor seria ter uma flag `isFileLoggingEnabled`.
    }

    if (logStream) {
        const createLogger = (originalConsoleFunc: (...args: any[]) => void, prefix = '') => {
            return (...args: any[]) => {
                const timestamp = new Date().toISOString();
                const formattedMessage = `${timestamp} [${prefix || 'LOG'}] ${util.format(...args)}`;
                
                // Escrever para o ficheiro se logStream estiver definido
                if (logStream) {
                    logStream.write(formattedMessage + '\n');
                }
                
                // Escrever para a consola original
                originalConsoleFunc.apply(console, [`${timestamp} [${prefix || 'LOG'}]`, ...args]);
            };
        };

        console.log = createLogger(originalConsoleLog, 'INFO');
        console.error = createLogger(originalConsoleError, 'ERROR');
        console.warn = createLogger(originalConsoleWarn, 'WARN');
        console.info = createLogger(originalConsoleInfo, 'INFO'); // Pode querer um prefixo 'DEBUG' ou 'VERBOSE'

        console.log("File logging configured. Subsequent console messages will be logged to file and stdout.");

    } else {
        originalConsoleLog("File logging not configured (or failed). Using standard console output.");
    }
}

// Opcional: exportar as funções originais se algum módulo precisar delas especificamente
export { originalConsoleLog, originalConsoleError, originalConsoleWarn, originalConsoleInfo };