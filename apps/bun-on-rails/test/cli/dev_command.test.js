/**
 * brails dev / brails start - server command tests
 *
 * Proves the dev and start commands boot a real listening HTTP server (not a
 * banner), that the app-root resolution picks the bundled demo application,
 * and that the port resolution rules hold.
 */

import { test, expect, describe } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  devCommand,
  resolveAppRoot,
  resolvePort,
} from "../../src/cli/commands/dev.js";
import { startCommand } from "../../src/cli/commands/start.js";

describe("brails dev", () => {
  test("boots a listening server that answers unknown paths with a JSON 404", async () => {
    let app;

    try {
      app = await devCommand.run({ options: { port: 0 }, flags: {} });

      expect(app).toBeDefined();
      expect(app.server).toBeDefined();
      expect(app.running).toBe(true);
      expect(app.server.port).toBeGreaterThan(0);

      const response = await fetch(
        `http://localhost:${app.server.port}/no-such-route`,
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Not Found");
    } finally {
      if (app) {
        await app.stop();
      }
    }
  });

  test("answers a routed path with a JSON 404 in the development environment", async () => {
    // The demo's development environment configures `session.store = 'memory'`
    // (a store NAME, not a Map-like object). Booting in that environment proves
    // the session middleware can resolve a named store instead of blowing up
    // after the handler already produced its response.
    //
    // `/health` is routed (health#index) but has no controller, so the request
    // runs through the middleware stack and ends in a 404 - unlike an unknown
    // path, which is answered before the middleware stack is entered.
    const originalBunEnv = process.env.BUN_ENV;
    const originalNodeEnv = process.env.NODE_ENV;

    process.env.BUN_ENV = "development";
    delete process.env.NODE_ENV;

    let app;

    try {
      app = await devCommand.run({ options: { port: 0 }, flags: {} });

      expect(app.running).toBe(true);

      const response = await fetch(
        `http://localhost:${app.server.port}/health`,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not Found" });
    } finally {
      if (app) {
        await app.stop();
      }

      if (originalBunEnv === undefined) {
        delete process.env.BUN_ENV;
      } else {
        process.env.BUN_ENV = originalBunEnv;
      }

      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  test("resolveAppRoot picks demo/ when the working directory is not an app root", () => {
    const cwd = process.cwd();

    // Precondition: this repository is a framework repo, not an application.
    expect(existsSync(join(cwd, "config"))).toBe(false);
    expect(existsSync(join(cwd, "app"))).toBe(false);

    expect(resolveAppRoot(cwd)).toBe(resolve(join(cwd, "demo")));
  });

  test("resolveAppRoot picks the working directory when it holds config/", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "brails-app-root-"));

    try {
      mkdirSync(join(tempRoot, "config"));
      // A demo/ application inside the working directory: the demo fallback
      // must not win over the working directory itself.
      mkdirSync(join(tempRoot, "demo", "config"), { recursive: true });

      expect(resolveAppRoot(tempRoot)).toBe(resolve(tempRoot));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("resolveAppRoot picks the working directory when it holds app/", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "brails-app-root-"));

    try {
      mkdirSync(join(tempRoot, "app"));
      mkdirSync(join(tempRoot, "demo", "app"), { recursive: true });

      expect(resolveAppRoot(tempRoot)).toBe(resolve(tempRoot));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("resolvePort", () => {
  test("throws for a non-numeric port", () => {
    expect(() => resolvePort({ options: { port: "not-a-port" } })).toThrow(
      /Invalid port/,
    );
  });

  test("throws for a port outside the valid range", () => {
    expect(() => resolvePort({ options: { port: 70000 } })).toThrow(
      /Invalid port/,
    );
    expect(() => resolvePort({ options: { port: -1 } })).toThrow(
      /Invalid port/,
    );
  });

  test("falls back to the PORT environment variable", () => {
    const originalPort = process.env.PORT;

    try {
      process.env.PORT = "4321";

      expect(resolvePort({ options: {} })).toBe(4321);
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });

  test("gives the --port option precedence over PORT", () => {
    const originalPort = process.env.PORT;

    try {
      process.env.PORT = "4321";

      expect(resolvePort({ options: { port: "5555" } })).toBe(5555);
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });
});

describe("brails start", () => {
  test("boots a listening server that answers unknown paths with a JSON 404", async () => {
    let app;

    try {
      app = await startCommand.run({ options: { port: 0 }, flags: {} });

      expect(app).toBeDefined();
      expect(app.server).toBeDefined();
      expect(app.running).toBe(true);
      expect(app.server.port).toBeGreaterThan(0);

      const response = await fetch(
        `http://localhost:${app.server.port}/no-such-route`,
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Not Found");
    } finally {
      if (app) {
        await app.stop();
      }
    }
  });

  test("stops the server it started", async () => {
    const app = await startCommand.run({ options: { port: 0 }, flags: {} });

    expect(app.running).toBe(true);

    await app.stop();

    expect(app.running).toBe(false);
  });
});
