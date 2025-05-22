// logger-setup.ts (ou no topo do seu ficheiro principal, antes de qualquer outro código)
import fs from 'fs';
import util from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Guardar referências às funções originais da consola ANTES de as sobrescrever
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// --- Configuração do Logging para Ficheiro ---
let logStream: fs.WriteStream;
const logDir = path.resolve(__dirname, '..', 'logs'); // Usar path.resolve para caminhos absolutos mais seguros
const logFilePath = path.join(logDir, 'mcp_server.log');

originalConsoleLog('Current working directory:', process.cwd());
originalConsoleLog('Script directory (__dirname):', __dirname);
originalConsoleLog('Attempting to create log directory:', logDir);

try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        originalConsoleLog('Log directory created:', logDir);
    }

    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    originalConsoleLog('Logging to file:', logFilePath);

} catch (error: any) {
    originalConsoleError('Error setting up file logger, falling back to console only:', error.message);
    // Se a criação do stream falhar, não sobrescrevemos console.log,
    // ou podemos ter um logStream que aponta para um stream nulo ou stdout.
    // Por simplicidade aqui, vamos apenas logar o erro e continuar com a consola original.
    // Para um fallback mais robusto, poderia criar um "null stream" ou não sobrescrever.
    // Por agora, vamos assumir que se isto falhar, não fazemos o log para ficheiro.
    // OU, para garantir que as sobrescritas funcionam mas não tentam escrever no ficheiro:
    logStream = undefined as any; // Fallback: disable file logging by setting logStream to undefined
    // Melhor seria ter uma flag `isFileLoggingEnabled`.
}

// --- Sobrescrever Funções da Consola ---
// Apenas sobrescrevemos se logStream foi inicializado com sucesso
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

// src/moodle-mcp.ts
// #!/usr/bin/env node // Shebang é geralmente para scripts executáveis diretamente, pode não ser necessário se compilado e executado com node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema, // Assumindo que existe um schema para a resposta
  ListToolsRequestSchema,
  ListToolsResultSchema, // Assumindo que existe um schema para a resposta
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import https from 'node:https';
import * as cheerio from 'cheerio';
// import pdf from 'pdf-parse';
import mammoth from 'mammoth';

// Ajuste o path se o seu .env estiver em outro local em relação a este ficheiro compilado in 'build'
dotenv.config({ path: '../../.env' }); // Se este ficheiro estiver em build/src/moodle-mcp.js, e .env na raiz, o path é ../../.env
                                       // Se este ficheiro estiver em build/moodle-mcp.js, e .env na raiz, o path é ../.env

const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
const MOODLE_URL = process.env.MOODLE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!MOODLE_TOKEN) {
  console.error('MOODLE_TOKEN environment variable is required');
  if (logStream) {
    logStream.end(() => process.exit(1));
  } else {
    process.exit(1);
  }
}
if (!MOODLE_URL) {
  console.error('MOODLE_URL environment variable is required');
  if (logStream) {
    logStream.end(() => process.exit(1));
  } else {
    process.exit(1);
  }
}

// --- Moodle Client ---
// (Poderia estar num ficheiro separado, ex: src/moodle-api-client.ts)

interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  // ... outras propriedades que a API retorna e que podem ser úteis
}

interface MoodleSection {
  id: number;
  name: string;
  summary: string;
  summaryformat: number;
  visible: number;
  modules: MoodleModule[];
}

interface MoodleModule {
  id: number;
  name: string;
  modname: string; // e.g., 'forum', 'assign', 'resource', 'page'
  modplural: string;
  instance: number; // ID da instância do módulo (ex: ID da página, do recurso)
  url?: string;
  description?: string;
  visible?: number;
  contents?: MoodleModuleContent[];
  // ... outras propriedades específicas do módulo
}

interface MoodleModuleContent { // Para módulos como 'resource' ou 'page'
  type: string; // e.g., 'file'
  filename?: string;
  filepath?: string;
  filesize?: string;
  fileurl?: string;
  mimetype?: string;
  // ... para 'page', pode haver 'content' with HTML
}

class MoodleApiClient {
  private httpClient: AxiosInstance;

  constructor(baseURL: string, private token: string) {
    this.httpClient = axios.create({
      baseURL: baseURL,
      params: {
        wstoken: this.token,
        moodlewsrestformat: 'json',
      },
      httpsAgent: new https.Agent({
        // Em produção, deve usar certificados válidos e remover isto
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && NODE_ENV === 'production',
      }),
    });
  }

  private async moodleRequest<T>(wsfunction: string, params: Record<string, any> = {}): Promise<T> {
    try {
      const response = await this.httpClient.get('/webservice/rest/server.php', {
        params: {
          wsfunction,
          ...params,
        },
      });
      
      // Tratamento básico de erro do Moodle
      if (response.data && response.data.exception) {
        console.error(`Moodle API Error for ${wsfunction}:`, response.data);
        throw new McpError(
            ErrorCode.InternalError, 
            `Moodle Error (${response.data.errorcode}): ${response.data.message}`
        );
      }
      return response.data as T;
    } catch (error: any) {
      if (error instanceof McpError) throw error; // Re-throw McpError
      console.error(`Error calling Moodle function ${wsfunction}:`, error.message);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to call Moodle function ${wsfunction}: ${error.message}`
      );
    }
  }

  async getCourses(): Promise<MoodleCourse[]> {
    const courses = await this.moodleRequest<MoodleCourse[]>('core_course_get_courses');
    if (!Array.isArray(courses)) {
        console.error('Unexpected response from core_course_get_courses:', courses);
        throw new McpError(ErrorCode.InternalError, 'Moodle returned non-array for courses.');
    }
    return courses;
  }

  async getCourseContents(courseId: number): Promise<MoodleSection[]> {
    const sections = await this.moodleRequest<MoodleSection[]>('core_course_get_contents', { courseid: courseId });
    if (!Array.isArray(sections)) {
        console.error(`Unexpected response from core_course_get_contents for course ${courseId}:`, sections);
        throw new McpError(ErrorCode.InternalError, `Moodle returned non-array for course ${courseId} contents.`);
    }
    // Poderia adicionar mais processamento aqui se necessário, como filtrar módulos
    return sections;
  }

  async getPageModuleContentByUrl(pageUrl: string): Promise<string | null> {
    try {
      console.log(`Attempting to fetch page content from: ${pageUrl}`);
      const response = await axios.get(pageUrl, {
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV !== 'production',
        }),
      });
      
      const $ = cheerio.load(response.data);
      const content = $('div.page-content').text() || response.data;
      return content as string;
    } catch (error: any) {
      console.error(`Error fetching page content from URL ${pageUrl}:`, error.message);
      throw new McpError(ErrorCode.InternalError, `Could not retrieve content from page URL: ${pageUrl}. It might be inaccessible or not found.`);
    }
  }

  async getResourceFileContent(fileUrl: string): Promise<string | null> {
    try {
      console.log(`Attempting to fetch file content from: ${fileUrl}`);
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer', // Important for handling binary files
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV !== 'production',
        }),
      });

      const contentType = response.headers['content-type'];
      const buffer = Buffer.from(response.data);

      if (contentType === 'application/pdf') {
        // const data = await pdf(buffer);
        // return data.text;
        return "PDF parsing is disabled";
      } else if (
        contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const result = await mammoth.extractRawText({ buffer: buffer });
        return result.value;
      } else if (contentType === 'text/plain') {
        return buffer.toString('utf-8');
      } else {
        console.warn(`Unsupported content type: ${contentType}`);
        return `Unsupported file type: ${contentType}`;
      }
    } catch (error: any) {
      console.error(`Error fetching file content from URL ${fileUrl}:`, error.message);
      throw new McpError(
        ErrorCode.InternalError,
        `Could not retrieve content from file URL: ${fileUrl}. It might be inaccessible or not found.`
      );
    }
  }
}

// 1. Tipos para inputs/outputs das tools
interface GetCoursesInput {}
type GetCoursesOutput = MoodleCourse[];

interface GetCourseContentsInput {
  course_id: number;
}
type GetCourseContentsOutput = MoodleSection[];

interface GetPageModuleContentInput {
  page_content_url: string;
}
type GetPageModuleContentOutput = string; // HTML

interface GetResourceFileContentInput {
  page_content_url: string;
}
type GetResourceFileContentOutput = string;

// 2. ToolDefinition genérico
interface ToolDefinition<I = any, O = any> {
  name: string;
  description: string;
  inputSchema: any;
}

// 3. Definições das tools tipadas
const toolDefinitions: ToolDefinition[] = [
  {
    name: 'get_courses',
    description: 'Retrieves a list of all available courses from Moodle.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_course_contents',
    description: 'Retrieves the sections and modules for a specific course from Moodle.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'integer',
          description: 'The ID of the course to retrieve contents for.',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_page_module_content',
    description: 'Retrieves the HTML content of a Moodle "Page" module, given its direct content URL.',
    inputSchema: {
      type: 'object',
      properties: {
        page_content_url: {
          type: 'string',
          format: 'url',
          description: 'The direct URL to the Moodle page module\'s content.',
        },
      },
      required: ['page_content_url'],
    },
  },
  {
    name: 'get_resource_file_content',
    description: 'Retrieves the content of a resource file from Moodle, given its direct URL.',
    inputSchema: {
      type: 'object',
      properties: {
        page_content_url: {
          type: 'string',
          format: 'url',
          description: 'The direct URL to the Moodle resource file.',
        },
      },
      required: ['page_content_url'],
    },
  },
];

class MoodleMCP {
  private server: Server;
  private moodleClient: MoodleApiClient;
  private version: string;

  constructor() {
    this.version = '0.2.1';
    this.moodleClient = new MoodleApiClient(MOODLE_URL!, MOODLE_TOKEN!);

    this.server = new Server(
      {
        name: 'school-moodle-mcp',
        version: this.version,
      },
      {
        capabilities: {
          resources: {},
          tools: Object.fromEntries(toolDefinitions.map(td => [td.name, {
            description: td.description,
            inputSchema: td.inputSchema
          }]))
        }
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('MCP Server Error:', error);
    process.on('SIGINT', async () => {
      console.log('SIGINT received, Moodle MCP server shutting down...');
      await this.server.close();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, Moodle MCP server shutting down...');
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      console.log("Received ListToolsRequest:", request);
      return {
        tools: toolDefinitions.map(td => ({
          name: td.name,
          inputSchema: td.inputSchema,
          description: td.description,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log("CallToolRequestSchema handler called!");
      console.log("request.params:", request.params);
      console.log(`Received CallToolRequest for tool: ${request.params.name}`, request.params.input);
      const toolName = request.params.name;
      //const toolInput = request.params.input || request.params.arguments || {};
      const toolInput = request.params.arguments || {};
      console.log("toolInput:", toolInput);

      let resultData: any;

      switch (toolName) {
        case 'get_courses':
          resultData = await this.moodleClient.getCourses();
          break;

        case 'get_course_contents':
          // Log completo de request.params para ver onde os argumentos podem estar
          console.log("DEBUG: Full request.params for get_course_contents:", JSON.stringify(request.params, null, 2));
          
          //const currentToolInput = request.params.input || {}; // A sua linha atual
          const currentToolInput = request.params.arguments || {};
          console.log("DEBUG: request.params.input (toolInput) for get_course_contents:", JSON.stringify(currentToolInput, null, 2));

          // Tentar aceder a course_id de formas diferentes para teste:
          let courseId: number | undefined;

          // 1. Do input aninhado (o que você está a tentar e que está a falhar)
          if (typeof (currentToolInput as any)?.course_id === 'number') {
            courseId = (currentToolInput as any).course_id;
            console.log("DEBUG: course_id from request.params.input.course_id:", courseId);
          }
          // 2. Diretamente de params (se o SDK "achatar" os argumentos)
          else if (typeof (request.params as any)?.course_id === 'number') {
            courseId = (request.params as any).course_id;
            console.log("DEBUG: course_id from request.params.course_id:", courseId);
          }
          // 3. Se params.input for uma string JSON que precisa de ser parseada (menos provável com um SDK)
          else if (typeof request.params.input === 'string') {
            try {
              const parsedInput = JSON.parse(request.params.input);
              if (typeof parsedInput?.course_id === 'number') {
                courseId = parsedInput.course_id;
                console.log("DEBUG: course_id from parsed request.params.input:", courseId);
              } else {
                console.log("DEBUG: request.params.input is a string, but course_id not found after parsing or not a number:", parsedInput);
              }
            } catch (e) {
              console.log("DEBUG: request.params.input is a string, but failed to parse as JSON:", request.params.input, e);
            }
          } else {
              console.log("DEBUG: course_id not found in expected locations or not a number.");
          }

          console.log("Final determined courseId:", courseId);

          if (typeof courseId !== 'number') {
            throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'course_id' (number) for get_course_contents. Received in toolInput: ${JSON.stringify(currentToolInput)}, full params: ${JSON.stringify(request.params)}`);
          }
          
          resultData = await this.moodleClient.getCourseContents(courseId);
          break;

        case 'get_page_module_content':
          const pageUrl = (toolInput as any)?.page_content_url;
          if (typeof pageUrl !== 'string' || !pageUrl.startsWith('http')) {
            throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'page_content_url' (string URL) for ${toolName}. Received: ${pageUrl}`);
          }
          const htmlContent = await this.moodleClient.getPageModuleContentByUrl(pageUrl);
          if (htmlContent === null) {
            throw new McpError(ErrorCode.InternalError, `Could not retrieve content from page URL: ${pageUrl}. It might be inaccessible or not found.`);
          }
          return {
            content: [
              {
                type: 'text',
                text: htmlContent,
              },
            ],
          };
        case 'get_resource_file_content':
          const fileUrl = (toolInput as any)?.page_content_url;
          if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) {
            throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'page_content_url' (string URL) for ${toolName}. Received: ${fileUrl}`);
          }
          const fileContent = await this.moodleClient.getResourceFileContent(fileUrl);
          if (fileContent === null) {
            throw new McpError(ErrorCode.InternalError, `Could not retrieve content from file URL: ${fileUrl}. It might be inaccessible or not found.`);
          }
          return {
            content: [
              {
                type: 'text',
                text: fileContent,
              },
            ],
          };
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(`Moodle MCP server v${this.version} running on stdio...`);
  }
}

async function main() {
  try {
    const mcpServer = new MoodleMCP();
    await mcpServer.run();
  } catch (error) {
    console.error('Failed to start Moodle MCP server:', error);
    process.exit(1);
  }
}

main();
