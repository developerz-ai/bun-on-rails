/**
 * config/initializers/*.js
 *
 * An initializer that threw used to be swallowed: _runInitializers rethrew,
 * but its own outer `catch` (meant for a missing directory) caught that and
 * logged "No initializers directory found" at debug level, so the app booted
 * anyway. The database guide connects in an initializer, so a wrong password
 * gave a running app whose every query answered 500. Boot now fails, naming
 * the file.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Application } from "../../src/application.js";

const work = mkdtempSync(join(tmpdir(), "initializers-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function appWith(name, files) {
  const root = join(work, name);
  mkdirSync(join(root, "config", "initializers"), { recursive: true });
  for (const [file, code] of Object.entries(files)) {
    writeFileSync(join(root, "config", "initializers", file), code);
  }
  return new Application({ root });
}

describe("initializers", () => {
  test("a throwing initializer fails boot, naming the file and the cause", async () => {
    const app = appWith("throws", {
      "10_database.js":
        "export default async () => { throw new Error('password authentication failed') }\n",
    });
    let error;
    try {
      await app.initialize();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.message).toContain("10_database.js");
    expect(error.message).toContain("password authentication failed");
    expect(app.initialized).toBe(false);
  });

  test("an initializer that cannot be imported fails boot too", async () => {
    const app = appWith("syntax", { "broken.js": "export default ( =>\n" });
    await expect(app.initialize()).rejects.toThrow(/broken\.js/);
  });

  test("they run once each, in file-name order, with the application", async () => {
    globalThis.__initOrder = [];
    const app = appWith("order", {
      "20_second.js":
        "export default (app) => { globalThis.__initOrder.push(['second', !!app.router]) }\n",
      "10_first.js":
        "export default (app) => { globalThis.__initOrder.push(['first', !!app.router]) }\n",
    });
    await app.initialize();
    expect(globalThis.__initOrder).toEqual([
      ["first", true],
      ["second", true],
    ]);
    delete globalThis.__initOrder;
  });

  test("an app without config/initializers/ boots", async () => {
    const root = join(work, "none");
    mkdirSync(root, { recursive: true });
    const app = new Application({ root });
    await app.initialize();
    expect(app.initialized).toBe(true);
  });
});
