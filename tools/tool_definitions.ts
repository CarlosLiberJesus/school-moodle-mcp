// src/tools/tool_definitions.ts

// O SDK pode ter um tipo mais específico para ToolDefinition, use-o se disponível.
// Por agora, uma interface genérica.
export interface ToolDefinitionSchema {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema object
  outputSchema?: any; // Opcional, para descrever o output
}

export const toolDefinitions: ToolDefinitionSchema[] = [
  {
    name: 'get_courses',
    description: 'Retrieves a list of all available courses from Moodle.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      outputSchema: {
        type: 'array',
        description: 'An array of course objects. Each object contains details about a specific Moodle course.',
        items: { // Descreve cada objeto "curso" no array
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'The unique ID of the course. This ID is CRUCIAL and should be used as the "course_id" parameter for the "get_course_contents" tool to retrieve the contents of this specific course.'
            },
            fullname: {
              type: 'string',
              description: 'The full, official name of the course (e.g., "Aplicações Informáticas B 12º Ano"). Present this to the user for selection.'
            },
            shortname: {
              type: 'string',
              description: 'A short name or code for the course (e.g., "AIB2122_1"). Can also be used for display or identification.'
            },
            displayname: {
              type: 'string',
              description: 'The name of the course as it is displayed to users. Often the same as fullname.'
            },
            summary: {
              type: 'string',
              description: 'An HTML summary or description of the course. May need cleaning if displayed directly.'
            },
            visible: {
              type: 'integer',
              description: 'Indicates if the course is visible to students (1 = visible, 0 = hidden). The agent should generally only consider visible courses unless specified otherwise.'
            },
            startdate: {
              type: 'integer',
              description: 'Unix timestamp representing the start date of the course. Convert to a human-readable date if needed for display.'
            },
            enddate: {
              type: 'integer',
              description: 'Unix timestamp representing the end date of the course. A value of 0 typically means no end date is set. Convert to a human-readable date if needed for display.'
            },
            format: {
              type: 'string',
              description: 'The course format (e.g., "topics", "weeks", "tiles"). This might give a hint about the course structure.'
            },
            lang: {
                type: 'string',
                nullable: true, // pode ser uma string vazia
                description: 'The language code for the course (e.g., "pt", "en").'
            }
            // Adicione outros campos que você acha que o LLM pode precisar ou que são úteis para o utilizador:
            // categoryid, numsections, enablecompletion, etc.
            // Se não forem diretamente úteis para o próximo passo do agente, podem ser omitidos do schema
            // para manter a simplicidade, ou incluídos com descrições claras.
          },
          required: ['id', 'fullname', 'shortname', 'displayname', 'visible'] // Campos que você garante que sempre estarão lá e são importantes.
        }
      }
    },
    outputSchema: {
      type: 'array',
      description: 'An array of course sections. Each section contains its details and a list of modules within it.',
      items: { // Descreve cada objeto "secção" no array
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The unique ID of this course section.' },
          name: { type: 'string', description: 'The name of the course section (e.g., "Geral", "Semana 1", "Tópico 1").' },
          summary: { type: 'string', description: 'HTML summary/description for the section itself.' },
          visible: { type: 'integer', description: 'Visibility of the section (1 = visible, 0 = hidden).' },
          modules: {
            type: 'array',
            description: 'An array of modules (activities or resources) within this section.',
            items: { // Descreve cada objeto "módulo" no array de modules
              type: 'object',
              properties: {
                id: { type: 'integer', description: 'The unique ID of this module within the course. Use this ID with the "get_activity_details" tool for more specific details, or with "fetch_activity_content" to get its content.' },
                instance: { type: 'integer', description: 'The instance ID of this module type (e.g., the ID in the "assign" table if modname is "assign"). Less commonly used by the agent directly unless a specific API requires it.' },
                name: { type: 'string', description: 'The display name of the module (activity/resource name).' },
                url: { type: 'string', format: 'url', nullable: true, description: 'Direct URL to view this module (e.g., for "page", "quiz", "forum", "assign"). Use this URL with "get_page_module_content" if it\'s a page, or pass the module ID to "fetch_activity_content".' },
                modname: { type: 'string', description: 'The type of the module (e.g., "assign", "page", "resource", "quiz", "label", "forum"). This is CRUCIAL for deciding which subsequent tool to use or how to interpret the content.' },
                modplural: { type: 'string', description: 'Plural name of the module type.' },
                description: { type: 'string', nullable: true, description: 'HTML description of the module. For "label" type modules, this field IS the content. For other types like "assign" or "quiz", this might be the introduction/instructions.' },
                intro: { type: 'string', nullable: true, description: 'HTML introduction for the module, often used by "assign", "quiz". Similar to "description".'}, // Moodle usa description ou intro
                visible: { type: 'integer', description: 'Visibility of the module (1 = visible, 0 = hidden).' },
                noviewlink: { type: 'boolean', description: 'If true, this module (like a "label") does not have a separate view page/link. Its content is usually in its "description".' },
                contents: { // Mais detalhes para 'contents' como fizemos para get_activity_details
                  type: 'array',
                  nullable: true,
                  description: 'Associated files or content parts. CRUCIAL for "resource" modules, this contains the file details. For "page" modules, it might contain HTML content if structured that way by Moodle.',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', description: 'Type of content (e.g., "file", "url"). For "resource" modules, look for "file".' },
                      filename: { type: 'string', nullable: true, description: 'Name of the file.' },
                      fileurl: { type: 'string', format: 'url', nullable: true, description: 'Direct URL to download/access the file. For "resource" modules, use this URL with "get_resource_file_content" or pass the parent module ID to "fetch_activity_content".' },
                      mimetype: { type: 'string', nullable: true, description: 'MIME type of the file (e.g., "application/pdf", "text/html"). Important for "get_resource_file_content".' },
                      // ... outros campos de 'contents' que podem ser úteis
                    }
                  }
                },
                // ... outros campos do módulo que você achar relevantes
                // como 'completion', 'completiondata', 'dates'
              },
              required: ['id', 'name', 'modname'] // Campos mínimos que você garante
            }
          }
        },
        required: ['id', 'name', 'modules'] // Campos mínimos que uma secção terá
      }
    }
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
    outputSchema: {
      type: 'array',
      description: 'An array of course sections. Each section contains its details and a list of modules within it.',
      items: { // Descreve cada objeto "secção" no array
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The unique ID of this course section.' },
          name: { type: 'string', description: 'The name of the course section (e.g., "Geral", "Semana 1", "Tópico 1").' },
          summary: { type: 'string', description: 'HTML summary/description for the section itself.' },
          visible: { type: 'integer', description: 'Visibility of the section (1 = visible, 0 = hidden).' },
          modules: {
            type: 'array',
            description: 'An array of modules (activities or resources) within this section.',
            items: { // Descreve cada objeto "módulo" no array de modules
              type: 'object',
              properties: {
                id: { type: 'integer', description: 'The unique ID of this module within the course. Use this ID with the "get_activity_details" tool for more specific details, or with "fetch_activity_content" to get its content.' },
                instance: { type: 'integer', description: 'The instance ID of this module type (e.g., the ID in the "assign" table if modname is "assign"). Less commonly used by the agent directly unless a specific API requires it.' },
                name: { type: 'string', description: 'The display name of the module (activity/resource name).' },
                url: { type: 'string', format: 'url', nullable: true, description: 'Direct URL to view this module (e.g., for "page", "quiz", "forum", "assign"). Use this URL with "get_page_module_content" if it\'s a page, or pass the module ID to "fetch_activity_content".' },
                modname: { type: 'string', description: 'The type of the module (e.g., "assign", "page", "resource", "quiz", "label", "forum"). This is CRUCIAL for deciding which subsequent tool to use or how to interpret the content.' },
                modplural: { type: 'string', description: 'Plural name of the module type.' },
                description: { type: 'string', nullable: true, description: 'HTML description of the module. For "label" type modules, this field IS the content. For other types like "assign" or "quiz", this might be the introduction/instructions.' },
                intro: { type: 'string', nullable: true, description: 'HTML introduction for the module, often used by "assign", "quiz". Similar to "description".'}, // Moodle usa description ou intro
                visible: { type: 'integer', description: 'Visibility of the module (1 = visible, 0 = hidden).' },
                noviewlink: { type: 'boolean', description: 'If true, this module (like a "label") does not have a separate view page/link. Its content is usually in its "description".' },
                contents: { // Mais detalhes para 'contents' como fizemos para get_activity_details
                  type: 'array',
                  nullable: true,
                  description: 'Associated files or content parts. CRUCIAL for "resource" modules, this contains the file details. For "page" modules, it might contain HTML content if structured that way by Moodle.',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', description: 'Type of content (e.g., "file", "url"). For "resource" modules, look for "file".' },
                      filename: { type: 'string', nullable: true, description: 'Name of the file.' },
                      fileurl: { type: 'string', format: 'url', nullable: true, description: 'Direct URL to download/access the file. For "resource" modules, use this URL with "get_resource_file_content" or pass the parent module ID to "fetch_activity_content".' },
                      mimetype: { type: 'string', nullable: true, description: 'MIME type of the file (e.g., "application/pdf", "text/html"). Important for "get_resource_file_content".' },
                      // ... outros campos de 'contents' que podem ser úteis
                    }
                  }
                },
                // ... outros campos do módulo que você achar relevantes
                // como 'completion', 'completiondata', 'dates'
              },
              required: ['id', 'name', 'modname'] // Campos mínimos que você garante
            }
          }
        },
        required: ['id', 'name', 'modules'] // Campos mínimos que uma secção terá
      }
    }
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
    outputSchema: { // NOVO
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The unique ID of this module within the course.' },
        url: { type: 'string', format: 'url', description: 'Direct URL to view this activity/module.' },
        name: { type: 'string', description: 'The display name of the activity.' },
        instance: { type: 'integer', description: 'The instance ID of this specific module type (e.g., the ID in the "assign" table if modname is "assign").' },
        modname: { type: 'string', description: 'The type of the module (e.g., assign, page, resource, quiz).' },
        // ... outros campos importantes como 'intro', 'description', 'contents', 'fileurl', 'mimetype' com descrições claras
        contents: {
          type: 'array',
          description: 'Associated files or content parts. For "resource" modules, this contains the file details. For "page" modules, it might contain HTML content if structured that way.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Type of content (e.g., file, url).' },
              filename: { type: 'string', description: 'Name of the file.' },
              filepath: { type: 'string', description: 'Path of the file within Moodle.' },
              fileurl: { type: 'string', format: 'url', description: 'Direct URL to download/access the file. Use this with get_resource_file_content or get_page_module_content.' },
              mimetype: { type: 'string', description: 'MIME type of the file (e.g., application/pdf, text/html). Important for get_resource_file_content.' }
              // ... outros campos de 'contents'
            }
          }
        },
        intro: { type: 'string', description: 'Introduction or description HTML for the activity (common for "assign", "quiz", etc.). May contain the main content for some "page" modules.'},
        description: { type: 'string', description: 'Description HTML for the activity (alternative to "intro" in some Moodle versions/modules).'}
      },
      required: ['id', 'name', 'modname'] // Campos que você garante que sempre estarão lá
    }
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
