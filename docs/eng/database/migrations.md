# Migrations

A migration is a file in `db/migrations/` that changes the schema in `up()` and undoes the change
in `down()`. Nothing in the CLI runs migrations yet: you run them from a short script with
`MigrationRunner` (see [Running migrations](#running-migrations)).

Name each file `<version>_<name>.js`. The version is everything before the first `_`; use a
timestamp such as `20260110120000`, so that file-name order is the order to run them in.

## Writing a migration

A migration is either two exported functions or a `Migration` subclass.

### Functions

**`db/migrations/20260110120000_create_posts.js`**

```js
export async function up(db) {
  await db.createTable("posts", (t) => {
    t.id();
    t.string("title").notNull();
    t.text("body");
    t.boolean("published").default(false);
    t.references("user").notNull().onDelete("cascade");
    t.timestamps();
  });

  await db.addIndex("posts", ["user_id"]);
}

export async function down(db) {
  await db.dropTable("posts");
}
```

`db` is the `Connection` you hand to `MigrationRunner`. It has:

| Method                                       | Does                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `createTable(name, (t) => {...})`            | `CREATE TABLE`, with the columns below                                      |
| `dropTable(name)`                            | `DROP TABLE IF EXISTS`                                                      |
| `addColumn(table, column, sqlType, options)` | `sqlType` is SQL (`"varchar(255)"`); options `notNull`, `default`, `unique` |
| `removeColumn(table, column)`                | `DROP COLUMN`                                                               |
| `addIndex(table, columns, options)`          | options `unique`, `name`, `using`, `where`                                  |
| `removeIndex(table, nameOrColumns)`          | an index name, or the column array it was created with                      |
| `query(sql, params)`                         | any SQL, with `$1`-style parameters                                         |

This `createTable` does not create the indexes that `t.references()` and `t.index()` ask for.
Add them with `addIndex`, as above.

### A Migration subclass

**`db/migrations/20260110120100_create_comments.js`**

```js
import { Migration } from "bun-on-rails";

export default class CreateComments extends Migration {
  async up() {
    await this.createTable("comments", (t) => {
      t.id();
      t.text("body").notNull();
      t.references("post").onDelete("cascade");
      t.timestamps();
    });
  }

  async down() {
    await this.dropTable("comments");
  }
}
```

The subclass's `createTable` also creates the indexes, and it has more methods:

| Method                                                              | Does                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `createTable`, `dropTable(name)`, `renameTable(old, new)`           |                                                           |
| `addColumn(table, column, type, options)`                           | `type` is a column type from the table below (`"string"`) |
| `removeColumn(table, column)`, `renameColumn(table, old, new)`      |                                                           |
| `changeColumn(table, column, type)`                                 | changes the type                                          |
| `changeColumnNull(table, column, notNull)`                          | `true` sets `NOT NULL`, `false` drops it                  |
| `changeColumnDefault(table, column, value, type)`                   |                                                           |
| `addIndex(table, columns, options)`                                 | options `unique`, `name`, `using`, `where`                |
| `removeIndex(table, { name })` or `{ column }`                      |                                                           |
| `addForeignKey(fromTable, toTable, { column, onDelete, onUpdate })` | `column` defaults to `<singular toTable>_id`              |
| `removeForeignKey(fromTable, { toTable, column })` or `{ name }`    |                                                           |
| `execute(sql, params)`                                              | any SQL                                                   |

## Column types

Inside `createTable`, `t` is a table builder:

| Method                                                                | PostgreSQL type                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `t.id()`                                                              | `BIGSERIAL PRIMARY KEY`                                                           |
| `t.string(name, { limit })`                                           | `VARCHAR(255)`, or the limit                                                      |
| `t.text(name)`                                                        | `TEXT`                                                                            |
| `t.integer`, `t.bigint`, `t.smallint`                                 | `INTEGER`, `BIGINT`, `SMALLINT`                                                   |
| `t.boolean(name)`                                                     | `BOOLEAN`                                                                         |
| `t.decimal(name, { precision, scale })`                               | `NUMERIC(precision, scale)`                                                       |
| `t.float`, `t.double`                                                 | `FLOAT`, `DOUBLE PRECISION`                                                       |
| `t.date`, `t.time`                                                    | `DATE`, `TIME`                                                                    |
| `t.datetime(name, { timezone })`                                      | `TIMESTAMP`, or `TIMESTAMPTZ` with `timezone: true`                               |
| `t.json`, `t.jsonb`, `t.uuid`                                         | `JSON`, `JSONB`, `UUID`                                                           |
| `t.binary`                                                            | `BYTEA`                                                                           |
| `t.inet`, `t.cidr`, `t.macaddr`, `t.tsvector`, `t.point`, `t.polygon` | the type of the same name                                                         |
| `t.array(name, type)`                                                 | an array of `type`: `t.array("tags", "string")` is `VARCHAR(255)[]`               |
| `t.references(name, options)`                                         | `<name>_id BIGINT`, a foreign key to `<name>s (id)`, and an index (subclass form) |
| `t.timestamps({ timezone })`                                          | `created_at` and `updated_at`, `NOT NULL DEFAULT NOW()`                           |
| `t.index(columns, { unique, name })`                                  | an index on the table (subclass form)                                             |

Each column method returns a builder for these modifiers, chained as in the examples:
`notNull()`, `unique()`, `default(value)`, `check("x >= 0")`, `index()`, and on a reference
`onDelete(action)` and `onUpdate(action)`.

`t.references` names the referenced table with the same plural rule as models, so
`t.references("category")` points at `categories`. Pass `table` when yours differs:
`t.references("author", { table: "users" })`. Its other options are `column`, `index: false` and `polymorphic: true`, which adds a `<name>_type` column
instead of the foreign key.

## Generating migrations and models

```bash
brails g migration CreateTags name:string count:integer
brails g model Post title:string body:text user:references
```

`g migration Create<Table>` writes a `createTable` migration with the fields and timestamps; any
other name writes an empty `up` / `down` to fill in. `g model` writes `app/models/<name>.js` (with
`belongsTo` for each `references` field) and its `create_<table>` migration. Field types are the
column methods above, plus `references`. Existing files are never overwritten, and migrations
generated in the same second get distinct versions. `brails g controller Posts index show` writes
`app/controllers/posts_controller.js`. A generated model calls `register()`.

`brails g scaffold Post title:string body:text user:references` writes the model and its
migration, a JSON controller with `index`, `show`, `create`, `update` and `destroy` (it accepts the
generated fields, through `StrongParams`, and nothing else), a request test in
`test/controllers/posts_controller.test.js`, and adds `router.resources('posts')` to
`config/routes.js`. It checks every file first, so a conflict writes nothing. The test runs on the
database `config/database.js` names for the test environment; run `brails db:migrate`, or let the
test's `setupDatabase()` migrate it.

## Running migrations

```bash
brails db:migrate              # run every pending migration, then update db/schema.js
brails db:rollback             # roll back the latest one
brails db:rollback --step=3    # or the latest three
```

Both use the database `config/database.js` names (`DATABASE_URL` in a generated app). `db:migrate`
runs every pending migration in `db/migrations` in file-name order and records each version in a
`schema_migrations` table; `db:rollback` runs `down()` for the latest versions and removes them.
Either way, `db/schema.js` is rewritten afterwards (see [Dump the schema](#dump-the-schema)).

To run migrations from your own code, use `MigrationRunner`:

**`db/migrate.js`**

```js
import { Connection, MigrationRunner } from "bun-on-rails";

const connection = new Connection({ url: process.env.DATABASE_URL });
await connection.connect();

const runner = new MigrationRunner(connection, "db/migrations");
await runner.migrate();

await connection.disconnect();
```

```bash
bun run db/migrate.js
```

`migrate()` runs every pending migration in file-name order and records each version in a
`schema_migrations` table. A relative migrations directory is resolved against the working
directory, so run the script from the app root; an absolute path works from anywhere.

The runner also has:

- `rollback(steps = 1)` runs `down()` for the latest `steps` versions and removes them from
  `schema_migrations`;
- `status()` returns `{ version, file, status }` for each file, `status` being `"up"` or
  `"down"`;
- `getPending()` returns the files not run yet.

A migration that has run is history: change the schema with a new migration rather than by
editing an old one.

## Dump the schema

```bash
brails db:schema:dump   # write db/schema.js from the database
brails db:schema:load   # load db/schema.js into an empty database
```

`brails db:migrate` and `db:rollback` already rewrite `db/schema.js` after each run. `db:schema:load`
creates every table in an empty database and marks the schema's version, and every migration file
up to it, as run, so a later `db:migrate` only runs newer migrations.

From your own code, `dumpSchema(connection, appRoot)` writes `db/schema.js` under `appRoot`, and
`loadSchema(connection, appRoot)` loads it. To dump after a hand-run `MigrationRunner`:

```js
import { Connection, MigrationRunner, dumpSchema } from "bun-on-rails";

// ...connect and migrate as above, then:
await dumpSchema(connection, process.cwd());
```

`db/schema.js` is generated: never edit it by hand.

The dump lists tables so that each comes after the tables its foreign keys reference, so they
load in a working order. Foreign keys that form a cycle between tables cannot be dumped this way: `dumpSchema`
throws and names the tables.

## Not implemented yet

- **Automatic schema dump from `MigrationRunner`.** `runner.migrate()` in your own script does not
  update `db/schema.js`; `brails db:migrate` does.
