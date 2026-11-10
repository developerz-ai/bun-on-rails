/**
 * brails routes
 *
 * `brails routes` exited 1 as not implemented. It now loads
 * config/routes.js into a Router (no server, no database) and prints the
 * routes in match order: verb, path, controller#action and name. A filter
 * argument keeps rows whose path or controller#action contains it.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { formatRoutes, listRoutes } from "../../src/cli/commands/routes.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");
const work = mkdtempSync(join(tmpdir(), "routes-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function app(name, routes) {
  const root = join(work, name);
  mkdirSync(join(root, "config"), { recursive: true });
  if (routes !== null) writeFileSync(join(root, "config", "routes.js"), routes);
  return root;
}

const ROUTES = `export default (router) => {
  router.root('home#index')
  router.get('/health', 'health#index', { as: 'health' })
  router.resources('posts', { only: ['index', 'show'] })
  router.namespace('admin', () => {
    router.resources('users', { only: ['index'] })
  })
}
`;

function brails(cwd, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("listRoutes()", () => {
  test("returns the routes in match order", async () => {
    expect(await listRoutes(app("list", ROUTES))).toEqual([
      { method: "GET", path: "/", target: "home#index", name: "" },
      {
        method: "GET",
        path: "/health",
        target: "health#index",
        name: "health",
      },
      { method: "GET", path: "/posts", target: "posts#index", name: "" },
      { method: "GET", path: "/posts/:id", target: "posts#show", name: "" },
      {
        method: "GET",
        path: "/admin/users",
        target: "admin/users#index",
        name: "",
      },
    ]);
  });

  test("without config/routes.js it says so", async () => {
    await expect(listRoutes(app("none", null))).rejects.toThrow(
      /config\/routes\.js not found/,
    );
  });
});

describe("formatRoutes()", () => {
  test("aligns the columns under a header", () => {
    const out = formatRoutes([
      { method: "GET", path: "/", target: "home#index", name: "" },
      {
        method: "DELETE",
        path: "/posts/:id",
        target: "posts#destroy",
        name: "post",
      },
    ]);
    expect(out.split("\n")).toEqual([
      "Verb    Path        Controller#Action  Name",
      "GET     /           home#index",
      "DELETE  /posts/:id  posts#destroy      post",
    ]);
  });
});

describe("the CLI", () => {
  test("brails routes prints the table and exits 0", () => {
    const r = brails(app("cli", ROUTES), "routes");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Controller#Action");
    expect(r.stdout).toMatch(/GET\s+\/posts\/:id\s+posts#show/);
    expect(r.stdout).toMatch(/GET\s+\/admin\/users\s+admin\/users#index/);
  });

  test("brails routes <filter> keeps matching rows only", () => {
    const r = brails(app("cli-filter", ROUTES), "routes", "admin");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("admin/users#index");
    expect(r.stdout).not.toContain("posts#show");
  });
});
