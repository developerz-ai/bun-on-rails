/**
 * Boot fails when a file under app/ fails to import (plan 105 S11)
 *
 * Application#_loadComponents caught the error and logged "Failed to load
 * ...", so an app with a syntax error in a controller booted and answered
 * 404 for its routes, and one in a model booted without the model. Now the
 * first file that fails to import fails initialize(), naming the file and
 * the error. A missing app/ directory is still fine.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Application } from "../../src/application.js";

const roots = [];
afterEach(() =>
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })),
);

function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), "boot-loading-"));
  roots.push(root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return new Application({ root, config: { logging: { level: "error" } } });
}

describe("a file under app/ that fails to import", () => {
  test("a controller with a syntax error fails boot, naming the file", async () => {
    const app = appWith({
      "app/controllers/posts_controller.js":
        "export default class PostsController {\n  index( {\n}\n",
    });
    await expect(app.initialize()).rejects.toThrow(
      /^Failed to load controller app\/controllers\/posts_controller\.js: /,
    );
  });

  test("a model that throws on import fails boot, with the error", async () => {
    const app = appWith({
      "app/models/post.js": "throw new Error('missing env PAYMENTS_KEY')\n",
    });
    await expect(app.initialize()).rejects.toThrow(
      "Failed to load model app/models/post.js: missing env PAYMENTS_KEY",
    );
  });

  test("an app with no app/ directory still boots", async () => {
    const app = appWith({ "config/app.js": "export default {}\n" });
    await app.initialize();
    expect(app.initialized).toBe(true);
  });
});
