# Plan 105: no silent stubs; test support that works

**Goal.** Nothing exported from `bun-on-rails` reports success without doing its job. Plan 101's
T2 made the planned CLI commands exit with an error. The library still has stubs, measured on
2026-11-10 by parsing `src/` for function bodies that have no statements, or only a `return`, and
hold a `TODO`: 96 of them in 10 files, each reachable from the package entry:

| Where                                               | Stubs | What a caller gets today                                                      |
| --------------------------------------------------- | ----: | ----------------------------------------------------------------------------- |
| `src/storage/storage.js`                            |    22 | `upload`, `get`, `url` resolve `undefined`; nothing stored                    |
| `src/jobs/job.js`                                   |    15 | `performLater` / `performIn` / `performAt` enqueue nothing                    |
| `src/react/forms.js`, `src/react/hooks.js`          |    22 | placeholder values; `useResource` never loads                                 |
| `src/websocket/channel.js`                          |    12 | `send`, `broadcast`, the channel server do nothing                            |
| `src/cache/cache.js` (Redis store)                  |     8 | `get` is always a miss, `set` stores nothing                                  |
| `src/mail/mailer.js`                                |     7 | `deliver` / `deliverLater` send nothing                                       |
| `src/testing/database.js`, `src/testing/request.js` |     9 | `withinTransaction(cb)` never runs `cb`; `request.get()` resolves `undefined` |
| `src/database/associations.js`                      |     1 | a `hasAndBelongsToMany` reader resolves `undefined`                           |

The docs say most of these are stubs, but a caller who misses that loses mail, jobs and uploads with
no error, and a test written inside `withinTransaction` passes without running.

**Rule for every task.** A test that fails first; the README, CLAUDE.md, CHANGELOG and every docs page
that describes the API change in the same PR; database features are also run against PostgreSQL 16.

## Tasks

| Id  | What                                                                                                         | Where                                              |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| S1  | a guard rejects a TODO-only body under `src/`; every planned API throws `NotImplementedError` naming itself  | `src/support/`, the modules above, `test/support/` |
| S2  | a config naming a backend that is not built (`cache.store: 'redis'`, `jobs.adapter: 'bullmq'`) fails at boot | `src/application.js`                               |
| S3  | test-database isolation: `withinTransaction`, `cleanDatabase`, `setupDatabase` work                          | `src/testing/database.js`                          |
| S4  | the exported `request` (a `TestRequest`) sends through an app and returns a `TestResponse`                   | `src/testing/request.js`                           |
| S5  | `hasAndBelongsToMany` loads through its join table                                                           | `src/database/associations.js`                     |
| S6  | `brails test` runs `bun test` with `NODE_ENV=test`                                                           | `src/cli/commands/test.js`                         |

Boot has the same defect one seam earlier: with `cache.store: 'redis'` (the demo's production
config) it logs a warning and uses the memory store, and with `jobs.adapter: 'bullmq'` it logs "Job
queue initialized with BullMQ" and initializes nothing. S2 makes both refuse to boot.

Order: S1 first, so that S3 to S5 each replace a loud `NotImplementedError` with the working
feature, and the guard keeps a new silent stub from landing meanwhile.
