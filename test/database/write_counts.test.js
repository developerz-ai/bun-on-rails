/**
 * Affected-row counts from bulk writes
 *
 * updateAll / deleteAll (and Model.updateWhere / deleteWhere / deleteAll,
 * which call them) returned `result.length`: the number of rows the
 * statement *returned*. An UPDATE or DELETE without RETURNING returns none,
 * so they always answered 0. Both drivers (postgres.js and Bun.sql) report the
 * affected rows as `count` on the result; that is what is returned now.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { setConnection } from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";

class Post extends Model {}

/** A connection whose results look like the drivers': an empty row array carrying `count`. */
function connectionAffecting(count) {
  const run = async () => Object.assign([], { count, command: "UPDATE" });
  return { query: run, execute: run, isConnected: true };
}

afterEach(() => setConnection(null));

describe("bulk writes return the number of affected rows", () => {
  test("updateAll and deleteAll", async () => {
    setConnection(connectionAffecting(3));
    expect(
      await Post.where({ status: "draft" }).updateAll({ status: "published" }),
    ).toBe(3);
    expect(await Post.where({ status: "draft" }).deleteAll()).toBe(3);
  });

  test("Model.updateWhere, Model.deleteWhere and Model.deleteAll", async () => {
    setConnection(connectionAffecting(2));
    expect(await Post.updateWhere({ status: "draft" }, { status: "x" })).toBe(
      2,
    );
    expect(await Post.deleteWhere({ status: "draft" })).toBe(2);
    expect(await Post.deleteAll()).toBe(2);
  });

  test("zero affected rows is 0", async () => {
    setConnection(connectionAffecting(0));
    expect(await Post.where({ id: -1 }).deleteAll()).toBe(0);
  });
});
