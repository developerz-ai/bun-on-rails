/**
 * Package manifest guard
 *
 * The npm name used to be "@bun-on-rails", a scope with no package name. `npm
 * pack` accepts it, but a clean `bun add -g <tarball>` fails with
 * `invalid dependency name "@bun-on-rails"` and the registry rejects it, so
 * nothing could ever be installed or published. The manifest also had no
 * "files" field, so a publish shipped 159 files, test/, demo/, docs/ and the
 * agent config among them, around 44 files of framework. And "homepage" pointed
 * at a domain with no DNS record. Each rule below pins one of those.
 */

import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { dirname, join, normalize } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

// npm's rules for a new package name: lowercase, URL-safe, at most 214
// characters, no leading dot or underscore, and a scope only with a name after it.
const NPM_NAME = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

describe("package.json", () => {
  test("name is a valid, installable npm package name", () => {
    expect(pkg.name).toMatch(NPM_NAME);
    expect(pkg.name.length).toBeLessThanOrEqual(214);
  });

  test("the bare-scope name that blocked every install cannot come back", () => {
    expect(NPM_NAME.test("@bun-on-rails")).toBe(false);
  });

  test('"files" ships the framework source and nothing else', () => {
    // npm adds package.json, README.md and LICENSE on its own (measured with
    // `npm pack --dry-run`; it does not add CHANGELOG.md).
    expect(pkg.files).toEqual(["src/"]);
  });

  test("main and every bin target sit inside the shipped files and exist", () => {
    const targets = [pkg.main, ...Object.values(pkg.bin ?? {})];
    expect(targets.length).toBeGreaterThan(1);
    for (const target of targets) {
      expect(normalize(target)).toMatch(/^src\//);
      expect(existsSync(join(repoRoot, target))).toBe(true);
    }
  });

  test("homepage is the GitHub Pages docs site, not the unresolvable bunonrails.com", () => {
    expect(pkg.homepage).toBe("https://developerz-ai.github.io/bun-on-rails/");
  });
});
