/**
 * created_at / updated_at on save()
 *
 * save() set updated_at only when it was undefined, and a loaded record always
 * has it, so updating a record never refreshed updated_at. It also wrote both
 * columns on every insert and update, so a model whose table has no timestamp
 * columns could not be saved at all. Now an update always refreshes
 * updated_at, and `static timestamps = false` turns both off.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { setConnection } from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";

class Post extends Model {}
class Setting extends Model {
  static timestamps = false;
}

/** Records each statement and answers like a driver: RETURNING rows plus `count`. */
function recordingConnection() {
  const seen = [];
  const run = async (sql, params) => {
    seen.push({ sql, params });
    return Object.assign([{ id: 1, title: "t" }], { count: 1 });
  };
  return { seen, connection: { query: run, execute: run, isConnected: true } };
}

/** The value bound for `column` in an INSERT or UPDATE. */
function bound(statement, column) {
  const quoted = `"${column}"`;
  if (statement.sql.startsWith("INSERT")) {
    const columns = statement.sql
      .slice(statement.sql.indexOf("(") + 1, statement.sql.indexOf(")"))
      .split(", ");
    const i = columns.indexOf(quoted);
    return i === -1 ? undefined : statement.params[i];
  }
  const match = statement.sql.match(new RegExp(`${quoted} = \\$(\\d+)`));
  return match ? statement.params[Number(match[1]) - 1] : undefined;
}

afterEach(() => setConnection(null));

describe("timestamps", () => {
  test("an insert sets created_at and updated_at", async () => {
    const { seen, connection } = recordingConnection();
    setConnection(connection);
    await new Post({ title: "t" }).save();
    expect(bound(seen[0], "created_at")).toBeInstanceOf(Date);
    expect(bound(seen[0], "updated_at")).toBeInstanceOf(Date);
  });

  test("updating a loaded record refreshes updated_at", async () => {
    const { seen, connection } = recordingConnection();
    setConnection(connection);
    const old = new Date("2020-01-01T00:00:00Z");
    const post = new Post({
      id: 1,
      title: "t",
      created_at: old,
      updated_at: old,
    });
    post.persisted = true;
    post.set("title", "changed");
    const before = Date.now();
    await post.save();

    const updatedAt = bound(seen[0], "updated_at");
    expect(updatedAt).toBeInstanceOf(Date);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(bound(seen[0], "created_at")).toEqual(old);
  });

  test("`static timestamps = false` writes neither column, on insert or update", async () => {
    const { seen, connection } = recordingConnection();
    setConnection(connection);
    const setting = new Setting({ key: "theme", value: "dark" });
    await setting.save();
    setting.set("value", "light");
    await setting.save();

    expect(seen).toHaveLength(2);
    for (const statement of seen) {
      expect(statement.sql).not.toContain("created_at");
      expect(statement.sql).not.toContain("updated_at");
    }
  });
});
