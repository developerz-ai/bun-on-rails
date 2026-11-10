/**
 * Test-database helpers (plan 105 S3)
 *
 * withinTransaction(cb) never ran cb, so a test written inside it passed
 * without running; cleanDatabase() and setupDatabase() did nothing. Now
 * withinTransaction runs cb in a transaction that always rolls back,
 * cleanDatabase truncates every table but schema_migrations (and refuses
 * outside the test environment), and setupDatabase connects from
 * config/database.js. test/testing/database.pg.test.js runs them against
 * PostgreSQL when TEST_DATABASE_URL is set.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  withinTransaction,
  cleanDatabase,
  setupDatabase,
} from "../../src/testing/index.js";
import {
  Connection,
  getConnection,
  setConnection,
} from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";

class Post extends Model {}

/** A Connection over a fake client: logs where each statement ran, rolls back on a throw. */
function fakeConnection({ tables = [] } = {}) {
  const log = [];
  const result = (rows = []) => Object.assign(rows, { count: rows.length });
  const unsafe = (where) => async (sql) => {
    log.push([where, sql.trim().replace(/\s+/g, " ")]);
    return /FROM pg_tables/.test(sql)
      ? result(tables.map((tablename) => ({ tablename })))
      : result();
  };
  const connection = new Connection({
    url: "postgres://u:p@localhost:5432/app_test",
  });
  connection._client = {
    unsafe: unsafe("global"),
    begin: async (fn) => {
      try {
        const value = await fn({ unsafe: unsafe("tx") });
        log.push(["tx", "COMMIT"]);
        return value;
      } catch (error) {
        log.push(["tx", "ROLLBACK"]);
        throw error;
      }
    },
  };
  connection._connected = true;
  connection._adapter = "postgres";
  return { connection, log };
}

afterEach(() => setConnection(null));

describe("withinTransaction(callback)", () => {
  test("runs the callback, with model queries in the transaction, and rolls back after it succeeds", async () => {
    const { connection, log } = fakeConnection();
    setConnection(connection);

    const value = await withinTransaction(async () => {
      await Post.where({ id: 1 }).updateAll({ title: "kept only in the test" });
      return "ran";
    });

    expect(value).toBe("ran");
    expect(log.map(([where, sql]) => `${where}: ${sql.split(" ")[0]}`)).toEqual(
      ["tx: UPDATE", "tx: ROLLBACK"],
    );
  });

  test("a failing assertion inside it comes back unchanged, and is rolled back", async () => {
    const { connection, log } = fakeConnection();
    setConnection(connection);
    const assertion = new Error("expect(received).toBe(expected)");

    const caught = await withinTransaction(async () => {
      throw assertion;
    }).catch((error) => error);

    expect(caught).toBe(assertion);
    expect(log.at(-1)).toEqual(["tx", "ROLLBACK"]);
  });

  test("with no connection it throws, naming setupDatabase, instead of skipping the callback", async () => {
    let ran = false;
    await expect(
      withinTransaction(async () => {
        ran = true;
      }),
    ).rejects.toThrow(
      "withinTransaction needs a connected database: call setupDatabase() first, or setConnection(connection)",
    );
    expect(ran).toBe(false);
  });
});

describe("cleanDatabase()", () => {
  test("truncates every table but schema_migrations, restarting ids", async () => {
    const { connection, log } = fakeConnection({
      tables: ["posts", "schema_migrations", "users"],
    });
    setConnection(connection);

    expect(await cleanDatabase()).toEqual(["posts", "users"]);
    expect(log.at(-1)).toEqual([
      "global",
      'TRUNCATE TABLE "posts", "users" RESTART IDENTITY CASCADE',
    ]);
  });

  test("with no tables, runs no TRUNCATE", async () => {
    const { connection, log } = fakeConnection({
      tables: ["schema_migrations"],
    });
    setConnection(connection);

    expect(await cleanDatabase()).toEqual([]);
    expect(log.some(([, sql]) => sql.startsWith("TRUNCATE"))).toBe(false);
  });

  test("outside the test environment it refuses, before touching the database", async () => {
    const { connection, log } = fakeConnection({ tables: ["posts"] });
    setConnection(connection);
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await expect(cleanDatabase()).rejects.toThrow(
        "cleanDatabase() truncates every table, so it runs only when NODE_ENV is 'test' (it is 'development')",
      );
    } finally {
      process.env.NODE_ENV = saved;
    }
    expect(log).toEqual([]);
  });
});

describe("setupDatabase()", () => {
  const roots = [];
  afterEach(() =>
    roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })),
  );

  test("uses the connection already set, without connecting again", async () => {
    const { connection } = fakeConnection();
    setConnection(connection);
    const root = mkdtempSync(join(tmpdir(), "setup-db-"));
    roots.push(root);

    expect(await setupDatabase({ root })).toBe(connection);
    expect(getConnection()).toBe(connection);
  });

  test("with no database configured, throws naming DATABASE_URL", async () => {
    const root = mkdtempSync(join(tmpdir(), "setup-db-"));
    roots.push(root);
    mkdirSync(join(root, "config"));
    writeFileSync(
      join(root, "config", "database.js"),
      "export default { test: { adapter: 'postgresql', url: undefined } }\n",
    );

    await expect(setupDatabase({ root })).rejects.toThrow(
      `No database configured for ${root}: set DATABASE_URL`,
    );
  });
});
