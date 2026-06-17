import type {
  ApiStats,
  CategoryNode,
  ProductSearchResponse,
  ProductSortBy,
  ProductSummary,
  Retailer,
  SortOrder,
} from "./types.js";

const DEFAULT_API_BASE = "https://api.posokanei.gov.gr";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MIN_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "posokanei-mcp/0.1.0";

export class PosoKaneiApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "PosoKaneiApiError";
  }
}

export interface PosoKaneiClientOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export class PosoKaneiClient {
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly cache = new Map<string, CacheEntry>();
  private rateLimitQueue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: PosoKaneiClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(
      options.baseUrl ?? process.env.POSOKANEI_API_BASE ?? DEFAULT_API_BASE,
    );
    this.cacheTtlMs =
      options.cacheTtlMs ?? numberFromEnv(process.env.POSOKANEI_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);
    this.minIntervalMs =
      options.minIntervalMs ??
      numberFromEnv(process.env.POSOKANEI_MIN_INTERVAL_MS, DEFAULT_MIN_INTERVAL_MS);
    this.timeoutMs =
      options.timeoutMs ?? numberFromEnv(process.env.POSOKANEI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async searchProducts(input: {
    query?: string;
    ids?: string[];
    page?: number;
    pageSize?: number;
    sortBy?: ProductSortBy;
    sortOrder?: SortOrder;
  }): Promise<ProductSearchResponse> {
    const page = clampInteger(input.page ?? 1, 1, 10_000);
    const pageSize = clampInteger(input.pageSize ?? 10, 1, 50);
    const body: Record<string, unknown> = {
      page,
      page_size: pageSize,
      sort_by: input.sortBy ?? "name",
      sort_order: input.sortOrder ?? "asc",
    };

    if (input.query?.trim()) {
      body.title = input.query.trim();
    }

    if (input.ids?.length) {
      body.ids = input.ids;
    }

    return this.request<ProductSearchResponse>("POST", "/products/search", {
      body,
    });
  }

  async listProducts(input: {
    category: string;
    isInternational?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: ProductSortBy;
    sortOrder?: SortOrder;
  }): Promise<ProductSearchResponse> {
    const params = new URLSearchParams({
      category: input.category,
      countries: "GR",
      page: String(clampInteger(input.page ?? 1, 1, 10_000)),
      page_size: String(clampInteger(input.pageSize ?? 10, 1, 50)),
      sort_by: input.sortBy ?? "unit_price",
      sort_order: input.sortOrder ?? "asc",
    });

    if (input.isInternational !== undefined) {
      params.set("is_international", String(input.isInternational));
    }

    return this.request<ProductSearchResponse>("GET", `/products?${params}`);
  }

  async getProduct(input: {
    productId: string;
    countries?: string;
    includeTax?: boolean;
    sortRetailers?: SortOrder;
    includeHistory?: boolean;
    priceType?: "price" | "unit_price";
  }): Promise<ProductSummary & Record<string, unknown>> {
    const params = new URLSearchParams({
      countries: input.countries ?? "GR",
      include_tax: String(input.includeTax ?? true),
    });

    if (input.sortRetailers) {
      params.set("sort_retailers", input.sortRetailers);
    }

    if (input.includeHistory) {
      params.set("include_history", "true");
    }

    if (input.priceType) {
      params.set("price_type", input.priceType);
    }

    return this.request<ProductSummary & Record<string, unknown>>(
      "GET",
      `/products/${encodeURIComponent(input.productId)}?${params}`,
    );
  }

  async lookupBarcode(input: {
    barcode: string;
    countries?: string;
    includeTax?: boolean;
  }): Promise<ProductSummary> {
    const params = new URLSearchParams({
      countries: input.countries ?? "GR",
      include_tax: String(input.includeTax ?? true),
    });
    return this.request<ProductSummary>(
      "GET",
      `/products/barcode/${encodeURIComponent(input.barcode)}?${params}`,
    );
  }

  async getCompetitors(input: {
    productId: string;
    retailer?: string;
    includeTax?: boolean;
  }): Promise<unknown> {
    const params = new URLSearchParams({
      include_tax: String(input.includeTax ?? true),
    });
    if (input.retailer?.trim()) {
      params.set("retailer", input.retailer.trim());
    }
    return this.request<unknown>(
      "GET",
      `/products/${encodeURIComponent(input.productId)}/competitors?${params}`,
    );
  }

  async listCategories(input: {
    tree?: boolean;
    includeCounts?: boolean;
    includeHidden?: boolean;
  } = {}): Promise<unknown> {
    if (input.tree === false) {
      return this.request<unknown>("GET", "/meta/categories");
    }

    const params = new URLSearchParams({
      include_counts: String(input.includeCounts ?? true),
      include_hidden: String(input.includeHidden ?? false),
    });
    return this.request<unknown>(`GET`, `/meta/categories/tree?${params}`);
  }

  async listRetailers(countries = "all"): Promise<{ retailers: Retailer[] }> {
    const params = new URLSearchParams({ countries });
    return this.request<{ retailers: Retailer[] }>(
      "GET",
      `/meta/retailers?${params}`,
    );
  }

  async getStats(): Promise<ApiStats> {
    return this.request<ApiStats>("GET", "/meta/stats");
  }

  private async request<T>(
    method: "GET" | "POST",
    pathAndQuery: string,
    options: { body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const cacheKey = `${method} ${pathAndQuery} ${JSON.stringify(options.body ?? {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    await this.waitForRateLimit();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${pathAndQuery}`;

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": this.userAgent,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new PosoKaneiApiError(
          messageForStatus(response.status, responseText),
          response.status,
          responseText,
        );
      }

      const value = responseText.length ? (JSON.parse(responseText) as T) : (null as T);
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + this.cacheTtlMs,
        value,
      });
      this.pruneCache();
      return value;
    } catch (error) {
      if (error instanceof PosoKaneiApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new PosoKaneiApiError(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw new PosoKaneiApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private waitForRateLimit(): Promise<void> {
    const next = this.rateLimitQueue.then(async () => {
      const now = Date.now();
      const waitMs = this.lastRequestAt + this.minIntervalMs - now;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastRequestAt = Date.now();
    });
    this.rateLimitQueue = next.catch(() => undefined);
    return next;
  }

  private pruneCache(): void {
    if (this.cache.size <= 500) {
      return;
    }
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now || this.cache.size > 400) {
        this.cache.delete(key);
      }
    }
  }
}

export function simplifyProduct(product: ProductSummary): Record<string, unknown> {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    subcategory: product.subcategory ?? null,
    unit: product.unit ?? null,
    unit_quantity: product.unit_quantity ?? null,
    image_url: product.image_url ?? null,
    price_stats: product.price_stats ?? null,
    retailers: product.retailers ?? [],
    retailer_prices: (product.retailer_prices ?? []).map((price) => ({
      retailer: price.retailer,
      retailer_name:
        price.retailer_display_name || price.retailer_name || price.retailer,
      price: price.price,
      unit_price: price.price_normalized,
      is_discount: price.is_discount ?? false,
      discount_percentage: price.discount_percentage ?? null,
      last_updated: price.last_updated ?? null,
      country: price.country ?? null,
    })),
  };
}

export function simplifyCategoryTree(
  raw: unknown,
  maxDepth: number,
  maxItems: number,
): Record<string, unknown> {
  const data = raw as { tree?: CategoryNode[]; total_categories?: number; root_count?: number };
  const roots = Array.isArray(data.tree) ? data.tree : [];
  let emitted = 0;
  let truncated = false;

  const simplifyNode = (
    node: CategoryNode,
    traversalDepth: number,
  ): Record<string, unknown> | null => {
    if (emitted >= maxItems) {
      truncated = true;
      return null;
    }
    emitted += 1;
    const simplified: Record<string, unknown> = {
      id: node.category_id,
      name: node.name ?? node.category_name ?? "",
      name_en: node.name_en ?? null,
      depth: traversalDepth,
      product_count: node.total_product_count ?? node.product_count ?? 0,
    };

    if (traversalDepth < maxDepth && node.children?.length) {
      const children = node.children
        .map((child) => simplifyNode(child, traversalDepth + 1))
        .filter((child): child is Record<string, unknown> => child !== null);
      if (children.length) {
        simplified.children = children;
      }
    }
    return simplified;
  };

  const tree = roots
    .map((node) => simplifyNode(node, 0))
    .filter((node): node is Record<string, unknown> => node !== null);

  return {
    total_categories: data.total_categories ?? null,
    root_count: data.root_count ?? roots.length,
    returned_categories: emitted,
    tree,
    truncated,
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function messageForStatus(status: number, responseText: string): string {
  if (status === 404) {
    return "Resource not found";
  }
  if (status === 429) {
    return "PosoKanei API rate limit reached. Try again later.";
  }
  if (status >= 500) {
    return "PosoKanei API server error";
  }
  return `PosoKanei API request failed with status ${status}: ${responseText.slice(0, 500)}`;
}
