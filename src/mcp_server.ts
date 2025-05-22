// src/mcp_server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { MoodleApiClient } from './../moodle/moodle_api_client.js';
import { toolDefinitions, ToolDefinitionSchema } from './../tools/tool_definitions.js';
import { ToolValidator } from './../tools/tool_validators.js';
import type { 
    GetCourseContentsInput, 
    GetPageModuleContentInput, 
    GetResourceFileContentInput,
    MoodleModuleContent 
} from './../moodle/moodle_types.js';

// Interface for tool calls
interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export class MoodleMCP {
  private server: Server;
  private moodleClient: MoodleApiClient;
  private version: string = '0.2.7';
  private toolValidator: ToolValidator;

  constructor() {
    this.moodleClient = new MoodleApiClient();
    this.toolValidator = ToolValidator.getInstance();

    const serverCapabilitiesTools = Object.fromEntries(
        toolDefinitions.map((td: ToolDefinitionSchema) => [
            td.name, 
            {
                description: td.description,
                inputSchema: td.inputSchema,
            }
        ])
    );

    console.log("Loaded tools:", toolDefinitions.map(t => t.name));

    this.server = new Server(
      {
        name: 'school-moodle-mcp',
        version: this.version,
      },
      {
        capabilities: {
          resources: {},
          tools: {
            call: async (toolName: string, input: Record<string, any>) => {
              return await this.handleTool(toolName, input);
            },
          },
        },
      }
    );
  }

  // Public method to handle tools
  private async handleTool(toolName: string, input: Record<string, any>): Promise<any> {
    const toolDefinition = toolDefinitions.find(td => td.name === toolName);
    if (!toolDefinition) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    const validation = this.toolValidator.validateInput(toolName, input);
    
    if (!validation.isValid) {
      throw validation.error;
    }

    const validatedInput = validation.validatedData;
    
    switch (toolName) {
      case 'get_courses': {
        return await this.moodleClient.getCourses();
      }
      
      case 'get_course_contents': {
        const { course_id } = validatedInput as { course_id: number };
        return await this.moodleClient.getCourseContents(course_id);
      }
      
      case 'get_page_module_content': {
        const { page_content_url } = validatedInput as { page_content_url: string };
        return await this.moodleClient.getPageModuleContentByUrl(page_content_url);
      }
      
      case 'get_resource_file_content': {
        const { resource_file_url, mimetype } = validatedInput as { 
          resource_file_url: string, 
          mimetype: string 
        };
        return await this.moodleClient.getResourceFileContent(resource_file_url, mimetype);
      }
      
      case 'get_activity_details': {
        const { activity_id, course_name, activity_name } = validatedInput;
        
        if (activity_id !== undefined) {
          if (typeof activity_id !== 'number') {
            throw new McpError(ErrorCode.InvalidParams, `Invalid 'activity_id' (number) for ${toolName}. Received: ${activity_id}`);
          }
          return await this.moodleClient.getActivityDetails({ activity_id });
        } else if (course_name && activity_name) {
          if (typeof course_name !== 'string' || typeof activity_name !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, `Invalid 'course_name' or 'activity_name' for ${toolName}. Received: ${course_name}, ${activity_name}`);
          }
          return await this.moodleClient.getActivityDetails({ course_name, activity_name });
        } else {
          throw new McpError(ErrorCode.InvalidParams, `Either activity_id or both course_name and activity_name must be provided for ${toolName}`);
        }
      }

      case 'analyze_activity_content': {
        const { activity_details } = validatedInput as { activity_details: any };
        
        // Analyze the activity details to determine content type
        const modname = activity_details.modname?.toLowerCase();
        const contents = activity_details.contents || [];
        
        // Check if it's a page module
        if (modname === 'page') {
          const pageUrl = contents.find((c: MoodleModuleContent) => c.type === 'page')?.fileurl;
          if (pageUrl) {
            return {
              type: 'page',
              url: pageUrl,
              fetchTool: 'get_page_module_content',
              fetchParams: { page_content_url: pageUrl }
            };
          }
        }
        
        // Check if it's a resource file
        const resource = contents.find((c: MoodleModuleContent) => c.type === 'resource');
        if (resource) {
          return {
            type: 'resource',
            url: resource.fileurl,
            mimetype: resource.mimetype,
            fetchTool: 'get_resource_file_content',
            fetchParams: { 
              resource_file_url: resource.fileurl,
              mimetype: resource.mimetype 
            }
          };
        }
        
        // If we can't determine the content type
        return {
          type: 'unknown',
          details: activity_details,
          fetchTool: null,
          fetchParams: null
        };
      }

      case 'fetch_activity_content': {
        const { activity_id, course_name, activity_name } = validatedInput;
        
        // First get the activity details
        let activityDetails;
        if (activity_id !== undefined) {
          activityDetails = await this.moodleClient.getActivityDetails({ activity_id });
        } else if (course_name && activity_name) {
          activityDetails = await this.moodleClient.getActivityDetails({ course_name, activity_name });
        } else {
          throw new McpError(ErrorCode.InvalidParams, 'Either activity_id or both course_name and activity_name must be provided');
        }
        
        // Analyze the content type
        const modname = activityDetails.modname?.toLowerCase();
        const contents = activityDetails.contents || [];
        
        // Handle page content
        if (modname === 'page') {
          const pageUrl = contents.find((c: MoodleModuleContent) => c.type === 'page')?.fileurl;
          if (pageUrl) {
            return await this.moodleClient.getPageModuleContentByUrl(pageUrl);
          }
        }
        
        // Handle resource file
        const resource = contents.find((c: MoodleModuleContent) => c.type === 'resource');
        if (resource) {
          return await this.moodleClient.getResourceFileContent(resource.fileurl, resource.mimetype);
        }
        
        // If we can't determine the content type
        throw new McpError(ErrorCode.InvalidParams, `Could not determine content type for activity ${activity_id || activity_name}`);
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  }

  // Public method to call tools from tests
  async callTool(toolName: string, input: Record<string, any>): Promise<any> {
    return await this.handleTool(toolName, input);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log(`Moodle MCP server v${this.version} running on stdio...`);
  }
}
