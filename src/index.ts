// src/index.ts
import { setupFileLogger } from '../lib/logger.js';
import { MoodleMCP } from './mcp_server.js';
import './../config/index.js';

// --- Configuração do Logger ---
const __dirname = new URL('.', import.meta.url).pathname;
setupFileLogger(__dirname, {
    logLevel: 'debug',
    logDir: `${__dirname}/logs`,
    logFile: 'mcp_server.log'
});

// --- Inicialização da Aplicação ---
async function main() {
    let mcp: MoodleMCP;
    try {
        mcp = new MoodleMCP();
        await mcp.run();
    } catch (error) {
        console.error('Failed to start MCP server:', error);
        process.exit(1);
    }
}

main();
