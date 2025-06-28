// src/index.ts
import path from "path";
import { fileURLToPath } from "url";
import express from "express"; // Added
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"; // Added
import { setupFileLogger } from "../lib/logger.js";
import { MoodleMCP } from "./mcp_server.js";
import "./../config/index.js"; // Garante que config é executado
import { toolDefinitions } from "../tools/tool_definitions.js";

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
    console.log("Initial POST /mcp request body:", JSON.stringify(req.body, null, 2));

    // Transformação do pedido se 'method' for um nome de ferramenta conhecido
    const knownToolNames = toolDefinitions.map(td => td.name);
    if (req.body && typeof req.body.method === 'string' && knownToolNames.includes(req.body.method)) {
      console.log(`MCP Request Transformer: Original method '${req.body.method}' matches a known tool name. Transforming to 'call_tool' format.`);
      const toolName = req.body.method;
      const originalToolParams = req.body.params || {};

      req.body = {
        jsonrpc: req.body.jsonrpc || "2.0",
        id: req.body.id,
        method: "call_tool", // O método JSON-RPC que o CallToolRequestSchema espera
        params: {
          name: toolName,           // O nome original do método torna-se o nome da ferramenta
          input: originalToolParams // Os parâmetros originais tornam-se o 'input' da ferramenta
        }
      };
      console.log("MCP Request Transformer: Transformed request body:", JSON.stringify(req.body, null, 2));
    }

    let mcp: MoodleMCP; // Declare mcp here
    let transport: StreamableHTTPServerTransport; // Declare transport here

    try {
      mcp = new MoodleMCP(); // Instantiate MoodleMCP
      const sdkServer = mcp.getServer(); // Get the SDK Server instance

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless
      });

      // It's important to handle client connection closure to clean up the transport
      res.on("close", () => {
        console.log("Request closed, closing transport.");
        if (transport) {
          // Check if transport was initialized
          transport.close();
        }
        // Note: The SDK's McpServer or our MoodleMCP doesn't have a specific .close() method
        // for this stateless, per-request server setup.
        // If MoodleMCP acquired resources that need explicit cleanup per request,
        // a cleanup method on mcp would be needed here.
      });

      await sdkServer.connect(transport);
      // Pass the raw Express request and response objects, and the parsed body
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      // Ensure transport is closed on error too, if it was initialized
      if (transport! && !res.headersSent) {
        // Check if transport was initialized
        transport.close();
      }
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: req.body?.id || null, // Try to get request id from body
        });
      }
    }
  });

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
