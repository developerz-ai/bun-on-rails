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

| Layer          | Choice                                                                    | Where                              |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| Runtime        | Bun >= 1.0.0                                                              | `package.json` engines             |
| Language       | plain JavaScript, ES modules (`"type": "module"`), no TypeScript build    | `package.json`                     |
| Package        | `bun-on-rails` — `main` `src/index.js`, bin `brails` → `src/cli/index.js` | `package.json`                     |
| Tests          | Bun's own runner (`bun:test`)                                             | `test/`                            |
| ORM / database | Active-Record-style `Model` on a Postgres adapter (`postgres` driver)     | `src/database/`                    |
| Jobs           | a `Job` base class; BullMQ is the intended queue                          | `src/jobs/job.js`                  |
| WebSockets     | native Bun WebSocket — a channel base class and a broadcast manager       | `src/websocket/`                   |
| Mail           | nodemailer + `@react-email/render`                                        | `src/mail/mailer.js`               |
| Storage        | S3-compatible via `@aws-sdk/client-s3`                                    | `src/storage/storage.js`           |
| Cache          | in-process `MemoryStore`, with a Redis backend planned                    | `src/cache/cache.js`               |
| React          | `useResource` / `useAction` / `useChannel`, `Form` / `Field`              | `src/react/`                       |
| Docs           | VitePress, pages in `docs/eng/<section>/<page>.md`                        | `docs/`                            |
| Lint / format  | ESLint (`--max-warnings=0`) / Prettier                                    | `eslint.config.js`, `package.json` |

No auth module ships in `src/` — bcrypt is a dependency only, and the demo's password check is still a TODO (`demo/app/models/user.js:56`).

## Scaffolds

Parts of the tree are planned, not built. Each such function throws `NotImplementedError` (`src/support/not_implemented.js`), and `test/support/no_silent_stubs.test.js` rejects a function whose body is only TODO comments, so none resolves `undefined` as if it worked. Read the module before you rely on it.

| Module                         | State                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/commands/`            | `console`, `test`, `credentials` exit 1 as not implemented — see Commands                                                                                                                             |
| `src/jobs/job.js`              | `performNow` runs a job; `performLater` / `performAt` / `performIn` throw `NotImplementedError` (`src/jobs/job.js:32`)                                                                                |
| `src/mail/mailer.js`           | `deliver()` and `deliverLater()` throw `NotImplementedError` (`src/mail/mailer.js:40`)                                                                                                                |
| `src/storage/storage.js`       | upload, download and delete throw `NotImplementedError` (`src/storage/storage.js:22`)                                                                                                                 |
| `src/cache/cache.js`           | `MemoryStore` works; the `RedisStore` methods throw `NotImplementedError` (`src/cache/cache.js:176`)                                                                                                  |
| `src/websocket/channel.js`     | the `Channel` methods and the server wiring throw `NotImplementedError` (`src/websocket/channel.js:100`); `BroadcastManager` is implemented and covered by `test/websocket/broadcast_manager.test.js` |
| `src/react/`                   | the hooks and forms throw `NotImplementedError` (`src/react/hooks.js:21`)                                                                                                                             |
| `src/testing/`                 | `request(app)` sends through `app.handle(request)`; `TestRequest#as` throws `NotImplementedError` (`src/testing/request.js:37`); the `database.js` helpers work — see Conventions                     |
| `src/database/associations.js` | HABTM loads through its join table (`loadThroughJoinTable`); `EagerLoader` there is a second eager loader only its own tests use                                                                      |

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

| Command                                                                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brails new <app-name>` (`create`)                                             | writes `src/cli/templates/app/` into `./<app-name>` (routes, a home and a health controller, `package.json` depending on this package at its own version, `config/database.js` reading `DATABASE_URL`, `.gitignore`, `.env.example`), then `bun install`; `--skip-install` skips it. The app boots with no database, and connects at boot when `DATABASE_URL` is set (`test/cli/new.test.js`, `test/core/database_boot.test.js`) |
| `brails dev` (aliases `server`, `s`)                                           | boots the Application and serves HTTP                                                                                                                                                                                                                                                                                                                                                                                            |
| `brails start`                                                                 | production server                                                                                                                                                                                                                                                                                                                                                                                                                |
| `brails db:migrate` / `brails db:rollback [--step=N]` (also `brails db <cmd>`) | run `db/migrations` against the database `config/database.js` names (`src/database/config.js`), then rewrite `db/schema.js` (`src/cli/commands/db.js`, `test/cli/db_commands.test.js`)                                                                                                                                                                                                                                           |
| `brails db:schema:dump` / `db:schema:load` / `db:seed`                         | dump or load `db/schema.js` (a load marks every migration up to its version as run), or run `db/seeds.js` with the app's connection set for models (`src/cli/commands/db.js`)                                                                                                                                                                                                                                                    |
| `brails db:create` / `db:drop [--force]` / `db:setup` / `db:reset [--force]`   | create or drop the database from the server's `postgres` maintenance database (drop and reset refuse in production without `--force`); setup = create + schema:load + seed; reset = drop + setup (`test/cli/db_create_drop.test.js`)                                                                                                                                                                                             |
| `brails routes [filter]`                                                       | loads `config/routes.js` into a `Router` (no server, no database) and prints verb, path, controller#action and name in match order; a filter keeps rows whose path or target contains it (`src/cli/commands/routes.js`, `test/cli/routes.test.js`)                                                                                                                                                                               |
| `brails generate` (`g`) `migration` / `model` / `controller`                   | writes `db/migrations/<version>_<name>.js` (a `createTable` one for `Create<Table>`), `app/models/<name>.js` plus its create migration, or `app/controllers/<name>_controller.js`; never overwrites; scaffold/job/mailer/channel/component/auth/admin still throw not implemented (`src/cli/commands/generate.js`, `test/cli/generate.test.js`)                                                                                  |
| `--help`                                                                       | command list and per-command help (`src/cli/help.js`)                                                                                                                                                                                                                                                                                                                                                                            |

Registered but not implemented. Each is built by `notImplemented()` (`src/cli/commands/not_implemented.js`) and exits 1 with `brails <cmd> is not implemented yet`, printing nothing to stdout. `brails help` lists them under Planned. Pinned by `test/cli/not_implemented.test.js`:

| Command                                   | Where                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `brails console` (`c`)                    | `src/cli/commands/console.js`                                |
| `brails test` (`t`)                       | `src/cli/commands/test.js`. The error says to use `bun test` |
| `brails credentials` (`credentials:edit`) | `src/cli/commands/credentials.js`                            |

The CLI has no top-level `setup` verb: `brails db:setup` creates, loads and seeds the database.

## Structure

| Path                                                                 | What lives there                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.js`                                                       | the public export surface                                                                                                                                                                                                                                                                                                     |
| `src/application.js`                                                 | app bootstrap: refuses a backend it does not have (`_refuseUnbuiltBackends`), redis, cache, middleware stack, session store, request dispatch                                                                                                                                                                                 |
| `src/database/`                                                      | `model.js` (Active Record), `query_builder.js`, `validations.js`, `associations.js`, `connection.js`, `migration.js`, `schema.js` (dump/load), `adapters/postgres.js`, `n_plus_one_detector.js`                                                                                                                               |
| `src/controller/`                                                    | `base.js` (Controller, ControllerContext, RequestParams), `middleware.js` (Middleware factories), `request_parser.js`                                                                                                                                                                                                         |
| `src/routing/router.js`                                              | the router DSL: `root`, `get`, `resources` (a callback nests), `namespace`, `scope`                                                                                                                                                                                                                                           |
| `src/jobs/job.js`                                                    | the Job base class                                                                                                                                                                                                                                                                                                            |
| `src/websocket/`                                                     | `channel.js`, `broadcast_manager.js`                                                                                                                                                                                                                                                                                          |
| `src/mail/mailer.js`, `src/storage/storage.js`, `src/cache/cache.js` | mail, S3 storage, cache                                                                                                                                                                                                                                                                                                       |
| `src/react/`                                                         | `hooks.js`, `forms.js`                                                                                                                                                                                                                                                                                                        |
| `src/testing/`                                                       | `factory.js`, `request.js` (`request(app)`), `database.js` (`setupDatabase`, `withinTransaction`, `cleanDatabase`)                                                                                                                                                                                                            |
| `src/cli/`                                                           | `index.js` (entry), `parser.js`, `help.js`, `build.js`, `commands/`, `templates/app/` (the `brails new` skeleton; a leading `_` in a template name becomes `.`)                                                                                                                                                               |
| `src/support/inflector.js`                                           | `pluralize` / `singularize` / `classify` / `tableize` / `foreignKey`                                                                                                                                                                                                                                                          |
| `src/config/loader.js`                                               | configuration loading                                                                                                                                                                                                                                                                                                         |
| `demo/`                                                              | the only app in this repo — `demo/app/{models,controllers,jobs,mailers,channels,components}`, `demo/config/{routes.js,database.js,environments/}`, `demo/db/{migrations/,seeds.js}`, `demo/test/{factories,models}`. The framework also runs `config/initializers/*.js` when that directory exists (`src/application.js:487`) |
| `test/`                                                              | the framework suite — `cli/ config/ controller/ core/ database/ routing/ support/ websocket/`, plus `framework.test.js`                                                                                                                                                                                                       |
| `docs/`                                                              | VitePress site — pages in `docs/eng/<section>/<page>.md`, nav in `docs/.vitepress/config.js`                                                                                                                                                                                                                                  |
| `bin/`                                                               | `setup`, `dev`, `check`, `stop`                                                                                                                                                                                                                                                                                               |
| `db/schema.js`                                                       | an app's generated schema dump; this repo commits none                                                                                                                                                                                                                                                                        |

## Conventions

| Area           | Rule                                                                                                                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules        | ES modules only; JSDoc on public APIs                                                                                                                                                                                                                                                                                      |
| Size           | small focused functions, single responsibility. ~300 LOC is a target for new files, not an enforced limit — the core modules are larger (`src/database/model.js`, `src/controller/middleware.js`)                                                                                                                          |
| Dependencies   | wrap popular libraries instead of reimplementing them; no manual dependency injection — the framework wires it                                                                                                                                                                                                             |
| App naming     | models singular PascalCase (`post.js` → `Post`), controllers plural snake_case (`posts_controller.js` → `PostsController`), jobs / mailers / channels snake_case                                                                                                                                                           |
| Tables         | plural snake_case via `tableize()`; key `id`; foreign keys `{model}_id`; `created_at` / `updated_at`                                                                                                                                                                                                                       |
| Booleans       | plain names — the demo writes `t.boolean('published')` (`demo/db/migrations/20250124000002_create_posts.js:11`). The framework enforces no `is_` prefix                                                                                                                                                                    |
| Join tables    | `posts_tags`: both table names in lexical order, columns `post_id` / `tag_id` (`loadThroughJoinTable`, `src/database/associations.js`)                                                                                                                                                                                     |
| Migrations     | `db/migrations/<timestamp>_<name>.js` with `up()` and `down()`; both a `Migration` subclass and `export async function up(db)` are accepted (`src/database/migration.js:343`)                                                                                                                                              |
| Schema dump    | `db/schema.js` is generated — never hand-edited                                                                                                                                                                                                                                                                            |
| Tests          | `bun:test`; files at `test/<area>/<name>.test.js`; the database is mocked                                                                                                                                                                                                                                                  |
| Test isolation | `withinTransaction` rolls each test back, `cleanDatabase` truncates (test env only), `setupDatabase` connects and migrates (`src/testing/database.js`). The framework suite fakes the driver, except `test/testing/database.pg.test.js`: it runs on PostgreSQL when `TEST_DATABASE_URL` is set, as CI's framework job does |
| Test names     | no `unit:` / `integration:` prefix convention here — `bun run test:unit` matches zero tests, `bun run test:integration` only the few tests whose name contains `integration`                                                                                                                                               |
| Lint           | ESLint over `src/` with `--max-warnings=0`; `bin/check` lints `demo/` separately                                                                                                                                                                                                                                           |

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

Context available in an action: `this.request`, `this.params`, `this.session`, `this.csrfToken` (the session's CSRF token, which writes must echo in `X-CSRF-Token` while `security.csrf` is on), `this.currentUser`, `this.cache`, `this.db`.

`beforeAction` / `afterAction` take a list of names and/or `{ name, only, except, if, unless }`, or an object keyed by method name (`{ authenticate: { except: ['index'] } }`); dispatch runs them through `ControllerMiddleware.runBeforeFilters` / `runAfterFilters` (`src/controller/middleware.js`), and a filter naming a missing method throws (`test/controller/filters_dispatch.test.js`).

Router — `src/routing/router.js`, used from `config/routes.js`:

```
export default (router) => {
  router.root('home#index')
  router.resources('posts', () => router.resources('comments')) // /posts/:post_id/comments
  router.namespace('admin', () => router.resources('users'))     // admin/users controller
  router.scope('/:locale', () => router.get('/about', 'pages#about')) // path only
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

`performNow(data)` runs the job inline; `performLater` / `performAt` / `performIn` throw `NotImplementedError` (see Scaffolds).

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
