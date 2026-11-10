/**
 * CSRF token issuance
 *
 * The csrf middleware compares a write's X-CSRF-Token with
 * session.csrfToken, but nothing ever set session.csrfToken, so with CSRF on
 * (the default) every POST/PUT/PATCH/DELETE answered 403. The session
 * middleware now gives each session a token; an action reads it as
 * `this.csrfToken` and hands it to the client, which sends it back with the
 * session cookie.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Middleware } from "../../src/controller/middleware.js";
import { Controller, ControllerContext } from "../../src/controller/base.js";
import { Application } from "../../src/application.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("Middleware.session()", () => {
  test("gives a new session a random csrfToken and keeps it across requests", async () => {
    const session = Middleware.session({ store: new Map() });
    const first = { request: new Request("http://localhost/") };
    const response = await session(first, async () => new Response("ok"));

    expect(first.session.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    const cookie = response.headers.get("set-cookie").split(";")[0];

    const second = {
      request: new Request("http://localhost/", { headers: { cookie } }),
    };
    await session(second, async () => new Response("ok"));
    expect(second.session.csrfToken).toBe(first.session.csrfToken);
  });

  test("two sessions get different tokens", async () => {
    const session = Middleware.session({ store: new Map() });
    const a = { request: new Request("http://localhost/") };
    const b = { request: new Request("http://localhost/") };
    await session(a, async () => new Response("ok"));
    await session(b, async () => new Response("ok"));
    expect(a.session.csrfToken).not.toBe(b.session.csrfToken);
  });
});

describe("Controller#csrfToken", () => {
  test("is the session's token", () => {
    const context = new ControllerContext({
      request: new Request("http://localhost/"),
      session: { csrfToken: "abc" },
    });
    expect(new Controller(context).csrfToken).toBe("abc");
  });
});

describe("a write through the app with CSRF on", () => {
  const work = mkdtempSync(join(tmpdir(), "csrf-token-"));
  let app;
  let base;

  beforeAll(async () => {
    const framework = join(repoRoot, "src", "index.js");
    mkdirSync(join(work, "config"), { recursive: true });
    mkdirSync(join(work, "app", "controllers"), { recursive: true });
    writeFileSync(
      join(work, "config", "routes.js"),
      "export default (router) => {\n  router.get('/csrf', 'csrf#show')\n  router.post('/notes', 'notes#create')\n}\n",
    );
    writeFileSync(
      join(work, "app", "controllers", "csrf_controller.js"),
      `import { Controller } from '${framework}'\nexport default class CsrfController extends Controller {\n  show() { return this.render({ csrfToken: this.csrfToken }) }\n}\n`,
    );
    writeFileSync(
      join(work, "app", "controllers", "notes_controller.js"),
      `import { Controller } from '${framework}'\nexport default class NotesController extends Controller {\n  create() { return this.render({ ok: true }, { status: 201 }) }\n}\n`,
    );
    // CSRF is off by default in the test environment (csrf_default.test.js)
    app = new Application({ root: work, config: { security: { csrf: true } } });
    await app.initialize();
    await app.start({ port: 0, hostname: "127.0.0.1" });
    base = `http://127.0.0.1:${app.server.port}`;
  });

  afterAll(async () => {
    await app?.stop();
    rmSync(work, { recursive: true, force: true });
  });

  async function getToken() {
    const res = await fetch(`${base}/csrf`);
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const { csrfToken } = await res.json();
    return { cookie, csrfToken };
  }

  const post = (headers) => fetch(`${base}/notes`, { method: "POST", headers });

  test("passes with the session cookie and its token", async () => {
    const { cookie, csrfToken } = await getToken();
    expect(csrfToken).toMatch(/^[0-9a-f]{64}$/);
    const res = await post({ cookie, "x-csrf-token": csrfToken });
    expect(res.status).toBe(201);
  });

  test("is refused without a token, with a wrong token, or with another session's token", async () => {
    const mine = await getToken();
    const theirs = await getToken();
    expect((await post({ cookie: mine.cookie })).status).toBe(403);
    expect(
      (await post({ cookie: mine.cookie, "x-csrf-token": "0".repeat(64) }))
        .status,
    ).toBe(403);
    expect(
      (await post({ cookie: mine.cookie, "x-csrf-token": theirs.csrfToken }))
        .status,
    ).toBe(403);
    expect((await post({ "x-csrf-token": mine.csrfToken })).status).toBe(403);
  });
});
