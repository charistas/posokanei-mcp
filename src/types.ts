export type SortOrder = "asc" | "desc";
export type ProductSortBy = "name" | "price" | "unit_price";

export interface RetailerPrice {
  retailer?: string;
  retailer_display_name?: string;
  retailer_name?: string;
  price?: number;
  price_normalized?: number;
  is_discount?: boolean;
  discount_percentage?: number | null;
  last_updated?: string | null;
  country?: string;
}

export interface PriceStats {
  min_price?: number;
  max_price?: number;
  avg_price?: number;
  retailer_count?: number;
  min_unit_price?: number;
  last_computed?: string | null;
}

export interface ProductSummary {
  id: string;
  gtin?: string | null;
  barcode?: string | null;
  barcode_aliases?: string[];
  name: string;
  brand?: string | null;
  category?: string | null;
  category_ids?: string[];
  subcategory?: string | null;
  description?: string | null;
  image_url?: string | null;
  unit?: string | null;
  unit_quantity?: number | null;
  price_stats?: PriceStats | null;
  retailers?: string[];
  retailer_prices?: RetailerPrice[];
  available_countries?: string[];
  is_international?: boolean;
  private_label?: boolean;
  private_label_retailer?: string | null;
  private_label_retailer_logo?: string | null;
}

export interface ProductSearchResponse {
  products: ProductSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  query_time_ms?: number;
}

export interface CategoryNode {
  category_id: string;
  name?: string;
  category_name?: string;
  name_en?: string;
  depth?: number;
  hidden?: boolean;
  image_url?: string | null;
  product_count?: number;
  total_product_count?: number;
  children?: CategoryNode[];
}

export interface Retailer {
  id?: string;
  name?: string;
  display_name?: string;
  retailer?: string;
  retailer_display_name?: string;
  country?: string;
  logo_url?: string | null;
}

export interface ApiStats {
  total_products?: number;
  active_products?: number;
  retailers?: string[];
  retailer_count?: number;
  products_on_discount?: number;
  timestamp?: string;
}

export interface BasketItemInput {
  productId?: string;
  barcode?: string;
  query?: string;
  quantity?: number;
}

export interface BasketRetailerLine {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  unitPrice?: number;
  subtotal: number;
  lastUpdated?: string | null;
}

export interface BasketRetailerTotal {
  retailer: string;
  retailerName: string;
  total: number;
  matchedItems: number;
  missingItems: string[];
  lines: BasketRetailerLine[];
}

