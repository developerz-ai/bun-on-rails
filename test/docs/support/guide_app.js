/**
 * Boot a docs page's examples as a real app.
 *
 * A guide marks each complete file with a fence titled by its path
 * (```js [config/routes.js]). bootGuideApp() runs `brails new` into a temp
 * dir, writes every titled block over it, links this checkout as the
 * framework, and starts the app on a free port, so a test can check the
 * responses the page promises. Used by the tests in test/docs/.
 */

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
import { Application } from "../../../src/application.js";

export const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

/**
 * Every fenced block titled with a path, in page order.
 *
 * @param {string} markdown
 * @returns {{ path: string, code: string }[]}
 */
export function titledBlocks(markdown) {
  return [...markdown.matchAll(/^```js \[([^\]]+)\]\n([\s\S]*?)^```$/gm)].map(
    ([, path, code]) => ({ path, code }),
  );
}

/**
 * @param {string} guidePath - path of the markdown page, relative to the repo root
 * @returns {Promise<{ app: string, files: string[], base: string, call: Function, close: Function }>}
 */
export async function bootGuideApp(guidePath) {
  const blocks = titledBlocks(readFileSync(join(repoRoot, guidePath), "utf8"));
  const work = mkdtempSync(join(tmpdir(), "guide-app-"));
  const app = join(work, "guide");

  const made = spawnSync(
    process.execPath,
    [
      join(repoRoot, "src", "cli", "index.js"),
      "new",
      "guide",
      "--skip-install",
    ],
    {
      cwd: work,
      encoding: "utf8",
    },
  );
  if (made.status !== 0) throw new Error(`brails new failed: ${made.stderr}`);

  for (const { path, code } of blocks) {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), code);
  }
  mkdirSync(join(app, "node_modules"), { recursive: true });
  symlinkSync(repoRoot, join(app, "node_modules", pkg.name), "dir");

  // Guide examples need no database; keep an ambient DATABASE_URL from connecting.
  const savedUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const application = new Application({ root: app });
  try {
    await application.initialize();
  } finally {
    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
  }
  await application.start({ port: 0, hostname: "127.0.0.1" });
  const base = `http://127.0.0.1:${application.server.port}`;

  async function call(method, path, { headers = {}, body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers,
      body,
      redirect: "manual",
    });
    const text = await res.text();
    return {
      status: res.status,
      location: res.headers.get("location"),
      json: text ? JSON.parse(text) : null,
    };
  }

  async function close() {
    await application.stop();
    rmSync(work, { recursive: true, force: true });
  }

  return { app, files: blocks.map((b) => b.path), base, call, close };
}
