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

const IMPLEMENTED = new Set([
  "new",
  "create",
  "dev",
  "server",
  "s",
  "start",
  "db",
  "db:migrate",
  "db:rollback",
  "db:schema:dump",
  "db:schema:load",
  "db:seed",
  "db:create",
  "db:drop",
  "db:reset",
  "db:setup",
]);

const UNIMPLEMENTED_INVOCATIONS = [
  ["generate", "model", "User"],
  ["g", "scaffold", "Post", "title:string"],
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
      const name = args[0] === "db" ? `db:${args[1]}` : args[0];
      expect(r.stderr).toContain(`brails ${name} is not implemented yet`);
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
    const [available, rest] = out.split(/^Planned\b.*$/m);
    const planned = rest?.split(/^Options:/m)[0];
    expect(planned).toBeDefined();
    for (const name of [
      "generate",
      "console",
      "routes",
      "test",
      "credentials",
    ]) {
      expect(planned).toMatch(new RegExp(`^  .*\\b${name}\\b`, "m"));
      expect(available).not.toMatch(new RegExp(`^  .*\\b${name}\\b`, "m"));
    }
    for (const name of [
      "db:migrate",
      "db:rollback",
      "db:schema:dump",
      "db:schema:load",
      "db:seed",
      "db:create",
      "db:drop",
      "db:setup",
      "db:reset",
    ]) {
      expect(available).toMatch(new RegExp(`^  ${name}\\b`, "m"));
      expect(planned).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(out).not.toContain("brails generate scaffold");
  });

  test("brails help <unimplemented> says it is not implemented yet", () => {
    for (const name of ["generate", "credentials", "console"]) {
      expect(brails("help", name).stdout).toContain(
        `brails ${name} is not implemented yet`,
      );
    }
  });

  test("brails help db:migrate and db:rollback describe the commands", () => {
    expect(brails("help", "db:migrate").stdout).toContain(
      "Usage: brails db:migrate",
    );
    expect(brails("help", "db:rollback").stdout).toContain("--step=N");
  });
});
