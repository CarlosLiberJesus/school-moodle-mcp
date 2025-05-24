// src/moodle/moodle_api_client.ts
import { MOODLE_URL, MOODLE_TOKEN, NODE_ENV } from "../config/index.js";
import axios, { AxiosInstance } from "axios";
import https from "node:https";
import * as cheerio from "cheerio";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type {
  GetActivityDetailsInput,
  GetActivityDetailsOutput,
  MoodleCourse,
  MoodleModule,
  MoodleSection,
  MoodleAssignment,
  MoodleForumData,
} from "./moodle_types.js";
import { Buffer } from "node:buffer";
// Importar pdf-parse e mammoth quando forem usados
// import pdf from 'pdf-parse';
// import mammoth from 'mammoth';

export class MoodleApiClient {
  private httpClient: AxiosInstance;

  constructor() {
    if (!MOODLE_URL || !MOODLE_TOKEN) {
      throw new Error(
        "MoodleApiClient: MOODLE_URL or MOODLE_TOKEN is not configured."
      );
    }
    this.httpClient = axios.create({
      baseURL: MOODLE_URL,
      params: {
        wstoken: MOODLE_TOKEN,
        moodlewsrestformat: "json",
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: NODE_ENV === "production",
      }),
    });
  }

  private async moodleRequest<T>(
    wsfunction: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      const response = await this.httpClient.get(
        "/webservice/rest/server.php",
        {
          params: {
            wsfunction,
            ...params,
          },
        }
      );

      if (response.data && response.data.exception) {
        console.error(
          `Moodle API Error for ${wsfunction}:`,
          response.data.message,
          `(${response.data.errorcode})`
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Moodle Error (${response.data.errorcode}): ${response.data.message}`
        );
      }
      return response.data as T;
    } catch (error: unknown) {
      if (error instanceof McpError) throw error;
      // Type guard para Error
      if (error && typeof error === "object" && "message" in error) {
        console.error(
          `Error calling Moodle function ${wsfunction}:`,
          (error as { message?: string }).message
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to call Moodle function ${wsfunction}: ${
            (error as { message?: string }).message
          }`
        );
      } else {
        // fallback para erros não convencionais
        console.error(`Error calling Moodle function ${wsfunction}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to call Moodle function ${wsfunction}: ${JSON.stringify(
            error
          )}`
        );
      }
    }
  }

  async getCourses(): Promise<MoodleCourse[]> {
    const courses = await this.moodleRequest<MoodleCourse[]>(
      "core_course_get_courses"
    );
    if (!Array.isArray(courses)) {
      console.error(
        "Unexpected response from core_course_get_courses:",
        courses
      );
      throw new McpError(
        ErrorCode.InternalError,
        "Moodle returned non-array for courses."
      );
    }
    return courses;
  }

  async getCourseContents(courseId: number): Promise<MoodleSection[]> {
    const sections = await this.moodleRequest<MoodleSection[]>(
      "core_course_get_contents",
      { courseid: courseId }
    );
    if (!Array.isArray(sections)) {
      console.error(
        `Unexpected response from core_course_get_contents for course ${courseId}:`,
        sections
      );
      throw new McpError(
        ErrorCode.InternalError,
        `Moodle returned non-array for course ${courseId} contents.`
      );
    }
    return sections;
  }

  // Esta função é para URLs que apontam DIRETAMENTE para conteúdo HTML,
  // idealmente URLs de 'pluginfile.php' que já contêm um token.
  // NÃO é para URLs genéricas de 'view.php?id=X' que requerem sessão de browser.
  async getPageModuleContentByUrl(pageContentFileUrl: string): Promise<string> {
    try {
      console.info(
        `Attempting to fetch HTML content from: ${pageContentFileUrl}`
      );

      // As URLs de pluginfile.php retornadas pelas APIs Moodle geralmente JÁ contêm um token.
      // Portanto, um GET direto para essa URL deve funcionar.
      // Não devemos usar this.httpClient aqui, pois ele adicionaria o wstoken aos params,
      // o que não é o esperado para pluginfile.php (que espera o token na própria URL).
      const response = await axios.get(pageContentFileUrl, {
        // Não é necessário responseType: 'arraybuffer' para HTML
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV === "production",
        }),
        // Se precisares forçar o token (SE pageContentFileUrl não o tiver e for um pluginfile.php):
        // params: { token: MOODLE_TOKEN } // Mas geralmente não é necessário se a URL já o tem.
      });

      const $ = cheerio.load(response.data);
      // Tenta ser mais específico se souberes a estrutura do conteúdo da página Moodle
      // Por exemplo, o conteúdo real pode estar dentro de um div com uma classe específica.
      const mainContentSelectors = [
        "div.box.py-3.generaltable", // Comum para o conteúdo de uma 'page' quando descarregado
        "div.no-overflow", // Outro seletor comum
        'div[role="main"]', // Mais genérico
        "#region-main",
        "div.page-content", // Se for um HTML de página completo
        "article",
        "main",
        "body", // Último recurso
      ];
      let extractedText = "";
      for (const selector of mainContentSelectors) {
        const elementText = $(selector).text();
        if (elementText && elementText.trim().length > 0) {
          extractedText = elementText.trim();
          console.debug(
            `Extracted text using selector: ${selector} (Length: ${extractedText.length})`
          );
          break;
        }
      }
      return extractedText || ($("body").text()?.trim() ?? "");
    } catch (error) {
      console.error(
        `MoodleApiClient: Error in getPageModuleContentByUrl for ${pageContentFileUrl}:`,
        error
      );
      if (error instanceof McpError) throw error;
      if (error && typeof error === "object" && "message" in error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from page URL: ${pageContentFileUrl}: ${error.message}`
        );
      } else {
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from page URL: ${pageContentFileUrl}: ${JSON.stringify(
            error
          )}`
        );
      }
    }
  }

  async getResourceFileContent(
    resourceFileUrl: string,
    mimetype: string
  ): Promise<string> {
    console.info(
      `Attempting to fetch file content from: ${resourceFileUrl} (MIME: ${mimetype})`
    );
    try {
      // Semelhante a getPageModuleContentByUrl, resourceFileUrl (de pluginfile.php)
      // geralmente já contém o token.
      const response = await axios.get(resourceFileUrl, {
        responseType: "arraybuffer", // Importante para ficheiros binários
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV === "production",
        }),
        // params: { token: MOODLE_TOKEN } // Apenas se resourceFileUrl não tiver token e precisar.
      });

      const fileBuffer = Buffer.from(response.data);

      if (mimetype.includes("pdf")) {
        console.warn("PDF parsing not yet implemented.");
        return "[Conteúdo PDF não processado devido à falta de parser]";
      } else if (
        mimetype.includes(
          "vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ) {
        // DOCX
        console.warn("DOCX parsing not yet implemented.");
        return "[Conteúdo DOCX não processado devido à falta de parser]";
      } else if (mimetype.startsWith("text/")) {
        return fileBuffer.toString("utf-8");
      } else {
        console.warn(
          `Unsupported mimetype for content extraction: ${mimetype}`
        );
        return `[Conteúdo não extraível para mimetype: ${mimetype}]`;
      }
    } catch (error) {
      console.error(
        `MoodleApiClient: Error in getResourceFileContent for ${resourceFileUrl}:`,
        error
      );
      if (error instanceof McpError) throw error;
      if (error && typeof error === "object" && "message" in error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from file URL: ${resourceFileUrl}: ${error.message}`
        );
      } else {
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from file URL: ${resourceFileUrl}: ${JSON.stringify(
            error
          )}`
        );
      }
    }
  }

  async getActivityDetails(
    params: GetActivityDetailsInput
  ): Promise<GetActivityDetailsOutput> {
    // ... (a tua implementação atual para getActivityDetails é boa, usando this.moodleRequest)
    // Lembra-te de garantir que o output desta função sempre inclui o 'course_id' do curso da atividade.
    // Por exemplo, quando usas core_course_get_course_module:
    // if (moduleDetails && moduleDetails.cm) {
    //     return { ...moduleDetails.cm, course_id_resolved: moduleDetails.cm.course };
    // }
    // E quando procuras por course_id e activity_name:
    // if (activityDetails) {
    //     return { ...activityDetails, course_id_resolved: params.course_id };
    // }
    // (Usar um nome consistente como 'course_id_resolved' ou apenas 'course' se o objeto cm já o tiver como 'course')
    // A tua versão atual já faz algo semelhante com `moduleDetails.cm` e `{...activityDetails, course_id_provided: params.course_id }`
    // O importante é que o `fetch_activity_content` possa aceder a este ID de curso de forma fiável a partir do resultado de `getActivityDetails`.
    try {
      if (params.activity_id !== undefined) {
        const moduleDetails = await this.moodleRequest<{ cm: MoodleModule }>(
          "core_course_get_course_module",
          { cmid: params.activity_id }
        );
        if (moduleDetails && moduleDetails.cm) {
          // moduleDetails.cm.course já é o course_id
          return moduleDetails.cm;
        } else {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Activity with cmid ${params.activity_id} not found or invalid response from Moodle.`
          );
        }
      }

      if (params.course_id !== undefined && params.activity_name) {
        const sections = await this.getCourseContents(params.course_id);
        if (!sections || sections.length === 0) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `No sections found for course ID ${params.course_id}.`
          );
        }
        let foundActivity = null;
        for (const section of sections) {
          if (section.modules) {
            const module = section.modules.find(
              (m) =>
                m.name &&
                m.name
                  .toLowerCase()
                  .includes(params.activity_name!.toLowerCase())
            );
            if (module) {
              foundActivity = module;
              break;
            }
          }
        }
        if (!foundActivity) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Activity "${params.activity_name}" not found in course ID ${params.course_id}.`
          );
        }
        // Adicionar explicitamente o course_id aqui, pois o objeto do módulo de getCourseContents não o tem.
        return { ...foundActivity, course: params.course_id }; // Usar 'course' para consistência com o output de core_course_get_course_module
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        "Insufficient parameters for get_activity_details. Provide activity_id OR (course_id AND activity_name)."
      );
    } catch (error) {
      // Tratamento de erros genérico no final
      console.error(
        `MoodleApiClient: Error in getActivityDetails with params ${JSON.stringify(
          params
        )}:`,
        error
      );
      if (error instanceof McpError) throw error;
      if (error && typeof error === "object" && "message" in error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to retrieve activity details: ${error.message}`
        );
      } else {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to retrieve activity details: ${JSON.stringify(error)}`
        );
      }
    }
  }

  async getAssignmentDetails(
    courseId: number,
    assignmentInstanceId: number
  ): Promise<MoodleAssignment> {
    console.info(
      `Fetching ALL assignments for course ${courseId} to find instance ${assignmentInstanceId}`
    );

    // Tipo para a resposta de mod_assign_get_assignments
    // Ajusta conforme a estrutura real da tua API Moodle se necessário,
    // mas esta é uma estrutura comum.
    type MoodleAssignmentsResponse = {
      courses: Array<{
        id: number; // course id
        assignments: Array<{
          id: number; // <<< ESTE é o ID da INSTÂNCIA do assignment (e.g., 27)
          cmid: number; // Course Module ID (e.g., 150)
          course: number; // course id (e.g., 6)
          name: string;
          intro: string;
          introformat: number;
          introfiles: Array<Record<string, unknown>>;
          // ... outros campos ...
        }>;
      }>;
      warnings?: unknown[];
    };

    const response = await this.moodleRequest<MoodleAssignmentsResponse>(
      "mod_assign_get_assignments",
      {
        courseids: [courseId], // Apenas o ID do curso
      }
    );

    if (response && response.courses) {
      const courseData = response.courses.find((c) => c.id === courseId);
      if (courseData && courseData.assignments) {
        const specificAssignment = courseData.assignments.find(
          (a) => a.id === assignmentInstanceId // Filtra pelo ID da INSTÂNCIA do assignment
        );
        if (specificAssignment) {
          console.debug(
            `Found specific assignment: ${JSON.stringify(
              specificAssignment,
              null,
              2
            )}`
          );
          // Ensure introfiles has the required 'type' property for MoodleModuleContent[]
          const introfilesWithType = (specificAssignment.introfiles || []).map(
            (file: Record<string, unknown>) => ({
              type: typeof file.type === "string" ? file.type : "file",
              ...file,
            })
          );
          return {
            ...specificAssignment,
            introfiles: introfilesWithType,
          };
        } else {
          console.warn(
            `Assignment with instance ID ${assignmentInstanceId} not found in the list of assignments for course ${courseId}. Assignments received: ${JSON.stringify(
              courseData.assignments,
              null,
              2
            )}`
          );
        }
      } else {
        console.warn(
          `No assignments found for course ${courseId} in the response. Response: ${JSON.stringify(
            response,
            null,
            2
          )}`
        );
      }
    } else {
      console.warn(
        `Unexpected response structure from mod_assign_get_assignments for course ${courseId}. Response: ${JSON.stringify(
          response,
          null,
          2
        )}`
      );
    }

    // Se não encontrou após a filtragem
    throw new McpError(
      ErrorCode.MethodNotFound, // Usar NotFound se o recurso específico não foi encontrado
      `Assignment with instance ID ${assignmentInstanceId} not found in course ${courseId} (or response was not as expected).`
    );
  }

  async getForumDiscussions(
    forumInstanceId: number,
    options: {
      sortby?: string;
      sortdirection?: string;
      page?: number;
      perpage?: number;
    } = { sortby: "timedesc", page: 0, perpage: 5 }
  ): Promise<MoodleForumData> {
    console.info(`Fetching discussions for forum instance ${forumInstanceId}`);
    // Chamar 'mod_forum_get_forum_discussions' ou 'mod_forum_get_forum_discussions_paginated'
    // O 'forumInstanceId' é o 'id' do fórum na tabela 'forum', que é o `baseActivityDetails.instance`
    return this.moodleRequest("mod_forum_get_forum_discussions", {
      forumid: forumInstanceId,
      sortby: options.sortby || "timemodified", // ou 'lastpost' ou 'created'
      sortdirection: options.sortdirection || "DESC",
      page: options.page || 0,
      perpage: options.perpage || 5,
    });
  }
}
