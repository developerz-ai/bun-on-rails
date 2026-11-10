/**
 * Controller filters on the request path
 *
 * Application dispatch ran `beforeAction` / `afterAction` with its own loop:
 * a plain list of method names, no `only` / `except`, and an object-form
 * declaration (`{ authenticate: { except: ['index'] } }`, as the demo app
 * writes it) threw "is not iterable", so the request answered 500. A filter
 * naming a method that does not exist was skipped with a warning, so a typo
 * in an auth filter silently disabled it. Dispatch now uses
 * ControllerMiddleware's filter runner, which understands every form, and a
 * missing filter method fails the request.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application } from "../../src/application.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const framework = join(repoRoot, "src", "index.js");
const work = mkdtempSync(join(tmpdir(), "filters-dispatch-"));
let app;
let base;

function controller(name, body) {
  writeFileSync(
    join(work, "app", "controllers", `${name}_controller.js`),
    `import { Controller } from '${framework}'\n${body}\n`,
  );
}

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
  router.resources('notes', { only: ['index', 'show', 'edit'] })
  router.get('/broken', 'broken#index')
}
`,
  );
  // object form, as the demo writes it
  controller(
    "posts",
    `export default class PostsController extends Controller {
  static beforeAction = { authenticate: { except: ['index', 'show'] } }
  authenticate() {
    if (this.request.headers.get('authorization') !== 'Bearer ok') return this.unauthorized()
  }
  index() { return this.render({ action: 'index' }) }
  show() { return this.render({ action: 'show' }) }
  create() { return this.render({ action: 'create' }, { status: 201 }) }
}`,
  );
  // array form with only / except, and an after filter
  controller(
    "notes",
    `globalThis.__afterRan = []
export default class NotesController extends Controller {
  static beforeAction = [{ name: 'onlyShow', only: ['show'] }]
  static afterAction = [{ name: 'record', except: ['edit'] }]
  onlyShow() { return this.forbidden('show is guarded') }
  record() { globalThis.__afterRan.push('note') }
  index() { return this.render({ action: 'index' }) }
  show() { return this.render({ action: 'show' }) }
  edit() { return this.render({ action: 'edit' }) }
}`,
  );
  // a typo in a filter name
  controller(
    "broken",
    `export default class BrokenController extends Controller {
  static beforeAction = ['authenicate']
  index() { return this.render({ ok: true }) }
}`,
  );
  app = new Application({ root: work });
  await app.initialize();
  await app.start({ port: 0, hostname: "127.0.0.1" });
  base = `http://127.0.0.1:${app.server.port}`;
});

afterAll(async () => {
  await app?.stop();
  rmSync(work, { recursive: true, force: true });
  delete globalThis.__afterRan;
});

const call = async (method, path, headers = {}) => {
  const res = await fetch(base + path, { method, headers });
  return { status: res.status, json: await res.json().catch(() => null) };
};

describe("object-form filters (demo style)", () => {
  test("`except` skips the filter for index and show", async () => {
    expect(await call("GET", "/posts")).toMatchObject({
      status: 200,
      json: { action: "index" },
    });
    expect(await call("GET", "/posts/1")).toMatchObject({
      status: 200,
      json: { action: "show" },
    });
  });

  test("the filter runs for create and can halt it", async () => {
    expect((await call("POST", "/posts")).status).toBe(401);
    expect(
      await call("POST", "/posts", { authorization: "Bearer ok" }),
    ).toMatchObject({
      status: 201,
      json: { action: "create" },
    });
  });
});

describe("array-form filters with only / except", () => {
  test("`only` runs a before filter just for the listed action", async () => {
    expect((await call("GET", "/notes")).status).toBe(200);
    expect(await call("GET", "/notes/1")).toMatchObject({
      status: 403,
      json: { error: "show is guarded" },
    });
  });

  test("`except` on an after filter skips the listed action", async () => {
    globalThis.__afterRan = [];
    expect((await call("GET", "/notes")).status).toBe(200);
    // edit passes the before filters, so only `except` keeps `record` from running
    expect(await call("GET", "/notes/1/edit")).toMatchObject({
      status: 200,
      json: { action: "edit" },
    });
    expect(globalThis.__afterRan).toEqual(["note"]);
  });
});

describe("a filter naming a method that does not exist", () => {
  test("fails the request, naming the filter, instead of being skipped", async () => {
    const r = await call("GET", "/broken");
    expect(r.status).toBe(500);
    expect(r.json.error).toContain("authenicate");
  });
});
