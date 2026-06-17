import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../dist/server.js";

test("default-only MCP tools accept omitted arguments", async () => {
  const server = createServer({});

  const categories = await validateTool(server, "list_categories", undefined);
  assert.deepEqual(categories, {
    maxDepth: 2,
    maxItems: 100,
    includeCounts: true,
    includeHidden: false
  });

  const retailers = await validateTool(server, "list_retailers", undefined);
  assert.deepEqual(retailers, { countries: "all" });

  const stats = await validateTool(server, "get_stats", undefined);
  assert.deepEqual(stats, {});
});

function validateTool(server, toolName, args) {
  return server.validateToolInput(server._registeredTools[toolName], args, toolName);
}
