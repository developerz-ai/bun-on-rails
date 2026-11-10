/**
 * Connecting to the database at boot
 *
 * Application._initializeDatabase only stored config/database.js's settings
 * ("will be implemented"), so a booted app had no connection and every model
 * query failed until app code opened one in an initializer. The app now
 * connects at boot when config/database.js names a database (its `url` or
 * `database`, or the current environment's block), makes that the connection
 * models use, and closes it on stop. A connection that fails fails boot. With
 * no database configured, the app boots without one.
 */

import { test, expect, describe, afterEach, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Application } from "../../src/application.js";
import { getConnection, setConnection } from "../../src/database/connection.js";
import { getEnvironment } from "../../src/config/loader.js";

const RealSQL = Bun.SQL;
const work = mkdtempSync(join(tmpdir(), "database-boot-"));

/** A Bun.SQL stand-in that records the URLs it was built with and its close(). */
function fakeDriver() {
  const urls = [];
  let closed = 0;
  Bun.SQL = class FakeSQL {
    constructor(options) {
      urls.push(options.url);
    }
    async unsafe() {
      return Object.assign([], { count: 0 });
    }
    async close() {
      closed++;
    }
  };
  return { urls, closed: () => closed };
}

function appWithDatabaseConfig(name, source) {
  const root = join(work, name);
  mkdirSync(join(root, "config"), { recursive: true });
  if (source !== null)
    writeFileSync(join(root, "config", "database.js"), source);
  return new Application({ root });
}

afterEach(() => {
  Bun.SQL = RealSQL;
  setConnection(null);
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("database at boot", () => {
  test("a url in config/database.js connects, becomes the models' connection, and closes on stop", async () => {
    const driver = fakeDriver();
    const app = appWithDatabaseConfig(
      "url",
      "export default { url: 'postgres://app:pw@db.example.com:5432/app' }\n",
    );
    await app.initialize();

    expect(driver.urls).toEqual(["postgres://app:pw@db.example.com:5432/app"]);
    expect(app.database).toBeDefined();
    expect(getConnection()).toBe(app.database);

    app.running = true; // stop() only tears down a started app
    await app.stop();
    expect(driver.closed()).toBe(1);
    expect(getConnection()).toBeNull();
  });

  test("a config keyed by environment uses the current environment's block", async () => {
    const driver = fakeDriver();
    const env = getEnvironment();
    const app = appWithDatabaseConfig(
      "per-env",
      `export default {\n  ${env}: { url: 'postgres://u:p@localhost:5432/current' },\n  some_other_env: { url: 'postgres://u:p@localhost:5432/other' },\n}\n`,
    );
    await app.initialize();
    expect(driver.urls).toEqual(["postgres://u:p@localhost:5432/current"]);
  });

  test("no url or database configured: the app boots without a connection", async () => {
    const driver = fakeDriver();
    for (const [name, source] of [
      ["no-file", null],
      ["unset-env", "export default { url: undefined }\n"],
    ]) {
      const app = appWithDatabaseConfig(name, source);
      await app.initialize();
      expect({ name, database: app.database ?? null }).toEqual({
        name,
        database: null,
      });
    }
    expect(driver.urls).toEqual([]);
    expect(getConnection()).toBeNull();
  });

  test("a database that cannot be reached fails boot, naming config/database.js", async () => {
    const app = appWithDatabaseConfig(
      "unreachable",
      "export default { url: 'postgres://u:p@127.0.0.1:1/none', useBunSql: false, pool: { connectTimeout: 2 } }\n",
    );
    await expect(app.initialize()).rejects.toThrow(/config\/database\.js/);
    expect(app.initialized).toBe(false);
  });
});
