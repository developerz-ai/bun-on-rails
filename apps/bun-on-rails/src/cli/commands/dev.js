/**
 * brails dev - Development server
 *
 * Boots the framework Application and serves HTTP until the process is
 * signalled. `brails start` (src/cli/commands/start.js) reuses the helpers
 * exported here so both servers behave identically.
 */

import { existsSync } from "fs";
import { join, resolve } from "path";
import { Application } from "../../application.js";

/**
 * Check whether a directory looks like a BunOnRails application root.
 *
 * @param {string} dir - Directory to inspect
 * @returns {boolean} True when the directory holds config/ or app/
 */
function isAppRoot(dir) {
  return existsSync(join(dir, "config")) || existsSync(join(dir, "app"));
}

/**
 * Resolve the application root to serve.
 *
 * The current working directory wins when it is itself an application (it
 * holds config/ or app/). Otherwise the bundled demo/ application is used,
 * and finally the working directory itself.
 *
 * @param {string} [cwd] - Directory to resolve from (defaults to process.cwd())
 * @returns {string} Absolute path of the application root
 */
export function resolveAppRoot(cwd = process.cwd()) {
  const base = resolve(cwd);

  if (isAppRoot(base)) {
    return base;
  }

  const demo = join(base, "demo");
  if (existsSync(demo) && isAppRoot(demo)) {
    return demo;
  }

  return base;
}

/**
 * Resolve the port to listen on.
 *
 * Precedence: `--port` option, then the PORT environment variable, then the
 * application's own configuration (undefined means "let the app decide").
 *
 * @param {Object} [args] - Parsed CLI arguments
 * @returns {number|undefined} Port number, or undefined to use app config
 */
export function resolvePort(args = {}) {
  const raw = args?.options?.port ?? process.env.PORT;

  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }

  return port;
}

/**
 * Boot an Application and start serving HTTP.
 *
 * The returned Application is running; call `app.stop()` to shut it down.
 *
 * @param {Object} options - Boot options
 * @param {Object} [options.args] - Parsed CLI arguments
 * @param {string} [options.label] - Human readable server kind ("development")
 * @returns {Promise<Application>} The started application
 */
export async function bootServer({ args = {}, label = "development" } = {}) {
  const root = resolveAppRoot();
  const port = resolvePort(args);

  const app = new Application({ root });
  await app.initialize();
  await app.start(port === undefined ? {} : { port });

  const hostname = app.server?.hostname ?? "localhost";
  const actualPort = app.server?.port ?? port ?? "";
  const url = `http://${hostname}:${actualPort}`;

  console.log(`\n  BunOnRails ${label} server running:\n`);
  console.log(`  Local:  ${url}`);
  console.log(`  Root:   ${root}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);

  return app;
}

export const devCommand = {
  name: "dev",
  description: "Start development server",

  async run(args) {
    return await bootServer({ args, label: "development" });
  },
};
