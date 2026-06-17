import assert from "node:assert/strict";
import test from "node:test";
import { PosoKaneiApiError } from "../dist/api.js";
import { compareBasket } from "../dist/basket.js";

test("compareBasket ranks complete cheaper retailers first", async () => {
  const products = {
    milk: {
      id: "milk",
      name: "Milk",
      retailer_prices: [
        {
          retailer: "alpha",
          retailer_display_name: "Alpha Market",
          price: 1.5,
          price_normalized: 1.5,
          last_updated: "2026-06-17T00:00:00"
        },
        {
          retailer: "beta",
          retailer_display_name: "Beta Market",
          price: 1.2,
          price_normalized: 1.2
        }
      ]
    },
    bread: {
      id: "bread",
      name: "Bread",
      retailer_prices: [
        {
          retailer: "alpha",
          retailer_display_name: "Alpha Market",
          price: 2
        }
      ]
    }
  };

  const client = {
    async getProduct({ productId }) {
      return products[productId];
    },
    async lookupBarcode() {
      throw new Error("not used");
    },
    async searchProducts() {
      throw new Error("not used");
    }
  };

  const result = await compareBasket(client, [
    { productId: "milk", quantity: 2 },
    { productId: "bread", quantity: 1 }
  ]);

  assert.deepEqual(
    result.items.map((item) => item.matched),
    [true, true]
  );
  assert.equal(result.retailers[0].retailer, "alpha");
  assert.equal(result.retailers[0].total, 5);
  assert.deepEqual(result.retailers[0].missingItems, []);
  assert.equal(result.retailers[1].retailer, "beta");
  assert.deepEqual(result.retailers[1].missingItems, ["Bread (bread)"]);
});

test("compareBasket records unmatched inputs", async () => {
  const client = {
    async searchProducts() {
      return {
        products: [],
        total: 0,
        page: 1,
        page_size: 1,
        total_pages: 0,
        has_next: false,
        has_prev: false
      };
    }
  };

  const result = await compareBasket(client, [{ query: "missing product" }]);

  assert.equal(result.items[0].matched, false);
  assert.match(result.items[0].reason, /No product found/);
  assert.deepEqual(result.retailers, []);
});

test("compareBasket tracks missing products by id when names collide", async () => {
  const products = {
    p1: {
      id: "p1",
      name: "Same Name",
      retailer_prices: [{ retailer: "alpha", price: 1 }]
    },
    p2: {
      id: "p2",
      name: "Same Name",
      retailer_prices: [{ retailer: "beta", price: 2 }]
    }
  };

  const client = {
    async getProduct({ productId }) {
      return products[productId];
    }
  };

  const result = await compareBasket(client, [
    { productId: "p1" },
    { productId: "p2" }
  ]);

  const alpha = result.retailers.find((retailer) => retailer.retailer === "alpha");
  assert.deepEqual(alpha.missingItems, ["Same Name (p2)"]);
});

test("compareBasket propagates transient API failures", async () => {
  const client = {
    async getProduct() {
      throw new PosoKaneiApiError("rate limited", 429);
    }
  };

  await assert.rejects(
    () => compareBasket(client, [{ productId: "milk" }]),
    /rate limited/
  );
});

test("compareBasket treats 404 product lookups as unmatched", async () => {
  const client = {
    async getProduct() {
      throw new PosoKaneiApiError("not found", 404);
    }
  };

  const result = await compareBasket(client, [{ productId: "missing" }]);

  assert.equal(result.items[0].matched, false);
  assert.match(result.items[0].reason, /not found/);
  assert.deepEqual(result.retailers, []);
});
