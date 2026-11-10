/**
 * Test-database helpers against PostgreSQL (plan 105 S3)
 *
 * Runs only when TEST_DATABASE_URL names a PostgreSQL server
 * (postgres://user:pass@host:5432/any), and is skipped otherwise: it creates a
 * database of its own on that server, drops it afterwards, and never touches
 * the one the URL names. Locally:
 *
 *   docker run -d --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
 *     bun test test/testing/database.pg.test.js
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setupDatabase,
  withinTransaction,
  cleanDatabase,
} from "../../src/testing/index.js";
import { Model } from "../../src/database/model.js";
import { getConnection, setConnection } from "../../src/database/connection.js";
import { createDatabase, dropDatabase } from "../../src/cli/commands/db.js";

const serverUrl = process.env.TEST_DATABASE_URL;

class Note extends Model {
  static tableName = "notes";
}

describe.skipIf(!serverUrl)("test-database helpers on PostgreSQL", () => {
  const root = mkdtempSync(join(tmpdir(), "testing-pg-"));

  beforeAll(async () => {
    const url = new URL(serverUrl);
    url.pathname = `/bor_testing_${process.pid}_${Date.now()}`;
    mkdirSync(join(root, "config"));
    mkdirSync(join(root, "db", "migrations"), { recursive: true });
    writeFileSync(
      join(root, "config", "database.js"),
      `export default { test: { adapter: 'postgresql', url: ${JSON.stringify(url.toString())} } }\n`,
    );
    writeFileSync(
      join(root, "db", "migrations", "20260101000000_create_notes.js"),
      `export async function up(db) {
  await db.createTable('notes', (t) => {
    t.id()
    t.string('body').notNull()
    t.timestamps()
  })
}
export async function down(db) {
  await db.dropTable('notes')
}
`,
    );
    await createDatabase(root);
  });

  afterAll(async () => {
    await getConnection()?.disconnect();
    setConnection(null);
    await dropDatabase(root);
    rmSync(root, { recursive: true, force: true });
  });

  test("a failing migration leaves no connection set, so the next setupDatabase tries again", async () => {
    const bad = join(root, "db", "migrations", "20260101000001_fails.js");
    writeFileSync(
      bad,
      "export async function up() { throw new Error('migration 1 fails') }\n",
    );
    await expect(setupDatabase({ root })).rejects.toThrow("migration 1 fails");
    expect(getConnection()).toBeNull();
    rmSync(bad);
  });

  test("setupDatabase connects from config/database.js and runs the pending migrations", async () => {
    const connection = await setupDatabase({ root });
    expect(getConnection()).toBe(connection);
    expect(await Note.count()).toBe(0);
    const versions = await connection.query(
      "SELECT version FROM schema_migrations",
    );
    expect(versions.map((r) => r.version)).toEqual(["20260101000000"]);
  });

  test("a second setupDatabase leaves the database as it is", async () => {
    await Note.create({ body: "kept" });
    await setupDatabase({ root });
    expect(await Note.count()).toBe(1);
  });

  test("cleanDatabase empties the tables and restarts their ids", async () => {
    expect(await cleanDatabase()).toEqual(["notes"]);
    expect(await Note.count()).toBe(0);
    const note = await Note.create({ body: "first again" });
    expect(String(note.id)).toBe("1");
    await cleanDatabase();
  });

  test("withinTransaction rolls back what the callback wrote, after it succeeds", async () => {
    const seen = await withinTransaction(async () => {
      await Note.create({ body: "only inside" });
      return Note.count();
    });
    expect(seen).toBe(1);
    expect(await Note.count()).toBe(0);
  });

  test("withinTransaction inside a transaction that commits still rolls back what it wrote", async () => {
    await getConnection().transaction(async () => {
      await Note.create({ body: "outer, committed" });
      await withinTransaction(() =>
        Note.create({ body: "inner, rolled back" }),
      );
    });
    const bodies = (await Note.all()).map((n) => n.get("body"));
    expect(bodies).toEqual(["outer, committed"]);
    await cleanDatabase();
  });

  test("a failing assertion inside withinTransaction comes back unchanged, and is rolled back", async () => {
    const assertion = new Error("expect(received).toBe(expected)");
    const caught = await withinTransaction(async () => {
      await Note.create({ body: "also rolled back" });
      throw assertion;
    }).catch((error) => error);

    expect(caught).toBe(assertion);
    expect(await Note.count()).toBe(0);
  });

  test("a failing statement inside it is a DatabaseError with the SQLSTATE", async () => {
    const caught = await withinTransaction((tx) =>
      tx.query("INSERT INTO notes (body) VALUES (NULL)"),
    ).catch((error) => error);

    expect(caught.name).toBe("DatabaseError");
    expect(caught.code).toBe("23502"); // not_null_violation
  });
});
