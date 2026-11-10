/**
 * Request params are parsed once, with nested keys (plan 105 S10)
 *
 * Application#_buildContext flattened the query string
 * (`filter[status]=draft` gave params["filter[status]"]) and read the body
 * itself; the bodyParser middleware then read it again from a clone of the
 * consumed request, failed, and logged "Failed to parse request body" on
 * every POST. Malformed JSON was swallowed in both places, so the action ran
 * without its params. Now the query is parsed with nested keys, the body is
 * parsed once (by bodyParser, through request_parser's parseBody, nesting
 * form keys too), and a body that does not parse answers 400.
 */

import { test, expect, describe, beforeAll, afterAll, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application, request } from "../../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const framework = join(repoRoot, "src", "index.js");
const work = mkdtempSync(join(tmpdir(), "dispatch-params-"));
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
    "export default (router) => { router.resources('things', { only: ['index', 'create'] }) }\n",
  );
  writeFileSync(
    join(work, "app", "controllers", "things_controller.js"),
    `import { Controller } from '${framework}'
export default class ThingsController extends Controller {
  index() { return this.render({ params: this.params }) }
  create() { return this.render({ params: this.params }, { status: 201 }) }
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

const send = (method, path, body, contentType) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: contentType ? { "content-type": contentType } : {},
      body,
    }),
  );

describe("request params", () => {
  test("query keys nest: filter[status]=draft is { filter: { status } }", async () => {
    const res = await request(app).get("/things?filter[status]=draft&page=2");
    const { params } = await res.json();
    expect(params.filter).toEqual({ status: "draft" });
    expect(params.page).toBe("2");
  });

  test("form keys nest: thing[name]=a is { thing: { name } }", async () => {
    const res = await send(
      "POST",
      "/things",
      "thing[name]=lamp&thing[color]=red",
      "application/x-www-form-urlencoded",
    );
    expect((await res.json()).params.thing).toEqual({
      name: "lamp",
      color: "red",
    });
  });

  test("a JSON body is parsed once, with no 'Failed to parse request body' warning", async () => {
    const warn = spyOn(console, "warn");
    try {
      const res = await request(app).post("/things", { name: "lamp" });
      expect(res.status).toBe(201);
      expect((await res.json()).params.name).toBe("lamp");
      expect(warn.mock.calls.flat().join(" ")).not.toContain(
        "Failed to parse request body",
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("the body wins over the query for the same key", async () => {
    const res = await send(
      "POST",
      "/things?name=query",
      JSON.stringify({ name: "body" }),
      "application/json",
    );
    expect((await res.json()).params.name).toBe("body");
  });

  test("a JSON body that does not parse answers 400, and the action does not run", async () => {
    const res = await send(
      "POST",
      "/things",
      '{"name": "lamp"',
      "application/json",
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toStartWith("Malformed request body:");
  });
});
