/**
 * Raw where() conditions with bound values
 *
 * `where("age > ?", 18)` pushed the SQL with its `?` untouched and the value
 * into params without advancing the parameter index. PostgreSQL wants `$n`,
 * so the query was invalid, and any condition after it was numbered wrong.
 * The query builder also had its own copy of the WHERE builder (used by
 * updateAll/deleteAll) with the same flaw. Now one builder binds each `?`
 * (or renumbers `$n`) at the right index.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { PostgresAdapter } from "../../src/database/adapters/postgres.js";
import { QueryBuilder } from "../../src/database/query_builder.js";
import { setConnection } from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";

class Post extends Model {}
const adapter = new PostgresAdapter();

afterEach(() => setConnection(null));

describe("whereClauseSQL raw conditions", () => {
  test("? placeholders become $n in order, after earlier params", () => {
    const { sql, params, nextIndex } = adapter.whereClauseSQL([
      { column: "status", operator: "=", value: "published" },
      { raw: "views > ? AND views < ?", values: [10, 100] },
      { column: "author_id", operator: "=", value: 7 },
    ]);
    expect(sql).toBe(
      '"status" = $1 AND views > $2 AND views < $3 AND "author_id" = $4',
    );
    expect(params).toEqual(["published", 10, 100, 7]);
    expect(nextIndex).toBe(5);
  });

  test("$n placeholders in a raw condition are renumbered after earlier params", () => {
    const { sql, params } = adapter.whereClauseSQL([
      { column: "status", operator: "=", value: "published" },
      { raw: "views BETWEEN $1 AND $2", values: [10, 100] },
    ]);
    expect(sql).toBe('"status" = $1 AND views BETWEEN $2 AND $3');
    expect(params).toEqual(["published", 10, 100]);
  });

  test("a ? inside a quoted literal is not a placeholder", () => {
    const { sql } = adapter.whereClauseSQL([
      { raw: "title <> 'why?' AND id = ?", values: [3] },
    ]);
    expect(sql).toBe("title <> 'why?' AND id = $1");
  });

  test("a ? or $n inside a dollar-quoted literal is not a placeholder", () => {
    expect(
      adapter.whereClauseSQL([
        { raw: "title = $$why?$$ AND views > $1", values: [10] },
      ]).sql,
    ).toBe("title = $$why?$$ AND views > $1");
    expect(
      adapter.whereClauseSQL([
        { raw: "body = $q$a ? $1 b$q$ AND id = ?", values: [3] },
      ]).sql,
    ).toBe("body = $q$a ? $1 b$q$ AND id = $1");
  });

  test("with no values the raw SQL is left alone (? is also a jsonb operator)", () => {
    const { sql, params } = adapter.whereClauseSQL([
      { raw: "data ? 'key'", values: [] },
    ]);
    expect(sql).toBe("data ? 'key'");
    expect(params).toEqual([]);
  });

  test("a placeholder count that does not match the values fails loudly", () => {
    expect(() =>
      adapter.whereClauseSQL([{ raw: "a = ? AND b = ?", values: [1] }]),
    ).toThrow(/2 placeholder.*1 value/);
  });
});

describe("through the query builder", () => {
  test("toSQL binds a raw condition among object conditions", () => {
    const { sql, params } = new QueryBuilder(Post)
      .where({ status: "published" })
      .where("views > ?", 10)
      .toSQL();
    expect(sql).toContain('"status" = $1 AND views > $2');
    expect(params).toEqual(["published", 10]);
  });

  test("updateAll and deleteAll bind raw conditions after the SET params", async () => {
    const seen = [];
    const run = async (sql, params) => {
      seen.push({ sql, params });
      return { rows: [], rowCount: 0, count: 0 };
    };
    setConnection({ query: run, execute: run, isConnected: true });
    await new QueryBuilder(Post)
      .where("views > ?", 10)
      .updateAll({ title: "x" });
    await new QueryBuilder(Post).where("views > ?", 10).deleteAll();
    expect(seen[0].sql).toMatch(/SET "title" = \$1 WHERE views > \$2/);
    expect(seen[0].params).toEqual(["x", 10]);
    expect(seen[1].sql).toMatch(/WHERE views > \$1/);
    expect(seen[1].params).toEqual([10]);
  });
});

describe("Model.where", () => {
  test("passes a raw condition's values through to the query builder", () => {
    const { sql, params } = Post.where(
      "views > ? AND views < ?",
      10,
      100,
    ).toSQL();
    expect(sql).toContain("views > $1 AND views < $2");
    expect(params).toEqual([10, 100]);
  });
});
