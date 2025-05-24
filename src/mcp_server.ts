// src/mcp_server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, // Reintroduzir estes
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js'; // Certifique-se que os tipos do SDK estão aqui
import { MoodleApiClient } from './../moodle/moodle_api_client.js';
import { toolDefinitions, ToolDefinitionSchema } from './../tools/tool_definitions.js';
import { ToolValidator } from './../tools/tool_validators.js';
import type { 
    GetCourseContentsInput,
    MoodleModuleContent 
} from './../moodle/moodle_types.js';
import pkg from '../package.json' with { type: "json" };
import * as cheerio from 'cheerio';


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

    type ToolMap = Record<string, Pick<ToolDefinitionSchema, "description" | "inputSchema" | "outputSchema">>;

    // As Capacidades do Servidor
    // A forma como 'tools' aqui lida com ListTools e CallTool.
    const serverCapabilities = {
      capabilities: {
        resources: {}, 
        // Se o SDK @modelcontextprotocol/sdk espera um array de definições de ferramentas aqui
        tools: toolDefinitions.reduce((acc, td) => {
          acc[td.name] = {
            description: td.description,
            inputSchema: td.inputSchema,
            outputSchema: td.outputSchema,
          };
          return acc;
        }, {} as ToolMap),
      }
    };

    this.server = new Server(serverInfo, serverCapabilities);

    // Reintroduza os handlers específicos do SDK
    this.setupSdkRequestHandlers();

    this.server.onerror = (error) => {
      // Tentar obter mais detalhes do erro, se possível
      console.error('MCP Server Core Error:', error, JSON.stringify(error, null, 2));
      if (error instanceof Error && error.stack) {
        console.error('MCP Server Core Error Stack:', error.stack);
      }
    };

    // ... (signal handlers)
  }

  private setupSdkRequestHandlers() {
    // Handler para ListTools
    this.server.setRequestHandler(ListToolsRequestSchema, async (_request) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      } catch (error: unknown) {
          if (error instanceof McpError) throw error;
          // Type guard para Error
          if (error && typeof error === "object" && "message" in error) {
            console.error(
              `MCP Error in SDK CallTool for ${toolName}:`,
              (error as { message?: string }).message
            );
            throw new McpError(
              ErrorCode.InternalError,
              `MCP Error in SDK CallTool for ${toolName}: ${
                (error as { message?: string }).message
              }`
            );
          } else {
            // fallback para erros não convencionais
            console.error(
              `MCP Error in SDK CallTool for ${toolName}:`,
              error
            );
            throw new McpError(
              ErrorCode.InternalError,
              `MCP Error in SDK CallTool for ${toolName}: ${JSON.stringify(
                error
              )}`
            );
          }
        }
    });
  }

  // Renomeie o seu handler de lógica principal para evitar conflito de nomes
  // e para que ele possa ser chamado tanto pelo SDK quanto pelos seus testes.
  private async handleToolInternal(toolName: string, input: Record<string, unknown>): Promise<unknown> {
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
        const { course_id } = validatedInput as GetCourseContentsInput;
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
      case 'fetch_activity_content': {
        const { activity_id, course_name, activity_name } = validatedInput;
        let activityDetails;

        if (activity_id !== undefined) {
            activityDetails = await this.moodleClient.getActivityDetails({ activity_id });
        } else if (course_name && activity_name) {
            activityDetails = await this.moodleClient.getActivityDetails({ course_name, activity_name });
        } else {
            throw new McpError(ErrorCode.InvalidParams, 'Insufficient parameters for fetch_activity_content');
        }

        if (!activityDetails) {
            throw new McpError(ErrorCode.InvalidParams, 'Activity details not found for fetching content.');
        }

        const modname = activityDetails.modname?.toLowerCase();
        const contents = activityDetails.contents || [];

        console.debug('DEBUG fetch_activity_content: activityDetails received:', JSON.stringify(activityDetails, null, 2));

        if (modname === 'page') {
            // Encontrar a URL correta para o conteúdo da página
            // A 'url' no objeto do módulo 'page' geralmente é a view.php,
            // mas 'contents' pode ter um 'fileurl' mais direto se o módulo for estruturado assim.
            // Para 'mod_page', o 'intro' (descrição) PODE ser o conteúdo principal se for simples,
            // ou pode haver um 'contentfiles' dentro de 'contents'.
            // Se 'activityDetails.contents' tiver um item com type 'content' e 'fileurl', use-o.
            // Se não, e a 'activityDetails.url' for a melhor aposta:
            const pageViewUrl = activityDetails.url; // URL para view.php?id=X
            if (pageViewUrl) {
                // Se a descrição já contiver o conteúdo (comum em 'page')
                if (activityDetails.description && typeof activityDetails.description === 'string') {
                    // Você pode querer limpar o HTML da descrição aqui
                    const $ = cheerio.load(activityDetails.description);
                    return $('body').text().trim() || "[Descrição da página como conteúdo]";
                }
                // Ou se 'contents' tiver o conteúdo (mais complexo para 'page')
                // Este é um fallback, getPageModuleContentByUrl espera uma URL que retorna HTML direto.
                // A URL do módulo de página pode já ser o que você precisa.
                // Se 'contents' tem a URL do conteúdo real:
                const contentEntry = contents.find((c: MoodleModuleContent) => c.type === 'content' || c.type === 'file'); // Moodle pode variar
                if (contentEntry && contentEntry.fileurl) {
                    return await this.moodleClient.getPageModuleContentByUrl(contentEntry.fileurl);
                }
                // Fallback para a URL principal do módulo se a estrutura acima não for encontrada
                return await this.moodleClient.getPageModuleContentByUrl(pageViewUrl);
            }
            return "[Conteúdo da página não pôde ser determinado]";
        } else if (modname === 'resource' && contents.length > 0) {
            const resourceFile = contents.find((c: MoodleModuleContent) => c.type === 'file'); // Pode ser o primeiro, ou filtrar por tipo
            if (resourceFile && resourceFile.fileurl && resourceFile.mimetype) {
                return await this.moodleClient.getResourceFileContent(resourceFile.fileurl, resourceFile.mimetype);
            }
            return "[Ficheiro do recurso não encontrado ou mimetype em falta]";
        } else if (modname === 'assign' && activityDetails.intro) {
            // Para trabalhos (assign), o 'intro' (descrição) é o conteúdo principal.
            // Limpar HTML se necessário
            const $ = cheerio.load(activityDetails.intro);
            return $('body').text().trim() || "[Descrição do trabalho]";
        }
        // Adicione mais 'else if' para outros modnames (quiz, forum, etc.) se quiser extrair o seu "conteúdo" principal
        
        // Se não for nenhum dos tipos conhecidos para extração de conteúdo direto,
        // talvez retornar a descrição geral ou um aviso.
        if (activityDetails.description) { // Moodle 4.x pode usar 'description'
            const $ = cheerio.load(activityDetails.description);
            return $('body').text().trim() || "[Descrição da atividade]";
        }
        if (activityDetails.intro) { // Moodle mais antigo pode usar 'intro'
            const $ = cheerio.load(activityDetails.intro);
            return $('body').text().trim() || "[Introdução da atividade]";
        }

        return `[Conteúdo não extraível diretamente para modname: ${modname}. Detalhes da atividade retornados.]`;
    }

      // Certifique-se que eles também retornam os dados brutos que o handler do SDK pode então stringificar ou envolver.
      default:
        console.warn(`handleToolInternal: Switch case not found for tool: ${toolName}`);
        throw new McpError(ErrorCode.MethodNotFound, `Tool logic not implemented in switch: ${toolName}`);
    }
  }

  // O seu método para testes pode continuar a existir e chamar handleToolInternal
  async callToolForTests(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    // Este método é para os seus testes locais, não para o SDK MCP.
    return await this.handleToolInternal(toolName, input);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(`Moodle MCP server v${this.version} running on stdio...`);
  }
}
