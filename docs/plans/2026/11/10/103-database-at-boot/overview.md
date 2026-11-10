# Plan 103: connect to the database at boot

**Goal.** A generated app talks to PostgreSQL as soon as `DATABASE_URL` is set, with no initializer
to write. Until now `Application._initializeDatabase` only stored `config/database.js` ("will be
implemented"), so models had no connection unless app code opened one.

## Task

| Id  | What                                                                                                                                                                                                                                                        | Where                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| B1  | connect at boot from `config/database.js` (`url` / `database`, or the current environment's block); set it as the models' connection; close it on stop; fail boot when it cannot connect; `brails new` writes a `config/database.js` reading `DATABASE_URL` | `src/application.js`, `src/cli/templates/app/config/database.js.tmpl` |

## Decisions

- **No `DATABASE_URL`, no database.** The generated config reads only `DATABASE_URL`, so a fresh app,
  the test suite and `bin/dev` need no PostgreSQL. The demo app's config drops its localhost
  fallbacks for the same reason: with them, every boot required a running database.
- **Fail boot on a bad connection**, as initializers do since plan 102 F1: a running app whose every
  query fails is worse than one that will not start.
- **Connecting in an initializer still works** for anything custom: open a `Connection` and pass it
  to `setConnection`.
