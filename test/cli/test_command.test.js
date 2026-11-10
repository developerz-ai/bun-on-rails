/**
 * brails test (t) runs the app's tests with bun test (plan 105 S6)
 *
 * It exited 1 as not implemented ("Run `bun test` instead"). It now runs
 * `bun test` in the app root with NODE_ENV=test, passes every argument after
 * `test` through unchanged (files, -t patterns, flags), and exits with bun
 * test's exit code.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(repoRoot, "src", "cli", "index.js");
const app = mkdtempSync(join(tmpdir(), "brails-test-"));

function brails(...args) {
  const env = { ...process.env };
  delete env.NODE_ENV;
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: app,
    env,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeAll(() => {
  mkdirSync(join(app, "config"));
  mkdirSync(join(app, "app"));
  mkdirSync(join(app, "test"));
  writeFileSync(
    join(app, "test", "passing.test.js"),
    `import { test, expect } from "bun:test";
test("runs in the test environment", () => expect(process.env.NODE_ENV).toBe("test"));
test("adds up", () => expect(1 + 1).toBe(2));
`,
  );
  writeFileSync(
    join(app, "test", "failing.test.js"),
    `import { test, expect } from "bun:test";
test("fails on purpose", () => expect(1).toBe(2));
`,
  );
});

afterAll(() => rmSync(app, { recursive: true, force: true }));

describe("brails test", () => {
  test("runs the app's tests and exits with bun test's code", () => {
    const r = brails("test");
    expect(r.code).toBe(1);
    expect(r.out).toContain("2 pass");
    expect(r.out).toContain("1 fail");
  });

  test("passes a file through: only that file runs, in the test environment", () => {
    const r = brails("test", "test/passing.test.js");
    expect(r.code).toBe(0);
    expect(r.out).toContain("2 pass");
    expect(r.out).not.toContain("fails on purpose");
  });

  test("passes -t through unchanged, value and all", () => {
    const r = brails("t", "test/passing.test.js", "-t", "adds up");
    expect(r.code).toBe(0);
    expect(r.out).toContain("1 pass");
  });
});
