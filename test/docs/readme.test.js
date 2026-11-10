/**
 * README guard
 *
 * The README used to promise commands that did not exist (`brails setup`,
 * `brails g auth`, `brails db:migrate` as working steps), had no install
 * step, and showed code calling stubs. bin/qa-release runs its Quick Start
 * verbatim in a clean container; these tests catch the same drift on every
 * `bun test`:
 *
 * - the Quick Start installs this package by its real name;
 * - every `brails ...` line in a bash block is an implemented command
 *   (planned commands may be named in prose, never as steps to run);
 * - the example code, written over a fresh `brails new` app, answers as the
 *   README says.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { commands } from "../../src/cli/commands/index.js";
import { bootGuideApp, repoRoot } from "./support/guide_app.js";

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const bashLines = [...readme.matchAll(/^```bash\n([\s\S]*?)^```$/gm)]
  .flatMap(([, body]) => body.split("\n"))
  .map((line) => line.replace(/\s#.*$/, "").trim())
  .filter(Boolean);

describe("README commands", () => {
  test("the Quick Start installs this package by its package.json name", () => {
    const quickStart = readme.split(/^## Quick Start$/m)[1];
    const firstBlock = quickStart.match(/^```bash\n([\s\S]*?)^```$/m)[1];
    expect(firstBlock.split("\n")[0]).toBe(`bun add -g ${pkg.name}`);
  });

  test("every brails command shown as a step is implemented", () => {
    const steps = bashLines.filter((line) => line.startsWith("brails "));
    expect(steps.length).toBeGreaterThan(0);
    for (const line of steps) {
      const name = line.split(/\s+/)[1];
      expect({
        line,
        registered: name in commands,
        implemented: commands[name]?.implemented !== false,
      }).toEqual({
        line,
        registered: true,
        implemented: true,
      });
    }
  });
});

describe("README example", () => {
  let guide;

  beforeAll(async () => {
    guide = await bootGuideApp("README.md");
  });

  afterAll(async () => {
    await guide?.close();
  });

  test("shows complete files", () => {
    expect([...guide.files].sort()).toEqual([
      "app/controllers/posts_controller.js",
      "config/routes.js",
    ]);
  });

  test("answers as the README says", async () => {
    expect(await guide.call("GET", "/posts")).toMatchObject({
      status: 200,
      json: { posts: [{ id: "1", title: "Hello, BunOnRails" }] },
    });
    expect(await guide.call("GET", "/posts/1")).toMatchObject({
      status: 200,
      json: { post: { id: "1" } },
    });
    expect((await guide.call("GET", "/posts/9")).status).toBe(404);
    expect((await guide.call("GET", "/")).status).toBe(200);
  });
});
