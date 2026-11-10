/**
 * Scopes chain on a query builder (plan 106 O4)
 *
 * A scope was a static method only: Post.published().recent() threw "recent
 * is not a function", and the guide said to write .scope('recent'). And a
 * scope named like a model or builder method (where, all, order) was
 * skipped without a word, so it could never be called. Now each scope is a
 * method of every query builder for its model, and a scope that would shadow
 * a method throws on the model's first query, naming both.
 */

import { test, expect, describe } from "bun:test";
import { Model } from "../../src/database/model.js";

class Entry extends Model {
  static tableName = "entries";
  static scopes = {
    published: (q) => q.where({ published: true }),
    recent: (q) => q.order({ created_at: "desc" }),
    popular: (q, min = 100) => q.where({ views: { ">": min } }),
  };
}
Entry.register();

describe("scopes chain", () => {
  test("a scope after a scope", () => {
    expect(Entry.published().recent().toSQL().sql).toBe(
      'SELECT * FROM "entries" WHERE "published" = $1 ORDER BY "created_at" DESC',
    );
  });

  test("a scope after where(), with an argument", () => {
    const { sql, params } = Entry.where({ author_id: 3 }).popular(500).toSQL();
    expect(sql).toBe(
      'SELECT * FROM "entries" WHERE "author_id" = $1 AND "views" > $2',
    );
    expect(params).toEqual([3, 500]);
  });

  test(".scope(name) still works", () => {
    expect(Entry.published().scope("recent").toSQL().sql).toBe(
      Entry.published().recent().toSQL().sql,
    );
  });
});

describe("a scope named like a method", () => {
  test("throws on the model's first query, naming the method it would shadow", () => {
    class Shadowing extends Model {
      static tableName = "shadowing";
      static scopes = { order: (q) => q.where({ hidden: false }) };
    }
    expect(() => Shadowing.query()).toThrow(
      "Shadowing scope 'order' would shadow a method of the model or its query builder; rename the scope",
    );
  });

  test("a model's own static method counts too", () => {
    class Custom extends Model {
      static tableName = "custom";
      static scopes = { featured: (q) => q.where({ featured: true }) };
      static featured() {
        return "a static method";
      }
    }
    expect(() => Custom.register()).toThrow(
      "Custom scope 'featured' would shadow",
    );
  });
});
