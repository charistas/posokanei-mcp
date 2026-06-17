import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PosoKaneiApiError,
  PosoKaneiClient,
  simplifyCategoryTree,
  simplifyProduct,
} from "./api.js";
import { compareBasket } from "./basket.js";
import type { BasketItemInput, ProductSortBy, SortOrder } from "./types.js";

const sortBySchema = z.enum(["name", "price", "unit_price"]);
const sortOrderSchema = z.enum(["asc", "desc"]);
const omittedArgumentFriendlyTools = new Set([
  "list_categories",
  "list_retailers",
  "get_stats",
]);

type ToolInputValidator = (
  tool: unknown,
  args: unknown,
  toolName: string,
) => Promise<unknown>;

type McpServerInputValidatorPatch = {
  validateToolInput: ToolInputValidator;
};

export function createServer(client = new PosoKaneiClient()): McpServer {
  const server = new McpServer({
    name: "posokanei-mcp",
    version: "0.1.0",
  });

  allowOmittedToolArguments(server);

  server.registerTool(
    "search_products",
    {
      description:
        "Search PosoKanei supermarket products by Greek or English product text. Returns current price summaries and retailer prices.",
      inputSchema: {
        query: z.string().min(1).describe("Product search text, for example 'γάλα' or 'feta'."),
        page: z.number().int().min(1).default(1).describe("Result page."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Results per page. Capped at 50."),
        sortBy: sortBySchema.default("name").describe("Sort field."),
        sortOrder: sortOrderSchema.default("asc").describe("Sort order."),
      },
    },
    async ({ query, page, pageSize, sortBy, sortOrder }) =>
      asToolResult(async () => {
        const result = await client.searchProducts({
          query,
          page,
          pageSize,
          sortBy: sortBy as ProductSortBy,
          sortOrder: sortOrder as SortOrder,
        });
        return {
          ...result,
          products: result.products.map(simplifyProduct),
          source: "https://posokanei.gov.gr/",
        };
      }),
  );

  server.registerTool(
    "get_product",
    {
      description:
        "Get details and retailer prices for one PosoKanei product id.",
      inputSchema: {
        productId: z.string().min(1).describe("PosoKanei product id."),
        countries: z.string().default("GR").describe("Country code list accepted by the API. Defaults to GR."),
        includeTax: z.boolean().default(true).describe("Include tax in displayed prices."),
        sortRetailers: sortOrderSchema.default("asc").describe("Retailer price sort order."),
      },
    },
    async ({ productId, countries, includeTax, sortRetailers }) =>
      asToolResult(async () =>
        simplifyProduct(
          await client.getProduct({
            productId,
            countries,
            includeTax,
            sortRetailers: sortRetailers as SortOrder,
          }),
        ),
      ),
  );

  server.registerTool(
    "lookup_barcode",
    {
      description:
        "Find a product by EAN/GTIN barcode and return current supermarket prices.",
      inputSchema: {
        barcode: z
          .string()
          .regex(/^(\d{8}|\d{12}|\d{13})$/)
          .describe("8, 12, or 13 digit barcode."),
        countries: z.string().default("GR").describe("Country code list accepted by the API. Defaults to GR."),
        includeTax: z.boolean().default(true).describe("Include tax in displayed prices."),
      },
    },
    async ({ barcode, countries, includeTax }) =>
      asToolResult(async () =>
        simplifyProduct(await client.lookupBarcode({ barcode, countries, includeTax })),
      ),
  );

  server.registerTool(
    "list_products_by_category",
    {
      description:
        "List products in a PosoKanei category id, sorted by unit price by default.",
      inputSchema: {
        category: z.string().min(1).describe("Category id from list_categories."),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
        sortBy: sortBySchema.default("unit_price"),
        sortOrder: sortOrderSchema.default("asc"),
        isInternational: z.boolean().optional().describe("Filter international comparison products when set."),
      },
    },
    async ({ category, page, pageSize, sortBy, sortOrder, isInternational }) =>
      asToolResult(async () => {
        const result = await client.listProducts({
          category,
          page,
          pageSize,
          sortBy: sortBy as ProductSortBy,
          sortOrder: sortOrder as SortOrder,
          isInternational,
        });
        return {
          ...result,
          products: result.products.map(simplifyProduct),
        };
      }),
  );

  server.registerTool(
    "list_categories",
    {
      description:
        "List PosoKanei product categories. The default response is simplified because the full tree is very large.",
      inputSchema: {
        maxDepth: z.number().int().min(0).max(10).default(2).describe("Maximum category tree depth to return."),
        maxItems: z.number().int().min(1).max(500).default(100).describe("Maximum category nodes to return."),
        includeCounts: z.boolean().default(true),
        includeHidden: z.boolean().default(false),
      },
    },
    async ({ maxDepth, maxItems, includeCounts, includeHidden }) =>
      asToolResult(async () => {
        const raw = await client.listCategories({ tree: true, includeCounts, includeHidden });
        return simplifyCategoryTree(raw, maxDepth, maxItems);
      }),
  );

  server.registerTool(
    "list_retailers",
    {
      description: "List retailers known to PosoKanei.",
      inputSchema: {
        countries: z.string().default("all").describe("Country filter. Use 'all' or 'GR'."),
      },
    },
    async ({ countries }) => asToolResult(() => client.listRetailers(countries)),
  );

  server.registerTool(
    "get_price_history",
    {
      description:
        "Get product details including price history when available from PosoKanei.",
      inputSchema: {
        productId: z.string().min(1).describe("PosoKanei product id."),
        countries: z.string().default("GR"),
        includeTax: z.boolean().default(true),
        priceType: z.enum(["price", "unit_price"]).default("price"),
      },
    },
    async ({ productId, countries, includeTax, priceType }) =>
      asToolResult(() =>
        client.getProduct({
          productId,
          countries,
          includeTax,
          includeHistory: true,
          priceType,
        }),
      ),
  );

  server.registerTool(
    "compare_competitors",
    {
      description:
        "Get competitor or comparable product data for one product id when available.",
      inputSchema: {
        productId: z.string().min(1).describe("PosoKanei product id."),
        retailer: z.string().optional().describe("Optional retailer id to anchor comparison."),
        includeTax: z.boolean().default(true),
      },
    },
    async ({ productId, retailer, includeTax }) =>
      asToolResult(() => client.getCompetitors({ productId, retailer, includeTax })),
  );

  server.registerTool(
    "compare_basket",
    {
      description:
        "Compare a small shopping basket across retailers. Items can be product ids, barcodes, or search queries. Query matching uses the first search result.",
      inputSchema: {
        items: z
          .array(
            z.object({
              productId: z.string().optional(),
              barcode: z.string().optional(),
              query: z.string().optional(),
              quantity: z.number().positive().optional(),
            }),
          )
          .min(1)
          .max(25)
          .describe("Basket items. Prefer productId or barcode when possible for accuracy."),
      },
    },
    async ({ items }) =>
      asToolResult(() => compareBasket(client, items as BasketItemInput[])),
  );

  server.registerTool(
    "get_stats",
    {
      description: "Get high-level PosoKanei dataset stats.",
      inputSchema: {},
    },
    async () => asToolResult(() => client.getStats()),
  );

  return server;
}

function allowOmittedToolArguments(server: McpServer) {
  const patchedServer = server as unknown as McpServerInputValidatorPatch;
  const validateToolInput = patchedServer.validateToolInput.bind(server);

  patchedServer.validateToolInput = (tool, args, toolName) =>
    validateToolInput(
      tool,
      args === undefined && omittedArgumentFriendlyTools.has(toolName) ? {} : args,
      toolName,
    );
}

async function asToolResult(producer: () => Promise<unknown> | unknown) {
  try {
    const data = await producer();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof PosoKaneiApiError
        ? `${error.message}${error.status ? ` (HTTP ${error.status})` : ""}`
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: message,
        },
      ],
    };
  }
}
