/**
 * One table-name rule
 *
 * Model#save() named a model's table with tableize() (Category -> categories),
 * but the query builder used its own rule, the snake-cased class name plus
 * "s" (Category -> categorys, Person -> persons, Address -> addresss). So a
 * record saved fine and then could not be found, updated or deleted. The query
 * builder now uses tableize() too, for SELECT, UPDATE and DELETE alike.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { QueryBuilder } from "../../src/database/query_builder.js";
import { setConnection } from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";
import { TableBuilder } from "../../src/database/migration.js";
import { SchemaGenerator } from "../../src/database/schema.js";

class Category extends Model {}
class Person extends Model {}
class Address extends Model {}
class UserPost extends Model {}
class Legacy extends Model {
  static tableName = "tbl_legacy";
}

const MODELS = [Category, Person, Address, UserPost, Legacy];

/** A connection that records the SQL it is asked to run. */
function recordingConnection() {
  const seen = [];
  const run = async (sql) => {
    seen.push(sql);
    return { rows: [], rowCount: 0, count: 0 };
  };
  return { seen, connection: { query: run, execute: run, isConnected: true } };
}

afterEach(() => setConnection(null));

describe("query builder table names match Model.getTableName()", () => {
  for (const model of MODELS) {
    test(`${model.name}: SELECT`, () => {
      const { sql } = new QueryBuilder(model).toSQL();
      expect(sql).toContain(`"${model.getTableName()}"`);
    });

    test(`${model.name}: UPDATE and DELETE`, async () => {
      const { seen, connection } = recordingConnection();
      setConnection(connection);
      await new QueryBuilder(model).where({ id: 1 }).updateAll({ name: "x" });
      await new QueryBuilder(model).where({ id: 1 }).deleteAll();
      expect(seen).toHaveLength(2);
      for (const sql of seen) {
        expect(sql).toContain(`"${model.getTableName()}"`);
      }
    });
  }

  test("getTableName() itself is tableize(): categories, people, addresses, user_posts", () => {
    expect(MODELS.map((m) => m.getTableName())).toEqual([
      "categories",
      "people",
      "addresses",
      "user_posts",
      "tbl_legacy",
    ]);
  });
});

describe("migrations and schema dumps use the same plural", () => {
  test("t.references('category') points at categories, not categorys", () => {
    const t = new TableBuilder("products");
    t.references("category");
    t.references("person");
    t.references("author", { table: "users" });
    expect(t.columns.map((c) => [c.name, c.foreignKey.table])).toEqual([
      ["category_id", "categories"],
      ["person_id", "people"],
      ["author_id", "users"],
    ]);
  });

  test("a dump omits `table:` exactly when references() would infer it", () => {
    const generator = new SchemaGenerator({});
    const ref = (column, table) =>
      generator.generateReferenceDefinition(
        { column_name: column, is_nullable: "YES" },
        { foreign_table: table, foreign_column: "id" },
      );
    expect(ref("category_id", "categories")).not.toContain("table:");
    expect(ref("person_id", "people")).not.toContain("table:");
    expect(ref("author_id", "users")).toContain("table: 'users'");
  });
});
