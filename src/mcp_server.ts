// src/mcp_server.ts
import fs from "fs"; // Keep this one
import path from "path"; // Keep this one
import { fileURLToPath } from "url"; // Keep this one
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// StdioServerTransport import removed
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { MoodleApiClient } from "./../moodle/moodle_api_client.js";
import {
  toolDefinitions,
  ToolDefinitionSchema,
} from "./../tools/tool_definitions.js";
import { ToolValidator } from "./../tools/tool_validators.js";
import type {
  GetCourseContentsInput,
  MoodleModuleContent,
  MoodleForumDiscussion,
} from "./../moodle/moodle_types.js";
import * as cheerio from "cheerio";
import { MOODLE_URL } from "../config/index.js";

// Helper to get __dirname in ES modules for mcp_server.ts
const mcpModuleFilename = fileURLToPath(import.meta.url);
const mcpModuleDirname = path.dirname(mcpModuleFilename);

// Load package.json for version
const packageJsonPath = path.resolve(mcpModuleDirname, "../package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

export class MoodleMCP {
  private server: Server;
  private version: string = pkg.version;
  private toolValidator: ToolValidator;

  constructor() {
    this.toolValidator = ToolValidator.getInstance();

    const serverInfo = {
      name: "school-moodle-mcp",
      version: this.version,
    };

    type ToolMap = Record<
      string,
      Pick<ToolDefinitionSchema, "description" | "inputSchema" | "outputSchema">
    >;

    const serverCapabilities = {
      capabilities: {
        resources: {},
        tools: toolDefinitions.reduce((acc, td) => {
          acc[td.name] = {
            description: td.description,
            inputSchema: td.inputSchema,
            outputSchema: td.outputSchema,
          };
          return acc;
        }, {} as ToolMap),
      },
    };

    this.server = new Server(serverInfo, serverCapabilities);
    this.setupSdkRequestHandlers(); // Chamada movida para depois da atribuição de this.server

    console.log(
      "MoodleMCP: Server instance created and request handlers being set up."
    ); // Adicionado

    this.server.onerror = (error) => {
      console.error(
        // Alterado para console.error para destaque
        "MoodleMCP: MCP Server Core Error (onerror):",
        JSON.stringify(error, null, 2) // Log do objeto de erro completo
      );
      if (error instanceof Error && error.stack) {
        console.error("MoodleMCP: MCP Server Core Error Stack:", error.stack);
      }
    };
  }

  // Method to make the SDK server instance available
  public getServer(): Server {
    return this.server;
  }

  private setupSdkRequestHandlers() {
    // Isolado para clareza
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      console.info("MoodleMCP: SDK: Received ListToolsRequest"); // Adicionado "MoodleMCP:"
      console.log("CallToolRequest received:", request?.params?.name);

      const toolsForSdk = toolDefinitions.map((td) => ({
        name: td.name,
        description: td.description,
        inputSchema: td.inputSchema,
      }));
      console.debug(
        "SDK: Responding to ListToolsRequest with:",
        toolsForSdk.map((t) => t.name)
      );
      return { tools: toolsForSdk };
    });
    console.log(
      "MoodleMCP: Handler for ListToolsRequestSchema has been set on sdkServer."
    );

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Este log é crucial para ver se este manipulador é atingido
      console.info(
        "MoodleMCP: SDK: Received CallToolRequest. Request params:",
        JSON.stringify(request.params, null, 2)
      ); // Adicionado "MoodleMCP:" e stringify

      const toolName = request.params.name;
      const toolInput =
        request.params.input || (request.params as any).arguments || {};

      console.info(
        // Adicionado "MoodleMCP:"
        `MoodleMCP: SDK: Processing CallToolRequest for tool: '${toolName}' with input:`,
        toolInput
      );

      // try { // Temporariamente comentado para o log abaixo ficar no mesmo nível
      //   const resultData = await this.handleToolInternal(toolName, toolInput);
      // } catch (error: unknown) {
      // ...
      // } // Fim do try-catch temporariamente comentado

      try {
        const resultData = await this.handleToolInternal(toolName, toolInput);

        if (typeof resultData === "string") {
          console.debug(
            `SDK: Responding to CallToolRequest for '${toolName}' with text content.`
          );
          return { content: [{ type: "text", text: resultData }] };
        }
        console.debug(
          `SDK: Responding to CallToolRequest for '${toolName}' with JSON content (stringified).`
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resultData, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        if (error instanceof McpError) throw error;
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
          console.error(`MCP Error in SDK CallTool for ${toolName}:`, error);
          throw new McpError(
            ErrorCode.InternalError,
            `MCP Error in SDK CallTool for ${toolName}: ${JSON.stringify(
              error
            )}`
          );
        }
      }
    });
    console.log(
      "MoodleMCP: Handler for CallToolRequestSchema has been set on sdkServer."
    );
  }

  private async handleToolInternal(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    const toolDefinition = toolDefinitions.find((td) => td.name === toolName);
    if (!toolDefinition) {
      console.warn(`handleToolInternal: Unknown tool called: ${toolName}`);
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    const validation = this.toolValidator.validateInput(toolName, input);
    if (!validation.isValid || !validation.validatedData) {
      console.error(
        `handleToolInternal: Invalid input for ${toolName}:`,
        validation.error?.message,
        "Input:",
        input
      );
      throw (
        validation.error ||
        new McpError(ErrorCode.InvalidParams, "Unknown validation error")
      );
    }
    const { moodle_token, ...actualToolParams } = validation.validatedData;

    if (!moodle_token) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Moodle token not provided for tool ${toolName}.`
      );
    }

    const moodleClient = new MoodleApiClient(moodle_token);

    console.debug(
      `handleToolInternal: Calling tool '${toolName}' with validated input (token redacted from log):`,
      actualToolParams
    );

    try {
      switch (toolName) {
        case "get_courses": {
          const { course_name_filter } = actualToolParams as {
            course_name_filter?: string | null;
          };
          let courses = await moodleClient.getCourses();
          if (
            course_name_filter &&
            typeof course_name_filter === "string" &&
            course_name_filter.trim() !== ""
          ) {
            const filterText = course_name_filter.toLowerCase().trim();
            courses = courses.filter(
              (course) =>
                (course.fullname &&
                  course.fullname.toLowerCase().includes(filterText)) ||
                (course.shortname &&
                  course.shortname.toLowerCase().includes(filterText))
            );
          }
          return courses;
        }
        case "get_course_contents": {
          const { course_id } = actualToolParams as GetCourseContentsInput;
          return await moodleClient.getCourseContents(course_id);
        }
        case "get_course_activities": {
          const { course_id } = actualToolParams as { course_id: number };
          const sections = await moodleClient.getCourseContents(course_id);
          const activitiesList: {
            id: number;
            name: string;
            url: string | null;
            fileurl: string | null;
            timemodified: number;
          }[] = [];
          if (sections && sections.length > 0) {
            for (const section of sections) {
              if (section.modules && section.modules.length > 0) {
                for (const module of section.modules) {
                  activitiesList.push({
                    id: module.id,
                    name: module.name,
                    url: module.url || null,
                    fileurl:
                      Array.isArray(module.contents) &&
                      module.contents.length > 0
                        ? module.contents[0].fileurl || null
                        : null,
                    timemodified:
                      Array.isArray(module.contents) &&
                      module.contents.length > 0
                        ? typeof module.contents[0].timemodified === "number"
                          ? module.contents[0].timemodified
                          : 0
                        : 0,
                  });
                }
              }
            }
          }
          return activitiesList;
        }
        case "get_page_module_content": {
          const { page_content_url } = actualToolParams as {
            page_content_url: string;
          };
          const htmlAsTextContent =
            await moodleClient.getPageModuleContentByUrl(page_content_url);
          return (
            htmlAsTextContent || "[Conteúdo da página não encontrado ou vazio]"
          );
        }
        case "get_resource_file_content": {
          const { resource_file_url, mimetype } = actualToolParams as {
            resource_file_url: string;
            mimetype: string;
          };
          const fileTextContent = await moodleClient.getResourceFileContent(
            resource_file_url,
            mimetype
          );
          return (
            fileTextContent || "[Conteúdo do ficheiro não extraído ou vazio]"
          );
        }
        case "get_activity_details": {
          const params = actualToolParams as {
            activity_id?: number;
            course_id?: number;
            activity_name?: string;
          };
          return await moodleClient.getActivityDetails(params);
        }
        case "fetch_activity_content": {
          const { activity_id, course_id, activity_name } =
            actualToolParams as {
              activity_id?: number;
              course_id?: number;
              activity_name?: string;
            };
          let baseActivityDetails;

          if (activity_id !== undefined) {
            baseActivityDetails = await moodleClient.getActivityDetails({
              activity_id,
            });
          } else if (course_id && activity_name) {
            baseActivityDetails = await moodleClient.getActivityDetails({
              course_id,
              activity_name,
            });
          } else {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Insufficient parameters for fetch_activity_content. Provide activity_id OR (course_id AND activity_name)."
            );
          }

          if (!baseActivityDetails) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Activity details not found for fetching content."
            );
          }

          const cmid = baseActivityDetails.id;
          const effectiveCourseId = baseActivityDetails.course;
          const activityUrl =
            baseActivityDetails.url ||
            (baseActivityDetails.id && baseActivityDetails.modname
              ? `${(MOODLE_URL ?? "").replace(
                  "/webservice/rest/server.php",
                  ""
                )}/mod/${baseActivityDetails.modname}/view.php?id=${
                  baseActivityDetails.id
                }`
              : "URL da atividade não disponível");

          if (!effectiveCourseId) {
            throw new McpError(
              ErrorCode.InternalError,
              "Could not determine course_id for activity"
            );
          }

          const modname = baseActivityDetails.modname?.toLowerCase();
          const instanceId = baseActivityDetails.instance;

          console.debug(
            `fetch_activity_content: Base details for cmid ${cmid}, modname ${modname}, instance ${instanceId}, course ${effectiveCourseId}`
          );

          let richContent:
            | string
            | object = `[Conteúdo não processado para modname: ${modname}]`;
          type ActivityFile = {
            filename: string;
            fileurl: string;
            mimetype: string;
          };
          let files: ActivityFile[] = [];

          switch (modname) {
            case "assign": {
              const numericCourseId = Number(effectiveCourseId);
              const numericInstanceId = Number(instanceId);

              if (isNaN(numericCourseId) || isNaN(numericInstanceId)) {
                throw new McpError(
                  ErrorCode.InternalError,
                  `Invalid courseId or instanceId for assign: courseId=${effectiveCourseId}, instanceId=${instanceId}`
                );
              }
              try {
                const assignmentData = await moodleClient.getAssignmentDetails(
                  numericCourseId,
                  numericInstanceId
                );
                if (assignmentData && assignmentData.intro) {
                  const $ = cheerio.load(assignmentData.intro);
                  richContent =
                    $.text().trim() ||
                    "[Descrição do trabalho vazia ou apenas HTML]";
                  if (
                    assignmentData.introfiles &&
                    assignmentData.introfiles.length > 0
                  ) {
                    files = assignmentData.introfiles.map(
                      (file: MoodleModuleContent) => ({
                        filename: file.filename ?? "",
                        fileurl: file.fileurl ?? "",
                        mimetype: file.mimetype ?? "",
                      })
                    );
                    richContent += `

Ficheiros Anexos: ${files.map((f) => f.filename).join(", ")}`;
                  }
                } else {
                  richContent = assignmentData
                    ? "[Detalhes do trabalho encontrados, mas a descrição (intro) está em falta ou vazia]"
                    : "[Descrição (intro) do trabalho não encontrada]";
                }
              } catch (e) {
                const errorMessage =
                  e instanceof Error ? e.message : JSON.stringify(e);
                richContent = `[Erro ao buscar detalhes do trabalho: ${errorMessage}]`;
                if (e instanceof McpError)
                  console.error(
                    `MCP Error fetching rich assignment details: ${errorMessage} (Code: ${e.code})`
                  );
                else
                  console.error(
                    `Error fetching rich assignment details: ${errorMessage}`
                  );
              }
              break;
            }
            case "page": {
              let pageHtmlContent = "";
              if (baseActivityDetails.description) {
                pageHtmlContent = baseActivityDetails.description;
              }
              const pageContents = baseActivityDetails.contents || [];
              const mainHtmlFile = pageContents.find(
                (c: MoodleModuleContent) =>
                  c.type === "file" &&
                  c.mimetype &&
                  c.mimetype.includes("text/html")
              );

              if (mainHtmlFile && mainHtmlFile.fileurl) {
                try {
                  pageHtmlContent =
                    await moodleClient.getPageModuleContentByUrl(
                      mainHtmlFile.fileurl
                    );
                } catch (e) {
                  console.warn(
                    `Failed to fetch page content from fileurl ${
                      mainHtmlFile.fileurl
                    }: ${(e as Error).message}. Falling back.`
                  );
                }
              }
              if (
                !pageHtmlContent &&
                baseActivityDetails.url &&
                !(mainHtmlFile && mainHtmlFile.fileurl)
              ) {
                try {
                  pageHtmlContent =
                    await moodleClient.getPageModuleContentByUrl(
                      baseActivityDetails.url
                    );
                } catch (e) {
                  console.error(
                    `Error fetching page content from main URL ${
                      baseActivityDetails.url
                    }: ${(e as Error).message}`
                  );
                }
              }
              if (pageHtmlContent) {
                const $ = cheerio.load(pageHtmlContent);
                richContent =
                  $.text().trim() ||
                  "[Conteúdo da página vazio ou apenas HTML]";
              } else {
                richContent = "[Conteúdo da página não encontrado]";
              }
              break;
            }
            case "resource": {
              const resourceContents = baseActivityDetails.contents || [];
              const mainFile = resourceContents.find(
                (c: MoodleModuleContent) => c.type === "file"
              );
              if (mainFile && mainFile.fileurl && mainFile.mimetype) {
                try {
                  richContent = await moodleClient.getResourceFileContent(
                    mainFile.fileurl,
                    mainFile.mimetype
                  );
                  files = [
                    {
                      filename: mainFile.filename ?? "",
                      fileurl: mainFile.fileurl ?? "",
                      mimetype: mainFile.mimetype ?? "",
                    },
                  ];
                } catch (e) {
                  console.error(
                    `Error fetching resource content: ${(e as Error).message}`
                  );
                  richContent = `[Erro ao buscar conteúdo do recurso: ${
                    (e as Error).message
                  }]`;
                }
              } else {
                richContent =
                  "[Ficheiro do recurso não encontrado ou mimetype em falta]";
              }
              break;
            }
            case "url": {
              const externalUrl =
                baseActivityDetails.contents?.[0]?.fileurl ||
                baseActivityDetails.url;
              const description =
                baseActivityDetails.description ||
                baseActivityDetails.intro ||
                "";
              const $ = cheerio.load(description);
              richContent = `URL: ${externalUrl}
Descrição: ${$.text().trim()}`;
              break;
            }
            case "forum": {
              try {
                const forumData = await moodleClient.getForumDiscussions(
                  instanceId
                );
                let forumIntro =
                  baseActivityDetails.intro ||
                  baseActivityDetails.description ||
                  "";
                if (forumIntro) {
                  const $intro = cheerio.load(forumIntro);
                  forumIntro = `Introdução do Fórum: ${$intro.text().trim()}

`;
                }
                if (
                  forumData &&
                  forumData.discussions &&
                  forumData.discussions.length > 0
                ) {
                  const discussionSummaries = forumData.discussions
                    .slice(0, 5)
                    .map(
                      (d: MoodleForumDiscussion) =>
                        `- Tópico: "${d.name}" por ${d.userfullname} (Respostas: ${d.numreplies})`
                    )
                    .join("");
                  richContent = `${forumIntro}Últimas Discussões:
${discussionSummaries}`;
                } else {
                  richContent = `${forumIntro}[Nenhuma discussão encontrada ou fórum vazio]`;
                }
              } catch (e) {
                const errorMessage =
                  e instanceof Error ? e.message : JSON.stringify(e);
                richContent = `[Erro ao buscar discussões do fórum: ${errorMessage}]`;
                console.error(
                  `Error fetching forum discussions: ${errorMessage}`
                );
              }
              break;
            }
            default: {
              let fallbackContent = "";
              if (baseActivityDetails.description) {
                fallbackContent = cheerio
                  .load(baseActivityDetails.description)
                  .text()
                  .trim();
              } else if (baseActivityDetails.intro) {
                fallbackContent = cheerio
                  .load(baseActivityDetails.intro)
                  .text()
                  .trim();
              }
              richContent = fallbackContent
                ? `Descrição/Introdução: ${fallbackContent}`
                : `[Tipo de atividade "${modname}" não tem método de extração de conteúdo específico. Nenhuma descrição geral encontrada.]`;
            }
          }

          return {
            contentType:
              typeof richContent === "string" && richContent.startsWith("[")
                ? "error"
                : "text",
            content: richContent,
            files: files,
            activityName: baseActivityDetails.name,
            activityType: modname,
            activityUrl: activityUrl,
          };
        }
        default:
          console.warn(
            `handleToolInternal: Switch case not found for tool: ${toolName}`
          );
          throw new McpError(
            ErrorCode.MethodNotFound, // Ou InternalError, pois a ferramenta está definida mas não implementada no switch
            `Tool logic not implemented in switch: ${toolName}`
          );
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error; // Re-lança McpError
      }
      // Para outros erros (ex: erros de rede, da API Moodle não tratados)
      console.error(`Error during tool execution '${toolName}':`, error);
      throw new McpError(
        ErrorCode.InternalError, // Código genérico para erro do servidor/ferramenta
        `Error executing tool '${toolName}': ${
          (error as Error).message || "Unknown error"
        }`
      );
    }
  }

  async callToolForTests(
    // This method might be used by existing tests
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    return await this.handleToolInternal(toolName, input);
  }

  // run() method is removed
}
