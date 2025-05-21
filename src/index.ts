// src/moodle-mcp.ts
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
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

// Ajuste o path se o seu .env estiver em outro local em relação a este ficheiro compilado em 'build'
dotenv.config({ path: '../../.env' }); // Se este ficheiro estiver em build/src/moodle-mcp.js, e .env na raiz, o path é ../../.env
                                       // Se este ficheiro estiver em build/moodle-mcp.js, e .env na raiz, o path é ../.env

const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
const MOODLE_URL = process.env.MOODLE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!MOODLE_TOKEN) {
  console.error('MOODLE_TOKEN environment variable is required');
  process.exit(1);
}
if (!MOODLE_URL) {
  console.error('MOODLE_URL environment variable is required');
  process.exit(1);
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
  // ... para 'page', pode haver 'content' com HTML
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
      const content = $('div.page-content').html() || response.data;
      return content as string;
    } catch (error: any) {
      console.error(`Error fetching page content from URL ${pageUrl}:`, error.message);
      throw new McpError(ErrorCode.InternalError, `Could not retrieve content from page URL: ${pageUrl}. It might be inaccessible or not found.`);
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
];

class MoodleMCP {
  private server: Server;
  private moodleClient: MoodleApiClient;
  private version: string;

  constructor() {
    this.version = '0.2.0';
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
      console.log(`Received CallToolRequest for tool: ${request.params.name}`, request.params.input);
      const toolName = request.params.name;
      const toolInput = request.params.input || {};

      let resultData: any;

      switch (toolName) {
        case 'get_courses':
          resultData = await this.moodleClient.getCourses();
          break;

        case 'get_course_contents':
          const courseId = (toolInput as GetCourseContentsInput).course_id;
          if (typeof courseId !== 'number') {
            throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'course_id' (number) for ${toolName}. Received: ${courseId}`);
          }
          resultData = await this.moodleClient.getCourseContents(courseId);
          break;

        case 'get_page_module_content':
          const pageUrl = (toolInput as GetPageModuleContentInput).page_content_url;
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

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
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
