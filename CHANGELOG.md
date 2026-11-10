# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Routing & Controllers guide (`docs/eng/routing/overview.md`). Every example in it is a complete file, which `test/docs/routing_guide.test.js` writes over a fresh `brails new` app, boots and checks. It also documents what is not implemented yet: nested resources, `scope`, filter options, and CSRF token issuance.
- Initial framework implementation
- ORM with Active Record-style API
- Migration system with auto-schema sync
- Rails-like routing DSL
- Controller base class with context injection
- React frontend integration with hooks
- BullMQ-powered background jobs
- Native WebSocket support with channels
- Authentication generator
- File upload system with S3 support
- Redis-backed caching
- Mailer system with React templates
- Parallel test runner with transaction isolation
- CLI with generators
- Docker development environment
- Comprehensive documentation

### Changed

- The npm package is `bun-on-rails`. The old name, `@bun-on-rails`, was a scope with no package name: a clean `bun add -g` of the tarball failed with `invalid dependency name "@bun-on-rails"`. `files` now limits the tarball to `src/` plus the `package.json`, `README.md` and `LICENSE` that npm always adds: 47 files instead of 159 that included `test/`, `demo/`, `docs/` and the agent config. `homepage` points at the GitHub Pages docs site instead of the unresolvable bunonrails.com. `test/package_manifest.test.js` pins all three.
- Unimplemented `brails` commands (`generate`, `db:*`, `console`, `routes`, `test`, `credentials`) no longer print the results of work they never did, such as "Migrations complete.", made-up routes or "Tests complete.". They exit 1 with `brails <cmd> is not implemented yet`, and `brails help` lists them under Planned. `test/cli/not_implemented.test.js` pins this, and it requires any new command to be implemented or declared unimplemented.
- `brails new <app-name>` creates the app. It used to print "Application created successfully!", exit 0, and create nothing. It now writes routes, a home and a health controller, `package.json` (depending on this package at its own version), `.gitignore` and `.env.example`, then runs `bun install` (`--skip-install` skips it). The app answers `GET /` and `GET /health` with no database. It refuses invalid names and existing directories. Pinned by `test/cli/new.test.js`.
- The getting-started docs (introduction, installation, quick start, project structure) describe what works today. Gone: `bun create`, `bor --version`, `bun setup`, the scaffold-generator tutorial, the SQLite/MySQL claims and bunonrails.com. The quick start builds a posts resource, and `test/docs/quick_start.test.js` runs its code over a fresh `brails new` app. The introduction separates "What works today" from "Planned".
- The README matches the code. The Quick Start starts with `bun add -g bun-on-rails` and contains only working steps (no `brails setup`). The example is a routes file and a controller that run. Features are split into "What works today" and "Planned". The docs link points at `docs/`. `test/docs/readme.test.js` pins the install line, checks that every `brails` step shown is implemented, and runs the example.
- The release workflow is safe to run for the first time. It refuses a tag that differs from `package.json`'s version and runs `bin/qa-release` before publishing. It publishes through npm trusted publishing (Node 22, npm 11.5 or later, `--provenance`, no long-lived `NPM_TOKEN`). The first release's changelog starts from the root commit, and the release body's install line comes from `package.json`. `test/release_workflow.test.js` pins each of these.
- The remaining docs pages describe what works today. The database pages (overview, models, queries, migrations) document the ORM as `src/database/` implements it, every example checked against PostgreSQL: the app does not connect at boot, so you connect in an initializer; migrations run from a script with `MigrationRunner`; PostgreSQL is the only adapter. The jobs, deployment, core-concepts and vibe-coding pages and the site home page drop commands and features that do not exist (`bun dev`, `bun generate`, `brails setup`, generators, `db:*` commands, SQLite, auth) and list them under "Not implemented yet". Imports use `bun-on-rails`, not `@bun-on-rails` or subpaths. The authentication page is removed: no auth module ships. `docs/README.md` no longer links to the missing `idea/` and `standards/` folders.
- The docs site config is fixed. It sets `base: '/bun-on-rails/'` (the GitHub Pages project path, so the site loads with its styles), `ignoreDeadLinks: false` (a dead internal link now fails `bin/check` and CI), and `srcExclude` for `plans/**` and `README.md`. The sidebar lists every page, and the nav no longer links the missing `core-concepts/overview`. `test/docs/site_config.test.js` pins these settings and keeps the sidebar and pages in step.

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- `save()` refreshes `updated_at` on every update. It set the column only when it was missing, and a loaded record always has it, so updates kept the old value. A model whose table has no timestamp columns can now save, with `static timestamps = false`; before, every insert and update wrote both columns and failed. Pinned by `test/database/timestamps.test.js` and verified against PostgreSQL 16.
- `updateAll`, `deleteAll`, `Model.updateWhere`, `Model.deleteWhere` and `Model.deleteAll` return the number of rows they changed. They returned `result.length`, the rows the statement returned, which is 0 without `RETURNING`. Both drivers report the affected rows as `count`; a result without one now throws instead of reporting 0. Pinned by `test/database/write_counts.test.js` and verified against PostgreSQL 16.
- String conditions take bound values: `where("views > ? AND views < ?", 10, 100)`. The `?` was sent unchanged and the parameter index never advanced, so the SQL was invalid and any later condition was misnumbered. `Model.where` also dropped the values. Each `?` (or `$n`) is now bound at the right index, a `?` inside a quoted literal is left alone, and a count mismatch throws. The query builder's duplicate WHERE builder, used by `updateAll` and `deleteAll`, now delegates to the adapter's. Pinned by `test/database/raw_conditions.test.js`.
- One table-name rule. `save()` named a model's table with `tableize()` (`Category` becomes `categories`), but the query builder appended `s` to the snake-cased class name (`categorys`, `persons`, `addresss`), so a saved record could not be found, updated or deleted. `t.references()` and the schema dumper also appended `s`. The query builder, `references()` and the dumper now use the inflector, like `save()`. Pinned by `test/database/table_names.test.js`.
- A `postgresql://` database URL works. `parseDatabaseUrl` stripped "sql" from the scheme, which turned `postgresql` into the unsupported adapter `postgre`, so only `postgres://` URLs could connect. Verified against PostgreSQL 16 with both schemes.
- An initializer that throws now fails boot. `_runInitializers` rethrew the error, but its own outer `catch`, meant for a missing directory, swallowed it as "No initializers directory found", so an app whose database initializer failed booted anyway and answered 500 to every query. `brails dev` now exits 1 with `Initializer config/initializers/<file> failed: <cause>`. Pinned by `test/core/initializers.test.js`.
- Writes work with CSRF protection on. The csrf middleware checked `X-CSRF-Token` against `session.csrfToken`, but nothing set that token, so every POST/PUT/PATCH/DELETE got `403 CSRF token mismatch` unless the app turned CSRF off. The session middleware now gives each session a random token, and actions read it as `this.csrfToken`. `test/controller/csrf_token.test.js` covers the round trip, and the Routing & Controllers guide shows it (`GET /csrf`).
- Docs deployment: the `Deploy Documentation` workflow made its `build` job depend on a GitHub Pages site that only a repository admin can create. Run 42344720510 (push of `bc4d6c8c`, the merge of PR #23) annotated that job with `Get Pages site failed. Error: Not Found` — the workflow token could read the Pages API, the site simply does not exist — and `Create Pages site failed. Error: Resource not accessible by integration`: creating a Pages site is a repository-administration operation that no workflow `permissions:` block can grant `GITHUB_TOKEN`. PR #23 could not have fixed it: it pinned `actions/configure-pages` to `v6.0.0` with `enablement: true`, which turns the action's read-only lookup into exactly that Create call, while its `Preflight Pages site` step was `continue-on-error: true` and only printed a warning — so the run stayed red. `docs.yml` now probes the Pages API read-only before `Build documentation`, records readiness as the `pagesReady` job output, always uploads `docs/.vitepress/dist` with `actions/upload-artifact`, and gates both `actions/upload-pages-artifact` and the `deploy` job on that output: a missing site leaves the build green with a `::warning` annotation naming the required setting and the deploy skipped. `actions/configure-pages` and `enablement:` are gone. The remaining step is human: **Settings > Pages > Build and deployment > Source = "GitHub Actions"**.

### Security

- N/A

## [0.1.0] - 2025-01-24

### Added

- Initial release
- Core framework architecture
- Documentation site
