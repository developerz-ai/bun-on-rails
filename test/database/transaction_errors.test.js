/**
 * What connection.transaction() throws (plan 105 S3)
 *
 * It wrapped every error the callback threw in DatabaseError("Transaction
 * failed: ..."), dropping the original: a RecordNotFoundError, a validation
 * error or a failing test assertion came back as a DatabaseError with only
 * its message. Now, once the driver has rolled back, the callback's own error
 * comes back unchanged (as Rails re-raises it). A statement that fails inside
 * the callback is a DatabaseError naming the query, as outside a transaction,
 * and a failure of the transaction itself (BEGIN, COMMIT) is still
 * DatabaseError("Transaction failed: ...").
 */

import { test, expect, describe } from "bun:test";
import { Connection, DatabaseError } from "../../src/database/connection.js";

/** A Connection over a fake client whose begin() rolls back on a throw, as both drivers do. */
function fakeConnection({ failingStatement, beginFails } = {}) {
  const events = [];
  const client = {
    begin: async (fn) => {
      if (beginFails) throw beginFails;
      events.push("BEGIN");
      try {
        const result = await fn({
          unsafe: async (sql) => {
            if (failingStatement) throw failingStatement;
            events.push(sql);
            return Object.assign([], { count: 0 });
          },
        });
        events.push("COMMIT");
        return result;
      } catch (error) {
        events.push("ROLLBACK");
        throw error; // the driver rethrows the same error after rolling back
      }
    },
  };
  const connection = new Connection({
    url: "postgres://u:p@localhost:5432/app",
  });
  connection._client = client;
  connection._connected = true;
  connection._adapter = "postgres";
  return { connection, events };
}

class RecordNotFound extends Error {}

describe("connection.transaction() errors", () => {
  test("the callback's own error comes back unchanged, after a rollback", async () => {
    const { connection, events } = fakeConnection();
    const thrown = new RecordNotFound("Post 7 not found");

    const caught = await connection
      .transaction(async (tx) => {
        await tx.query("UPDATE posts SET title = 'x'");
        throw thrown;
      })
      .catch((error) => error);

    expect(caught).toBe(thrown);
    expect(events).toEqual([
      "BEGIN",
      "UPDATE posts SET title = 'x'",
      "ROLLBACK",
    ]);
  });

  test("a statement failing inside the callback is a DatabaseError naming the query", async () => {
    const driverError = Object.assign(new Error("duplicate key value"), {
      errno: "23505",
    });
    const { connection, events } = fakeConnection({
      failingStatement: driverError,
    });

    const caught = await connection
      .transaction((tx) =>
        tx.query("INSERT INTO posts (slug) VALUES ($1)", ["a"]),
      )
      .catch((error) => error);

    expect(caught).toBeInstanceOf(DatabaseError);
    expect(caught.message).toBe("Query failed: duplicate key value");
    expect(caught.code).toBe("23505");
    expect(caught.query).toBe("INSERT INTO posts (slug) VALUES ($1)");
    expect(events).toEqual(["BEGIN", "ROLLBACK"]);
  });

  test("a failure of the transaction itself is DatabaseError('Transaction failed: ...')", async () => {
    const { connection } = fakeConnection({
      beginFails: Object.assign(new Error("connection reset"), {
        errno: "08006",
      }),
    });

    const caught = await connection
      .transaction(async () => {})
      .catch((error) => error);

    expect(caught).toBeInstanceOf(DatabaseError);
    expect(caught.message).toBe("Transaction failed: connection reset");
    expect(caught.code).toBe("08006");
  });

  test("a committed transaction returns the callback's value", async () => {
    const { connection, events } = fakeConnection();
    expect(await connection.transaction(async () => 42)).toBe(42);
    expect(events).toEqual(["BEGIN", "COMMIT"]);
  });
});
