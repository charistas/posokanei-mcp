#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("posokanei-mcp running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in posokanei-mcp:", error);
  process.exit(1);
});

