/**
 * brails generate scaffold (plan 107 G1)
 *
 * `brails g scaffold Post title:string body:text user:references` exited as not
 * implemented. It now writes the model (registered) and its create migration,
 * a JSON controller with the five resource actions and a field whitelist, a
 * request test, and `router.resources('posts')` in config/routes.js. It
 * checks every target first, so a conflict writes nothing.
 *
 * The end-to-end case runs only when TEST_DATABASE_URL names a PostgreSQL
 * server: it makes an app with `brails new`, scaffolds into it, and runs the
 * app's own generated test with `bun test` against a database of its own.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { generate } from "../../src/cli/commands/generate.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");
const work = mkdtempSync(join(tmpdir(), "scaffold-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const ROUTES = `/**
 * Routes: each maps a path to \`controller#action\`.
 */

export default (router) => {
  router.root('home#index')
  router.get('/health', 'health#index')
}
`;

let count = 0;
function app(routes = ROUTES) {
  const root = join(work, `app${++count}`);
  mkdirSync(join(root, "config"), { recursive: true });
  if (routes !== null) writeFileSync(join(root, "config", "routes.js"), routes);
  return root;
}
const read = (root, file) => readFileSync(join(root, file), "utf8");
const now = new Date("2026-01-02T03:04:05Z");

describe("brails generate scaffold", () => {
  test("writes the model, migration, controller and test, and adds the route", () => {
    const root = app();
    const created = generate(
      root,
      "scaffold",
      "Post",
      ["title:string", "body:text", "user:references"],
      { now },
    );

    expect(created).toEqual([
      "app/models/post.js",
      "db/migrations/20260102030405_create_posts.js",
      "app/controllers/posts_controller.js",
      "test/controllers/posts_controller.test.js",
      "config/routes.js",
    ]);
    expect(read(root, "app/models/post.js")).toContain("Post.register()");
    expect(read(root, "config/routes.js")).toContain(
      "  router.get('/health', 'health#index')\n  router.resources('posts')\n}\n",
    );

    const controller = read(root, "app/controllers/posts_controller.js");
    expect(controller).toContain("import Post from '../models/post.js'");
    expect(controller).toContain(".permit('title', 'body', 'user_id')");
    for (const action of ["index", "show", "create", "update", "destroy"]) {
      expect(controller).toContain(`  async ${action}() {`);
    }
  });

  test("the generated test creates a record only when no field references another table", () => {
    const withReference = app();
    generate(
      withReference,
      "scaffold",
      "Post",
      ["title:string", "user:references"],
      { now },
    );
    expect(
      read(withReference, "test/controllers/posts_controller.test.js"),
    ).not.toContain("POST /posts");

    const plain = app();
    generate(
      plain,
      "scaffold",
      "Note",
      ["title:string", "pinned:boolean", "views:integer"],
      { now },
    );
    const generatedTest = read(
      plain,
      "test/controllers/notes_controller.test.js",
    );
    expect(generatedTest).toContain("POST /notes");
    expect(generatedTest).toContain(
      'note: { title: "Title", pinned: true, views: 1 }',
    );
  });

  test("a route already there is not added twice", () => {
    const root = app(
      ROUTES.replace(
        "router.get('/health'",
        "router.resources('posts')\n  router.get('/health'",
      ),
    );
    const created = generate(root, "scaffold", "Post", ["title:string"], {
      now,
    });
    expect(created).not.toContain("config/routes.js");
    expect(
      read(root, "config/routes.js").match(/resources\('posts'\)/g),
    ).toHaveLength(1);
  });

  test("a commented-out route does not count: the route is added", () => {
    const root = app(
      ROUTES.replace(
        "router.get('/health'",
        "// router.resources('posts')\n  router.get('/health'",
      ),
    );
    const created = generate(root, "scaffold", "Post", ["title:string"], {
      now,
    });
    expect(created).toContain("config/routes.js");
    expect(read(root, "config/routes.js")).toContain(
      "  router.get('/health', 'health#index')\n  router.resources('posts')\n}\n",
    );
  });

  test("a name the controller imports from the framework is refused before writing", () => {
    for (const name of ["Controller", "StrongParams"]) {
      const root = app();
      expect(() =>
        generate(root, "scaffold", name, ["title:string"], { now }),
      ).toThrow(
        `"${name}" is imported by the generated controller; choose another name`,
      );
      expect(existsSync(join(root, "app"))).toBe(false);
    }
  });

  test("a conflict writes nothing: an existing controller", () => {
    const root = app();
    mkdirSync(join(root, "app", "controllers"), { recursive: true });
    writeFileSync(
      join(root, "app", "controllers", "posts_controller.js"),
      "// mine\n",
    );

    expect(() =>
      generate(root, "scaffold", "Post", ["title:string"], { now }),
    ).toThrow(
      "app/controllers/posts_controller.js already exists; not overwriting it",
    );
    expect(existsSync(join(root, "app", "models", "post.js"))).toBe(false);
    expect(read(root, "config/routes.js")).toBe(ROUTES);
  });

  test("a routes file it cannot extend writes nothing, naming the line to add", () => {
    const root = app("module.exports = function () {}\n");
    expect(() =>
      generate(root, "scaffold", "Post", ["title:string"], { now }),
    ).toThrow(
      "config/routes.js does not end with the closing brace of `export default (router) => { ... }`; add router.resources('posts') yourself",
    );
    expect(existsSync(join(root, "app"))).toBe(false);
  });
});

const serverUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!serverUrl)(
  "a scaffold in a new app passes its own test on PostgreSQL",
  () => {
    test("brails new, brails g scaffold, bun test", async () => {
      const run = (cwd, ...args) =>
        spawnSync(process.execPath, args, {
          cwd,
          encoding: "utf8",
          env: { ...process.env },
        });
      const made = run(work, cli, "new", "blog", "--skip-install");
      expect(made.status).toBe(0);
      const root = join(work, "blog");
      mkdirSync(join(root, "node_modules"), { recursive: true });
      symlinkSync(repoRoot, join(root, "node_modules", "bun-on-rails"), "dir");

      const scaffold = run(
        root,
        cli,
        "g",
        "scaffold",
        "Note",
        "title:string",
        "pinned:boolean",
      );
      expect(scaffold.status).toBe(0);
      expect(readdirSync(join(root, "db", "migrations"))).toHaveLength(1);

      const url = new URL(serverUrl);
      url.pathname = `/bor_scaffold_${process.pid}_${Date.now()}`;
      const env = { ...process.env, DATABASE_URL: url.toString() };
      const admin = (sql) =>
        spawnSync(
          process.execPath,
          [
            "-e",
            `const s = new Bun.SQL(${JSON.stringify(serverUrl)}); await s.unsafe(${JSON.stringify(sql)}); await s.close()`,
          ],
          { encoding: "utf8" },
        );
      expect(admin(`CREATE DATABASE "${url.pathname.slice(1)}"`).status).toBe(
        0,
      );
      try {
        const tests = spawnSync(process.execPath, ["test"], {
          cwd: root,
          encoding: "utf8",
          env,
        });
        const out = `${tests.stdout}${tests.stderr}`;
        expect(out).toContain(" 0 fail");
        expect(tests.status).toBe(0);
      } finally {
        admin(
          `DROP DATABASE IF EXISTS "${url.pathname.slice(1)}" WITH (FORCE)`,
        );
      }
    }, 60_000);
  },
);
