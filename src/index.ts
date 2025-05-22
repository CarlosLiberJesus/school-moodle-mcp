// src/index.ts
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { setupFileLogger } from './../lib/logger.js'; // Importar o setup do logger

// --- Configuração do Logger (DEVE SER A PRIMEIRA COISA) ---
// Obter o __dirname para o script atual (index.ts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // Este __dirname será 'src' em dev, 'build' após compilação
setupFileLogger(__dirname, {
  logLevel: 'debug', // ou 'info', 'warn', 'error'
  logDir: path.join(__dirname, 'logs'), // caminho personalizado
  logFile: 'mcp_server.log' // nome do arquivo
});
// A partir daqui, console.log, etc., estão sobrescritos.

// --- Configuração Global (ex: NODE_TLS_REJECT_UNAUTHORIZED) ---
// Esta linha afeta todas as chamadas HTTPS do processo.
// É carregada de config/index.ts agora, mas pode ser definida aqui se necessário globalmente antes de config.
// import { NODE_TLS_REJECT_UNAUTHORIZED } from './config/index.js'; // Se precisar de aceder aqui
// if (NODE_TLS_REJECT_UNAUTHORIZED === '0') {
//   process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
//   console.info("Global NODE_TLS_REJECT_UNAUTHORIZED set to '0'. SSL/TLS certificate verification is disabled for this process.");
// }


// --- Imports Principais da Aplicação (depois do logger e config global) ---
import { MoodleMCP } from './mcp_server.js';
import './../config/index.js'; // Importar para executar e verificar config (MOODLE_URL/TOKEN)

async function main() {
  try {
    console.info("Initializing Moodle MCP server...");
    const mcpServer = new MoodleMCP();
    await mcpServer.run();
  } catch (error: any) {
    console.error('Failed to start Moodle MCP server:', error.message, error.stack);
    process.exit(1);
  }
}

main();