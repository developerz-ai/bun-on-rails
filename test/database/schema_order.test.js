/**
 * Table order in a schema dump
 *
 * The dumper wrote tables in alphabetical order with their foreign keys
 * inline, so loading a dump where `comments` references `posts` created
 * `comments` first and failed: the referenced table did not exist yet.
 * Tables are now ordered so every referenced table comes first.
 */

import { test, expect, describe } from "bun:test";
import { orderTablesForCreate } from "../../src/database/schema.js";

describe("orderTablesForCreate", () => {
  test("a referenced table comes before the tables that reference it", () => {
    const order = orderTablesForCreate(["comments", "posts", "users"], {
      comments: ["posts", "users"],
      posts: ["users"],
      users: [],
    });
    expect(order).toEqual(["users", "posts", "comments"]);
  });

  test("independent tables keep alphabetical order, so dumps are stable", () => {
    expect(
      orderTablesForCreate(["b", "a", "c"], { a: [], b: [], c: [] }),
    ).toEqual(["a", "b", "c"]);
  });

  test("a self-reference and a reference outside the dump do not block a table", () => {
    const order = orderTablesForCreate(["categories", "items"], {
      categories: ["categories"],
      items: ["categories", "external_table"],
    });
    expect(order).toEqual(["categories", "items"]);
  });

  test("a cycle between tables fails loudly, naming them", () => {
    expect(() =>
      orderTablesForCreate(["a", "b", "c"], { a: ["b"], b: ["a"], c: [] }),
    ).toThrow(/cycle.*\ba\b.*\bb\b/);
  });
});
