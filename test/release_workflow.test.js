/**
 * Release workflow guard
 *
 * `.github/workflows/release.yml` has never run (there is no tag yet), so its
 * first run is also its first test. It shipped with first-run bugs: no
 * check that the tag matches package.json's version; no release-bar check
 * before `npm publish`; a long-lived NPM_TOKEN on Node 20 / npm 10, too old
 * for npm trusted publishing (plan 101, D7); a changelog step whose
 * `git describe ... HEAD^` fails with no earlier tag, which left the first
 * release's notes empty; and a release body hardcoding the invalid name
 * `@bun-on-rails`. Each rule below pins one of those against the parsed
 * workflow.
 */

import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(
  join(repoRoot, ".github", "workflows", "release.yml"),
  "utf8",
);
const workflow = Bun.YAML.parse(text);
const steps = workflow.jobs.release.steps;

const indexOf = (predicate, what) => {
  const i = steps.findIndex(predicate);
  if (i === -1) throw new Error(`release.yml has no step that ${what}`);
  return i;
};
const runOf = (step) => step.run ?? "";

const publish = indexOf(
  (s) => /\bnpm publish\b/.test(runOf(s)),
  "runs npm publish",
);

describe("release.yml", () => {
  test("refuses a tag that differs from package.json's version, before publishing", () => {
    const check = indexOf(
      (s) =>
        runOf(s).includes("GITHUB_REF_NAME") &&
        runOf(s).includes("package.json"),
      "compares the tag with package.json",
    );
    expect(runOf(steps[check])).toMatch(/exit 1/);
    expect(check).toBeLessThan(publish);
  });

  test("runs bin/qa-release on the tagged checkout before publishing, with a token for its CI check", () => {
    const qa = indexOf(
      (s) => runOf(s).trim().startsWith("bin/qa-release"),
      "runs bin/qa-release",
    );
    expect(qa).toBeLessThan(publish);
    expect(steps[qa].env?.GH_TOKEN).toBeDefined();
    expect(workflow.permissions.actions).toBe("read");
  });

  test("publishes through npm trusted publishing with provenance, no long-lived token", () => {
    expect(runOf(steps[publish])).toContain("--provenance");
    expect(workflow.permissions["id-token"]).toBe("write");
    expect(text).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);

    const node = indexOf(
      (s) => String(s.uses ?? "").startsWith("actions/setup-node@"),
      "sets up Node",
    );
    expect(Number(steps[node].with["node-version"])).toBeGreaterThanOrEqual(22);
    const npm = indexOf(
      (s) => /npm install -g npm@/.test(runOf(s)),
      "upgrades npm",
    );
    expect(runOf(steps[npm])).toMatch(/npm@\^?(1[2-9]|11\.([5-9]|\d{2}))/);
    expect(npm).toBeLessThan(publish);
  });

  test("the changelog falls back to the root commit when there is no earlier tag", () => {
    const changelog = indexOf((s) => s.id === "changelog", "has id changelog");
    expect(runOf(steps[changelog])).toMatch(
      /git describe[^\n]*\|\|\s*git rev-list --max-parents=0 HEAD/,
    );
  });

  test("the release body takes the install line from package.json, not a hardcoded name", () => {
    const release = indexOf(
      (s) => String(s.uses ?? "").startsWith("softprops/action-gh-release@"),
      "creates the release",
    );
    const body = steps[release].with.body;
    expect(body).toContain("bun add -g ${{ steps.pkg.outputs.name }}");
    expect(text).not.toContain("@bun-on-rails");
  });
});
