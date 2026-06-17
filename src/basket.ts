import type {
  BasketItemInput,
  BasketRetailerLine,
  BasketRetailerTotal,
  ProductSummary,
} from "./types.js";
import { PosoKaneiApiError, type PosoKaneiClient } from "./api.js";

export interface BasketComparison {
  items: Array<{
    input: BasketItemInput;
    productId?: string;
    productName?: string;
    matched: boolean;
    reason?: string;
  }>;
  retailers: BasketRetailerTotal[];
}

export async function compareBasket(
  client: PosoKaneiClient,
  items: BasketItemInput[],
): Promise<BasketComparison> {
  const matchedProducts: Array<{ input: BasketItemInput; product: ProductSummary }> = [];
  const itemResults: BasketComparison["items"] = [];

  for (const item of items) {
    const quantity = normalizeQuantity(item.quantity);
    try {
      const product = await resolveProduct(client, item);
      matchedProducts.push({ input: { ...item, quantity }, product });
      itemResults.push({
        input: { ...item, quantity },
        productId: product.id,
        productName: product.name,
        matched: true,
      });
    } catch (error) {
      if (!isUnmatchedBasketError(error)) {
        throw error;
      }
      itemResults.push({
        input: { ...item, quantity },
        matched: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const byRetailer = new Map<string, BasketRetailerTotal>();
  const allProducts = matchedProducts.map(({ product }) => ({
    id: product.id,
    name: product.name,
  }));

  for (const { input, product } of matchedProducts) {
    const quantity = normalizeQuantity(input.quantity);
    for (const retailerPrice of product.retailer_prices ?? []) {
      if (typeof retailerPrice.price !== "number") {
        continue;
      }

      const retailerKey =
        retailerPrice.retailer ??
        retailerPrice.retailer_display_name ??
        retailerPrice.retailer_name;
      if (!retailerKey) {
        continue;
      }

      const retailerName =
        retailerPrice.retailer_display_name ||
        retailerPrice.retailer_name ||
        retailerKey;
      const line: BasketRetailerLine = {
        productId: product.id,
        productName: product.name,
        quantity,
        price: retailerPrice.price,
        unitPrice: retailerPrice.price_normalized,
        subtotal: roundCurrency(retailerPrice.price * quantity),
        lastUpdated: retailerPrice.last_updated ?? null,
      };

      const total = byRetailer.get(retailerKey) ?? {
        retailer: retailerKey,
        retailerName,
        total: 0,
        matchedItems: 0,
        missingItems: [],
        lines: [],
      };
      total.lines.push(line);
      total.total = roundCurrency(total.total + line.subtotal);
      total.matchedItems += 1;
      byRetailer.set(retailerKey, total);
    }
  }

  const retailers = [...byRetailer.values()]
    .map((retailer) => ({
      ...retailer,
      missingItems: allProducts
        .filter(
          (product) => !retailer.lines.some((line) => line.productId === product.id),
        )
        .map((product) => `${product.name} (${product.id})`),
    }))
    .sort((a, b) => {
      if (a.missingItems.length !== b.missingItems.length) {
        return a.missingItems.length - b.missingItems.length;
      }
      return a.total - b.total;
    });

  return {
    items: itemResults,
    retailers,
  };
}

async function resolveProduct(
  client: PosoKaneiClient,
  item: BasketItemInput,
): Promise<ProductSummary> {
  if (item.productId?.trim()) {
    return client.getProduct({ productId: item.productId.trim(), sortRetailers: "asc" });
  }

  if (item.barcode?.trim()) {
    return client.lookupBarcode({ barcode: item.barcode.trim() });
  }

  if (item.query?.trim()) {
    const result = await client.searchProducts({
      query: item.query.trim(),
      page: 1,
      pageSize: 1,
      sortBy: "name",
      sortOrder: "asc",
    });
    const product = result.products[0];
    if (!product) {
      throw new BasketItemResolutionError(`No product found for query: ${item.query}`);
    }
    return product;
  }

  throw new BasketItemResolutionError("Each basket item needs productId, barcode, or query");
}

class BasketItemResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasketItemResolutionError";
  }
}

function isUnmatchedBasketError(error: unknown): boolean {
  return (
    error instanceof BasketItemResolutionError ||
    (error instanceof PosoKaneiApiError && error.status === 404)
  );
}

function normalizeQuantity(quantity: number | undefined): number {
  if (quantity === undefined || !Number.isFinite(quantity) || quantity <= 0) {
    return 1;
  }
  return quantity;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
