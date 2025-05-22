// src/config/index.ts
import dotenv from 'dotenv';
import path from 'path';

// Assumindo que este ficheiro está em src/config/index.ts
// E o .env está na raiz do projeto (um nível acima de src)
// E o script compilado estará em build/config/index.js
// Então, a partir de build/config, subimos dois níveis para a raiz do projeto.
const projectRoot = path.resolve(__dirname, '..', '..'); 
const envPath = path.join(projectRoot, '.env');

const loadEnvResult = dotenv.config({ path: envPath });

if (loadEnvResult.error) {
    // Usar console.error original aqui, pois o logger pode ainda não estar configurado
    // ou podemos estar num ponto muito inicial do bootstrap.
    console.error(`Config: Error loading .env from ${envPath}: ${loadEnvResult.error.message}`);
} else {
    // console.info(`Config: Successfully loaded .env from ${envPath}`);
}


export const MOODLE_URL = process.env.MOODLE_URL;
export const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'; // Mantendo a sua lógica

if (!MOODLE_URL) {
    console.error('Config: FATAL ERROR - MOODLE_URL is not defined in the environment.');
    process.exit(1);
}
if (!MOODLE_TOKEN) {
    // Este erro é esperado se o Cline for fornecer o token, então talvez não deva ser fatal aqui,
    // ou o MCP server deve ter uma forma de receber o token do Cline.
    // Por agora, mantenho a sua lógica original de ser um requisito.
    console.error('Config: FATAL ERROR - MOODLE_TOKEN is not defined in the environment.');
    process.exit(1);
}