/**
 * The native Bun.sql driver path
 *
 * _connectBunSql called `Bun.sql({...})`. In Bun 1.2+ `Bun.sql` is the default
 * client itself, a tagged-template function, so calling it with an object
 * builds a query helper rather than a client, and the connection test
 * (`this._client\`SELECT 1\``) threw "SQLHelper is not a function". connect()
 * caught that and fell back to postgres.js every time, so the native driver
 * never ran. It also passed connectionTimeout in milliseconds where Bun.SQL
 * takes seconds. The client is now `new Bun.SQL(options)`.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Connection } from "../../src/database/connection.js";

const RealSQL = Bun.SQL;
afterEach(() => {
  Bun.SQL = RealSQL;
});

describe("Connection#connect with Bun.SQL available", () => {
  test("constructs a Bun.SQL client, probes it, and uses the native adapter", async () => {
    const constructed = [];
    const probes = [];
    Bun.SQL = class FakeSQL {
      constructor(options) {
        constructed.push(options);
      }
      async unsafe(sql) {
        probes.push(sql);
        return Object.assign([{ "?column?": 1 }], { count: 1 });
      }
    };

    const warn = console.warn;
    const warnings = [];
    console.warn = (...a) => warnings.push(a.join(" "));
    try {
      const connection = new Connection({
        url: "postgres://app:secret@db.example.com:5433/app",
        pool: { max: 7, idleTimeout: 12, connectTimeout: 4 },
      });
      await connection.connect();
      expect(connection.adapter ?? connection._adapter).toBe("bun");
    } finally {
      console.warn = warn;
    }

    expect(warnings).toEqual([]);
    expect(constructed).toHaveLength(1);
    expect(constructed[0]).toMatchObject({
      url: "postgres://app:secret@db.example.com:5433/app",
      max: 7,
      idleTimeout: 12,
      connectionTimeout: 4, // seconds, as Bun.SQL takes them (was 4000)
      tls: false,
    });
    expect(probes).toEqual(["SELECT 1"]);
  });
});
