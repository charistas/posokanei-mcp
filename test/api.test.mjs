import assert from "node:assert/strict";
import test from "node:test";
import { PosoKaneiClient, simplifyCategoryTree } from "../dist/api.js";

test("searchProducts posts the expected payload and caches the response", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return new Response(
      JSON.stringify({
        products: [],
        total: 0,
        page: 1,
        page_size: 2,
        total_pages: 0,
        has_next: false,
        has_prev: false
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const client = new PosoKaneiClient({
    baseUrl: "https://example.test",
    fetchImpl,
    minIntervalMs: 0,
    cacheTtlMs: 60_000
  });

  await client.searchProducts({ query: "γάλα", page: 1, pageSize: 2 });
  await client.searchProducts({ query: "γάλα", page: 1, pageSize: 2 });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.test/products/search");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    page: 1,
    page_size: 2,
    sort_by: "name",
    sort_order: "asc",
    title: "γάλα"
  });
});

test("getProduct builds the expected product detail URL", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ id: "p1", name: "Milk" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const client = new PosoKaneiClient({
    baseUrl: "https://example.test",
    fetchImpl,
    minIntervalMs: 0
  });

  const product = await client.getProduct({
    productId: "p1",
    countries: "GR",
    includeTax: true,
    sortRetailers: "asc"
  });

  assert.equal(product.id, "p1");
  assert.equal(
    requests[0].url,
    "https://example.test/products/p1?countries=GR&include_tax=true&sort_retailers=asc"
  );
});

test("simplifyCategoryTree bounds depth and item count", () => {
  const simplified = simplifyCategoryTree(
    {
      total_categories: 3,
      root_count: 1,
      tree: [
        {
          category_id: "root",
          name: "Root",
          total_product_count: 2,
          children: [
            {
              category_id: "child",
              name: "Child",
              total_product_count: 1,
              children: [
                {
                  category_id: "grandchild",
                  name: "Grandchild",
                  total_product_count: 1
                }
              ]
            }
          ]
        }
      ]
    },
    1,
    10
  );

  assert.equal(simplified.total_categories, 3);
  assert.equal(simplified.returned_categories, 2);
  assert.equal(simplified.truncated, false);
  assert.equal(simplified.tree[0].children[0].id, "child");
  assert.equal(simplified.tree[0].children[0].children, undefined);
});

test("simplifyCategoryTree reports truncation only when a node is skipped", () => {
  const raw = {
    tree: [
      {
        category_id: "root",
        name: "Root",
        children: [
          { category_id: "child-1", name: "Child 1" },
          { category_id: "child-2", name: "Child 2" }
        ]
      }
    ]
  };

  const exact = simplifyCategoryTree(raw, 1, 3);
  const truncated = simplifyCategoryTree(raw, 1, 2);

  assert.equal(exact.returned_categories, 3);
  assert.equal(exact.truncated, false);
  assert.equal(truncated.returned_categories, 2);
  assert.equal(truncated.truncated, true);
});

test("explicit numeric client options override environment defaults", async () => {
  const previous = {
    cache: process.env.POSOKANEI_CACHE_TTL_MS,
    interval: process.env.POSOKANEI_MIN_INTERVAL_MS,
    timeout: process.env.POSOKANEI_TIMEOUT_MS
  };
  process.env.POSOKANEI_CACHE_TTL_MS = "0";
  process.env.POSOKANEI_MIN_INTERVAL_MS = "1000";
  process.env.POSOKANEI_TIMEOUT_MS = "1";

  const requestTimes = [];
  const fetchImpl = async () => {
    requestTimes.push(Date.now());
    return new Response(JSON.stringify({ timestamp: "now" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const client = new PosoKaneiClient({
      baseUrl: "https://example.test",
      fetchImpl,
      cacheTtlMs: 60_000,
      minIntervalMs: 0,
      timeoutMs: 15_000
    });

    await client.getStats();
    await client.getStats();

    assert.equal(requestTimes.length, 1);
  } finally {
    restoreEnv("POSOKANEI_CACHE_TTL_MS", previous.cache);
    restoreEnv("POSOKANEI_MIN_INTERVAL_MS", previous.interval);
    restoreEnv("POSOKANEI_TIMEOUT_MS", previous.timeout);
  }
});

test("requests reserve rate-limit slots under concurrent load", async () => {
  const requestTimes = [];
  const fetchImpl = async () => {
    requestTimes.push(Date.now());
    return new Response(JSON.stringify({ timestamp: "now" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const client = new PosoKaneiClient({
    baseUrl: "https://example.test",
    fetchImpl,
    minIntervalMs: 20,
    cacheTtlMs: 0
  });

  await Promise.all([client.getStats(), client.getStats(), client.getStats()]);

  assert.equal(requestTimes.length, 3);
  assert.ok(
    requestTimes[1] - requestTimes[0] >= 15,
    `expected second request to be spaced, got ${requestTimes[1] - requestTimes[0]}ms`
  );
  assert.ok(
    requestTimes[2] - requestTimes[1] >= 15,
    `expected third request to be spaced, got ${requestTimes[2] - requestTimes[1]}ms`
  );
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
