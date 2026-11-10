/**
 * Dependency guard: bcryptjs instead of native bcrypt
 *
 * `bcrypt@^5.1.1` was the only path to `@mapbox/node-pre-gyp@1.0.11`, and
 * node-pre-gyp depends on `tar@^6.1.11`. No tar 6.x release is patched, and
 * the advisory could not be fixed by refreshing the lock: the whole subtree
 * had to go. Nothing in src/, demo/ or test/ imported bcrypt, and the demo's
 * password_digest is still a placeholder ("authentication is planned"), so
 * the swap breaks no code. bcryptjs 3.0.3 is plain JavaScript with zero
 * runtime dependencies, its default export is API-compatible with native
 * bcrypt, and it reads hashes native bcrypt wrote, so no stored digest
 * changes shape.
 *
 * Each rule below pins one of those: the manifest, the lockfile, and a live
 * round-trip through the replacement.
 */

import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const lock = readFileSync(join(repoRoot, "bun.lock"), "utf8");

describe("bcryptjs dependency", () => {
  test("the manifest declares bcryptjs ^3 and no native bcrypt", () => {
    // Own-property check on purpose: `in` searches the prototype chain and
    // would mask a missing key behind an inherited one.
    expect(Object.hasOwn(pkg.dependencies, "bcrypt")).toBe(false);
    expect(pkg.dependencies.bcryptjs).toMatch(/^\^3\./);
  });

  test("the lock resolves no native bcrypt, no node-pre-gyp and no tar", () => {
    // `"bcrypt@[0-9]` matches only the native package; bcryptjs's own
    // resolution is `"bcryptjs@` and does not match.
    expect(lock).not.toMatch(/"bcrypt@[0-9]/);
    expect(lock).not.toMatch(/@mapbox\/node-pre-gyp/);
    // Acceptance: no tar at all resolves — there is no patched tar 6.x to
    // pin, so the subtree must stay gone, not be refreshed.
    expect(lock).not.toMatch(/"tar@[0-9]/);
    expect(lock).toMatch(/"bcryptjs@3\./);
  });

  test("hash and compare round-trip like native bcrypt (async)", async () => {
    const password = "correct horse battery staple";
    const hash = await bcrypt.hash(password, 10);
    expect(hash).toMatch(/^\$2[ab]\$/);

    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare("wrong password", hash)).toBe(false);
  });

  test("the sync variants round-trip too", () => {
    const password = "correct horse battery staple";
    const hash = bcrypt.hashSync(password, 10);
    expect(hash).toMatch(/^\$2[ab]\$/);

    expect(bcrypt.compareSync(password, hash)).toBe(true);
    expect(bcrypt.compareSync("wrong password", hash)).toBe(false);
  });
});
