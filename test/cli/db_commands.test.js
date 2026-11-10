/**
 * brails db:migrate and db:rollback
 *
 * Every `brails db:*` command exited 1 as not implemented, so an app could
 * only run migrations from a hand-written script. db:migrate and db:rollback
 * now connect to the app's database (config/database.js / DATABASE_URL), run
 * the migrations in db/migrations, and rewrite db/schema.js afterwards.
 * The driver is a stand-in that keeps schema_migrations in memory.
 */

import {
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
  afterAll,
} from "bun:test";
import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  migrate,
  rollback,
  schemaDump,
  schemaLoad,
  seed,
} from "../../src/cli/commands/db.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");
const RealSQL = Bun.SQL;
const work = mkdtempSync(join(tmpdir(), "db-commands-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/**
 * A Bun.SQL stand-in: schema_migrations lives in `versions`, and tables
 * created or dropped by migrations live in `tables`, which the schema dumper
 * sees through information_schema.tables. Every statement is logged.
 */
function fakeDriver() {
  const versions = new Set();
  const tables = new Set();
  const log = [];
  const result = (rows = []) => Object.assign(rows, { count: rows.length });
  Bun.SQL = class FakeSQL {
    async unsafe(sql, params = []) {
      const text = sql.trim().replace(/\s+/g, " ");
      log.push(text);
      if (
        /^SELECT version FROM schema_migrations ORDER BY version DESC LIMIT/.test(
          text,
        )
      ) {
        return result(
          [...versions]
            .sort()
            .reverse()
            .slice(0, params[0])
            .map((version) => ({ version })),
        );
      }
      if (
        /^SELECT version FROM schema_migrations WHERE version = \$1/.test(text)
      ) {
        return result(versions.has(params[0]) ? [{ version: params[0] }] : []);
      }
      if (/^SELECT version FROM schema_migrations/.test(text)) {
        return result([...versions].sort().map((version) => ({ version })));
      }
      if (/FROM information_schema\.tables/.test(text)) {
        return result([...tables].sort().map((table_name) => ({ table_name })));
      }
      if (/^INSERT INTO schema_migrations/.test(text)) versions.add(params[0]);
      if (/^DELETE FROM schema_migrations/.test(text))
        versions.delete(params[0]);
      const created = text.match(/^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/);
      if (created) tables.add(created[1]);
      const dropped = text.match(/^DROP TABLE (\w+)/);
      if (dropped) tables.delete(dropped[1]);
      return result();
    }
    async close() {}
  };
  return { versions, tables, log };
}

/** The tables db/schema.js creates, in order. */
function dumpedTables(root) {
  const schema = readFileSync(join(root, "db", "schema.js"), "utf8");
  return [...schema.matchAll(/createTable\('(\w+)'/g)].map((m) => m[1]);
}

function appWithMigrations(name) {
  const root = join(work, name);
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "db", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "config", "database.js"),
    "export default { url: 'postgres://u:p@localhost:5432/app' }\n",
  );
  for (const [version, table] of [
    ["20250101000000", "users"],
    ["20250102000000", "posts"],
  ]) {
    writeFileSync(
      join(root, "db", "migrations", `${version}_create_${table}.js`),
      `export async function up(db) { await db.query('CREATE TABLE ${table} (id bigserial)') }\n` +
        `export async function down(db) { await db.query('DROP TABLE ${table}') }\n`,
    );
  }
  return root;
}

beforeEach(() => {});
afterEach(() => {
  Bun.SQL = RealSQL;
});

describe("migrate()", () => {
  test("runs pending migrations in order, records them, and writes db/schema.js", async () => {
    const driver = fakeDriver();
    const root = appWithMigrations("migrate");
    expect(await migrate(root)).toEqual(["20250101000000", "20250102000000"]);
    expect(driver.log).toContain("CREATE TABLE users (id bigserial)");
    expect(driver.log).toContain("CREATE TABLE posts (id bigserial)");
    expect([...driver.versions].sort()).toEqual([
      "20250101000000",
      "20250102000000",
    ]);
    expect(existsSync(join(root, "db", "schema.js"))).toBe(true);
    expect(dumpedTables(root)).toEqual(["posts", "users"]);

    expect(await migrate(root)).toEqual([]); // nothing pending the second time
  });
});

describe("rollback()", () => {
  test("rolls back the latest `steps` migrations and rewrites db/schema.js", async () => {
    const driver = fakeDriver();
    const root = appWithMigrations("rollback");
    await migrate(root);
    expect(await rollback(root, 1)).toEqual(["20250102000000"]);
    expect(driver.log).toContain("DROP TABLE posts");
    expect([...driver.versions]).toEqual(["20250101000000"]);
    expect(dumpedTables(root)).toEqual(["users"]);
  });
});

describe("schemaDump()", () => {
  test("writes db/schema.js from the database, versioned by the latest migration", async () => {
    fakeDriver();
    const root = appWithMigrations("dump");
    await migrate(root);
    rmSync(join(root, "db", "schema.js"));

    await schemaDump(root);
    expect(dumpedTables(root)).toEqual(["posts", "users"]);
    expect(readFileSync(join(root, "db", "schema.js"), "utf8")).toContain(
      "export const schemaVersion = '20250102000000'",
    );
  });
});

describe("schemaLoad()", () => {
  test("creates the tables, marks every migration up to the schema's version as run, and leaves newer ones pending", async () => {
    fakeDriver();
    const source = appWithMigrations("load-source");
    await migrate(source);

    const driver = fakeDriver(); // an empty database
    const root = join(work, "load-target");
    cpSync(source, root, { recursive: true });
    writeFileSync(
      join(root, "db", "migrations", "20250103000000_create_tags.js"),
      "export async function up(db) { await db.query('CREATE TABLE tags (id bigserial)') }\n" +
        "export async function down(db) { await db.query('DROP TABLE tags') }\n",
    );

    await schemaLoad(root);
    expect([...driver.tables].sort()).toEqual([
      "posts",
      "schema_migrations",
      "users",
    ]);
    expect([...driver.versions].sort()).toEqual([
      "20250101000000",
      "20250102000000",
    ]);

    // only the migration newer than the schema still runs
    expect(await migrate(root)).toEqual(["20250103000000"]);
  });

  test("without db/schema.js it says to run db:migrate first", async () => {
    fakeDriver();
    const root = appWithMigrations("load-missing");
    await expect(schemaLoad(root)).rejects.toThrow(
      /db\/schema\.js.*db:migrate/,
    );
  });
});

describe("seed()", () => {
  test("runs db/seeds.js with the app's connection set for models", async () => {
    const driver = fakeDriver();
    const root = appWithMigrations("seed");
    writeFileSync(
      join(root, "db", "seeds.js"),
      `import { Model } from "${join(repoRoot, "src", "index.js")}";\n` +
        "class Widget extends Model { static timestamps = false }\n" +
        "export default async function seed(connection) {\n" +
        "  globalThis.__seedGotConnection = typeof connection?.query === 'function';\n" +
        "  await Widget.create({ name: 'first' });\n" +
        "}\n",
    );
    await seed(root);
    expect(globalThis.__seedGotConnection).toBe(true);
    expect(driver.log.some((q) => q.startsWith('INSERT INTO "widgets"'))).toBe(
      true,
    );
    delete globalThis.__seedGotConnection;
  });

  test("without db/seeds.js it says so", async () => {
    fakeDriver();
    const root = appWithMigrations("seed-missing");
    await expect(seed(root)).rejects.toThrow(/db\/seeds\.js not found/);
  });
});

describe("without a database", () => {
  test("migrate() says how to configure one", async () => {
    const root = join(work, "no-db");
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(
      join(root, "config", "database.js"),
      "export default { url: undefined }\n",
    );
    await expect(migrate(root)).rejects.toThrow(
      /No database configured.*DATABASE_URL/,
    );
  });
});

describe("the CLI", () => {
  const run = (cwd, ...args) => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const r = spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: "utf8",
      env,
    });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  test("db:rollback rejects a --step that is not a positive integer", () => {
    const r = run(appWithMigrations("cli-step"), "db:rollback", "--step=abc");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--step must be a positive integer");
  });

  test("`brails db migrate` reaches db:migrate (here: no DATABASE_URL, so it says so)", () => {
    const root = join(work, "cli-space");
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(
      join(root, "config", "database.js"),
      "export default { url: process.env.DATABASE_URL }\n",
    );
    const r = run(root, "db", "migrate");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("No database configured");
  });
});
