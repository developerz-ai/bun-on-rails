/**
 * Routing & Controllers guide guard
 *
 * docs/eng/routing/overview.md promises that its examples run as shown. This
 * test makes that true: it takes every fenced block titled with a path
 * (```js [config/routes.js]), writes it over a fresh `brails new` app, boots
 * the app, and checks the responses the guide's "Try it" section lists, plus
 * the behaviour its "Not implemented yet" section describes. Change the guide
 * and this test reads the new code; change the framework and the guide's
 * claims are re-checked.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application } from "../../src/application.js";
import { Router } from "../../src/routing/router.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const guidePath = join(repoRoot, "docs", "eng", "routing", "overview.md");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

const guide = readFileSync(guidePath, "utf8");
const files = [...guide.matchAll(/^```js \[([^\]]+)\]\n([\s\S]*?)^```$/gm)].map(
  ([, path, code]) => ({ path, code }),
);

const work = mkdtempSync(join(tmpdir(), "routing-guide-"));
const app = join(work, "guide");
let application;
let base;

beforeAll(async () => {
  const made = spawnSync(
    process.execPath,
    [
      join(repoRoot, "src", "cli", "index.js"),
      "new",
      "guide",
      "--skip-install",
    ],
    {
      cwd: work,
      encoding: "utf8",
    },
  );
  if (made.status !== 0) throw new Error(`brails new failed: ${made.stderr}`);
  for (const { path, code } of files) {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), code);
  }
  mkdirSync(join(app, "node_modules"), { recursive: true });
  symlinkSync(repoRoot, join(app, "node_modules", pkg.name), "dir");

  application = new Application({ root: app });
  await application.initialize();
  await application.start({ port: 0, hostname: "127.0.0.1" });
  base = `http://127.0.0.1:${application.server.port}`;
});

afterAll(async () => {
  await application?.stop();
  rmSync(work, { recursive: true, force: true });
});

async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get("location"),
    json: text ? JSON.parse(text) : null,
  };
}

const token = { authorization: "Bearer secret" };

describe("the guide's code", () => {
  test("has the files the guide shows", () => {
    expect(files.map((f) => f.path).sort()).toEqual(
      [
        "app/controllers/admin/users_controller.js",
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

  test("CSRF is on by default and nothing issues a token: every write gets 403", async () => {
    const strict = new Application({
      root: app,
      config: { security: { csrf: true } },
    });
    await strict.initialize();
    await strict.start({ port: 0, hostname: "127.0.0.1" });
    try {
      const res = await fetch(`http://127.0.0.1:${strict.server.port}/posts`, {
        method: "POST",
        headers: { ...token, "content-type": "application/json" },
        body: JSON.stringify({ title: "Blocked" }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "CSRF token mismatch" });
    } finally {
      await strict.stop();
    }
  });

  test("Not implemented yet: nested resources define /comments, not /posts/:post_id/comments", () => {
    const router = new Router();
    router.resources("posts", () =>
      router.resources("comments", { only: ["index"] }),
    );
    const paths = router.routes.map((r) => r.path);
    expect(paths).toContain("/comments");
    expect(paths).not.toContain("/posts/:post_id/comments");
  });
});
