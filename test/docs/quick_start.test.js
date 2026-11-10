/**
 * Quick Start guard
 *
 * docs/eng/getting-started/quick-start.md walks a reader from `brails new blog`
 * to a working posts resource. This test writes the page's titled code blocks
 * over a fresh `brails new` app (test/docs/support/guide_app.js), boots it, and
 * checks every response the page's "Try it" section shows.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { bootGuideApp } from "./support/guide_app.js";

let guide;

beforeAll(async () => {
  guide = await bootGuideApp("docs/eng/getting-started/quick-start.md");
});

afterAll(async () => {
  await guide?.close();
});

describe("Quick Start", () => {
  test("shows the two files it asks the reader to write", () => {
    expect([...guide.files].sort()).toEqual([
      "app/controllers/posts_controller.js",
      "config/routes.js",
    ]);
  });

  test("the generated app still answers / with its name, as the page says", async () => {
    expect(await guide.call("GET", "/")).toMatchObject({
      status: 200,
      json: { app: "guide" },
    });
  });

  test("Try it: GET /posts", async () => {
    const r = await guide.call("GET", "/posts");
    expect(r.status).toBe(200);
    expect(r.json.posts.map((p) => p.id)).toEqual(["1", "2"]);
    expect(r.json.posts[0]).toEqual({ id: "1", title: "Hello, BunOnRails" });
  });

  test("Try it: GET /posts/2 and /posts/9", async () => {
    expect(await guide.call("GET", "/posts/2")).toMatchObject({
      status: 200,
      json: { post: { id: "2", title: "Routes and controllers" } },
    });
    expect(await guide.call("GET", "/posts/9")).toMatchObject({
      status: 404,
      json: { error: "Not Found" },
    });
  });
});
