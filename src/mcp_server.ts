// src/mcp_server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  // CallToolResultSchema, // Se existir e for necessário tipar a resposta
  ListToolsRequestSchema,
  // ListToolsResultSchema, // Se existir
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { MoodleApiClient } from './../moodle/moodle_api_client.js';
import { toolDefinitions, ToolDefinitionSchema } from './../tools/tool_definitions.js';
import type { 
    GetCourseContentsInput, 
    GetPageModuleContentInput, 
    GetResourceFileContentInput 
} from './../moodle/moodle_types.js'; // Tipos de input para as tools

export class MoodleMCP {
  private server: Server;
  private moodleClient: MoodleApiClient;
  private version: string = '0.2.7'; // Versão incrementada

  constructor() {
    this.moodleClient = new MoodleApiClient();

    const serverCapabilitiesTools = Object.fromEntries(
        toolDefinitions.map((td: ToolDefinitionSchema) => [
            td.name, 
            {
                description: td.description,
                inputSchema: td.inputSchema,
            }
        ])
    );

    console.log("Loaded tools:", toolDefinitions.map(t => t.name));

    this.server = new Server(
      {
        name: 'school-moodle-mcp',
        version: this.version,
      },
      {
        capabilities: {
          resources: {}, // Pode ser preenchido no futuro
          tools: serverCapabilitiesTools,
        }
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('MCP Server Core Error:', error);
    
    const signalHandler = async (signal: string) => {
      console.info(`Received ${signal}, Moodle MCP server shutting down...`);
      await this.server.close().catch(err => console.error('Error during server close:', err));
      process.exit(0);
    };
    process.on('SIGINT', () => signalHandler('SIGINT'));
    process.on('SIGTERM', () => signalHandler('SIGTERM'));
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      console.info("Received ListToolsRequest:", JSON.stringify(request, null, 2));
      return {
        tools: toolDefinitions.map(td => ({ // Mapear para a estrutura que o SDK espera
          name: td.name,
          description: td.description,
          inputSchema: td.inputSchema,
        })),
      }; // Adicionar 'as ListToolsResultSchema' se o SDK tiver este tipo
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      // Usar a sua solução para obter o input:
      const toolInput = request.params.input || (request.params as any).arguments || {};
      
      console.info(`Received CallToolRequest for tool: ${toolName}`, "Input:", JSON.stringify(toolInput, null, 2));

      let resultData: any;

      try {
        switch (toolName) {
          case 'get_courses':
            resultData = await this.moodleClient.getCourses();
            break;

          case 'get_course_contents':
            const { course_id } = toolInput as GetCourseContentsInput;
            if (typeof course_id !== 'number') {
              throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'course_id' (number) for ${toolName}. Received: ${course_id}`);
            }
            resultData = await this.moodleClient.getCourseContents(course_id);
            break;

          case 'get_page_module_content':
            const { page_content_url } = toolInput as GetPageModuleContentInput;
            if (typeof page_content_url !== 'string' || !page_content_url.startsWith('http')) {
              throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'page_content_url' (string URL) for ${toolName}. Received: ${page_content_url}`);
            }
            const htmlAsTextContent = await this.moodleClient.getPageModuleContentByUrl(page_content_url);
            // Esta tool retorna texto diretamente, não um objeto JSON a ser stringificado
            return { content: [{ type: 'text', text: htmlAsTextContent || "[Conteúdo da página não encontrado ou vazio]" }] };

          case 'get_resource_file_content':
            const { resource_file_url, mimetype } = toolInput as GetResourceFileContentInput;
            if (typeof resource_file_url !== 'string' || !resource_file_url.startsWith('http')) {
              throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'resource_file_url' (string URL) for ${toolName}. Received: ${resource_file_url}`);
            }
            if (typeof mimetype !== 'string' || mimetype.trim() === '') {
              throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'mimetype' (string) for ${toolName}. Received: ${mimetype}`);
            }
            const fileTextContent = await this.moodleClient.getResourceFileContent(resource_file_url, mimetype);
            // Esta tool retorna texto diretamente
            return { content: [{ type: 'text', text: fileTextContent || "[Conteúdo do ficheiro não extraído ou vazio]" }] };

          case 'get_activity_details':
            const { activity_id } = toolInput;
            if (typeof activity_id !== 'number') {
              throw new McpError(ErrorCode.InvalidParams, `Missing or invalid 'activity_id' (number) for ${toolName}. Received: ${activity_id}`);
            }
            resultData = await this.moodleClient.getActivityDetails(activity_id);
            break;

          default:
            console.warn(`Unknown tool called: ${toolName}`);
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        // Resposta padrão para tools que retornam dados estruturados (JSON)
        return {
          content: [{
              type: 'text', // Ou 'json_string' / 'json_object' se o SDK suportar
              text: JSON.stringify(resultData, null, 2),
          }],
        }; // Adicionar 'as CallToolResultSchema' se o SDK tiver
      } catch (error: any) {
          if (error instanceof McpError) {
              console.error(`MCP Error calling tool ${toolName}:`, error.message, `(Code: ${error.code})`);
              throw error; // Re-throw McpError para o SDK tratar
          }
          console.error(`Unexpected error calling tool ${toolName}:`, error);
          throw new McpError(ErrorCode.InternalError, `Unexpected error in tool ${toolName}: ${error.message}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(`Moodle MCP server v${this.version} running on stdio...`);
  }
}
