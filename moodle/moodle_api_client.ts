// src/moodle/moodle_api_client.ts
import { MOODLE_URL, NODE_ENV } from "../config/index.js";
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

  constructor(moodleToken: string) {
    if (!MOODLE_URL) {
      throw new Error(
        "MoodleApiClient: MOODLE_URL or MOODLE_TOKEN is not configured."
      );
    }
    if (!moodleToken) {
      // MODIFICADO: Verificar o token passado
      throw new Error(
        "MoodleApiClient: MOODLE_TOKEN must be provided to the constructor."
      );
    }

    this.httpClient = axios.create({
      baseURL: MOODLE_URL,
      params: {
        wstoken: moodleToken,
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
      const response = await axios.get(pageContentFileUrl, {
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV === "production",
        }),
      });

      const $ = cheerio.load(response.data);
      const mainContentSelectors = [
        "div.box.py-3.generaltable",
        "div.no-overflow",
        'div[role="main"]',
        "#region-main",
        "div.page-content",
        "article",
        "main",
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
      return (
        extractedText ||
        "[Conteúdo da página não encontrado ou seletor principal falhou]"
      );
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
      const response = await axios.get(resourceFileUrl, {
        responseType: "arraybuffer",
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV === "production",
        }),
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
            (file) => ({
              type: typeof file.type === "string" ? file.type : "file", // Default to 'file'
              filename: file.filename as unknown as string,
              fileurl: file.fileurl as unknown as string,
              mimetype: file.mimetype as unknown as string,
              // ...outros campos de file se existirem e forem necessários.
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
