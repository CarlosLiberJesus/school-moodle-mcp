// src/mcp_server.ts
import fs from 'fs'; // Keep this one
import path from 'path'; // Keep this one
import { fileURLToPath } from 'url'; // Keep this one
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
    MoodleModuleContent,
    MoodleForumDiscussion
} from './../moodle/moodle_types.js';
// import pkg from '../package.json' with { type: "json" };

// Helper to get __dirname in ES modules for mcp_server.ts
const mcpModuleFilename = fileURLToPath(import.meta.url);
const mcpModuleDirname = path.dirname(mcpModuleFilename);

// Load package.json for version
const packageJsonPath = path.resolve(mcpModuleDirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
// Removed duplicated imports and __filename/__dirname blocks
import * as cheerio from 'cheerio';
import { MOODLE_URL } from "../config/index.js";


export class MoodleMCP {
  private server: Server;
  private version: string = pkg.version;
  private toolValidator: ToolValidator;

  constructor() {
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
    const { moodle_token, ...actualToolParams } = validation.validatedData;
    
    if (!moodle_token) { // Dupla verificação, embora o Zod já deva ter apanhado
      throw new McpError(ErrorCode.InvalidParams, `Moodle token not provided for tool ${toolName}.`);
    }

    // ADICIONADO: Instanciar MoodleApiClient com o token fornecido
    const moodleClient = new MoodleApiClient(moodle_token);

    console.debug(`handleToolInternal: Calling tool '${toolName}' with validated input (token redacted from log):`, actualToolParams);

    // A sua lógica de switch que chama this.moodleClient...
    // Adapte o retorno para que o handler do SDK CallToolRequestSchema possa formatá-lo.
    switch (toolName) {
      case 'get_courses': {
        const { course_name_filter } = actualToolParams as { course_name_filter?: string | null }; // Permitir null
        let courses = await moodleClient.getCourses();
        if (course_name_filter && typeof course_name_filter === "string" && course_name_filter.trim() !== "") {
          const filterText = course_name_filter.toLowerCase().trim();
          courses = courses.filter(course =>
            (course.fullname && course.fullname.toLowerCase().includes(filterText)) ||
            (course.shortname && course.shortname.toLowerCase().includes(filterText))
          );
        }
        return courses;
      }
      case 'get_course_contents': {
        const { course_id } = actualToolParams as GetCourseContentsInput;
        return await moodleClient.getCourseContents(course_id);
      }
      case 'get_course_activities': {
        const { course_id } = actualToolParams as { course_id: number };
        const sections = await moodleClient.getCourseContents(course_id);
        const activitiesList: { id: number; name: string; url: string | null; timemodified: number }[] = [];
        if (sections && sections.length > 0) {
          for (const section of sections) {
            if (section.modules && section.modules.length > 0) {
              for (const module of section.modules) {
                activitiesList.push({
                  id: module.id,
                  name: module.name,
                  url: module.url || null, // Ensure null if undefined
                  timemodified: module.timemodified || 0, // Default to 0 if undefined, as schema requires integer
                });
              }
            }
          }
        }
        return activitiesList;
      }
      case 'get_page_module_content': {
        const { page_content_url } = actualToolParams as { page_content_url: string };
        const htmlAsTextContent = await moodleClient.getPageModuleContentByUrl(page_content_url);
        return htmlAsTextContent || "[Conteúdo da página não encontrado ou vazio]"; // Retorna string diretamente
      }
      case 'get_resource_file_content': {
        // ...
        const fileTextContent = await moodleClient.getResourceFileContent(actualToolParams.resource_file_url, actualToolParams.mimetype);
        return fileTextContent || "[Conteúdo do ficheiro não extraído ou vazio]"; // Retorna string diretamente
      }
      case 'get_activity_details': {
        // ...
        return await moodleClient.getActivityDetails(actualToolParams);
      }
      case 'fetch_activity_content': {
        const { activity_id, course_id, activity_name } = actualToolParams as { activity_id?: number; course_id?: number; activity_name?: string };
        let baseActivityDetails; // Detalhes básicos do módulo

        // Passo 1: Obter os detalhes básicos da atividade (cmid, course_id, modname, instance, etc.)
        // Usando a lógica já refinada de get_activity_details
        if (activity_id !== undefined) { // activity_id é o cmid
            baseActivityDetails = await moodleClient.getActivityDetails({ activity_id });
        } else if (course_id && activity_name) {
            baseActivityDetails = await moodleClient.getActivityDetails({ course_id, activity_name });
        } else {
            throw new McpError(ErrorCode.InvalidParams, 'Insufficient parameters for fetch_activity_content. Provide activity_id OR (course_id AND activity_name).');
        }

        if (!baseActivityDetails) {
            throw new McpError(ErrorCode.InvalidParams, 'Activity details not found for fetching content.');
        }

        // Extrair informações cruciais dos detalhes base
        const cmid = baseActivityDetails.id; // Course Module ID
        const effectiveCourseId = baseActivityDetails.course; // Garantir que temos o course_id
        const activityUrl = baseActivityDetails.url || (baseActivityDetails.id ? `${(MOODLE_URL ?? '').replace('/webservice/rest/server.php', '')}/mod/${baseActivityDetails.modname}/view.php?id=${baseActivityDetails.id}` : "URL da atividade não disponível");
        if (!effectiveCourseId) {
            throw new McpError(ErrorCode.InternalError, 'Could not determine course_id for activity');
        }
        console.debug(`Debug courseId: effectiveCourseId=${effectiveCourseId}, baseActivityDetails.course=${baseActivityDetails.course}, course_id=${course_id}`);

        const modname = baseActivityDetails.modname?.toLowerCase();
        const instanceId = baseActivityDetails.instance; // ID da instância do módulo (e.g., ID na tabela 'assign')

        console.debug(`fetch_activity_content: Base details for cmid ${cmid}, modname ${modname}, instance ${instanceId}, course ${effectiveCourseId}`);

        // Passo 2: Usar APIs específicas do Moodle com base no modname
        let richContent: string | object = `[Conteúdo não processado para modname: ${modname}]`;
        type ActivityFile = { filename: string; fileurl: string; mimetype: string };
        let files: ActivityFile[] = [];

        switch (modname) {
            case 'assign': {
              // effectiveCourseId e instanceId são extraídos corretamente de baseActivityDetails.
              // Assegura-te que eles são efetivamente números.
              const numericCourseId = Number(effectiveCourseId);
              const numericInstanceId = Number(instanceId);

              if (isNaN(numericCourseId) || isNaN(numericInstanceId)) {
                  throw new McpError(ErrorCode.InternalError, `Invalid courseId or instanceId for assign: courseId=${effectiveCourseId}, instanceId=${instanceId}`);
              }

              console.debug(`Fetching rich content for assign (instance: ${numericInstanceId}, course: ${numericCourseId})`);
              try {
                  // Chama getAssignmentDetails com courseId e instanceId
                  const assignmentData = await moodleClient.getAssignmentDetails(
                      numericCourseId,
                      numericInstanceId
                  );

                  if (assignmentData && assignmentData.intro) {
                      const $ = cheerio.load(assignmentData.intro);
                      richContent = $.text().trim() || "[Descrição do trabalho vazia ou apenas HTML]";

                      if (assignmentData.introfiles && assignmentData.introfiles.length > 0) {
                          files = assignmentData.introfiles.map((file: MoodleModuleContent) => ({
                              filename: file.filename ?? '',
                              fileurl: file.fileurl ?? '',
                              mimetype: file.mimetype ?? '',
                          }));
                          richContent += `\n\nFicheiros Anexos: ${files.map(f => f.filename).join(', ')}`;
                      }
                  } else {
                      // Se assignmentData for encontrado mas não tiver 'intro'
                      if (assignmentData) {
                          richContent = "[Detalhes do trabalho encontrados, mas a descrição (intro) está em falta ou vazia]";
                          console.warn("Assignment data found but 'intro' is missing:", JSON.stringify(assignmentData, null, 2));
                      } else {
                          // Este caso não deveria acontecer se getAssignmentDetails lançar erro quando não encontra
                          richContent = "[Descrição (intro) do trabalho não encontrada nos detalhes ricos (assignmentData nulo/undefined)]";
                      }
                  }
              } catch (e) {
                  if (e instanceof McpError) { // Re-lançar McpError
                      console.error(`MCP Error fetching rich assignment details: ${e.message} (Code: ${e.code})`);
                      richContent = `[Erro ao buscar detalhes do trabalho: ${e.message}]`;
                  } else if (e && typeof e === 'object' && 'message' in e) {
                      console.error(`Error fetching rich assignment details: ${(e as Error).message}`);
                      richContent = `[Erro ao buscar detalhes do trabalho: ${(e as Error).message}]`;
                  } else {
                      console.error(`Unknown error fetching rich assignment details:`, e);
                      richContent = `[Erro desconhecido ao buscar detalhes do trabalho: ${JSON.stringify(e)}]`;
                  }
              }
              break;
            }
            case 'page': {
                console.debug(`Fetching rich content for page (cmid: ${cmid})`);
                // baseActivityDetails (de core_course_get_course_module) pode já ter o conteúdo.
                let pageHtmlContent = "";
                if (baseActivityDetails.description) { // Algumas páginas simples usam a descrição
                    pageHtmlContent = baseActivityDetails.description;
                }
                // Verificar 'contents' ou 'contentfiles' para o HTML principal
                // O objeto baseActivityDetails.contents pode variar
                const pageContents = baseActivityDetails.contents || (Array.isArray(baseActivityDetails.contentfiles) && baseActivityDetails.contentfiles.length > 0 ? [{
                    type: 'file', // Assumindo
                    filename: baseActivityDetails.contentfiles[0]?.filename,
                    fileurl: baseActivityDetails.contentfiles[0]?.fileurl,
                    mimetype: baseActivityDetails.contentfiles[0]?.mimetype,
                }] : []);

                const mainHtmlFile = pageContents.find((c: MoodleModuleContent) => c.type === 'file' && c.mimetype && c.mimetype.includes('text/html'));

                if (mainHtmlFile && mainHtmlFile.fileurl) {
                    try {
                        // getPageModuleContentByUrl PRECISA usar o token para URLs de ficheiros de conteúdo
                        pageHtmlContent = await moodleClient.getPageModuleContentByUrl(mainHtmlFile.fileurl); // Esta função precisa ser robusta e usar o token
                    } catch (e) {
                          if (e && typeof e === 'object' && 'message' in e) {
                            console.warn(`Failed to fetch page content from fileurl ${mainHtmlFile.fileurl}: ${(e as { message?: string }).message}. Falling back to description or URL.`);
                          } else {
                            console.warn(`Failed to fetch page content from fileurl ${mainHtmlFile.fileurl}: ${JSON.stringify(e)}. Falling back to description or URL.`);
                          }
                          if (!pageHtmlContent && baseActivityDetails.url) { // Fallback para a URL principal se a descrição for vazia
                            try {
                                pageHtmlContent = await moodleClient.getPageModuleContentByUrl(baseActivityDetails.url);
                            } catch (e2) {
                                if (e2 && typeof e2 === 'object' && 'message' in e2) {
                                    console.error(`Error fetching page content from main URL ${baseActivityDetails.url}: ${(e2 as { message?: string }).message}`);
                                } else {
                                    console.error(`Error fetching page content from main URL ${baseActivityDetails.url}: ${JSON.stringify(e2)}`);
                                }
                            }
                          }
                    }
                } 
                if (!pageHtmlContent && baseActivityDetails.description) { // Tentar descrição primeiro se não usou fileurl
                  pageHtmlContent = baseActivityDetails.description;
                }
                if (!pageHtmlContent && baseActivityDetails.url) { // Se não há description nem fileurl, tentar a URL principal
                      try {
                        pageHtmlContent = await moodleClient.getPageModuleContentByUrl(baseActivityDetails.url);
                    } catch (e) {
                        if (e && typeof e === 'object' && 'message' in e) {
                            console.error(`Error fetching page content from main URL ${baseActivityDetails.url}: ${(e as { message?: string }).message}`);
                        } else {
                            console.error(`Error fetching page content from main URL ${baseActivityDetails.url}: ${JSON.stringify(e)}`);
                        }
                    }
                }

                if (pageHtmlContent) {
                    const $ = cheerio.load(pageHtmlContent);
                    richContent = $.text().trim() || "[Conteúdo da página vazio ou apenas HTML]";
                } else {
                    richContent = "[Conteúdo da página não encontrado]";
                }
                break;
            }

            case 'resource': {
                console.debug(`Fetching rich content for resource (cmid: ${cmid})`);
                const resourceContents = baseActivityDetails.contents || [];
                const mainFile = resourceContents.find((c: MoodleModuleContent) => c.type === 'file');
                if (mainFile && mainFile.fileurl && mainFile.mimetype) {
                    try {
                        // getResourceFileContent PRECISA usar o token
                        richContent = await moodleClient.getResourceFileContent(mainFile.fileurl, mainFile.mimetype);
                        files = [{
                            filename: mainFile.filename ?? '',
                            fileurl: mainFile.fileurl ?? '',
                            mimetype: mainFile.mimetype ?? ''
                        }];
                    } catch (e) {
                        if (e && typeof e === 'object' && 'message' in e) {
                            console.error(`Error fetching resource content: ${(e as { message?: string }).message}`);
                            richContent = `[Erro ao buscar conteúdo do recurso: ${(e as { message?: string }).message}]`;
                        } else {
                            console.error(`Error fetching resource content:`, e);
                            richContent = `[Erro ao buscar conteúdo do recurso: ${JSON.stringify(e)}]`;
                        }
                    }
                } else {
                    richContent = "[Ficheiro do recurso não encontrado ou mimetype em falta]";
                }
                break;
            }

            case 'url': {
                console.debug(`Fetching rich content for URL (cmid: ${cmid})`);
                // Para um módulo URL, o "conteúdo" é a própria URL externa e a sua descrição.
                // A API core_course_get_course_module já deve ter os detalhes.
                const externalUrl = baseActivityDetails.contents?.[0]?.fileurl || baseActivityDetails.url; // O Moodle pode colocar a URL externa aqui
                const description = baseActivityDetails.description || baseActivityDetails.intro || "";
                const $ = cheerio.load(description);
                richContent = `URL: ${externalUrl}\nDescrição: ${$.text().trim()}`;
                break;
            }

            case 'forum': {
                console.debug(`Fetching rich content for forum (instance: ${instanceId}, course: ${effectiveCourseId})`);
                // Usar mod_forum_get_forum_discussions_paginated ou mod_forum_get_forum_discussions
                // Para obter, por exemplo, os N tópicos mais recentes e a descrição do fórum.
                try {
                    const forumData = await moodleClient.getForumDiscussions(instanceId, /* options */);
                    let forumIntro = baseActivityDetails.intro || baseActivityDetails.description || "";
                    if (forumIntro) {
                        const $intro = cheerio.load(forumIntro);
                        forumIntro = `Introdução do Fórum: ${$intro.text().trim()}\n\n`;
                    }

                    if (forumData && forumData.discussions && forumData.discussions.length > 0) {
                        const discussionSummaries = forumData.discussions.slice(0, 5)
                          .map((d: MoodleForumDiscussion) => `- Tópico: "${d.name}" por ${d.userfullname} (Respostas: ${d.numreplies})`)
                          .join('\n');
                        richContent = `${forumIntro}Últimas Discussões:\n${discussionSummaries}`;
                    } else {
                        richContent = `${forumIntro}[Nenhuma discussão encontrada ou fórum vazio]`;
                    }
                } catch (e) {
                    if (e && typeof e === 'object' && 'message' in e) {
                        console.error(`Error fetching forum discussions: ${(e as { message?: string }).message}`);
                        richContent = `[Erro ao buscar discussões do fórum: ${(e as { message?: string }).message}]`;
                    } else {
                        console.error(`Error fetching forum discussions:`, e);
                        richContent = `[Erro ao buscar discussões do fórum: ${JSON.stringify(e)}]`;
                    }
                }
                break;
            }

            // TODO: Adicionar casos para 'quiz', 'lesson', 'wiki', etc.
            // Para 'quiz', poderias usar mod_quiz_get_quizzes_by_courses (filtrando pelo instanceId)
            // ou mod_quiz_get_quiz_access_information para obter a descrição e as regras.
            // Obter as perguntas em si é mais complexo e pode não ser desejado.

            default: {
                // Fallback: tentar extrair de 'description' ou 'intro' se existirem nos baseActivityDetails
                let fallbackContent = "";
                if (baseActivityDetails.description) {
                    const $ = cheerio.load(baseActivityDetails.description);
                    fallbackContent = $.text().trim();
                } else if (baseActivityDetails.intro) {
                    const $ = cheerio.load(baseActivityDetails.intro);
                    fallbackContent = $.text().trim();
                }
                if (fallbackContent) {
                    richContent = `Descrição/Introdução: ${fallbackContent}`;
                } else {
                    richContent = `[Tipo de atividade "${modname}" não tem método de extração de conteúdo específico. Nenhuma descrição geral encontrada.]`;
                }
            }
        }

        // Passo 3: Retornar o conteúdo de forma estruturada
        // (Alinhado com o outputSchema que definimos antes)
        return {
            contentType: typeof richContent === 'string' && richContent.startsWith('[') ? 'error' : 'text', // Simplificado, pode melhorar
            content: richContent,
            files: files,
            // Adicionar mais metadados se útil:
            activityName: baseActivityDetails.name,
            activityType: modname,
            activityUrl: activityUrl,
        };
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
