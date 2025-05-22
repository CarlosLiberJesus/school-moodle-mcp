// src/index.ts
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { setupFileLogger } from '../lib/logger.js';
import { MoodleMCP } from './mcp_server.js';

// --- Configuração de Ambiente ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// First load environment variables
const envPath = path.join(__dirname, '..', '..', '.env');
console.log(`Config: Attempting to load .env from ${envPath}`);

try {
    // Load dotenv explicitly, but don't override existing environment variables
    // This allows MCP to override .env values
    const loadEnvResult = dotenv.config({ 
        path: envPath, 
        override: false, // Don't override MCP environment variables
        debug: true
    });

    console.log('After dotenv:', JSON.stringify(process.env, null, 2));

    if (loadEnvResult.error) {
        console.warn(`Config: Warning loading .env: ${loadEnvResult.error.message}`);
    } else {
        console.log(`Config: Successfully loaded .env from ${envPath}`);
    }

    // Check required environment variables
    const requiredVars = ['MOODLE_URL', 'MOODLE_TOKEN'];
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.error(`Config: FATAL ERROR - ${varName} is not defined in the environment.`);
            //process.exit(1);
        }
    }

    // Set default values
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

    console.log('Config: Final environment variables:', {
        MOODLE_URL: process.env.MOODLE_URL,
        MOODLE_TOKEN: process.env.MOODLE_TOKEN ? '***' : 'undefined',
        NODE_ENV: process.env.NODE_ENV,
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED
    });

    // --- Configuração do Logger ---
    setupFileLogger(__dirname, {
        logLevel: 'debug',
        logDir: path.join(__dirname, 'logs'),
        logFile: 'mcp_server.log'
    });

    // --- Inicialização da Aplicação ---
    async function main() {
        const mcp = new MoodleMCP();
        try {
            await mcp.run();
        } catch (error) {
            console.error('Failed to start MCP server:', error);
            process.exit(1);
        }
    }

    main();

} catch (error: any) {
    console.error(`Config: Fatal error loading environment: ${error.message}`);
    process.exit(1);
}