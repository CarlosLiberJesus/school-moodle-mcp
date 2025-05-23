// src/mcp_server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, // Reintroduzir estes
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js'; // Certifique-se que os tipos do SDK estão aqui
import { z } from 'zod';
import { MoodleApiClient } from './../moodle/moodle_api_client.js';
import { toolDefinitions, ToolDefinitionSchema } from './../tools/tool_definitions.js';
import { ToolValidator } from './../tools/tool_validators.js';
import type { 
    GetCourseContentsInput, 
    GetPageModuleContentInput, 
    GetResourceFileContentInput,
    MoodleModuleContent 
} from './../moodle/moodle_types.js';
import pkg from '../package.json' with { type: "json" };


export class MoodleMCP {
  private server: Server;
  private moodleClient: MoodleApiClient;
  private version: string = pkg.version;
  private toolValidator: ToolValidator;

  constructor() {
    this.moodleClient = new MoodleApiClient();
    this.toolValidator = ToolValidator.getInstance();

    // A Informação do Servidor (nome, versão)
    const serverInfo = {
      name: 'school-moodle-mcp',
      version: this.version,
    };

    // As Capacidades do Servidor
    // A forma como 'tools' aqui é preenchido é CRUCIAL para como o SDK
    // lida com ListTools e CallTool.
    const serverCapabilities = {
      capabilities: {
        resources: {}, // Deixe como está por agora
        // AQUI é o ponto chave.
        // Se o SDK @modelcontextprotocol/sdk espera um array de definições de ferramentas aqui
        // para que ele próprio trate o ListTools, então deveria ser:
        tools: toolDefinitions.reduce((acc, td) => {
          acc[td.name] = {
            description: td.description,
            inputSchema: td.inputSchema,
          };
          return acc;
        }, {} as Record<string, { description: string; inputSchema: any }>),
        // Se o SDK não usa isto para ListTools e depende 100% do seu handler
        // ListToolsRequestSchema, então isto poderia ser um objeto vazio:
        // tools: {}, // <-- TENTATIVA 2: Deixar vazio e confiar nos handlers abaixo
      }
    };

    this.server = new Server(serverInfo, serverCapabilities);

    // Reintroduza os handlers específicos do SDK
    this.setupSdkRequestHandlers();

    this.server.onerror = (error) => {
      // Tentar obter mais detalhes do erro, se possível
      console.error('MCP Server Core Error:', error, JSON.stringify(error, null, 2));
      if (error && (error as any).stack) {
        console.error('MCP Server Core Error Stack:', (error as any).stack);
      }
    };

    // ... (signal handlers)
  }

  private setupSdkRequestHandlers() {
    // Handler para ListTools
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      console.info("SDK: Received ListToolsRequest"); // Removido JSON.stringify para brevidade
      const toolsForSdk = toolDefinitions.map(td => ({
        name: td.name,
        description: td.description,
        inputSchema: td.inputSchema,
      }));
      console.debug("SDK: Responding to ListToolsRequest with:", toolsForSdk.map(t=>t.name));
      return { tools: toolsForSdk };
    });

    // Handler para CallTool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const toolInput = request.params.input || (request.params as any).arguments || {};
      
      console.info(`SDK: Received CallToolRequest for tool: '${toolName}' with input:`, toolInput);

      try {
        const resultData = await this.handleToolInternal(toolName, toolInput);

        if (typeof resultData === 'string') {
            console.debug(`SDK: Responding to CallToolRequest for '${toolName}' with text content.`);
            return { content: [{ type: 'text', text: resultData }] };
        }
        console.debug(`SDK: Responding to CallToolRequest for '${toolName}' with JSON content (stringified).`);
        return {
          content: [{
              type: 'text', // Idealmente, o SDK teria um tipo 'json_object' ou 'application/json'
              text: JSON.stringify(resultData, null, 2),
          }],
        };
      } catch (error: any) {
          // ... (seu tratamento de erro, que parece bom)
          if (error instanceof McpError) {
              console.error(`MCP Error in SDK CallTool for ${toolName}:`, error.message, `(Code: ${error.code})`);
              throw error;
          }
          console.error(`Unexpected error in SDK CallTool for ${toolName}:`, error);
          throw new McpError(ErrorCode.InternalError, `Unexpected error in SDK tool ${toolName}: ${error.message}`);
      }
    });
  }

  // Renomeie o seu handler de lógica principal para evitar conflito de nomes
  // e para que ele possa ser chamado tanto pelo SDK quanto pelos seus testes.
  private async handleToolInternal(toolName: string, input: Record<string, any>): Promise<any> {
    const toolDefinition = toolDefinitions.find(td => td.name === toolName);
    if (!toolDefinition) {
      // Este erro deve ser capturado antes pelo SDK se a ferramenta não foi listada,
      // mas é uma boa salvaguarda.
      console.warn(`handleToolInternal: Unknown tool called: ${toolName}`);
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    const validation = this.toolValidator.validateInput(toolName, input);
    if (!validation.isValid || !validation.validatedData) { // Adicionado check para validatedData
      console.error(`handleToolInternal: Invalid input for ${toolName}:`, validation.error?.message, "Input:", input);
      throw validation.error || new McpError(ErrorCode.InvalidParams, "Unknown validation error");
    }
    const validatedInput = validation.validatedData;
    
    console.debug(`handleToolInternal: Calling tool '${toolName}' with validated input:`, validatedInput);

    // A sua lógica de switch que chama this.moodleClient...
    // Adapte o retorno para que o handler do SDK CallToolRequestSchema possa formatá-lo.
    switch (toolName) {
      case 'get_courses':
        return await this.moodleClient.getCourses();
      case 'get_course_contents': {
        const { course_id } = validatedInput as { course_id: number };
        return await this.moodleClient.getCourseContents(course_id);
      }
      case 'get_page_module_content': {
        const { page_content_url } = validatedInput as { page_content_url: string };
        const htmlAsTextContent = await this.moodleClient.getPageModuleContentByUrl(page_content_url);
        return htmlAsTextContent || "[Conteúdo da página não encontrado ou vazio]"; // Retorna string diretamente
      }
      case 'get_resource_file_content': {
        // ...
        const fileTextContent = await this.moodleClient.getResourceFileContent(validatedInput.resource_file_url, validatedInput.mimetype);
        return fileTextContent || "[Conteúdo do ficheiro não extraído ou vazio]"; // Retorna string diretamente
      }
      case 'get_activity_details': {
        // ...
        return await this.moodleClient.getActivityDetails(validatedInput);
      }
      // ... seus outros cases para 'analyze_activity_content', 'fetch_activity_content'
      // Certifique-se que eles também retornam os dados brutos que o handler do SDK pode então stringificar ou envolver.
      default:
        console.warn(`handleToolInternal: Switch case not found for tool: ${toolName}`);
        throw new McpError(ErrorCode.MethodNotFound, `Tool logic not implemented in switch: ${toolName}`);
    }
  }

  // O seu método para testes pode continuar a existir e chamar handleToolInternal
  async callToolForTests(toolName: string, input: Record<string, any>): Promise<any> {
    // Este método é para os seus testes locais, não para o SDK MCP.
    return await this.handleToolInternal(toolName, input);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(`Moodle MCP server v${this.version} running on stdio...`);
  }
}
