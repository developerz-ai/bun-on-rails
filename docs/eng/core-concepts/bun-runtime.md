# The Bun Runtime

BunOnRails runs only on Bun (version 1.0 or later). It is plain JavaScript in ES modules, with no
build step and no TypeScript compiler: Bun runs the framework and your app as they are. This page
lists what the framework takes from Bun and what that means for your app.

## The HTTP server

`brails dev` and `brails start` boot the application and serve it with `Bun.serve`
(`src/application.js`). A request becomes a standard `Request`, and an action returns a standard
`Response`, usually through `this.render` (see [Routing & Controllers](../routing/overview.md)).

`brails dev` does not reload on file changes: restart it after an edit.

## Environment variables

Bun loads `.env` from the directory you start it in, so `process.env.DATABASE_URL` is set without
a dotenv package. Keep `.env` out of git; an app made by `brails new` ignores it and lists the
names it expects in `.env.example`.

The environment name is `BUN_ENV`, else `NODE_ENV`, else `development`. It picks
`config/environments/<env>.js`, which overrides the sections in `config/<name>.js`.

## Only `.js` files are loaded

Bun can run TypeScript, but the app loader looks for `.js` files only: `app/**/*.js`,
`config/*.js`, `config/initializers/*.js` and `config/routes.js`. A `.ts` file in those places is
never loaded.

## Tests

Use Bun's test runner, `bun test`, with `import { test, expect } from "bun:test"`. An app made by
`brails new` has `"test": "bun test"` in `package.json`. `brails test` is not implemented yet: it exits 1 and says to use `bun test`.

## PostgreSQL

The database connection tries Bun's built-in `Bun.sql` driver first and falls back to the
`postgres` package when that fails (`src/database/connection.js`). See
[Database Overview](../database/overview.md).

## Not implemented yet

- **WebSockets.** `Bun.serve` gets a WebSocket handler when the `websocket.enabled` config is
  `true`, but no request is upgraded to a WebSocket yet, and the channel base class is a
  scaffold.
- **Reload on change** for `brails dev`.
