/**
 * request(app): HTTP tests without a server (plan 105 S4)
 *
 * The exported `request` was a TestRequest bound to no app whose request()
 * resolved undefined (S1 made it throw), and TestResponse#assertJson and
 * #assertJsonHas passed whatever the body held. request(app) now sends a
 * Request through the app in-process (routing, middleware, action), and the
 * JSON assertions compare.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application, request } from "../../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const framework = join(repoRoot, "src", "index.js");
const work = mkdtempSync(join(tmpdir(), "test-request-"));
let app;

beforeAll(async () => {
  mkdirSync(join(work, "config"), { recursive: true });
  mkdirSync(join(work, "app", "controllers"), { recursive: true });
  writeFileSync(
    join(work, "config", "security.js"),
    "export default { csrf: false }\n",
  );
  writeFileSync(
    join(work, "config", "routes.js"),
    `export default (router) => {
  router.resources('posts', { only: ['index', 'show', 'create'] })
}
`,
  );
  writeFileSync(
    join(work, "app", "controllers", "posts_controller.js"),
    `import { Controller } from '${framework}'
export default class PostsController extends Controller {
  index() {
    return this.render({ page: this.params.page ?? null, q: this.params.q ?? null })
  }
  show() {
    return this.render({ post: { id: this.params.id, title: 'Hello' }, auth: this.request.headers.get('authorization') })
  }
  create() {
    return this.render({ post: { title: this.params.title } }, { status: 201 })
  }
}
`,
  );
  app = new Application({
    root: work,
    config: { logging: { level: "error" } },
  });
  await app.initialize();
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("request(app)", () => {
  test("GET sends query params through routing and the action", async () => {
    const res = await request(app).get("/posts", { page: 2, q: "draft posts" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ page: "2", q: "draft posts" });
  });

  test("POST sends a JSON body", async () => {
    const res = await request(app).post("/posts", { title: "From a test" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ post: { title: "From a test" } });
  });

  test("header() sets a request header", async () => {
    const res = await request(app)
      .header("authorization", "Bearer t")
      .get("/posts/7");
    expect((await res.json()).auth).toBe("Bearer t");
  });

  test("an unknown route answers 404", async () => {
    const res = await request(app).get("/nothing");
    expect(res.status).toBe(404);
  });

  test("an app that is not initialized is refused, naming the fix", async () => {
    const fresh = new Application({ root: work });
    await expect(request(fresh).get("/posts")).rejects.toThrow(
      "app.handle(request) needs an initialized app: await app.initialize() first",
    );
  });
});

describe("TestResponse JSON assertions compare", () => {
  test("assertJson passes on an equal body and throws on a different one", async () => {
    const res = await request(app).get("/posts/7");
    await res.assertJson({ post: { id: "7", title: "Hello" }, auth: null });
    await expect(res.assertJson({ post: { id: "8" } })).rejects.toThrow(
      'Expected JSON {"post":{"id":"8"}}, got {"post":{"id":"7","title":"Hello"},"auth":null}',
    );
  });

  test("assertJsonHas follows a dotted path and throws on a missing key", async () => {
    const res = await request(app).get("/posts/7");
    await res.assertJsonHas("post.title");
    await expect(res.assertJsonHas("post.author.name")).rejects.toThrow(
      "Expected JSON to have 'post.author.name'; 'post.author' is missing",
    );
  });
});
