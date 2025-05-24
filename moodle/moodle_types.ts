export interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  [key: string]: unknown;
}

export interface MoodleModuleContent {
  type: string;
  filename?: string;
  filepath?: string;
  filesize?: string | number;
  fileurl?: string;
  mimetype?: string;
  [key: string]: unknown;
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
  intro?: string;
  introfiles?: MoodleModuleContent[];
  [key: string]: unknown;
}

export interface MoodleSection {
  id: number;
  name: string;
  summary: string;
  summaryformat: number;
  visible: number;
  modules: MoodleModule[];
  [key: string]: unknown;
}

// Assignment
export interface MoodleAssignment {
  id: number;
  name: string;
  intro?: string;
  introfiles?: MoodleModuleContent[];
  [key: string]: unknown;
}

// Forum Discussion
export interface MoodleForumDiscussion {
  id: number;
  name: string;
  userfullname: string;
  numreplies: number;
  [key: string]: unknown;
}

// Forum Data (resposta da API)
export interface MoodleForumData {
  discussions: MoodleForumDiscussion[];
  [key: string]: unknown;
}

// Inputs/outputs das tools
export interface GetCoursesInput {}
export type GetCoursesOutput = MoodleCourse[];

export interface GetCourseContentsInput {
  course_id: number;
}
export type GetCourseContentsOutput = MoodleSection[];

export interface GetPageModuleContentInput {
  page_content_url: string;
}
export type GetPageModuleContentOutput = string;

export interface GetResourceFileContentInput {
  resource_file_url: string;
  mimetype: string;
}
export type GetResourceFileContentOutput = string | null;

export interface GetActivityDetailsInput {
  activity_id?: number;
  course_id?: number;
  activity_name?: string;
}
export type GetActivityDetailsOutput = MoodleModule | null;

// Assignment API response
export interface AssignmentsResponse {
  courses?: Array<{
    id: number;
    assignments: MoodleAssignment[];
  }>;
  assignments?: Array<{
    id: number;
    assignments: MoodleAssignment[];
  }>;
}
