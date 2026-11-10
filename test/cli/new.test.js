/**
 * brails new guard
 *
 * `brails new myapp` used to print "Application created successfully!", exit
 * 0, and create nothing (every step was a TODO), so the README Quick Start
 * failed at its next line, `cd myapp`. These tests generate an app into a
 * temp dir and boot it: `GET /` and `GET /health` must answer 200 with no
 * database and no Redis.
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
  statSync,
  symlinkSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Application } from "../../src/application.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const work = mkdtempSync(join(tmpdir(), "brails-new-"));

afterAll(() => rmSync(work, { recursive: true, force: true }));

function brails(cwd, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function filesUnder(dir, prefix = "") {
  return readdirSync(dir).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(join(dir, name)).isDirectory()
      ? filesUnder(join(dir, name), rel)
      : [rel];
  });
}

describe("brails new <name> --skip-install", () => {
  const r = brails(work, "new", "blog", "--skip-install");
  const app = join(work, "blog");

  test("exits 0 and creates the app directory", () => {
    expect(r.code).toBe(0);
    expect(existsSync(app)).toBe(true);
  });

  test("writes the skeleton, dotfiles included", () => {
    expect(filesUnder(app).sort()).toEqual(
      [
        ".env.example",
        ".gitignore",
        "README.md",
        "app/controllers/health_controller.js",
        "app/controllers/home_controller.js",
        "config/database.js",
        "config/routes.js",
        "package.json",
      ].sort(),
    );
  });

  test("package.json depends on this framework at its own version", () => {
    const appPkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
    expect(appPkg.name).toBe("blog");
    expect(appPkg.type).toBe("module");
    expect(appPkg.private).toBe(true);
    expect(appPkg.dependencies).toEqual({ [pkg.name]: `^${pkg.version}` });
  });

  test("no template placeholder survives", () => {
    for (const file of filesUnder(app)) {
      expect({
        file,
        text: readFileSync(join(app, file), "utf8"),
      }).not.toMatchObject({
        text: expect.stringMatching(/\{\{[A-Z_]+\}\}/),
      });
    }
  });

  test(".env.example names variables and holds no values", () => {
    for (const line of readFileSync(join(app, ".env.example"), "utf8").split(
      "\n",
    )) {
      if (line.trim() === "" || line.startsWith("#")) continue;
      expect(line).toMatch(/^[A-Z_]+=$/);
    }
  });

  test("prints only what it did, plus the next steps", () => {
    expect(r.stdout).toContain("cd blog");
    expect(r.stdout).toContain("brails dev");
    expect(r.stdout).not.toContain("brails setup");
    expect(r.stdout).not.toMatch(/docker|git repository/i);
  });

  test("the generated app boots with no database and answers / and /health", async () => {
    // Stand in for `bun install`: resolve the framework import to this checkout.
    mkdirSync(join(app, "node_modules"), { recursive: true });
    symlinkSync(repoRoot, join(app, "node_modules", pkg.name), "dir");

    // The skeleton connects when DATABASE_URL is set; this test is about booting without one.
    const savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const application = new Application({ root: app });
    try {
      await application.initialize();
    } finally {
      if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    }
    await application.start({ port: 0, hostname: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${application.server.port}`;
      const home = await fetch(`${base}/`);
      expect(home.status).toBe(200);
      expect(await home.json()).toMatchObject({ app: "blog" });
      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok" });
    } finally {
      await application.stop();
    }
  });
});

describe("brails new refuses", () => {
  test("a missing name", () => {
    const r = brails(work, "new");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("brails new <app-name>");
  });

  test("an invalid name", () => {
    for (const name of ["My App", "1app", "../escape", "Blog"]) {
      const r = brails(work, "new", name, "--skip-install");
      expect({ name, code: r.code }).toEqual({ name, code: 1 });
      expect(r.stderr).toContain("lowercase");
    }
  });

  test("an existing directory, and leaves it untouched", () => {
    mkdirSync(join(work, "taken"));
    const r = brails(work, "new", "taken", "--skip-install");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("already exists");
    expect(readdirSync(join(work, "taken"))).toEqual([]);
  });
});

describe("brails help new", () => {
  test("documents only the options new actually has", () => {
    const out = brails(work, "help", "new").stdout;
    expect(out).toContain("--skip-install");
    expect(out).not.toMatch(
      /--database|--skip-git|--skip-docker|--api|mysql|sqlite/,
    );
  });
});
