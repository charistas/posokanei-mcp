# posokanei-mcp

Unofficial read-only MCP server for supermarket product and price data from [PosoKanei](https://posokanei.gov.gr/).

This server lets MCP-compatible clients ask questions such as:

- Search for supermarket products by name.
- Look up a product by barcode.
- Compare current retailer prices for a product.
- Compare a small shopping basket across retailers.
- Browse product categories and retailers.

## Status

Early open-source version. The implementation uses public, undocumented endpoints used by the PosoKanei web app. Keep requests modest and cache-friendly.

This project is not affiliated with, endorsed by, or operated by PosoKanei, gov.gr, or any Greek public authority.

## Installation

Add it to your MCP client configuration:

```json
{
  "mcpServers": {
    "posokanei": {
      "command": "npx",
      "args": ["-y", "posokanei-mcp"]
    }
  }
}
```

For local development:

```json
{
  "mcpServers": {
    "posokanei": {
      "command": "node",
      "args": ["/absolute/path/to/posokanei-mcp/dist/index.js"]
    }
  }
}
```

Build first:

```sh
npm install
npm run build
```

## Tools

| Tool | Purpose |
| --- | --- |
| `search_products` | Search products by text. |
| `get_product` | Get details and retailer prices for a product id. |
| `lookup_barcode` | Find product prices by EAN/GTIN barcode. |
| `list_products_by_category` | List category products, sorted by unit price by default. |
| `list_categories` | Return a simplified category tree. |
| `list_retailers` | List known retailers. |
| `get_price_history` | Fetch product detail with history when available. |
| `compare_competitors` | Fetch comparable/competitor product data when available. |
| `compare_basket` | Compare a small basket across retailers. |
| `get_stats` | Return high-level dataset stats. |

## Configuration

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSOKANEI_API_BASE` | `https://api.posokanei.gov.gr` | API base URL. |
| `POSOKANEI_CACHE_TTL_MS` | `300000` | In-memory cache TTL. |
| `POSOKANEI_MIN_INTERVAL_MS` | `250` | Minimum delay between outbound API requests. |
| `POSOKANEI_TIMEOUT_MS` | `15000` | Request timeout. |

## Development

```sh
npm install
npm run typecheck
npm test
```

The test suite mocks the PosoKanei API. It should not require live network access.

## License

MIT
