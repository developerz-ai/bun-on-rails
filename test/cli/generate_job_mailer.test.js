/**
 * brails generate job and brails generate mailer (plan 108 G2)
 *
 * Both exited as not implemented, though plan 107 made jobs and mail work.
 * `brails g job SendDigest` writes app/jobs/send_digest_job.js and a test that
 * runs it; `brails g mailer User welcome` writes app/mailers/user_mailer.js
 * with a static method per mail and a test that delivers each through the test
 * adapter. Each generated test is run here against the framework.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { generate } from "../../src/cli/commands/generate.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const work = mkdtempSync(join(tmpdir(), "generate-job-mailer-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let count = 0;
function app() {
  const root = join(work, `app${++count}`);
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(repoRoot, join(root, "node_modules", "bun-on-rails"), "dir");
  writeFileSync(join(root, "package.json"), '{ "type": "module" }\n');
  return root;
}
const read = (root, file) => readFileSync(join(root, file), "utf8");
const runTests = (root) => {
  const r = spawnSync(process.execPath, ["test"], {
    cwd: root,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe("brails generate job", () => {
  test("writes the job and a test that runs it", () => {
    const root = app();
    expect(generate(root, "job", "SendDigest")).toEqual([
      "app/jobs/send_digest_job.js",
      "test/jobs/send_digest_job.test.js",
    ]);
    const job = read(root, "app/jobs/send_digest_job.js");
    expect(job).toContain("import { Job } from 'bun-on-rails'");
    expect(job).toContain("export default class SendDigestJob extends Job {");
    expect(job).toContain("  async perform(data) {");

    const run = runTests(root);
    expect(run.out).toContain("1 pass");
    expect(run.code).toBe(0);
  });

  test("a name that already ends in Job is not doubled", () => {
    const root = app();
    generate(root, "job", "CleanupJob");
    expect(read(root, "app/jobs/cleanup_job.js")).toContain(
      "class CleanupJob extends Job",
    );
  });
});

describe("brails generate mailer", () => {
  test("writes the mailer, one static method per mail, and a test that delivers each", () => {
    const root = app();
    expect(
      generate(root, "mailer", "User", ["welcome", "password_reset"]),
    ).toEqual([
      "app/mailers/user_mailer.js",
      "test/mailers/user_mailer.test.js",
    ]);
    const mailer = read(root, "app/mailers/user_mailer.js");
    expect(mailer).toContain(
      "export default class UserMailer extends Mailer {",
    );
    expect(mailer).toContain("  static welcome(to) {");
    expect(mailer).toContain("  static passwordReset(to) {");

    const run = runTests(root);
    expect(run.out).toContain("2 pass");
    expect(run.code).toBe(0);
  });

  test("a mailer needs at least one mail, and a mail name is snake_case", () => {
    expect(() => generate(app(), "mailer", "User", [])).toThrow(
      "Usage: brails generate mailer <Name> <mail ...>, e.g. User welcome password_reset",
    );
    expect(() => generate(app(), "mailer", "User", ["Welcome"])).toThrow(
      'Invalid mail name "Welcome": use snake_case',
    );
  });
});
