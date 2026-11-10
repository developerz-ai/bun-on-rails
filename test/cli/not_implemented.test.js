/**
 * Unimplemented-command guard
 *
 * Registered `brails` commands whose implementation has not landed used to
 * print the output of work they never did, then exit 0: `brails db:migrate`
 * printed "Migrations complete.", `brails routes` printed made-up routes,
 * `brails console` claimed "Models loaded: User, Post, Comment", and
 * `brails test` printed "Tests complete." without running a test. Each now
 * fails loudly: exit 1, the error on stderr, nothing on stdout.
 *
 * The registry rule makes the next stub declare itself: a command is either in
 * the implemented set below or built by notImplemented().
 */

import { test, expect, describe } from "bun:test";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { commands } from "../../src/cli/commands/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");

function brails(...args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// `new` / `create` is still a stub; plan 101 task T3 implements it.
const IMPLEMENTED = new Set(["new", "create", "dev", "server", "s", "start"]);

const UNIMPLEMENTED_INVOCATIONS = [
  ["generate", "model", "User"],
  ["g", "scaffold", "Post", "title:string"],
  ["db:create"],
  ["db:drop"],
  ["db:migrate"],
  ["db:rollback"],
  ["db:reset"],
  ["db:seed"],
  ["db:setup"],
  ["db:schema:load"],
  ["db:schema:dump"],
  ["db", "migrate"],
  ["console"],
  ["c"],
  ["routes"],
  ["test"],
  ["t"],
  ["credentials"],
  ["credentials:edit"],
];

describe("unimplemented commands fail loudly", () => {
  for (const args of UNIMPLEMENTED_INVOCATIONS) {
    test(`brails ${args.join(" ")} exits 1 and claims nothing`, () => {
      const r = brails(...args);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(`brails ${args[0]} is not implemented yet`);
      expect(r.stdout).toBe("");
    });
  }

  test("brails test points at bun test", () => {
    expect(brails("test").stderr).toContain("bun test");
  });
});

describe("registry", () => {
  test("every command is implemented or declares itself unimplemented", () => {
    for (const [name, command] of Object.entries(commands)) {
      if (IMPLEMENTED.has(name)) continue;
      expect({ name, implemented: command.implemented }).toEqual({
        name,
        implemented: false,
      });
    }
  });
});

describe("help", () => {
  test("brails help lists unimplemented commands only under Planned", () => {
    const out = brails("help").stdout;
    const [available, planned] = out.split(/^Planned\b.*$/m);
    expect(planned).toBeDefined();
    for (const name of [
      "generate",
      "db",
      "console",
      "routes",
      "test",
      "credentials",
    ]) {
      expect(planned).toMatch(new RegExp(`^  ${name}\\b`, "m"));
      expect(available).not.toMatch(new RegExp(`^  ${name}\\b`, "m"));
    }
    expect(out).not.toContain("brails generate scaffold");
    expect(out).not.toContain("brails db:migrate");
  });

  test("brails help <unimplemented> says it is not implemented yet", () => {
    for (const name of ["generate", "db", "console"]) {
      expect(brails("help", name).stdout).toContain(
        `brails ${name} is not implemented yet`,
      );
    }
  });
});
