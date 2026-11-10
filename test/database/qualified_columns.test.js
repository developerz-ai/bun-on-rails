/**
 * Qualified column names, and first()/last() after a join
 *
 * first() and last() ordered by the bare primary key (`ORDER BY "id"`), which
 * is ambiguous once a join brings in a second `id`, so both failed. And every
 * column reference was quoted as one identifier, so `"users.name"` named a
 * column literally called `users.name` instead of `name` on `users`. Column
 * references in SELECT, WHERE, GROUP BY and ORDER BY now split `table.column`,
 * and first()/last() order by the qualified primary key.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { PostgresAdapter } from "../../src/database/adapters/postgres.js";
import { setConnection } from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";

class Post extends Model {}
const adapter = new PostgresAdapter();

afterEach(() => setConnection(null));

function recordingConnection() {
  const seen = [];
  const run = async (sql, params) => {
    seen.push({ sql, params });
    return Object.assign([], { count: 0 });
  };
  return { seen, connection: { query: run, execute: run, connected: true } };
}

describe("quoteColumn", () => {
  test("splits table.column, keeps a bare column and a qualified *", () => {
    expect(adapter.quoteColumn("posts.id")).toBe('"posts"."id"');
    expect(adapter.quoteColumn("id")).toBe('"id"');
    expect(adapter.quoteColumn("posts.*")).toBe('"posts".*');
  });
});

describe("qualified columns in queries", () => {
  test("where, select, group and order reach a joined table", () => {
    const { sql } = Post.query()
      .select("posts.*", "users.name")
      .join("users", "users.id = posts.user_id")
      .where({ "users.name": "Ada" })
      .order("posts.title")
      .toSQL();
    expect(sql).toContain('SELECT "posts".*, "users"."name"');
    expect(sql).toContain('"users"."name" = $1');
    expect(sql).toContain('ORDER BY "posts"."title"');
  });

  test("first() and last() after a join order by the qualified primary key", async () => {
    const { seen, connection } = recordingConnection();
    setConnection(connection);
    await Post.query().join("users", "users.id = posts.user_id").first();
    await Post.query().join("users", "users.id = posts.user_id").last();
    expect(seen[0].sql).toContain('ORDER BY "posts"."id" ASC');
    expect(seen[1].sql).toContain('ORDER BY "posts"."id" DESC');
  });
});
