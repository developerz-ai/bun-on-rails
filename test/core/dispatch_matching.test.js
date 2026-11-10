/**
 * Dispatch matches routes with Router#match (plan 105 S10)
 *
 * Application matched requests with its own _matchRoute/_matchPath, beside
 * Router#match: a second matcher that did not decode params
 * (/tags/hello%20world gave "hello%20world"), refused a trailing slash and
 * knew no `*` segment. Dispatch now uses Router#match, and Router#match
 * compares static segments case-sensitively, as its comment always said
 * (the check was dead: /Posts matched /posts).
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application, Router, request } from "../../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const framework = join(repoRoot, "src", "index.js");
const work = mkdtempSync(join(tmpdir(), "dispatch-matching-"));
let app;

beforeAll(async () => {
  mkdirSync(join(work, "config"), { recursive: true });
  mkdirSync(join(work, "app", "controllers"), { recursive: true });
  writeFileSync(
    join(work, "config", "routes.js"),
    `export default (router) => {
  router.get('/tags/:name', 'tags#show')
  router.get('/files/*', 'tags#file')
}
`,
  );
  writeFileSync(
    join(work, "app", "controllers", "tags_controller.js"),
    `import { Controller } from '${framework}'
export default class TagsController extends Controller {
  show() { return this.render({ name: this.params.name }) }
  file() { return this.render({ splat: this.params.splat }) }
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

describe("dispatch matches with Router#match", () => {
  test("a param is URI-decoded", async () => {
    const res = await request(app).get("/tags/hello%20world");
    expect(await res.json()).toEqual({ name: "hello world" });
  });

  test("a trailing slash matches", async () => {
    const res = await request(app).get("/tags/bun/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "bun" });
  });

  test("a * segment matches one segment as params.splat", async () => {
    const res = await request(app).get("/files/notes.txt");
    expect(await res.json()).toEqual({ splat: "notes.txt" });
  });

  test("static segments are case-sensitive", async () => {
    expect((await request(app).get("/Tags/bun")).status).toBe(404);
  });
});

describe("Router#match", () => {
  test("compares static segments case-sensitively", () => {
    const router = new Router();
    router.get("/posts/:id", "posts#show");
    expect(router.match("GET", "/Posts/7")).toBeNull();
    expect(router.match("GET", "/posts/7").params).toEqual({ id: "7" });
  });
});
