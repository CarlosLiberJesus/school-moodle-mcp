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

  async getPageModuleContentByUrl(pageUrl: string): Promise<string | null> {
    try {
      console.info(`Attempting to fetch page content from: ${pageUrl}`);
      const response = await axios.get(pageUrl, {
        httpsAgent: new https.Agent({
          rejectUnauthorized: process.env.NODE_ENV === "production",
        }),
      });

      const $ = cheerio.load(response.data as string);
      const mainContentSelectors = [
        'div[role="main"]',
        "#region-main",
        ".course-content",
        "div.page-content",
        "article",
        "main",
        "body",
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
    } catch (error: unknown) {
      if (error instanceof McpError) throw error;
      // Type guard para Error
      if (error && typeof error === "object" && "message" in error) {
        console.error(
          `Could not retrieve content from page URL: ${pageUrl}:`,
          (error as { message?: string }).message
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from page URL: ${pageUrl}: ${
            (error as { message?: string }).message
          }`
        );
      } else {
        // fallback para erros não convencionais
        console.error(
          `Could not retrieve content from page URL: ${pageUrl}:`,
          error
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from page URL: ${pageUrl}: ${JSON.stringify(
            error
          )}`
        );
      }
    }
  }

  async getResourceFileContent(
    fileUrl: string,
    mimetype: string
  ): Promise<string | null> {
    console.info(
      `Attempting to fetch file content from: ${fileUrl} (MIME: ${mimetype})`
    );
    try {
      const response = await axios.get(fileUrl, {
        responseType: "arraybuffer",
        httpsAgent: new https.Agent({
          rejectUnauthorized: process.env.NODE_ENV === "production",
        }),
      });

      const fileBuffer = Buffer.from(response.data);

      if (mimetype.includes("pdf")) {
        // TODO: Implementar pdf-parse
        // Exemplo:
        // const data = await pdf(fileBuffer);
        // return data.text;
        console.warn("PDF parsing not yet implemented.");
        return "[Conteúdo PDF não processado devido à falta de parser]";
      } else if (
        mimetype.includes(
          "vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ) {
        // DOCX
        // TODO: Implementar mammoth.js
        // Exemplo:
        // const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
        // return value;
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
    } catch (error: unknown) {
      if (error instanceof McpError) throw error;
      // Type guard para Error
      if (error && typeof error === "object" && "message" in error) {
        console.error(
          `Could not retrieve content from file URL: ${fileUrl}:`,
          (error as { message?: string }).message
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from page file Url: ${fileUrl}: ${
            (error as { message?: string }).message
          }`
        );
      } else {
        // fallback para erros não convencionais
        console.error(
          `Could not retrieve content from file Url: ${fileUrl}:`,
          error
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Could not retrieve content from file Url: ${fileUrl}: ${JSON.stringify(
            error
          )}`
        );
      }
    }
  }

  async getActivityDetails(
    params: GetActivityDetailsInput
  ): Promise<GetActivityDetailsOutput> {
    // Ajuste o tipo de retorno para o objeto do módulo Moodle
    try {
      if (params.activity_id !== undefined) {
        // Temos cmid. Para obter os detalhes do módulo, incluindo o course_id,
        // a melhor API do Moodle é core_course_get_course_module.
        const moduleDetails = await this.moodleRequest<{ cm: MoodleModule }>(
          "core_course_get_course_module",
          { cmid: params.activity_id }
        );

        // A resposta de core_course_get_course_module já é rica.
        // Pode precisar de alguma adaptação para corresponder ao formato que a get_activity_details retornava antes
        // se o formato exato for importante para o LLM.
        // Importante: moduleDetails.cm.course deve dar o course_id
        if (moduleDetails && moduleDetails.cm) {
          // Adicionar o course_id ao objeto retornado se não estiver já no formato esperado
          // Exemplo: return { ...moduleDetails.cm, course_id: moduleDetails.cm.course };
          return moduleDetails.cm; // moduleDetails.cm contém a informação do módulo
        } else {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Activity with cmid ${params.activity_id} not found or invalid response from Moodle.`
          );
        }
      }

      if (params.course_id !== undefined && params.activity_name) {
        // Temos course_id e activity_name.
        // 1. Obter os conteúdos do curso.
        const sections = await this.getCourseContents(params.course_id);
        if (!sections || sections.length === 0) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `No sections found for course ID ${params.course_id}.`
          );
        }

        // 2. Procurar a atividade pelo nome dentro das secções/módulos.
        let activityDetails = null;
        for (const section of sections) {
          if (section.modules) {
            const foundModule = section.modules.find(
              (module) =>
                module.name &&
                module.name
                  .toLowerCase()
                  .includes(params.activity_name!.toLowerCase()) // activity_name é garantido aqui pelo Zod
            );
            if (foundModule) {
              activityDetails = foundModule;
              // Adicionar course_id ao resultado se não estiver lá, para consistência
              // activityDetails.course_id = params.course_id; // Ou garantir que o outputSchema sempre o inclua
              break;
            }
          }
        }

        if (!activityDetails) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Activity "${params.activity_name}" not found in course ID ${params.course_id}.`
          );
        }
        // Importante: Adicionar o course_id ao objeto retornado, pois foi um input
        return { ...activityDetails, course_id_provided: params.course_id }; // Ou uma forma mais estruturada
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        "Insufficient parameters for get_activity_details. Provide activity_id OR (course_id AND activity_name)."
      );
    } catch (error: unknown) {
      if (error instanceof McpError) throw error;
      // Type guard para Error
      if (error && typeof error === "object" && "message" in error) {
        console.error(
          `Failed to retrieve activity details:`,
          (error as { message?: string }).message
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to retrieve activity details: ${
            (error as { message?: string }).message
          }`
        );
      } else {
        // fallback para erros não convencionais
        console.error(`Failed to retrieve activity details:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to retrieve activity details: ${JSON.stringify(error)}`
        );
      }
    }
  }
}
