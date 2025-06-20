// Mock environment variables for Jest tests
if (process.env.JEST_WORKER_ID !== undefined) {
  process.env.MOODLE_URL = process.env.MOODLE_URL || 'http://mockmoodle.example.com';
  process.env.MOODLE_TOKEN = process.env.MOODLE_TOKEN || 'mocktoken';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  // Add any other environment variables that are essential for the config to load without errors.
  // For example, if it expects specific DB connection strings and they are checked, mock them too.
}

// src/config/index.ts
import dotenv from "dotenv";
dotenv.config(); // <--- CHAMADA 1: Tenta carregar .env do CWD (Current Working Directory)

import path from "path";
import { fileURLToPath } from "url";

const configModuleFilename = fileURLToPath(import.meta.url);
const configModuleDirname = path.dirname(configModuleFilename); // Em build, será E:\MCPs\school-moodle-mcp\build\config
const projectRoot = path.resolve(configModuleDirname, ".."); // Será E:\MCPs\school-moodle-mcp
const envPath = path.join(projectRoot, ".env"); // Será E:\MCPs\school-moodle-mcp\.env

console.log("=> Env path " + envPath);
// <--- CHAMADA 2: Tenta carregar .env de um caminho específico
const loadEnvResult = dotenv.config({ path: envPath });

if (loadEnvResult.error) {
  console.error(
    `Config: Error loading .env from ${envPath}: ${loadEnvResult.error.message}`
  );
} else {
  // console.info(`Config: Successfully loaded .env from ${envPath}`); // DESCOMENTE ISTO!
  // console.info('Config: Loaded variables from explicit path:', loadEnvResult.parsed); // DESCOMENTE ISTO!
}

export const MOODLE_URL = process.env.MOODLE_URL;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const NODE_TLS_REJECT_UNAUTHORIZED =
  process.env.NODE_TLS_REJECT_UNAUTHORIZED || "0"; // Mantendo a sua lógica
export const CONFIG_PORT: string = process.env.PORT || "3100";

if (!MOODLE_URL) {
  console.error(
    "Config in src/index.js: FATAL ERROR - MOODLE_URL is not defined in the environment."
  );
  process.exit(1);
}
