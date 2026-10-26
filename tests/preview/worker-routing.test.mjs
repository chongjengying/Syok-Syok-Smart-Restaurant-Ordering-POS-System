import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../worker.js";

function assetsFixture() {
  const calls = [];
  const env = {
    ASSETS: {
      async fetch(request, options) {
        calls.push({ request, options });
        if (!["GET", "HEAD"].includes(request.method))
          return new Response(null, { status: 405 });
        const pathname = new URL(request.url).pathname;
        if (pathname === "/" || pathname === "/index.html") {
          return new Response(
            request.method === "HEAD"
              ? null
              : '<!doctype html><div id="root"></div>',
            {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
                "X-Asset": "app-shell",
              },
            },
          );
        }
        return new Response(null, { status: 404 });
      },
    },
  };
  return { calls, env };
}

for (const pathname of ["/pos/preview", "/pos/preview/"]) {
  test(`serves the shell for the exact preview URL ${pathname}`, async () => {
    const { env, calls } = assetsFixture();
    const request = new Request(`https://example.test${pathname}?review=1`, {
      headers: { "Sec-Fetch-Mode": "navigate" },
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /text\/html/);
    assert.match(await response.text(), /id="root"/);
    assert.equal(new URL(calls[0].request.url).pathname, "/");
    assert.equal(new URL(calls[0].request.url).search, "?review=1");
    assert.equal(
      response.headers.get("Cache-Control"),
      "no-store, no-cache, must-revalidate",
    );
    assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Asset"), "app-shell");
    assert.equal(request.url, `https://example.test${pathname}?review=1`);
  });
}

test("preview HEAD returns shell metadata without a response body", async () => {
  const { env, calls } = assetsFixture();
  const response = await worker.fetch(
    new Request("https://example.test/pos/preview", { method: "HEAD" }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(calls[0].request.method, "HEAD");
  assert.equal(await response.text(), "");
});

test("preview mutation methods retain static asset rejection", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const { env, calls } = assetsFixture();
    const response = await worker.fetch(
      new Request("https://example.test/pos/preview", { method }),
      env,
    );
    assert.equal(response.status, 405);
    assert.equal(new URL(calls[0].request.url).pathname, "/pos/preview");
  }
});

test("preview-like paths and backend-looking paths never receive the app shell", async () => {
  for (const pathname of [
    "/pos/preview-other",
    "/pos/preview/nested",
    "/pos/preview//",
    "/pos/preview%2F",
    "/unrelated-route",
    "/auth/v1/token",
    "/functions/v1/orders",
  ]) {
    const { env, calls } = assetsFixture();
    const response = await worker.fetch(
      new Request(`https://example.test${pathname}`),
      env,
    );
    assert.equal(response.status, 404, pathname);
    assert.equal(new URL(calls[0].request.url).pathname, pathname);
  }
});

test("missing versioned scripts stay 404 without HTML fallback", async () => {
  const { env, calls } = assetsFixture();
  const response = await worker.fetch(
    new Request("https://example.test/assets/missing.js"),
    env,
  );
  assert.equal(response.status, 404);
  assert.deepEqual(calls[0].options, { not_found_handling: "404" });
  assert.equal(response.headers.get("Content-Type"), null);
});

test("original entry URLs retain their shell and cache policy", async () => {
  for (const pathname of ["/", "/index.html"]) {
    const { env, calls } = assetsFixture();
    const response = await worker.fetch(
      new Request(`https://example.test${pathname}`),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(new URL(calls[0].request.url).pathname, pathname);
    assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
  }
});

test("asset service failures propagate instead of returning a successful shell", async () => {
  const failure = new Error("Asset service unavailable");
  await assert.rejects(
    worker.fetch(new Request("https://example.test/pos/preview"), {
      ASSETS: {
        fetch: async () => {
          throw failure;
        },
      },
    }),
    failure,
  );
});

test(
  "local Cloudflare runtime serves browser navigations while keeping unrelated 404s",
  { skip: !process.env.POS_WORKER_BASE_URL },
  async () => {
    const origin = new URL(process.env.POS_WORKER_BASE_URL);
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
      "This test only contacts a local Worker.",
    );
    for (const pathname of ["/pos/preview", "/pos/preview/"]) {
      const response = await fetch(new URL(pathname, origin), {
        headers: { "Sec-Fetch-Mode": "navigate" },
        redirect: "manual",
      });
      assert.equal(response.status, 200, pathname);
      assert.match(response.headers.get("Content-Type"), /text\/html/);
      assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
      assert.match(await response.text(), /id="root"/);
    }
    for (const pathname of [
      "/assets/missing-review.js",
      "/pos/preview/nested",
      "/unrelated-route",
    ]) {
      const response = await fetch(new URL(pathname, origin), {
        headers: { "Sec-Fetch-Mode": "navigate" },
        redirect: "manual",
      });
      assert.equal(response.status, 404, pathname);
    }
  },
);
