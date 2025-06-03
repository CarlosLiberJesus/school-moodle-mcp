// src/tools/tool_definitions.ts

// O SDK pode ter um tipo mais específico para ToolDefinition, use-o se disponível.
// Por agora, uma interface genérica.
export interface ToolDefinitionSchema {
  name: string;
  description: string;
  inputSchema: unknown; // JSON Schema object
  outputSchema?: unknown; // Opcional, para descrever o output
}

export const toolDefinitions: ToolDefinitionSchema[] = [
  {
    name: "get_courses",
    description: "Retrieves a list of all available courses from Moodle.",
    inputSchema: {
      type: "object",
      properties: {
        moodle_token: {
          type: "string",
          description: "The Moodle API token for authentication.",
        },
        course_name_filter: {
          type: "string",
          description:
            "Optional. Text to filter course names (fullname or shortname, case-insensitive).",
        },
      },
      required: ["moodle_token"],
    },
    outputSchema: {
      type: "array",
      description:
        "An array of course objects. Each object contains details about a specific Moodle course.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description:
              'The unique ID of the course. This ID is CRUCIAL and should be used as the "course_id" parameter for the "get_course_contents" tool to retrieve the contents of this specific course.',
          },
          fullname: {
            type: "string",
            description:
              'The full, official name of the course (e.g., "Aplicações Informáticas B 12º Ano"). Present this to the user for selection.',
          },
          shortname: {
            type: "string",
            description:
              'A short name or code for the course (e.g., "AIB2122_1"). Can also be used for display or identification.',
          },
          displayname: {
            // Moodle geralmente retorna displayname
            type: "string",
            description:
              "The name of the course as it is displayed to users. Often the same as fullname.",
          },
          summary: {
            type: "string",
            description:
              "An HTML summary or description of the course. May need cleaning if displayed directly.",
          },
          visible: {
            // Moodle retorna 0 ou 1
            type: "integer", // Moodle retorna integer (0 ou 1)
            description:
              "Indicates if the course is visible to students (1 = visible, 0 = hidden). The agent should generally only consider visible courses unless specified otherwise.",
          },
          startdate: {
            type: "integer", // Unix timestamp
            description:
              "Unix timestamp representing the start date of the course. Convert to a human-readable date if needed for display.",
          },
          enddate: {
            type: "integer", // Unix timestamp
            description:
              "Unix timestamp representing the end date of the course. A value of 0 typically means no end date is set. Convert to a human-readable date if needed for display.",
          },
          format: {
            type: "string",
            description:
              'The course format (e.g., "topics", "weeks", "tiles"). This might give a hint about the course structure.',
          },
          lang: {
            type: "string",
            nullable: true,
            description:
              'The language code for the course (e.g., "pt", "en"). Can be an empty string.',
          },
        },
        required: [
          "id",
          "fullname",
          "shortname",
          "displayname",
          "visible",
          "startdate",
          "enddate",
          "format",
        ],
      },
    },
  },
  {
    name: "get_course_contents",
    description:
      "Retrieves the sections and modules for a specific course from Moodle.",
    inputSchema: {
      type: "object",
      properties: {
        moodle_token: {
          type: "string",
          description: "The Moodle API token for authentication.",
        },
        course_id: {
          type: "integer",
          description: "The ID of the course to retrieve contents for.",
        },
      },
      required: ["moodle_token", "course_id"],
    },
    outputSchema: {
      type: "array",
      description:
        "An array of course sections. Each section contains its details and a list of modules within it.",
      items: {
        // Descreve cada objeto "secção" no array
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "The unique ID of this course section.",
          },
          name: {
            type: "string",
            description:
              'The name of the course section (e.g., "Geral", "Semana 1", "Tópico 1").',
          },
          summary: {
            type: "string",
            description: "HTML summary/description for the section itself.",
          },
          visible: {
            type: "integer",
            description: "Visibility of the section (1 = visible, 0 = hidden).",
          },
          modules: {
            type: "array",
            description:
              "An array of modules (activities or resources) within this section.",
            items: {
              // Descreve cada objeto "módulo" no array de modules
              type: "object",
              properties: {
                id: {
                  type: "integer",
                  description:
                    'The unique ID of this module within the course. Use this ID with the "get_activity_details" tool for more specific details, or with "fetch_activity_content" to get its content.',
                },
                instance: {
                  type: "integer",
                  description:
                    'The instance ID of this module type (e.g., the ID in the "assign" table if modname is "assign"). Less commonly used by the agent directly unless a specific API requires it.',
                },
                name: {
                  type: "string",
                  description:
                    "The display name of the module (activity/resource name).",
                },
                url: {
                  type: "string",
                  format: "url",
                  nullable: true,
                  description:
                    'Direct URL to view this module (e.g., for "page", "quiz", "forum", "assign"). Use this URL with "get_page_module_content" if it\'s a page, or pass the module ID to "fetch_activity_content".',
                },
                modname: {
                  type: "string",
                  description:
                    'The type of the module (e.g., "assign", "page", "resource", "quiz", "label", "forum"). This is CRUCIAL for deciding which subsequent tool to use or how to interpret the content.',
                },
                modplural: {
                  type: "string",
                  description: "Plural name of the module type.",
                },
                description: {
                  type: "string",
                  nullable: true,
                  description:
                    'HTML description of the module. For "label" type modules, this field IS the content. For other types like "assign" or "quiz", this might be the introduction/instructions.',
                },
                intro: {
                  type: "string",
                  nullable: true,
                  description:
                    'HTML introduction for the module, often used by "assign", "quiz". Similar to "description".',
                }, // Moodle usa description ou intro
                visible: {
                  type: "integer",
                  description:
                    "Visibility of the module (1 = visible, 0 = hidden).",
                },
                noviewlink: {
                  type: "boolean",
                  description:
                    'If true, this module (like a "label") does not have a separate view page/link. Its content is usually in its "description".',
                },
                contents: {
                  // Mais detalhes para 'contents' como fizemos para get_activity_details
                  type: "array",
                  nullable: true,
                  description:
                    'Associated files or content parts. CRUCIAL for "resource" modules, this contains the file details. For "page" modules, it might contain HTML content if structured that way by Moodle.',
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        description:
                          'Type of content (e.g., "file", "url"). For "resource" modules, look for "file".',
                      },
                      filename: {
                        type: "string",
                        nullable: true,
                        description: "Name of the file.",
                      },
                      fileurl: {
                        type: "string",
                        format: "url",
                        nullable: true,
                        description:
                          'Direct URL to download/access the file. For "resource" modules, use this URL with "get_resource_file_content" or pass the parent module ID to "fetch_activity_content".',
                      },
                      mimetype: {
                        type: "string",
                        nullable: true,
                        description:
                          'MIME type of the file (e.g., "application/pdf", "text/html"). Important for "get_resource_file_content".',
                      },
                      // ... outros campos de 'contents' que podem ser úteis
                    },
                  },
                },
                // ... outros campos do módulo que você achar relevantes
                // como 'completion', 'completiondata', 'dates'
              },
              required: ["id", "name", "modname"], // Campos mínimos que você garante
            },
          },
        },
        required: ["id", "name", "modules"], // Campos mínimos que uma secção terá
      },
    },
  },
  {
    name: "get_page_module_content",
    description:
      'Retrieves the extracted text content of a Moodle "Page" module, given its direct content URL.',
    inputSchema: {
      type: "object",
      properties: {
        moodle_token: {
          type: "string",
          description: "The Moodle API token for authentication.",
        },
        page_content_url: {
          type: "string",
          format: "url",
          description:
            "The direct URL to the Moodle page module's content (e.g., from module details).",
        },
      },
      required: ["moodle_token", "page_content_url"],
    },
    outputSchema: {
      type: "string",
      description:
        "The extracted text content from the page. May be an empty string or a placeholder/error message if content cannot be fully extracted or an error occurs.",
    },
  },
  {
    name: "get_resource_file_content",
    description:
      'Retrieves and extracts text content from a Moodle "resource" file (PDF, DOCX, TXT), given its direct content URL and mimetype.',
    inputSchema: {
      type: "object",
      properties: {
        moodle_token: {
          type: "string",
          description: "The Moodle API token for authentication.",
        },
        resource_file_url: {
          type: "string",
          format: "url",
          description: "The direct URL to the Moodle resource file's content.",
        },
        mimetype: {
          type: "string",
          description:
            'The MIME type of the file (e.g., "application/pdf", "text/plain").',
        },
      },
      required: ["moodle_token", "resource_file_url", "mimetype"],
    },
    outputSchema: {
      type: "string",
      description:
        "The extracted text content from the file. Returns a placeholder message if the file type is not directly processable (e.g., PDF, DOCX where parsing is not yet implemented) or if an error occurs.",
    },
  },
  {
    name: "get_activity_details",
    description:
      "Retrieves the details of a specific activity from Moodle. Can search by activity ID or by course name and activity name.",
    inputSchema: {
      type: "object",
      properties: {
        moodle_token: {
          type: "string",
          description: "The Moodle API token for authentication.",
        },
      },
      oneOf: [
        {
          properties: {
            activity_id: {
              type: "integer",
              description:
                "The Course Module ID (cmid) of the activity to retrieve details for. This is the most direct way to get an activity.",
            },
          },
          required: ["activity_id"],
        },
        {
          properties: {
            course_id: {
              type: "integer",
              description:
                "The ID of the course where the activity is located. Obtain this using the 'get_courses' tool first if you only have the course name.",
            },
            activity_name: {
              type: "string",
              description:
                "The name (or part of the name, case-insensitive) of the activity to search for within the specified course_id.",
            },
          },
          required: ["course_id", "activity_name"],
        },
      ],
      required: ["moodle_token"],
    },
    outputSchema: {
      type: "object",
      description:
        "Detailed information about the course module (activity/resource).",
      properties: {
        id: { type: "integer", description: "The course module ID (cmid)." },
        course: {
          type: "integer",
          description: "The course ID this module belongs to.",
        },
        module: {
          type: "integer",
          description:
            "The module ID (internal Moodle ID for the type of module, e.g., ID for 'assign' in mdl_modules table).",
        },
        instance: {
          type: "integer",
          description:
            "The instance ID of this module (e.g., the ID in the 'assign' table).",
        },
        name: {
          type: "string",
          description: "The display name of the activity.",
        },
        url: {
          type: "string",
          format: "url",
          nullable: true,
          description: "Direct URL to view this activity/module.",
        },
        modname: {
          type: "string",
          description:
            "The type of the module (e.g., assign, page, resource, quiz).",
        },
        description: {
          type: "string",
          nullable: true,
          description:
            "HTML description/intro for the activity. May contain main content for 'page' or 'label'.",
        },
        intro: {
          type: "string",
          nullable: true,
          description: "HTML introduction, similar to description.",
        }, // Moodle pode usar intro ou description
        contents: {
          type: "array",
          nullable: true,
          description:
            "Associated files or content parts. Crucial for 'resource' or 'page' if content is a file.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "Type of content (e.g., file, url).",
              },
              filename: {
                type: "string",
                nullable: true,
                description: "Name of the file.",
              },
              filepath: {
                type: "string",
                nullable: true,
                description: "Path of the file within Moodle.",
              },
              fileurl: {
                type: "string",
                format: "url",
                nullable: true,
                description: "Direct URL to download/access the file.",
              },
              mimetype: {
                type: "string",
                nullable: true,
                description: "MIME type of the file.",
              },
            },
          },
        },
        contentsinfo: {
          type: "string",
          nullable: true,
          description:
            "JSON string with information about the main content of the module, often for 'page' or 'book'.",
        },
        visible: {
          type: "integer",
          description: "Visibility (1 = visible, 0 = hidden).",
        },
        // Adicionar outros campos importantes que são retornados por core_course_get_course_module.cm
        // ou por core_course_get_contents[section].modules[module]
      },
      required: ["id", "course", "instance", "name", "modname", "visible"],
    },
  },
  {
    name: "fetch_activity_content",
    description:
      "Fetches the detailed content of a specific Moodle activity (like assignment description, page text, resource file link, or URL details). Provides main text and a list of associated files.",
    inputSchema: {
      type: "object",
      properties: {
        moodle_token: {
          type: "string",
          description: "The Moodle API token for authentication.",
        },
      },
      oneOf: [
        {
          properties: {
            activity_id: {
              type: "integer",
              description: "The ID of the activity to fetch content for.",
            },
          },
          required: ["activity_id"],
        },
        {
          properties: {
            course_id: {
              type: "integer",
              description:
                "The ID of the course where the activity is located. Obtain this using the 'get_courses' tool first if you only have the course name.",
            },
            activity_name: {
              type: "string",
              description: "The name of the activity to fetch content for.",
            },
          },
          required: ["course_id", "activity_name"],
        },
      ],
      required: ["moodle_token"],
    },
    outputSchema: {
      type: "object",
      properties: {
        activityName: {
          type: "string",
          description: "The name of the activity.",
        },
        activityType: {
          type: "string",
          description: "The Moodle module type (e.g., assign, page, resource).",
        },
        activityUrl: {
          type: "string",
          format: "url",
          description: "The main URL to view the activity in Moodle.",
        },
        contentType: {
          type: "string",
          enum: [
            "text",
            "html_cleaned",
            "file_placeholder",
            "url_details",
            "error",
            "empty",
          ],
          description: "The nature of the main content provided.",
        },
        content: {
          type: "string",
          description:
            "The main textual content extracted from the activity (e.g., assignment description, cleaned page text, resource placeholder message, URL details). If an error occurred, this field contains the error message.",
        },
        files: {
          type: "array",
          description:
            "A list of files associated with this activity (e.g., attachments to an assignment, the resource file itself).",
          items: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "The name of the file.",
              },
              fileurl: {
                type: "string",
                format: "url",
                description:
                  "The direct URL to access/download the file (may require Moodle session/token).",
              },
              mimetype: {
                type: "string",
                description: "The MIME type of the file.",
              },
            },
            required: ["filename", "fileurl", "mimetype"],
          },
        },
      },
      required: [
        "activityName",
        "activityType",
        "activityUrl",
        "contentType",
        "content",
        "files",
      ],
    },
  },
];
