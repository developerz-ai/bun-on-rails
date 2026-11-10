# Plan 104: the planned CLI commands and routing gaps

**Goal.** Turn the most useful "Planned" entries into working features, one PR each, in milestone
"v0.1.0 public release". With the database connected at boot (plan 103), the database commands
come first.

**Rule for every task.** A test that fails first; the help text, `brails help` tests, README,
CLAUDE.md and the docs pages that list the feature as planned move it to working in the same PR;
database features are also run against PostgreSQL 16.

## Tasks

| Id  | What                                                                          | Where                                     |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| C1  | `brails db:migrate`, `brails db:rollback [--step=N]`, updating `db/schema.js` | `src/cli/commands/db.js`                  |
| C2  | `brails db:schema:dump`, `db:schema:load`, `db:seed` (`db/seeds.js`)          | `src/cli/commands/db.js`                  |
| C3  | `brails db:create`, `db:drop`, `db:reset`, `db:setup`                         | `src/cli/commands/db.js`                  |
| C4  | `brails routes`: list the app's routes                                        | `src/cli/commands/routes.js`              |
| C5  | `brails generate migration`, `model`, `controller`                            | `src/cli/commands/generate.js`, templates |
| R1  | `only` / `except` options for `beforeAction` / `afterAction` in dispatch      | `src/application.js`                      |
| R2  | nested resources and `scope(path)` with a real path prefix                    | `src/routing/router.js`                   |
