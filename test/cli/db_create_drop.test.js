/**
 * brails db:create, db:drop, db:setup, db:reset; DatabaseError codes
 *
 * These four exited 1 as not implemented. create and drop connect to the
 * server's `postgres` maintenance database and create or drop the one
 * config/database.js names; setup is create + schema:load + seed (when
 * db/seeds.js exists); reset is drop + setup. drop and reset refuse in
 * production without --force.
 *
 * Also: Bun.SQL reports a server error's SQLSTATE in `errno` (its `code` is a
 * generic ERR_POSTGRES_SERVER_ERROR), so since the native driver became the
 * default, DatabaseError#code no longer held the SQLSTATE. It does again.
 */

import { test, expect, describe, afterEach, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createDatabase,
  dropDatabase,
  reset,
  setup,
} from "../../src/cli/commands/db.js";
import { Connection, DatabaseError } from "../../src/database/connection.js";

const RealSQL = Bun.SQL;
const savedEnv = process.env.BUN_ENV;
const work = mkdtempSync(join(tmpdir(), "db-create-drop-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => {
  Bun.SQL = RealSQL;
  if (savedEnv === undefined) delete process.env.BUN_ENV;
  else process.env.BUN_ENV = savedEnv;
});

/** Records [database, statement] pairs; `existing` databases make CREATE DATABASE fail like PostgreSQL. */
function fakeServer(existing = []) {
  const databases = new Set(existing);
  const log = [];
  Bun.SQL = class FakeSQL {
    constructor({ url }) {
      this.db = new URL(url).pathname.slice(1);
    }
    async unsafe(sql) {
      const text = sql.trim().replace(/\s+/g, " ");
      if (text !== "SELECT 1") log.push([this.db, text]);
      const create = text.match(/^CREATE DATABASE "(\w+)"$/);
      if (create) {
        if (databases.has(create[1])) {
          throw Object.assign(
            new Error(`database "${create[1]}" already exists`),
            {
              code: "ERR_POSTGRES_SERVER_ERROR",
              errno: "42P04",
            },
          );
        }
        databases.add(create[1]);
      }
      const drop = text.match(/^DROP DATABASE IF EXISTS "(\w+)"$/);
      if (drop) databases.delete(drop[1]);
      return Object.assign([], { count: 0 });
    }
    async close() {}
  };
  return { databases, log };
}

function app(name, { schema = false, seeds = false } = {}) {
  const root = join(work, name);
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "db"), { recursive: true });
  writeFileSync(
    join(root, "config", "database.js"),
    "export default { url: 'postgres://u:p@localhost:5432/myapp' }\n",
  );
  if (schema) {
    writeFileSync(
      join(root, "db", "schema.js"),
      "export const schemaVersion = '0'\nexport async function up(db) { await db.execute('CREATE TABLE users (id bigserial)') }\n",
    );
  }
  if (seeds) {
    writeFileSync(
      join(root, "db", "seeds.js"),
      "export default async function seed(c) { await c.query('INSERT INTO users DEFAULT VALUES') }\n",
    );
  }
  return root;
}

describe("createDatabase()", () => {
  test("connects to the postgres maintenance database and creates the app's", async () => {
    const server = fakeServer();
    expect(await createDatabase(app("create"))).toBe("created");
    expect(server.log).toEqual([["postgres", 'CREATE DATABASE "myapp"']]);
  });

  test("an existing database is reported, not an error", async () => {
    fakeServer(["myapp"]);
    expect(await createDatabase(app("create-exists"))).toBe("exists");
  });
});

describe("dropDatabase()", () => {
  test("drops the app's database from the maintenance database", async () => {
    const server = fakeServer(["myapp"]);
    await dropDatabase(app("drop"));
    expect(server.log).toEqual([
      ["postgres", 'DROP DATABASE IF EXISTS "myapp"'],
    ]);
    expect(server.databases.has("myapp")).toBe(false);
  });

  test("refuses in production without force, and drops with it", async () => {
    const server = fakeServer(["myapp"]);
    process.env.BUN_ENV = "production";
    await expect(dropDatabase(app("drop-prod"))).rejects.toThrow(
      /production.*--force/,
    );
    expect(server.log).toEqual([]);
    await dropDatabase(app("drop-prod-force"), { force: true });
    expect(server.databases.has("myapp")).toBe(false);
  });
});

describe("setup() and reset()", () => {
  test("setup creates the database, loads the schema, then seeds", async () => {
    const server = fakeServer();
    await setup(app("setup", { schema: true, seeds: true }));
    expect(server.log).toEqual([
      ["postgres", 'CREATE DATABASE "myapp"'],
      ["myapp", "CREATE TABLE users (id bigserial)"],
      ["myapp", "INSERT INTO users DEFAULT VALUES"],
    ]);
  });

  test("reset drops, then sets up again", async () => {
    const server = fakeServer(["myapp"]);
    await reset(app("reset", { schema: true }));
    expect(server.log.map(([db, sql]) => `${db}: ${sql}`)).toEqual([
      'postgres: DROP DATABASE IF EXISTS "myapp"',
      'postgres: CREATE DATABASE "myapp"',
      "myapp: CREATE TABLE users (id bigserial)",
    ]);
  });
});

describe("DatabaseError#code", () => {
  test("is the SQLSTATE whichever driver raised it", async () => {
    fakeServer(["dup"]);
    const connection = new Connection({
      url: "postgres://u:p@localhost:5432/postgres",
    });
    await connection.connect();
    let error;
    try {
      await connection.query('CREATE DATABASE "dup"');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.code).toBe("42P04");
  });
});

describe("DatabaseError#code for system errors", () => {
  test("keeps the symbolic code (ECONNREFUSED) when errno is a number, not a SQLSTATE", async () => {
    Bun.SQL = class FakeSQL {
      async unsafe(sql) {
        if (sql.trim() === "SELECT 1") return Object.assign([], { count: 0 });
        throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
          code: "ECONNREFUSED",
          errno: -111,
        });
      }
      async close() {}
    };
    const connection = new Connection({
      url: "postgres://u:p@localhost:5432/app",
    });
    await connection.connect();
    let error;
    try {
      await connection.query("SELECT now()");
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("ECONNREFUSED");
  });
});
