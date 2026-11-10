/**
 * Routing & Controllers guide guard
 *
 * docs/eng/routing/overview.md promises that its examples run as shown. This
 * test makes that true: it takes every fenced block titled with a path
 * (```js [config/routes.js]), writes it over a fresh `brails new` app, boots
 * the app, and checks the responses the guide's "Try it" section lists, the
 * routes its "Nesting and scopes" table lists, and the behaviour its "Not
 * implemented yet" section describes. Change the guide
 * and this test reads the new code; change the framework and the guide's
 * claims are re-checked.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { Application } from "../../src/application.js";
import { request } from "../../src/testing/request.js";
import { Router } from "../../src/routing/router.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootGuideApp, repoRoot } from "./support/guide_app.js";

let guide;
const call = (...args) => guide.call(...args);

beforeAll(async () => {
  guide = await bootGuideApp("docs/eng/routing/overview.md");
});

afterAll(async () => {
  await guide?.close();
});

const token = { authorization: "Bearer secret" };

describe("the guide's code", () => {
  test("has the files the guide shows", () => {
    expect([...guide.files].sort()).toEqual(
      [
        "app/controllers/admin/users_controller.js",
        "app/controllers/csrf_controller.js",
        "app/controllers/posts_controller.js",
        "config/routes.js",
        "config/security.js",
      ].sort(),
    );
  });
});

describe("Try it, as the guide lists it", () => {
  test("GET /posts", async () => {
    expect(await call("GET", "/posts")).toMatchObject({
      status: 200,
      json: { posts: [{ id: "1", title: "Hello" }] },
    });
  });

  test("GET /posts/1 and /posts/9", async () => {
    expect(await call("GET", "/posts/1")).toMatchObject({
      status: 200,
      json: { post: { id: "1", title: "Hello" } },
    });
    expect(await call("GET", "/posts/9")).toMatchObject({
      status: 404,
      json: { error: "Not Found" },
    });
  });

  test("a form POST without the token is refused by the before filter", async () => {
    const r = await call("POST", "/posts", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "title=Second",
    });
    expect(r).toMatchObject({ status: 401, json: { error: "Unauthorized" } });
  });

  test("a JSON POST with the token creates", async () => {
    const r = await call("POST", "/posts", {
      headers: { ...token, "content-type": "application/json" },
      body: JSON.stringify({ title: "Second" }),
    });
    expect(r).toMatchObject({
      status: 201,
      json: { post: { id: "2", title: "Second" } },
    });
  });

  test("GET /admin/users/7 reaches the namespaced controller", async () => {
    expect(await call("GET", "/admin/users/7")).toMatchObject({
      status: 200,
      json: { user: { id: "7" } },
    });
  });
});

describe("the rest of the guide's claims", () => {
  test("unprocessableEntity answers 422 with errors", async () => {
    const r = await call("POST", "/posts", {
      headers: { ...token, "content-type": "application/json" },
      body: "{}",
    });
    expect(r).toMatchObject({
      status: 422,
      json: { errors: { title: ["is required"] } },
    });
  });

  test("redirect answers 302 with Location", async () => {
    const r = await call("POST", "/posts/1/publish", { headers: token });
    expect(r).toMatchObject({ status: 302, location: "/posts/1" });
  });

  test("params: the query string adds to path params, and the body wins over the query", async () => {
    const r = await call("POST", "/posts?title=FromQuery", {
      headers: { ...token, "content-type": "application/json" },
      body: JSON.stringify({ title: "FromBody" }),
    });
    expect(r.json.post.title).toBe("FromBody");
  });

  test("matching is segment by segment: a trailing slash or a route left out by `only` does not match", async () => {
    expect((await call("GET", "/posts/1/")).status).toBe(404);
    expect((await call("DELETE", "/posts/1", { headers: token })).status).toBe(
      404,
    );
  });

  test("root and /health from the brails new app still answer", async () => {
    expect((await call("GET", "/")).status).toBe(200);
    expect(await call("GET", "/health")).toMatchObject({
      status: 200,
      json: { status: "ok" },
    });
  });

  test("with CSRF on, a write needs the session cookie and the token GET /csrf hands out", async () => {
    const strict = new Application({
      root: guide.app,
      config: { security: { csrf: true } },
    });
    await strict.initialize();
    await strict.start({ port: 0, hostname: "127.0.0.1" });
    const at = `http://127.0.0.1:${strict.server.port}`;
    const write = (headers) =>
      fetch(`${at}/posts`, {
        method: "POST",
        headers: { ...token, "content-type": "application/json", ...headers },
        body: JSON.stringify({ title: "Protected" }),
      });
    try {
      const refused = await write({});
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "CSRF token mismatch" });

      const issued = await fetch(`${at}/csrf`);
      const cookie = issued.headers.get("set-cookie").split(";")[0];
      const { csrfToken } = await issued.json();
      expect(cookie).toStartWith("_session=");
      expect(csrfToken).toMatch(/^[0-9a-f]{64}$/);

      const accepted = await write({ cookie, "x-csrf-token": csrfToken });
      expect(accepted.status).toBe(201);
    } finally {
      await strict.stop();
    }
  });

  test("Testing a controller: request(app) gets the body the section asserts", async () => {
    const markdown = readFileSync(
      join(repoRoot, "docs/eng/routing/overview.md"),
      "utf8",
    );
    const section = markdown.match(
      /^### Testing a controller\n([\s\S]*?)^#/m,
    )[1];
    const code = section.match(/^```js\n([\s\S]*?)^```$/m)[1];
    const [, path] = code.match(/request\(app\)\.get\("([^"]+)"\)/);
    const [, literal] = code.match(/assertJson\((\{.*\})\);/);

    const app = new Application({
      root: guide.app,
      config: { logging: { level: "error" } },
    });
    await app.initialize();
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    await res.assertJson(new Function(`return ${literal}`)());
  });

  test("Not implemented yet: middleware(list, callback) throws instead of leaving the routes unguarded", () => {
    const router = new Router();
    expect(() =>
      router.middleware(["auth"], () => router.get("/inbox", "inbox#index")),
    ).toThrow("Router#middleware is not implemented yet");
    expect(router.routes).toEqual([]);
  });

  test("Nesting and scopes: the section's code defines the routes its table lists", () => {
    const markdown = readFileSync(
      join(repoRoot, "docs/eng/routing/overview.md"),
      "utf8",
    );
    const section = markdown.match(/^### Nesting and scopes\n([\s\S]*?)^#/m)[1];
    const code = section.match(/^```js\n([\s\S]*?)^```$/m)[1];
    const router = new Router();
    new Function("router", code)(router);

    const rows = [
      ...section.matchAll(/^\| `(\w+)` +\| `(\S+)` +\| `(\S+)` +\|$/gm),
    ];
    expect(rows.length).toBeGreaterThan(0);
    expect(
      router.routes.map(
        (r) => `${r.method} ${r.path} ${r.controller}#${r.action}`,
      ),
    ).toEqual(
      rows.map(([, verb, path, target]) => `${verb} ${path} ${target}`),
    );
    expect(router.match("GET", "/fr/about").params).toEqual({ locale: "fr" });
    expect(router.match("POST", "/posts/7/comments").params).toEqual({
      post_id: "7",
    });
  });
});
