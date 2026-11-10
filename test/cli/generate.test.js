/**
 * brails generate migration | model | controller
 *
 * `brails generate` exited 1 as not implemented. It now writes migrations,
 * models (with their create-table migration) and controllers, never
 * overwrites a file, and still refuses the generators that do not exist yet
 * (scaffold, auth, ...). The generated migration is run through
 * `brails db:migrate`'s code against a stubbed driver, so it is real code.
 */

import { test, expect, describe, afterEach, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { generate } from "../../src/cli/commands/generate.js";
import { migrate } from "../../src/cli/commands/db.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");
const RealSQL = Bun.SQL;
const work = mkdtempSync(join(tmpdir(), "generate-"));
const NOW = new Date("2026-01-02T03:04:05Z"); // version 20260102030405
afterEach(() => {
  Bun.SQL = RealSQL;
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

function app(name) {
  const root = join(work, name);
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "database.js"),
    "export default { url: 'postgres://u:p@localhost:5432/app' }\n",
  );
  // the generated model imports 'bun-on-rails': resolve it to this checkout
  mkdirSync(join(root, "node_modules"), { recursive: true });
  return root;
}

const read = (root, rel) => readFileSync(join(root, rel), "utf8");

describe("generate migration", () => {
  test("Create<Table> writes a createTable migration with the fields and timestamps", () => {
    const root = app("migration-create");
    expect(
      generate(
        root,
        "migration",
        "CreateTags",
        ["name:string", "count:integer"],
        { now: NOW },
      ),
    ).toEqual(["db/migrations/20260102030405_create_tags.js"]);
    const code = read(root, "db/migrations/20260102030405_create_tags.js");
    expect(code).toContain("await db.createTable('tags', (t) => {");
    expect(code).toContain("t.string('name')");
    expect(code).toContain("t.integer('count')");
    expect(code).toContain("t.timestamps()");
    expect(code).toContain("await db.dropTable('tags')");
  });

  test("any other name writes an empty up/down to fill in", () => {
    const root = app("migration-other");
    const [file] = generate(root, "migration", "AddSlugToPosts", [], {
      now: NOW,
    });
    expect(file).toBe("db/migrations/20260102030405_add_slug_to_posts.js");
    expect(read(root, file)).toContain("export async function up(db) {");
  });

  test("two migrations generated in the same second get different versions", () => {
    const root = app("migration-same-second");
    const [a] = generate(root, "migration", "CreateTags", [], { now: NOW });
    const [b] = generate(root, "migration", "CreateLabels", [], { now: NOW });
    expect(a.split("/").pop().split("_")[0]).toBe("20260102030405");
    expect(b.split("/").pop().split("_")[0]).toBe("20260102030406");
  });

  test("an unknown column type is refused", () => {
    expect(() =>
      generate(
        app("migration-bad"),
        "migration",
        "CreateTags",
        ["price:money"],
        { now: NOW },
      ),
    ).toThrow(/Unknown column type "money"/);
  });
});

describe("generate model", () => {
  test("writes the model, with belongsTo for references, and its create migration", () => {
    const root = app("model");
    expect(
      generate(root, "model", "BlogPost", ["title:string", "user:references"], {
        now: NOW,
      }),
    ).toEqual([
      "app/models/blog_post.js",
      "db/migrations/20260102030405_create_blog_posts.js",
    ]);
    const model = read(root, "app/models/blog_post.js");
    expect(model).toContain("import { Model } from 'bun-on-rails'");
    expect(model).toContain("export default class BlogPost extends Model");
    expect(model).toContain("static associations = { belongsTo: ['user'] }");
    const migration = read(
      root,
      "db/migrations/20260102030405_create_blog_posts.js",
    );
    expect(migration).toContain("db.createTable('blog_posts'");
    expect(migration).toContain("t.references('user')");
  });

  test("the generated migration runs: db:migrate creates the table with its columns", async () => {
    const root = app("model-runs");
    generate(root, "model", "Widget", ["name:string", "price:decimal"], {
      now: NOW,
    });
    const log = [];
    Bun.SQL = class FakeSQL {
      async unsafe(sql) {
        log.push(sql.trim().replace(/\s+/g, " "));
        return Object.assign([], { count: 0 });
      }
      async close() {}
    };
    expect(await migrate(root)).toEqual(["20260102030405"]);
    const create = log.find((sql) => sql.startsWith('CREATE TABLE "widgets"'));
    expect(create).toBeDefined();
    expect(create).toContain('"name"');
    expect(create).toContain('"price"');
    expect(create).toContain('"created_at"');
  });

  test("a model name must be singular PascalCase", () => {
    expect(() =>
      generate(app("model-bad"), "model", "widgets", [], { now: NOW }),
    ).toThrow(/PascalCase/);
  });
});

describe("generate controller", () => {
  test("writes a controller with an action per name", () => {
    const root = app("controller");
    expect(generate(root, "controller", "Posts", ["index", "show"])).toEqual([
      "app/controllers/posts_controller.js",
    ]);
    const code = read(root, "app/controllers/posts_controller.js");
    expect(code).toContain(
      "export default class PostsController extends Controller",
    );
    expect(code).toContain("  index() {");
    expect(code).toContain("  show() {");
  });

  test("a namespaced name goes in a subdirectory", () => {
    const root = app("controller-ns");
    expect(generate(root, "controller", "Admin::Users", ["index"])).toEqual([
      "app/controllers/admin/users_controller.js",
    ]);
    expect(read(root, "app/controllers/admin/users_controller.js")).toContain(
      "class UsersController",
    );
  });
});

describe("refusals", () => {
  test("an existing file is never overwritten", () => {
    const root = app("exists");
    generate(root, "controller", "Posts", ["index"]);
    expect(() => generate(root, "controller", "Posts", ["show"])).toThrow(
      /already exists; not overwriting/,
    );
    expect(read(root, "app/controllers/posts_controller.js")).toContain(
      "index()",
    );
  });

  test("generators that do not exist yet say so", () => {
    expect(() => generate(app("scaffold"), "scaffold", "Post", [])).toThrow(
      /brails generate scaffold is not implemented yet\. Available: migration, model, controller/,
    );
  });
});

describe("the CLI", () => {
  test("brails g model prints what it created", () => {
    const root = app("cli");
    const r = spawnSync(
      process.execPath,
      [cli, "g", "model", "Gadget", "name:string"],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("create  app/models/gadget.js");
    expect(r.stdout).toMatch(
      /create {2}db\/migrations\/\d{14}_create_gadgets\.js/,
    );
    expect(existsSync(join(root, "app", "models", "gadget.js"))).toBe(true);
    expect(readdirSync(join(root, "db", "migrations"))).toHaveLength(1);
  });
});
