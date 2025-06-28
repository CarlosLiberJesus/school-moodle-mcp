// src/index.ts
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
// StreamableHTTPServerTransport import removido pois não é mais usado diretamente aqui
import { setupFileLogger } from "../lib/logger.js";
import { MoodleMCP } from "./mcp_server.js";
import "./../config/index.js"; // Garante que config é executado
import { toolDefinitions } from "../tools/tool_definitions.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

// --- Configuração do Logger ---
const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootLogsDir = path.resolve(currentFileDir, "..", "..", "logs");

setupFileLogger(projectRootLogsDir, {
  logLevel:
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "debug",
});

// --- Inicialização da Aplicação HTTP ---
async function startServer() {
  // Renamed main to startServer for clarity
  const app = express();
  app.use(express.json());

  const PORT = process.env.PORT || 3001;

  app.post("/mcp", async (req, res) => {
    console.log("-----------------------------------------------------");
    console.log(
      "Initial POST /mcp request body:",
      JSON.stringify(req.body, null, 2)
    );

    const { id, method: methodName, params: toolParams, jsonrpc } = req.body;

    if (jsonrpc !== "2.0") {
      res.status(400).json({
        jsonrpc: "2.0",
        id: id || null,
        error: {
          code: -32600,
          message: "Invalid Request: JSON-RPC version must be 2.0",
        },
      });
      return;
    }
    if (typeof methodName !== "string") {
      res.status(400).json({
        jsonrpc: "2.0",
        id: id || null,
        error: {
          code: -32600,
          message: "Invalid Request: Method must be a string",
        },
      });
      return;
    }

    const knownToolNames = toolDefinitions.map((td) => td.name);

    if (knownToolNames.includes(methodName)) {
      // É uma chamada de ferramenta conhecida, tratar diretamente
      console.log(
        `Direct Dispatch: Method '${methodName}' is a known tool. Processing directly.`
      );
      try {
        const mcp = new MoodleMCP(); // Instanciar para aceder a callToolForTests
        // `toolParams` já é o objeto de parâmetros da ferramenta, incluindo o moodle_token
        const result = await mcp.callToolForTests(methodName, toolParams || {});

        let responseContent;
        if (typeof result === "string") {
          responseContent = [{ type: "text", text: result }];
        } else {
          responseContent = [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ];
        }

        res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: { content: responseContent },
        });
        return;
      } catch (error: unknown) {
        console.error(`Error directly executing tool '${methodName}':`, error);
        if (error instanceof McpError) {
          res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            error: {
              code: error.code,
              message: error.message,
              data: error.data,
            },
          });
          return;
        } else if (error instanceof Error) {
          res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            error: { code: -32000, message: `Server error: ${error.message}` },
          });
          return;
        } else {
          res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            error: { code: -32000, message: "Unknown server error" },
          });
          return;
        }
      }
    } else {
      // Método não é uma ferramenta conhecida.
      // Poderíamos aqui tentar usar o SDK para outros métodos MCP (ex: list_tools),
      // mas por agora, vamos apenas dizer Method Not Found para simplificar.
      console.warn(
        `Direct Dispatch: Method '${methodName}' not found in known tools or special MCP methods.`
      );
      res.status(200).json({
        jsonrpc: "2.0",
        id: id,
        error: { code: -32601, message: `Method not found: ${methodName}` },
      });
      return;
    }
  });

  // GET e DELETE /mcp podem permanecer como estão, pois não são para chamadas de ferramentas.
  app.get("/mcp", (req, res) => {
    // Made synchronous as it doesn't await
    console.log("Received GET /mcp request; Method Not Allowed.");
    res.status(405).json({
      // Use .status().json() for consistency
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Please use POST.",
      },
      id: null,
    });
  });

  app.delete("/mcp", (req, res) => {
    // Made synchronous
    console.log("Received DELETE /mcp request; Method Not Allowed.");
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Please use POST.",
      },
      id: null,
    });
  });

  app.listen(PORT, () => {
    console.log(`Moodle MCP server listening on http://localhost:${PORT}/mcp`);
  });

  app.post("/test", async (req, res) => {
    res.json({ ok: true, body: req.body });
  });
}

startServer().catch((error) => {
  console.error("Failed to start HTTP server:", error);
  process.exit(1);
});
