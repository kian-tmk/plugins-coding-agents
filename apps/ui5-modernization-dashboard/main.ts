import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import type { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./server.js";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = "/tmp/ui5-modernization-state.json";

async function startStreamableHTTPServer(
  factory: () => McpServer,
): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());

  // Serve the built MCP app UI at root
  app.get("/", async (_req: Request, res: Response) => {
    const htmlPath = path.join(PROJECT_DIR, "dist", "mcp-app.html");
    res.sendFile(htmlPath);
  });

  // Serve files from modernization-history/ at /files/
  app.get("/files/:filename", async (req: Request, res: Response) => {
    const filename = path.basename(String(req.params.filename)); // no path traversal
    const filepath = path.join(PROJECT_DIR, "modernization-history", filename);
    try {
      const content = await fs.readFile(filepath, "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(content);
    } catch {
      res.status(404).send("Not found");
    }
  });

  app.get("/api/status", async (_req: Request, res: Response) => {
    try {
      const raw = await fs.readFile(STATE_FILE, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      res.json({ status: "idle" });
    }
  });

  // REST API: reset dashboard to idle
  app.post("/api/reset", async (_req: Request, res: Response) => {
    await fs.writeFile(STATE_FILE, JSON.stringify({ status: "idle" }, null, 2), "utf-8");
    res.json({ ok: true });
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = factory();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`UI5 Modernization MCP server listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startStdioServer(factory: () => McpServer): Promise<void> {
  await factory().connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
