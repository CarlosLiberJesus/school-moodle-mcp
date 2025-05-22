// src/moodle/moodle_api_client.ts
import axios, { AxiosInstance } from 'axios';
import https from 'node:https';
import * as cheerio from 'cheerio';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MOODLE_URL, MOODLE_TOKEN, NODE_ENV } from '../config/index.js'; // Ajustado para importar de config
import type { MoodleCourse, MoodleSection } from './moodle_types.js';
// Importar pdf-parse e mammoth quando forem usados
// import pdf from 'pdf-parse';
// import mammoth from 'mammoth';

export class MoodleApiClient {
  private httpClient: AxiosInstance;

  constructor() { // Não precisa mais de baseURL e token como args, pega de config
    if (!MOODLE_URL || !MOODLE_TOKEN) {
        // Este check é redundante se config/index.ts já faz exit, mas bom para clareza.
        throw new Error("MoodleApiClient: MOODLE_URL or MOODLE_TOKEN is not configured.");
    }
    this.httpClient = axios.create({
      baseURL: MOODLE_URL,
      params: {
        wstoken: MOODLE_TOKEN,
        moodlewsrestformat: 'json',
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: NODE_ENV === 'production', // Correto
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
      
      if (response.data && response.data.exception) {
        console.error(`Moodle API Error for ${wsfunction}:`, response.data.message, `(${response.data.errorcode})`);
        throw new McpError(
            ErrorCode.InternalError, 
            `Moodle Error (${response.data.errorcode}): ${response.data.message}`
        );
      }
      return response.data as T;
    } catch (error: any) {
      if (error instanceof McpError) throw error;
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
    return sections;
  }

  async getPageModuleContentByUrl(pageUrl: string): Promise<string | null> {
    try {
      console.info(`Attempting to fetch page content from: ${pageUrl}`);
      const response = await axios.get(pageUrl, {
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV === 'production',
        }),
      });
      
      const $ = cheerio.load(response.data as string);
      const mainContentSelectors = [
        'div[role="main"]', '#region-main', '.course-content', 
        'div.page-content', 'article', 'main', 'body'
      ];
      let extractedText = '';
      for (const selector of mainContentSelectors) {
        const elementText = $(selector).text();
        if (elementText && elementText.trim().length > 0) {
          extractedText = elementText.trim();
          console.debug(`Extracted text using selector: ${selector} (Length: ${extractedText.length})`);
          break;
        }
      }
      return extractedText || ($('body').text()?.trim() ?? "");
    } catch (error: any) {
      console.error(`Error fetching page content from URL ${pageUrl}:`, error.message);
      // Não lançar McpError aqui, deixar o handler da tool decidir se é um erro fatal
      // ou se pode informar o utilizador que o conteúdo não foi encontrado.
      // Mas para consistência, talvez seja melhor lançar.
      throw new McpError(ErrorCode.InternalError, `Could not retrieve content from page URL: ${pageUrl}. ${error.message}`);
    }
  }

  async getResourceFileContent(fileUrl: string, mimetype: string): Promise<string | null> {
    console.info(`Attempting to fetch file content from: ${fileUrl} (MIME: ${mimetype})`);
    try {
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        httpsAgent: new https.Agent({
          rejectUnauthorized: NODE_ENV === 'production',
        }),
      });

      const fileBuffer = Buffer.from(response.data);

      if (mimetype.includes('pdf')) {
        // TODO: Implementar pdf-parse
        // Exemplo:
        // const data = await pdf(fileBuffer);
        // return data.text;
        console.warn('PDF parsing not yet implemented.');
        return "[Conteúdo PDF não processado devido à falta de parser]";
      } else if (mimetype.includes('vnd.openxmlformats-officedocument.wordprocessingml.document')) { // DOCX
        // TODO: Implementar mammoth.js
        // Exemplo:
        // const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
        // return value;
        console.warn('DOCX parsing not yet implemented.');
        return "[Conteúdo DOCX não processado devido à falta de parser]";
      } else if (mimetype.startsWith('text/')) {
        return fileBuffer.toString('utf-8');
      } else {
        console.warn(`Unsupported mimetype for content extraction: ${mimetype}`);
        return `[Conteúdo não extraível para mimetype: ${mimetype}]`;
      }
    } catch (error: any) {
      console.error(`Error fetching or processing file ${fileUrl}:`, error.message);
      throw new McpError(ErrorCode.InternalError, `Could not retrieve or process file from URL: ${fileUrl}. ${error.message}`);
    }
  }

  async getActivityDetails(activityId: number): Promise<any | null> {
    try {
      // Since there isn't a direct API to get activity details, we'll fetch all course contents and filter.
      const courses = await this.getCourses();
      if (!courses || courses.length === 0) {
        throw new McpError(ErrorCode.InternalError, 'No courses found to retrieve activity details.');
      }

      // Assuming the activity belongs to the first course.  A more robust solution would require knowing the course ID.
      const courseId = courses[0].id;
      const sections = await this.getCourseContents(courseId);

      if (!sections || sections.length === 0) {
        throw new McpError(ErrorCode.InternalError, `No sections found for course ID ${courseId} when retrieving activity details.`);
      }

      let activityDetails: any = null;
      for (const section of sections) {
        if (section.modules) {
          const foundModule = section.modules.find(module => module.id === activityId);
          if (foundModule) {
            activityDetails = foundModule;
            break;
          }
        }
      }

      if (!activityDetails) {
        console.warn(`Activity with ID ${activityId} not found in course ID ${courseId}.`);
        return null; // Or throw an error if you prefer.
      }

      return activityDetails;
    } catch (error: any) {
      console.error(`Error fetching activity details for ID ${activityId}:`, error.message);
      throw new McpError(ErrorCode.InternalError, `Failed to retrieve activity details for ID ${activityId}: ${error.message}`);
    }
  }
}
