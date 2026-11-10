/**
 * Model queries inside connection.transaction()
 *
 * transaction(callback) handed the callback a transaction-scoped connection,
 * but models always used the global one (getConnection()), so a model query
 * written inside the callback ran outside the transaction: a rollback did not
 * undo it, and `lock()` (FOR UPDATE) held nothing. Inside the callback,
 * getConnection() now returns the transaction's connection, so model queries
 * join it, and nothing outside the callback does.
 */

import { test, expect, describe, afterEach } from "bun:test";
import {
  Connection,
  getConnection,
  setConnection,
} from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";

class Post extends Model {}

/** A Connection over a fake driver client that tags each statement with where it ran. */
function taggedConnection() {
  const log = [];
  const result = () => Object.assign([], { count: 0 });
  const client = {
    begins: 0,
    unsafe: async (sql) => {
      log.push(["global", sql]);
      return result();
    },
    begin: async (fn) => {
      client.begins++;
      return fn({
        unsafe: async (sql) => {
          log.push(["tx", sql]);
          return result();
        },
      });
    },
  };
  const connection = new Connection({
    url: "postgres://u:p@localhost:5432/app",
  });
  connection._client = client;
  connection._connected = true;
  connection._adapter = "postgres";
  return { connection, log, client };
}

afterEach(() => setConnection(null));

describe("transactions", () => {
  test("model queries inside the callback run in the transaction", async () => {
    const { connection, log } = taggedConnection();
    setConnection(connection);

    await connection.transaction(async () => {
      await Post.where({ id: 1 }).all();
      await Post.where({ id: 1 }).updateAll({ title: "x" });
    });

    expect(log.map(([where]) => where)).toEqual(["tx", "tx"]);
  });

  test("model queries after the callback use the global connection again", async () => {
    const { connection, log } = taggedConnection();
    setConnection(connection);

    await connection.transaction(async () => {
      await Post.where({ id: 1 }).all();
    });
    await Post.where({ id: 2 }).all();

    expect(log.map(([where]) => where)).toEqual(["tx", "global"]);
    expect(getConnection()).toBe(connection);
  });

  test("a nested transaction() joins the open one", async () => {
    const { connection, log } = taggedConnection();
    setConnection(connection);

    await connection.transaction(async (tx) => {
      await tx.transaction(async () => {
        await Post.where({ id: 1 }).all();
      });
    });

    expect(log.map(([where]) => where)).toEqual(["tx"]);
  });

  test("connection.transaction() called inside a transaction joins it, not a second one", async () => {
    const { connection, log, client } = taggedConnection();
    setConnection(connection);

    await connection.transaction(async () => {
      await connection.transaction(async () => {
        await Post.where({ id: 1 }).updateAll({ title: "inner" });
      });
    });

    expect(client.begins).toBe(1);
    expect(log.map(([where]) => where)).toEqual(["tx"]);
  });

  test("two concurrent transactions each see their own connection", async () => {
    const { connection } = taggedConnection();
    setConnection(connection);
    const seen = [];

    await Promise.all(
      ["a", "b"].map((name) =>
        connection.transaction(async (tx) => {
          await Bun.sleep(name === "a" ? 20 : 5);
          seen.push([name, getConnection() === tx]);
        }),
      ),
    );

    expect(seen.sort()).toEqual([
      ["a", true],
      ["b", true],
    ]);
  });
});
