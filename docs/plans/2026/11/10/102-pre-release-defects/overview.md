# Plan 102: defects found while preparing the release

**Goal.** Fix the boot and ORM defects that plan 101 found while making the docs truthful
(plan 101, findings 9 and 10), before the first npm publish of v0.1.0. Each fix is one PR in
milestone "v0.1.0 public release". The release bar already passes (`bin/qa-release`); none of
these blocks it.

**Rule for every task.** First, a test that reproduces the defect and fails. Then the fix. In
the same PR, update the docs page that describes the defect as current behaviour (the database
pages under `docs/eng/database/` document each one, with a workaround) so the docs never
describe a bug that is already fixed.

## Tasks

| Id  | Defect (as found)                                                                            | Where                                         |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| F1  | an initializer that throws is swallowed; the app boots and every query answers 500           | `src/application.js` `_runInitializers`       |
| F2  | a `postgresql://` URL is rejected as adapter `postgre`                                       | `src/database/connection.js`                  |
| F3  | queries name the table class name + `s` (`Category` → `categorys`); `save()` uses `tableize` | `src/database/model.js`, `query_builder.js`   |
| F4  | `where("x > ?", v)` placeholders produce invalid SQL                                         | `src/database/query_builder.js`               |
| F5  | `updateAll` / `deleteAll` / `updateWhere` / `deleteWhere` return 0 when rows change          | `src/database/model.js`, adapter result shape |
| F6  | `save()` always inserts `created_at` / `updated_at` and never refreshes `updated_at`         | `src/database/model.js`                       |
| F7  | `loadAssociation` fails for `hasMany`, and for a `model` given as a string                   | `src/database/associations.js`                |
| F8  | model queries ignore `connection.transaction`, so `lock()` does not hold                     | `src/database/model.js`, `connection.js`      |
| F9  | `MigrationRunner` fails on a relative migrations path                                        | `src/database/migration.js`                   |
| F10 | `loadSchema` creates tables alphabetically and fails on foreign keys                         | `src/database/schema.js`                      |
| F11 | `first()` / `last()` are ambiguous (`id`) after a join                                       | `src/database/query_builder.js`               |

Order: F1 first (smallest, and the database guide's connect-in-an-initializer advice depends on
it), then F2 to F7 (each a wrong result for ordinary use), then F8 to F11.

Connecting to the database at boot from `config/database.js` is a feature, not a defect, and is
out of this plan.

Observed while verifying F2, not yet a task: on Bun 1.3, `Connection.connect()` logs
`Bun.sql connection failed: SQLHelper is not a function` and falls back to postgres.js. The
fallback works, so queries succeed, but the native path is dead code on this Bun.
