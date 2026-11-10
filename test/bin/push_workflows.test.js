/**
 * push-workflows guard
 *
 * bin/qa-release judges bar 4 ("CI green on main") over every workflow that
 * runs on a push to main. It used to find them with a one-line regex for
 * `branches: [main]`, which missed a multi-line branch list, and an empty
 * result then passed bar 4 having checked nothing. These cases pin the
 * structural trigger parser that replaced it, including the shapes this
 * repo's own workflows do not happen to use.
 */

import { test, expect, describe } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pushWorkflows, triggersOnPush } from "../../bin/lib/push-workflows.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const parse = (yaml) => Bun.YAML.parse(yaml);

describe("triggersOnPush", () => {
  test("a multi-line branch list is read (the regex missed it)", () => {
    expect(
      triggersOnPush(
        parse("on:\n  push:\n    branches:\n      - main\n"),
        "main",
      ),
    ).toBe(true);
  });

  test("an inline branch list is read", () => {
    expect(
      triggersOnPush(parse("on:\n  push:\n    branches: [main]\n"), "main"),
    ).toBe(true);
  });

  test("a branch list that excludes main does not trigger", () => {
    expect(
      triggersOnPush(parse("on:\n  push:\n    branches: [develop]\n"), "main"),
    ).toBe(false);
  });

  test("`on: push` and `on: [push, pull_request]` trigger on every branch", () => {
    expect(triggersOnPush(parse("on: push\n"), "main")).toBe(true);
    expect(triggersOnPush(parse("on: [push, pull_request]\n"), "main")).toBe(
      true,
    );
  });

  test("a bare `push:` with no filter triggers", () => {
    expect(
      triggersOnPush(parse("on:\n  push:\n  workflow_dispatch:\n"), "main"),
    ).toBe(true);
  });

  test("a tags-only push filter does not trigger on a branch push", () => {
    expect(
      triggersOnPush(parse("on:\n  push:\n    tags: ['v*']\n"), "main"),
    ).toBe(false);
  });

  test("branches-ignore is honoured", () => {
    expect(
      triggersOnPush(
        parse("on:\n  push:\n    branches-ignore: [main]\n"),
        "main",
      ),
    ).toBe(false);
    expect(
      triggersOnPush(
        parse("on:\n  push:\n    branches-ignore: [gh-pages]\n"),
        "main",
      ),
    ).toBe(true);
  });

  test("globs and negation follow GitHub's last-match-wins rule", () => {
    expect(
      triggersOnPush(parse("on:\n  push:\n    branches: ['**']\n"), "main"),
    ).toBe(true);
    expect(
      triggersOnPush(parse("on:\n  push:\n    branches: ['ma*']\n"), "main"),
    ).toBe(true);
    expect(
      triggersOnPush(
        parse("on:\n  push:\n    branches: ['**', '!main']\n"),
        "main",
      ),
    ).toBe(false);
    expect(
      triggersOnPush(
        parse("on:\n  push:\n    branches: ['release/*']\n"),
        "main",
      ),
    ).toBe(false);
  });

  test("a YAML 1.1 parse (bare `on` read as true) is still understood", () => {
    expect(
      triggersOnPush({ true: { push: { branches: ["main"] } } }, "main"),
    ).toBe(true);
  });

  test("a workflow with no push trigger does not count", () => {
    expect(
      triggersOnPush(
        parse("on:\n  pull_request:\n    branches: [main]\n"),
        "main",
      ),
    ).toBe(false);
  });
});

describe("pushWorkflows", () => {
  test("this repo: ci.yml and docs.yml run on push to main, release.yml (tags) does not", () => {
    expect(
      pushWorkflows(join(repoRoot, ".github", "workflows"), "main"),
    ).toEqual(["ci.yml", "docs.yml"]);
  });

  test("an unparseable workflow throws rather than being skipped", () => {
    const dir = mkdtempSync(join(tmpdir(), "push-workflows-"));
    writeFileSync(join(dir, "ok.yml"), "on: push\n");
    writeFileSync(join(dir, "broken.yml"), "on: [push\n  bad: : :\n");
    expect(() => pushWorkflows(dir, "main")).toThrow(
      /cannot parse workflow .*broken\.yml/,
    );
  });
});
