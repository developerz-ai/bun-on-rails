/**
 * MigrationRunner with a relative migrations path
 *
 * The runner imported each file as `${migrationsPath}/${file}`. A relative
 * path such as "db/migrations" is then a bare package name to the module
 * loader, and "./db/migrations" resolves against src/database/, not the app,
 * so `new MigrationRunner(db, "db/migrations")` (what a script in an app
 * writes) failed. The path is now resolved against the working directory.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { MigrationRunner } from "../../src/database/migration.js";

const work = mkdtempSync(join(tmpdir(), "migration-paths-"));
const dir = join(work, "db", "migrations");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "20250101000000_create_widgets.js"),
  "export async function up(db) { await db.query('CREATE TABLE widgets (id bigserial)') }\n" +
    "export async function down(db) { await db.query('DROP TABLE widgets') }\n",
);
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A db that records statements and has run no migrations yet. */
function recordingDb() {
  const seen = [];
  return {
    seen,
    query: async (sql) => {
      seen.push(sql.trim());
      return Object.assign([], { count: 0 });
    },
  };
}

describe("MigrationRunner paths", () => {
  for (const [label, path] of [
    ["relative, no ./", relative(process.cwd(), dir)],
    ["relative, with ./", `./${relative(process.cwd(), dir)}`],
    ["absolute", dir],
  ]) {
    test(`runs migrations from a ${label} path`, async () => {
      const db = recordingDb();
      const executed = await new MigrationRunner(db, path).migrate();
      expect(executed).toEqual(["20250101000000"]);
      expect(db.seen).toContain("CREATE TABLE widgets (id bigserial)");
    });
  }
});
