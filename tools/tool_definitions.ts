// src/tools/tool_definitions.ts

// O SDK pode ter um tipo mais específico para ToolDefinition, use-o se disponível.
// Por agora, uma interface genérica.
export interface ToolDefinitionSchema {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema object
  // outputSchema?: any; // Opcional, para descrever o output
}

export const toolDefinitions: ToolDefinitionSchema[] = [
  {
    name: 'get_courses',
    description: 'Retrieves a list of all available courses from Moodle.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_course_contents',
    description: 'Retrieves the sections and modules for a specific course from Moodle.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'integer',
          description: 'The ID of the course to retrieve contents for.',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_page_module_content',
    description: 'Retrieves the extracted text content of a Moodle "Page" module, given its direct content URL.',
    inputSchema: {
      type: 'object',
      properties: {
        page_content_url: {
          type: 'string',
          format: 'url',
          description: 'The direct URL to the Moodle page module\'s content (e.g., from module details).',
        },
      },
      required: ['page_content_url'],
    },
  },
  {
    name: 'get_resource_file_content',
    description: 'Retrieves and extracts text content from a Moodle "resource" file (PDF, DOCX, TXT), given its direct content URL and mimetype.',
    inputSchema: {
      type: 'object',
      properties: {
        resource_file_url: {
          type: 'string',
          format: 'url',
          description: 'The direct URL to the Moodle resource file\'s content.',
        },
        mimetype: {
          type: 'string',
          description: 'The MIME type of the file (e.g., "application/pdf", "text/plain").',
        },
      },
      required: ['resource_file_url', 'mimetype'],
    },
  },
  {
    name: 'get_activity_details',
    description: 'Retrieves the details of a specific activity from Moodle. Can search by activity ID or by course name and activity name.',
    inputSchema: {
      type: 'object',
      oneOf: [
        {
          properties: {
            activity_id: {
              type: 'integer',
              description: 'The ID of the activity to retrieve details for.',
            },
          },
          required: ['activity_id'],
        },
        {
          properties: {
            course_name: {
              type: 'string',
              description: 'The name of the course to search for the activity.',
            },
            activity_name: {
              type: 'string',
              description: 'The name of the activity to retrieve details for.',
            },
          },
          required: ['course_name', 'activity_name'],
        }
      ]
    },
  },
  {
    name: 'fetch_activity_content',
    description: 'Fetches the content of an activity in a single step, handling both page and resource types.',
    inputSchema: {
      type: 'object',
      oneOf: [
        {
          properties: {
            activity_id: {
              type: 'integer',
              description: 'The ID of the activity to fetch content for.',
            },
          },
          required: ['activity_id'],
        },
        {
          properties: {
            course_name: {
              type: 'string',
              description: 'The name of the course containing the activity.',
            },
            activity_name: {
              type: 'string',
              description: 'The name of the activity to fetch content for.',
            },
          },
          required: ['course_name', 'activity_name'],
        }
      ]
    },
  },
];
