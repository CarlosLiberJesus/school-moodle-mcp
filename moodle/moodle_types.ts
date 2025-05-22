// src/moodle/moodle_types.ts
export interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  // Adicione mais propriedades conforme necessário
  [key: string]: any; // Para flexibilidade com outras propriedades não explicitamente definidas
}

export interface MoodleModuleContent {
  type: string;
  filename?: string;
  filepath?: string;
  filesize?: string; // Ou number, se for consistente
  fileurl?: string;
  mimetype?: string;
  [key: string]: any;
}

export interface MoodleModule {
  id: number;
  name: string;
  modname: string;
  modplural: string;
  instance: number;
  url?: string;
  description?: string;
  visible?: number;
  contents?: MoodleModuleContent[];
  [key: string]: any;
}

export interface MoodleSection {
  id: number;
  name: string;
  summary: string;
  summaryformat: number;
  visible: number;
  modules: MoodleModule[];
  [key: string]: any;
}

// Tipos para inputs/outputs das tools (poderiam estar em tools/tool_types.ts)
export interface GetCoursesInput {}
export type GetCoursesOutput = MoodleCourse[];

export interface GetCourseContentsInput {
  course_id: number;
}
export type GetCourseContentsOutput = MoodleSection[];

export interface GetPageModuleContentInput {
  page_content_url: string;
}
export type GetPageModuleContentOutput = string; // HTML ou texto extraído

export interface GetResourceFileContentInput {
  resource_file_url: string;
  mimetype: string;
}
export type GetResourceFileContentOutput = string | null; // Texto extraído ou null