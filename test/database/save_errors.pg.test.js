/**
 * save() throws a database error on PostgreSQL (plan 106 O1)
 *
 * Runs only when TEST_DATABASE_URL names a PostgreSQL server; it creates a
 * database of its own and drops it afterwards. A unique violation comes back
 * as a DatabaseError with SQLSTATE 23505, and inside a transaction it rolls
 * the transaction back, instead of save() returning false while PostgreSQL
 * has already aborted the transaction.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Model } from "../../src/database/model.js";
import { setConnection, DatabaseError } from "../../src/database/connection.js";
import { connectToAppDatabase } from "../../src/database/config.js";
import { createDatabase, dropDatabase } from "../../src/cli/commands/db.js";

const serverUrl = process.env.TEST_DATABASE_URL;

class Member extends Model {
  static tableName = "members";
  static timestamps = false;
}

describe.skipIf(!serverUrl)("save() errors on PostgreSQL", () => {
  const root = mkdtempSync(join(tmpdir(), "save-errors-pg-"));
  let connection;

  beforeAll(async () => {
    const url = new URL(serverUrl);
    url.pathname = `/bor_save_errors_${process.pid}_${Date.now()}`;
    mkdirSync(join(root, "config"));
    writeFileSync(
      join(root, "config", "database.js"),
      `export default { test: { adapter: 'postgresql', url: ${JSON.stringify(url.toString())} } }\n`,
    );
    await createDatabase(root);
    connection = await connectToAppDatabase(root);
    setConnection(connection);
    await connection.query(
      "CREATE TABLE members (id bigserial PRIMARY KEY, email text NOT NULL UNIQUE)",
    );
  });

  afterAll(async () => {
    await connection?.disconnect();
    setConnection(null);
    await dropDatabase(root);
    rmSync(root, { recursive: true, force: true });
  });

  test("a unique violation is a DatabaseError with SQLSTATE 23505", async () => {
    await Member.create({ email: "taken@example.com" });
    const duplicate = new Member({ email: "taken@example.com" });

    const caught = await duplicate.save().catch((error) => error);

    expect(caught).toBeInstanceOf(DatabaseError);
    expect(caught.code).toBe("23505");
    expect(duplicate.persisted).toBe(false);
  });

  test("inside a transaction it rolls the whole transaction back", async () => {
    const caught = await connection
      .transaction(async () => {
        await Member.create({ email: "first@example.com" });
        await Member.create({ email: "first@example.com" });
      })
      .catch((error) => error);

    expect(caught.code).toBe("23505");
    expect(await Member.where({ email: "first@example.com" }).count()).toBe(0);
  });
});
