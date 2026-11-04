/**
 * Session store resolution
 *
 * The framework must never silently swap a configured session store it does
 * not implement for a private in-memory Map. An in-memory store lives in one
 * process, so requests routed to another server process lose the session -
 * and the login state it carries - even though the app looks healthy.
 *
 * An unimplemented store must therefore be rejected while the application
 * starts, not swallowed at request time.
 */

import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Middleware } from "../../src/controller/middleware.js";
import { Application } from "../../src/application.js";

describe("session store resolution", () => {
  test("rejects the unimplemented 'redis' store instead of falling back to memory", () => {
    expect(() => Middleware.session({ store: "redis" })).toThrow(
      /session store 'redis' is not implemented/i,
    );
  });

  test("rejects an unknown named store instead of falling back to memory", () => {
    expect(() => Middleware.session({ store: "memcached" })).toThrow(
      /unknown session store 'memcached'/i,
    );
  });

  test("accepts the 'memory' store", () => {
    expect(() => Middleware.session({ store: "memory" })).not.toThrow();
  });

  test("rejects a store object that does not implement the Map-like API", () => {
    expect(() =>
      Middleware.session({ store: { get: () => undefined } }),
    ).toThrow(/invalid session store object/i);
  });

  test("refuses to start an application configured with the 'redis' session store", async () => {
    const root = mkdtempSync(join(tmpdir(), "brails-session-store-"));

    try {
      mkdirSync(join(root, "config"));
      writeFileSync(
        join(root, "config", "session.js"),
        "export default { store: 'redis' }\n",
      );

      const app = new Application({ root });

      await expect(app.initialize()).rejects.toThrow(
        /session store 'redis' is not implemented/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
