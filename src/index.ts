#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
const MOODLE_URL = process.env.MOODLE_URL;

if (!MOODLE_TOKEN) {
  throw new Error('MOODLE_TOKEN environment variable is required');
}

if (!MOODLE_URL) {
    throw new Error('MOODLE_URL environment variable is required');
}

interface Course {
  id: number;
  fullname: string;
  shortname: string;
}

class MoodleMCP {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'school-moodle-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {}
        }
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_courses',
          description: 'Retrieves a list of courses from Moodle',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'get_courses') {
        try {
          const response = await axios.post(
            MOODLE_URL + '/webservice/rest/server.php',
            {},
            {
              params: {
                wstoken: MOODLE_TOKEN,
                wsfunction: 'core_course_get_courses',
                moodlewsrestformat: 'json',
              },
            }
          );

          const courses: Course[] = response.data;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(courses, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error(error);
          throw new McpError(
            ErrorCode.InternalError,
            `Moodle API error: ${error.message}`
          );
        }
      } else {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Moodle MCP server running on stdio');
  }
}

const server = new MoodleMCP();
server.run().catch(console.error);
