/**
 * save() and destroy() throw what they do not handle (plan 106 O1)
 *
 * Both caught every exception and returned false with the message in
 * record.errors.base: a unique violation lost its SQLSTATE, a TypeError in a
 * callback read like a validation failure, and inside connection.transaction()
 * the caller carried on in a transaction PostgreSQL had already aborted. Now
 * they return false only for what they handle (a failed validation, a before
 * callback that returns false), and anything else is thrown: a DatabaseError
 * keeps its code, a callback's error comes back unchanged.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Model } from "../../src/database/model.js";
import { setConnection, DatabaseError } from "../../src/database/connection.js";

class Account extends Model {
  static tableName = "accounts";
  static validations = { email: { presence: true } };
}

/** A connection whose next statement fails with a SQLSTATE. */
function failingConnection(code, message) {
  setConnection({
    connected: true,
    query: async (sql, params) => {
      throw new DatabaseError(`Query failed: ${message}`, {
        code,
        query: sql,
        params,
      });
    },
  });
}

afterEach(() => setConnection(null));

describe("save() and destroy() throw what they do not handle", () => {
  test("a database error on insert is thrown with its SQLSTATE", async () => {
    failingConnection(
      "23505",
      "duplicate key value violates unique constraint",
    );
    const account = new Account({ email: "a@example.com" });

    const caught = await account.save().catch((error) => error);

    expect(caught).toBeInstanceOf(DatabaseError);
    expect(caught.code).toBe("23505");
    expect(account.persisted).toBe(false);
    expect(account.errors).toEqual({});
  });

  test("Model.create throws it too", async () => {
    failingConnection("23503", "violates foreign key constraint");
    await expect(Account.create({ email: "a@example.com" })).rejects.toThrow(
      "violates foreign key constraint",
    );
  });

  test("a database error on destroy is thrown", async () => {
    failingConnection("23503", "still referenced");
    const account = new Account({ id: 1, email: "a@example.com" });
    account.persisted = true;

    await expect(account.destroy()).rejects.toThrow("still referenced");
  });

  test("an error a callback throws comes back unchanged", async () => {
    const bug = new TypeError(
      "Cannot read properties of undefined (reading 'trim')",
    );
    class Normalized extends Model {
      static tableName = "normalized";
      beforeSave() {
        throw bug;
      }
    }

    expect(await new Normalized({}).save().catch((e) => e)).toBe(bug);
  });

  test("a static callback naming a missing method throws, naming it", async () => {
    class Misnamed extends Model {
      static tableName = "misnamed";
      static callbacks = { beforeSave: ["normalizeEmial"] };
    }

    await expect(new Misnamed({}).save()).rejects.toThrow("normalizeEmial");
  });
});

describe("false stays for what save() handles", () => {
  test("a failed validation returns false with the errors", async () => {
    const account = new Account({});
    expect(await account.save()).toBe(false);
    expect(account.errors.email).toBe("email can't be blank");
  });

  test("a before callback that returns false halts the save", async () => {
    class Guarded extends Model {
      static tableName = "guarded";
      beforeSave() {
        this.errors.base = "locked";
        return false;
      }
    }
    const record = new Guarded({});
    expect(await record.save()).toBe(false);
    expect(record.errors.base).toBe("locked");
  });
});
