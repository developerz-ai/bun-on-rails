/**
 * brails start - Production server
 *
 * Boots the framework Application and serves HTTP until the process is
 * signalled. The boot helpers are shared with `brails dev`
 * (src/cli/commands/dev.js) so both servers behave identically.
 */

import { bootServer, resolveAppRoot, resolvePort } from "./dev.js";

export const startCommand = {
  name: "start",
  description: "Start production server",

  async run(args) {
    return await bootServer({ args, label: "production" });
  },
};

export { resolveAppRoot, resolvePort };
