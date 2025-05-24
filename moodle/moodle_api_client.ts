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
    try {
      // First check if we have an activity_id
      if (params.activity_id !== undefined) {
        // We have an activity_id - use the old method
        const courses = await this.getCourses();
        if (!courses || courses.length === 0) {
          throw new McpError(
            ErrorCode.InternalError,
            "No courses found to retrieve activity details."
          );
        }

        // Assuming the activity belongs to the first course
        const courseId = courses[0].id;
        const sections = await this.getCourseContents(courseId);

        if (!sections || sections.length === 0) {
          throw new McpError(
            ErrorCode.InternalError,
            `No sections found for course ID ${courseId} when retrieving activity details.`
          );
        }

        let activityDetails: MoodleModule | null = null;
        for (const section of sections) {
          if (section.modules) {
            const foundModule = section.modules.find(
              (module) => module.id === params.activity_id
            );
            if (foundModule) {
              activityDetails = foundModule;
              break;
            }
          }
        }

        if (!activityDetails) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Activity with ID ${params.activity_id} not found.`
          );
        }

        return activityDetails;
      }

      // If we don't have an activity_id, we must have course_name and activity_name
      if (!params.course_name || !params.activity_name) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Either activity_id or both course_name and activity_name must be provided."
        );
      }

      // Search by course name and activity name
      const courses = await this.getCourses();
      if (!courses || courses.length === 0) {
        throw new McpError(
          ErrorCode.InternalError,
          "No courses found to retrieve activity details."
        );
      }

      const course = courses.find(
        (c) =>
          c.fullname === params.course_name ||
          c.shortname === params.course_name
      );
      if (!course) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Course "${params.course_name}" not found.`
        );
      }

      const sections = await this.getCourseContents(course.id);
      if (!sections || sections.length === 0) {
        throw new McpError(
          ErrorCode.InternalError,
          `No sections found for course ID ${course.id} when retrieving activity details.`
        );
      }

      let activityDetails: MoodleModule | null = null;
      for (const section of sections) {
        if (section.modules) {
          const foundModule = section.modules.find(
            (module) =>
              module.name &&
              module.name
                .toLowerCase()
                .includes(params.activity_name?.toLowerCase() ?? "")
          );
          if (foundModule) {
            activityDetails = foundModule;
            break;
          }
        }
      }

      if (!activityDetails) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Activity "${params.activity_name}" not found in course "${params.course_name}"`
        );
      }

      return activityDetails;
    } catch (error: unknown) {
      if (error instanceof McpError) throw error;
      // Type guard para Error
      if (error && typeof error === "object" && "message" in error) {
        console.error(
          `Fail to retrive activity details: `,
          (error as { message?: string }).message
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Fail to retrive activity details: ${
            (error as { message?: string }).message
          }`
        );
      } else {
        // fallback para erros não convencionais
        console.error(`Fail to retrive activity details:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Fail to retrive activity details: ${JSON.stringify(error)}`
        );
      }
    }
  }
}
