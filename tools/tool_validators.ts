// tools/tool_validators.ts
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export interface ToolValidationResult {
  isValid: boolean;
  error?: McpError;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validatedData?: any;
}

export class ToolValidator {
  private static instance: ToolValidator;
  private validators: Map<string, z.ZodSchema>;

  private constructor() {
    this.validators = new Map();
    this.initializeValidators();
  }

  public static getInstance(): ToolValidator {
    if (!ToolValidator.instance) {
      ToolValidator.instance = new ToolValidator();
    }
    return ToolValidator.instance;
  }

  private initializeValidators() {
    // Definir validadores Zod para cada ferramenta
    this.validators.set(
      "get_courses",
      z.object({
        moodle_token: z
          .string()
          .min(1, { message: "moodle_token is required." }),
        course_name_filter: z.string().nullable().optional(),
      })
    );
    this.validators.set(
      "get_course_contents",
      z.object({
        moodle_token: z
          .string()
          .min(1, { message: "moodle_token is required." }),
        course_id: z.number().int().positive(),
      })
    );
    this.validators.set(
      "get_page_module_content",
      z.object({
        moodle_token: z
          .string()
          .min(1, { message: "moodle_token is required." }),
        page_content_url: z.string().url(),
      })
    );
    this.validators.set(
      "get_resource_file_content",
      z.object({
        moodle_token: z
          .string()
          .min(1, { message: "moodle_token is required." }),
        resource_file_url: z.string().url(),
        mimetype: z.string(),
      })
    );
    this.validators.set(
      "get_activity_details",
      z
        .object({
          moodle_token: z
            .string()
            .min(1, { message: "moodle_token is required." }),
        })
        .and(
          z.union([
            z.object({
              activity_id: z.number().int().positive({
                message: "activity_id must be a positive integer.",
              }),
            }),
            z.object({
              course_id: z
                .number()
                .int()
                .positive({ message: "course_id must be a positive integer." }),
              activity_name: z
                .string()
                .min(1, { message: "activity_name must not be empty." }),
            }),
          ])
        )
    );
    this.validators.set(
      "fetch_activity_content",
      z
        .object({
          moodle_token: z
            .string()
            .min(1, { message: "moodle_token is required." }),
        })
        .and(
          z.union([
            z.object({
              activity_id: z.number().int().positive({
                message: "activity_id must be a positive integer.",
              }),
            }),
            z.object({
              course_id: z
                .number()
                .int()
                .positive({ message: "course_id must be a positive integer." }),
              activity_name: z.string().min(1, {
                message:
                  "activity_name must not be empty when used with course_id.",
              }),
            }),
          ])
        )
    );
    this.validators.set(
      "get_course_activities",
      z.object({
        moodle_token: z.string().min(1, { message: "moodle_token is required." }),
        course_id: z.number().int().positive({ message: "course_id must be a positive integer." }),
      })
    );
  }

  public validateInput(
    toolName: string,
    inputData: unknown
  ): ToolValidationResult {
    const validator = this.validators.get(toolName);

    if (!validator) {
      return {
        isValid: false,
        error: new McpError(
          ErrorCode.MethodNotFound,
          `Validator not found for tool: ${toolName}`
        ),
      };
    }

    try {
      const result = validator.parse(inputData);
      return {
        isValid: true,
        validatedData: result,
      };
    } catch (error) {
      let errorMessage = "Invalid input data";
      if (error instanceof z.ZodError) {
        errorMessage = error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; ");
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        isValid: false,
        error: new McpError(ErrorCode.InvalidParams, errorMessage),
      };
    }
  }
  /*
 ACHO QUE Não Necessito
  public validateSchema(toolDefinition: ToolDefinitionSchema): boolean {
    try {
      // Aqui podemos adicionar validação do schema JSON
      // Por exemplo, verificar se tem todos os campos obrigatórios
      // Verificar se os tipos estão corretos
      return true;
    } catch (error) {
      console.error('Error validating tool schema:', error);
      return false;
    }
  }
*/
}
