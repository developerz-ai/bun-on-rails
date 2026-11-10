# Core Philosophy

BunOnRails brings Rails conventions to JavaScript on Bun. Three ideas shape it. Several parts are
still scaffolds, so this page also says where each one stands today.

## Convention over configuration

Where a file lives and what it is called decide how it is wired: there is no registration code.
A route target `posts#index` runs `index()` in `app/controllers/posts_controller.js`, a `Post`
model reads the `posts` table, and `config/server.js` is the `server` section of the config.
See [Convention over Configuration](./convention-over-configuration.md).

## Batteries included

The goal is one package with what a web app needs. Today:

| Area                    | Module                            | State                                                                                                            |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Routing and controllers | `src/routing/`, `src/controller/` | Works. Actions return JSON; writes need the session's CSRF token ([how](../routing/overview.md#csrf-protection)) |
| ORM and migrations      | `src/database/`                   | Works once the app opens a connection. PostgreSQL only ([Database](../database/overview.md))                     |
| Cache                   | `src/cache/`                      | The in-memory store works (`this.cache` in a controller). The Redis store is stubs                               |
| Background jobs         | `src/jobs/`                       | `performNow` runs a job inline. Nothing enqueues ([Jobs](../jobs/overview.md))                                   |
| WebSockets              | `src/websocket/`                  | The broadcast manager is implemented, but no connection is upgraded and the channel class is a scaffold          |
| Mail                    | `src/mail/`                       | `deliver` and `deliverLater` are stubs                                                                           |
| File storage            | `src/storage/`                    | Upload, download and delete are stubs                                                                            |
| React                   | `src/react/`                      | `useResource`, `useAction`, `useChannel`, `Form` and `Field` are scaffolds                                       |
| Test helpers            | `src/testing/`                    | Stubs. Use `bun test` directly                                                                                   |
| Authentication          | none                              | No module ships                                                                                                  |

## Plain JavaScript on Bun

The framework and your app are ES modules in plain JavaScript, documented with JSDoc. There is no
build step and no TypeScript compiler. Bun is the server, the test runner, the package manager
and the `.env` loader. See [The Bun Runtime](./bun-runtime.md).

## What comes from Rails

- **Active Record models**: a class per table, with validations, callbacks, scopes and
  associations.
- **Migrations**: schema changes as versioned files with `up` and `down`.
- **A routing DSL**: `root`, `resources`, `namespace`, and `controller#action` targets.
- **Controllers with filters**: `beforeAction` and `afterAction`.

What differs: it is JavaScript, it runs on Bun, and actions answer with JSON. There are no HTML
views.

## Not implemented yet

- **Generators beyond migration, model and controller.** `brails generate scaffold`, `job`, `mailer`, `channel` and `auth` are not implemented yet.
- **A console.** `brails console` is not implemented yet.
- **HTML views and React integration.** `render` returns JSON, and the React helpers are
  scaffolds.
- **Authentication.**
