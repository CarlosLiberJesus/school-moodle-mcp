// src/index.ts
import path from "path"; // Adicione esta importação se ainda não existir
import { fileURLToPath } from "url";
import { setupFileLogger } from "../lib/logger.js";
import { MoodleMCP } from "./mcp_server.js";
import "./../config/index.js"; // Garante que config é executado

// --- Configuração do Logger ---
const currentFileDir = path.dirname(fileURLToPath(import.meta.url));

const projectRootLogsDir = path.resolve(currentFileDir, "..", "..", "logs");

setupFileLogger(projectRootLogsDir, {
  // Passar o diretório onde os logs devem ser criados
  logLevel:
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "debug", // Usar variável de ambiente se definida
  // logFile: 'mcp_server.log' // Já é o default em logger.ts
});

// --- Inicialização da Aplicação ---
async function main() {
  let mcp: MoodleMCP;
  try {
    mcp = new MoodleMCP();
    await mcp.run();
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main();
