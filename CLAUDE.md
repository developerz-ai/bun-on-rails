# CLAUDE.md

**BunOnRails** — a full-stack JavaScript framework for Bun with Rails-like conventions: an Active-Record-style ORM, migrations, a routing DSL, controllers, background jobs, WebSocket channels, mail, S3 storage, caching and React hooks.

> **THE RULE.** A change is done when `bin/check` is green and the code agrees with this file. Never silence or work around a red gate; when this file and the code disagree, the code is right and this file is the bug.

## Non-negotiables

| Rule                                  | Detail                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gate is `bin/check`               | `bun lint && bun test && bun run build && (cd demo && bunx eslint --max-warnings=0 app/ config/ test/ db/)`. CI runs the same steps in separate jobs (`.github/workflows/ci.yml`); the pre-commit hook (`.githooks/pre-commit`) runs `bin/check` itself. Red is fixed at the cause — never skipped, never silenced, never worked around. |
| Generated files are never hand-edited | `db/schema.js` is an app's schema dump, written by the dumper/loader module `src/database/schema.js` (`dumpSchema` / `loadSchema`) — the module is not the dump. A migration that has run is history: add a new one.                                                                                                                     |
| Secrets never enter the repo          | `SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL` come from the environment. `.env.example` lists names only; `.env` is never committed; a value is never pasted into code, a comment or a log.                                                                                                                                              |
| Area rules live in the specialists    | Open the file that owns the area (see Pointers) and follow it. This file points at them; it does not copy them.                                                                                                                                                                                                                          |
| One brain                             | `AGENTS.md` is a pointer to this file. Change the rule here, never in a second copy.                                                                                                                                                                                                                                                     |

## Stack

| Layer          | Choice                                                                     | Where                              |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| Runtime        | Bun >= 1.0.0                                                               | `package.json` engines             |
| Language       | plain JavaScript, ES modules (`"type": "module"`), no TypeScript build     | `package.json`                     |
| Package        | `@bun-on-rails` — `main` `src/index.js`, bin `brails` → `src/cli/index.js` | `package.json`                     |
| Tests          | Bun's own runner (`bun:test`)                                              | `test/`                            |
| ORM / database | Active-Record-style `Model` on a Postgres adapter (`postgres` driver)      | `src/database/`                    |
| Jobs           | a `Job` base class; BullMQ is the intended queue                           | `src/jobs/job.js`                  |
| WebSockets     | native Bun WebSocket — a channel base class and a broadcast manager        | `src/websocket/`                   |
| Mail           | nodemailer + `@react-email/render`                                         | `src/mail/mailer.js`               |
| Storage        | S3-compatible via `@aws-sdk/client-s3`                                     | `src/storage/storage.js`           |
| Cache          | in-process `MemoryStore`, with a Redis backend planned                     | `src/cache/cache.js`               |
| React          | `useResource` / `useAction` / `useChannel`, `Form` / `Field`               | `src/react/`                       |
| Docs           | VitePress, pages in `docs/eng/<section>/<page>.md`                         | `docs/`                            |
| Lint / format  | ESLint (`--max-warnings=0`) / Prettier                                     | `eslint.config.js`, `package.json` |

No auth module ships in `src/` — bcrypt is a dependency only, and the demo's password check is still a TODO (`demo/app/models/user.js:56`).

## Scaffolds

Parts of the tree are stubs. Read the module before you rely on it.

| Module                         | State                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/commands/`            | `new`, `generate`, `db:*`, `console`, `routes`, `test`, `credentials` are stubs — see Commands                                                                                      |
| `src/jobs/job.js`              | `performNow` runs a job; `performLater` / `performAt` / `performIn` are TODO stubs (`src/jobs/job.js:29`)                                                                           |
| `src/mail/mailer.js`           | `deliver()` and `deliverLater()` are TODO stubs (`src/mail/mailer.js:36`)                                                                                                           |
| `src/storage/storage.js`       | upload, download and delete are TODO stubs (`src/storage/storage.js:17`)                                                                                                            |
| `src/cache/cache.js`           | `MemoryStore` works; the `RedisStore` methods are TODO stubs (`src/cache/cache.js:173`)                                                                                             |
| `src/websocket/channel.js`     | the channel base class and the server wiring are TODOs (`src/websocket/channel.js:93`); `BroadcastManager` is implemented and covered by `test/websocket/broadcast_manager.test.js` |
| `src/react/`                   | the hooks and forms are scaffolds (`src/react/hooks.js:12`)                                                                                                                         |
| `src/testing/`                 | `request.js` never reaches the app (`src/testing/request.js:90`); `database.js` is stubs — see Conventions                                                                          |
| `src/database/associations.js` | the HABTM join query is a TODO (`src/database/associations.js:681`)                                                                                                                 |

## Commands

### Repo scripts (`package.json`)

| Command                                            | What it does                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bun run dev`                                      | dev server (`bun run src/cli/index.js dev`)                                                  |
| `bun run start`                                    | production server                                                                            |
| `bun run build`                                    | no-op build — CI expects exit 0 (`src/cli/build.js`)                                         |
| `bun test`                                         | the whole suite (`bun test test/`)                                                           |
| `bun test <path>`                                  | one file                                                                                     |
| `bun run test:unit`                                | matches zero tests — no test or `describe` in `test/` carries the word `unit`                |
| `bun run test:integration`                         | matches only the few tests whose name contains `integration`                                 |
| `bun run lint`                                     | ESLint over `src/`, `--max-warnings=0`                                                       |
| `bun run format`                                   | Prettier over the whole tree — a repo-wide write, so run it only when nobody else is editing |
| `bun run docs:dev` / `docs:build` / `docs:preview` | the VitePress site                                                                           |

### Repo scripts (`bin/`)

| Command          | What it does                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bin/setup`      | ensures bun meets the floor — it installs bun on CI, otherwise exits 69 — then `bun install`                                                                                                                                                                                                                 |
| `bin/dev`        | dev server                                                                                                                                                                                                                                                                                                   |
| `bin/check`      | the gate (see Non-negotiables)                                                                                                                                                                                                                                                                               |
| `bin/stop`       | stops what the session started — currently a no-op                                                                                                                                                                                                                                                           |
| `bin/qa-release` | the public-release bar from a fresh clone: packs, installs from README in a clean `oven/bun` container, boots the app, checks links, licence and CI on main — PASS/FAIL per item; exits 75 when docker is unreachable. Needs docker with compose, git, gh. Plan: `docs/plans/2026/11/10/101-public-release/` |

### `brails` (entry `src/cli/index.js`)

| Command                              | What it does                                          |
| ------------------------------------ | ----------------------------------------------------- |
| `brails dev` (aliases `server`, `s`) | boots the Application and serves HTTP                 |
| `brails start`                       | production server                                     |
| `--help`                             | command list and per-command help (`src/cli/help.js`) |

Registered but not implemented — a stub prints its plan and returns, so never rely on it:

| Command                                                   | Stub at                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `brails new` (`create`)                                   | `src/cli/commands/new.js:18`                                           |
| `brails generate` (`g`)                                   | `src/cli/commands/generate.js:36`                                      |
| `brails db:create` / `db:drop` / `db:migrate` / `db:seed` | `src/cli/commands/db.js:42`                                            |
| `brails db rollback`                                      | `src/cli/commands/db.js:76`                                            |
| `brails db:reset` / `brails db:setup`                     | `src/cli/commands/db.js:84` — they only call the stubs above           |
| `brails db:schema:dump` / `db:schema:load`                | `src/cli/commands/db.js:126` — prints "requires a database connection" |
| `brails console` (`c`)                                    | `src/cli/commands/console.js:12`                                       |
| `brails routes`                                           | `src/cli/commands/routes.js:14`                                        |
| `brails test` (`t`)                                       | `src/cli/commands/test.js:15` — use `bun test`                         |
| `brails credentials` (`credentials:edit`)                 | `src/cli/commands/credentials.js:27`                                   |

The CLI has no top-level `setup` verb — the registry (`src/cli/commands/index.js:15-49`) lists `db:setup`, and that one is a stub.

## Structure

| Path                                                                 | What lives there                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.js`                                                       | the public export surface                                                                                                                                                                                                                                                                                                     |
| `src/application.js`                                                 | app bootstrap: middleware stack, jobs, redis, session store, request dispatch                                                                                                                                                                                                                                                 |
| `src/database/`                                                      | `model.js` (Active Record), `query_builder.js`, `validations.js`, `associations.js`, `connection.js`, `migration.js`, `schema.js` (dump/load), `adapters/postgres.js`, `n_plus_one_detector.js`                                                                                                                               |
| `src/controller/`                                                    | `base.js` (Controller, ControllerContext, RequestParams), `middleware.js` (Middleware factories), `request_parser.js`                                                                                                                                                                                                         |
| `src/routing/router.js`                                              | the router DSL: `root`, `get`, `resources`, `namespace`                                                                                                                                                                                                                                                                       |
| `src/jobs/job.js`                                                    | the Job base class                                                                                                                                                                                                                                                                                                            |
| `src/websocket/`                                                     | `channel.js`, `broadcast_manager.js`                                                                                                                                                                                                                                                                                          |
| `src/mail/mailer.js`, `src/storage/storage.js`, `src/cache/cache.js` | mail, S3 storage, cache                                                                                                                                                                                                                                                                                                       |
| `src/react/`                                                         | `hooks.js`, `forms.js`                                                                                                                                                                                                                                                                                                        |
| `src/testing/`                                                       | `factory.js`, `request.js`, `database.js` (stubs — see Conventions)                                                                                                                                                                                                                                                           |
| `src/cli/`                                                           | `index.js` (entry), `parser.js`, `help.js`, `build.js`, `commands/`                                                                                                                                                                                                                                                           |
| `src/support/inflector.js`                                           | `pluralize` / `singularize` / `classify` / `tableize` / `foreignKey`                                                                                                                                                                                                                                                          |
| `src/config/loader.js`                                               | configuration loading                                                                                                                                                                                                                                                                                                         |
| `demo/`                                                              | the only app in this repo — `demo/app/{models,controllers,jobs,mailers,channels,components}`, `demo/config/{routes.js,database.js,environments/}`, `demo/db/{migrations/,seeds.js}`, `demo/test/{factories,models}`. The framework also runs `config/initializers/*.js` when that directory exists (`src/application.js:487`) |
| `test/`                                                              | the framework suite — `cli/ config/ controller/ core/ database/ routing/ support/ websocket/`, plus `framework.test.js`                                                                                                                                                                                                       |
| `docs/`                                                              | VitePress site — pages in `docs/eng/<section>/<page>.md`, nav in `docs/.vitepress/config.js`                                                                                                                                                                                                                                  |
| `bin/`                                                               | `setup`, `dev`, `check`, `stop`                                                                                                                                                                                                                                                                                               |
| `db/schema.js`                                                       | an app's generated schema dump; this repo commits none                                                                                                                                                                                                                                                                        |

## Conventions

| Area           | Rule                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules        | ES modules only; JSDoc on public APIs                                                                                                                                                             |
| Size           | small focused functions, single responsibility. ~300 LOC is a target for new files, not an enforced limit — the core modules are larger (`src/database/model.js`, `src/controller/middleware.js`) |
| Dependencies   | wrap popular libraries instead of reimplementing them; no manual dependency injection — the framework wires it                                                                                    |
| App naming     | models singular PascalCase (`post.js` → `Post`), controllers plural snake_case (`posts_controller.js` → `PostsController`), jobs / mailers / channels snake_case                                  |
| Tables         | plural snake_case via `tableize()`; key `id`; foreign keys `{model}_id`; `created_at` / `updated_at`                                                                                              |
| Booleans       | plain names — the demo writes `t.boolean('published')` (`demo/db/migrations/20250124000002_create_posts.js:11`). The framework enforces no `is_` prefix                                           |
| Join tables    | no framework rule — the HABTM join query is still a TODO (`src/database/associations.js:681`)                                                                                                     |
| Migrations     | `db/migrations/<timestamp>_<name>.js` with `up()` and `down()`; both a `Migration` subclass and `export async function up(db)` are accepted (`src/database/migration.js:343`)                     |
| Schema dump    | `db/schema.js` is generated — never hand-edited                                                                                                                                                   |
| Tests          | `bun:test`; files at `test/<area>/<name>.test.js`; the database is mocked                                                                                                                         |
| Test isolation | none — `setupDatabase`, `cleanDatabase` and `withinTransaction` are TODO stubs (`src/testing/database.js:8-30`); the suite mocks the database (`test/database/connection.test.js:5`)              |
| Test names     | no `unit:` / `integration:` prefix convention here — `bun run test:unit` matches zero tests, `bun run test:integration` only the few tests whose name contains `integration`                      |
| Lint           | ESLint over `src/` with `--max-warnings=0`; `bin/check` lints `demo/` separately                                                                                                                  |

## Patterns

Model — `src/database/model.js`:

```
export default class Post extends Model {
  static associations = { belongsTo: ['user'], hasMany: ['comments'] }
  static validations = { title: { presence: true, length: { max: 200 } } }
  static scopes = { published: (query) => query.where({ published: true }) }
}
```

Controller — `src/controller/base.js`:

```
export default class PostsController extends Controller {
  static beforeAction = ['authenticate']

  async index() {
    const posts = await Post.findAll({ include: 'user' })
    return this.render({ posts })
  }
}
```

Context available in an action: `this.request`, `this.params`, `this.session`, `this.currentUser`, `this.cache`, `this.db`.

A filter entry may also be an object — `{ name, only, except }` (`src/controller/middleware.js:299`) — but the plain array of names is the form every dispatch path understands (`src/application.js:858`).

Router — `src/routing/router.js`, used from `config/routes.js`:

```
export default (router) => {
  router.root('home#index')
  router.resources('posts')
  router.namespace('admin', () => router.resources('users'))
}
```

Job — `src/jobs/job.js`:

```
export default class SendWelcomeEmailJob extends Job {
  static queue = 'emails'
  static attempts = 3

  async perform({ userId }) { /* ... */ }
}
// SendWelcomeEmailJob.performNow({ userId })
```

`performNow(data)` runs the job inline; `performLater` / `performAt` / `performIn` are stubs (see Scaffolds).

Migration — `db/migrations/<timestamp>_<name>.js`:

```
export async function up(db) {
  await db.createTable('posts', (t) => {
    t.id()
    t.string('title').notNull()
    t.references('user')
    t.timestamps()
  })
}

export async function down(db) {
  await db.dropTable('posts')
}
```

## Pointers

Open the file that owns the area; its rules live there, not here.

| File                                          | Owns                                                                | Open it when                      |
| --------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- |
| `.claude/agents/cli-brails.md`                | the `brails` CLI — commands, flags, generators, help                | anything under `src/cli/`         |
| `.claude/agents/database-orm.md`              | model, query builder, validations, associations, migrations, schema | anything under `src/database/`    |
| `.claude/agents/jobs-websocket.md`            | background jobs and WebSocket channels                              | `src/jobs/`, `src/websocket/`     |
| `.claude/agents/routing-controller.md`        | router DSL, controller layer, middleware, params                    | `src/routing/`, `src/controller/` |
| `.claude/skills/verify-change/SKILL.md`       | how this repo is installed, run and checked                         | before every commit               |
| `.claude/skills/database-migrations/SKILL.md` | how migrations are written, run and rolled back                     | migration or schema work          |
| `.claude/skills/docs-website/SKILL.md`        | how the VitePress site is written and built                         | any `docs/` change                |
