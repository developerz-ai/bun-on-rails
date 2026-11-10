/**
 * CSRF protection is off by default in the test environment (plan 107 G1)
 *
 * As in Rails (allow_forgery_protection = false in test): a request test can
 * post without fetching a session token first, which a generated request test
 * needs. Every other environment keeps it on by default, and
 * `security.csrf: true` turns it on in tests that cover it.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application, request } from "../../src/index.js";

const framework = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "index.js",
);
const root = mkdtempSync(join(tmpdir(), "csrf-default-"));

beforeAll(() => {
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "app", "controllers"), { recursive: true });
  writeFileSync(
    join(root, "config", "routes.js"),
    "export default (router) => { router.post('/notes', 'notes#create') }\n",
  );
  writeFileSync(
    join(root, "app", "controllers", "notes_controller.js"),
    `import { Controller } from '${framework}'
export default class NotesController extends Controller {
  create() { return this.render({ ok: true }, { status: 201 }) }
}
`,
  );
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function postIn(environment, config = {}) {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    BUN_ENV: process.env.BUN_ENV,
  };
  process.env.NODE_ENV = environment;
  delete process.env.BUN_ENV;
  try {
    const app = new Application({
      root,
      config: { logging: { level: "error" }, ...config },
    });
    await app.initialize();
    return (await request(app).post("/notes", { text: "hi" })).status;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("the CSRF default", () => {
  test("off in the test environment: a POST with no token goes through", async () => {
    expect(await postIn("test")).toBe(201);
  });

  test("on in development: a POST with no token is refused", async () => {
    expect(await postIn("development")).toBe(403);
  });

  test("security.csrf: true turns it on in the test environment", async () => {
    expect(await postIn("test", { security: { csrf: true } })).toBe(403);
  });
});
