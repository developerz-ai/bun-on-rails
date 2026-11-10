/**
 * schema_migrations is created once per migrate()
 *
 * migrate() called ensureMigrationsTable() and then getCompletedVersions(),
 * which calls it again, so every run issued `CREATE TABLE IF NOT EXISTS
 * "schema_migrations"` twice and PostgreSQL answered the second with a
 * "relation already exists, skipping" NOTICE, which postgres.js prints.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { MigrationRunner } from "../../src/database/migration.js";

const dir = join(
  mkdtempSync(join(tmpdir(), "migrations-table-")),
  "migrations",
);
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "20250101000000_noop.js"),
  "export async function up() {}\nexport async function down() {}\n",
);
afterAll(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

describe("MigrationRunner", () => {
  test("migrate() creates schema_migrations once", async () => {
    const seen = [];
    const db = {
      query: async (sql) => {
        seen.push(sql);
        return Object.assign([], { count: 0 });
      },
    };
    await new MigrationRunner(db, dir).migrate();
    const creates = seen.filter((sql) =>
      /CREATE TABLE IF NOT EXISTS "schema_migrations"/.test(sql),
    );
    expect(creates).toHaveLength(1);
  });
});
