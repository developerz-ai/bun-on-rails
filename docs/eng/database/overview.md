# Database Overview

BunOnRails has an Active Record-style ORM: models with validations, callbacks and scopes, a
chainable query builder, and migrations. It lives in `src/database/`.

> **Status.**
>
> - The app connects at boot when `config/database.js` names a database (below).
> - Every `brails db:*` command works: see [Database commands](#database-commands).
> - PostgreSQL is the only adapter (`src/database/adapters/postgres.js`).

## Connect to PostgreSQL

`brails new` writes `config/database.js`, which reads `DATABASE_URL`:

**`config/database.js`**

```js
export default {
  url: process.env.DATABASE_URL,
};
```

Put `DATABASE_URL=postgres://user:password@localhost:5432/myapp` in `.env`: Bun loads it
automatically. Both `postgres://` and `postgresql://` URLs work. At boot the app connects and
makes that connection the one every model and query uses, and it closes it on stop. With no
`DATABASE_URL`, the app runs without a database.

A database that cannot be reached (a wrong password, a server that is down) fails boot: `brails
dev` exits 1 with `Cannot connect to the database configured in config/database.js: <the
cause>`.

`config/database.js` can also hold one block per environment, `{ development: {...}, test:
{...}, production: {...} }`, and the app uses the block for the current environment (`BUN_ENV`,
else `NODE_ENV`, else `development`). To connect some other way, open a `Connection` yourself in
an initializer and pass it to `setConnection`.

`new Connection({...})` also takes `host`, `port`, `database`, `username`, `password` and `ssl`
instead of `url`. It uses Bun's built-in SQL driver (`Bun.SQL`), and the `postgres` package only
on a Bun without it or with `useBunSql: false`. Both return the same results: `bigint` columns
such as `id` come back as strings.

## A model in a controller

**`app/models/post.js`**

```js
import { Model } from "bun-on-rails";

export default class Post extends Model {
  static validations = {
    title: { presence: true, length: { max: 200 } },
  };

  static scopes = {
    published: (query) => query.where({ published: true }),
  };
}
```

**`app/controllers/posts_controller.js`**

```js
import { Controller } from "bun-on-rails";
import Post from "../models/post.js";

export default class PostsController extends Controller {
  async index() {
    const posts = await Post.published()
      .order({ created_at: "desc" })
      .limit(10)
      .all();
    return this.render({ posts });
  }
}
```

`render` serializes each record to its column values. The table (`posts`) has to exist first:
see [Migrations](./migrations.md).

## Pages

- [Models](./models.md): defining models, saving, validations, callbacks, scopes and
  associations.
- [Queries](./queries.md): the query builder, aggregates, pagination and raw SQL.
- [Migrations](./migrations.md): writing migrations, running them, and dumping the schema.

## N+1 query warnings

In development (`BUN_ENV`, else `NODE_ENV`, unset or `development`), queries run through `all()`
and `count()` are tracked. When the same query shape runs 3 times within a second, a warning
with a stack trace is printed, pointing at `includes()` or a single `where({ id: ids })`. Call
`disableN1Detection()` (exported from `bun-on-rails`) to turn it off.

## Database commands

Each uses the database `config/database.js` names (`DATABASE_URL` in a generated app):

| Command                         | Does                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| `brails db:create`              | creates the database (an existing one is reported, not an error)            |
| `brails db:drop`                | drops it; refuses in production without `--force`                           |
| `brails db:migrate`             | runs pending migrations, then rewrites `db/schema.js`                       |
| `brails db:rollback [--step=N]` | rolls back the latest migrations, then rewrites `db/schema.js`              |
| `brails db:schema:dump`         | writes `db/schema.js` from the database                                     |
| `brails db:schema:load`         | loads `db/schema.js` into an empty database and marks its migrations as run |
| `brails db:seed`                | runs `db/seeds.js` (below)                                                  |
| `brails db:setup`               | `db:create`, `db:schema:load`, then `db:seed` when `db/seeds.js` exists     |
| `brails db:reset`               | `db:drop`, then `db:setup` (`--force` in production)                        |

`db:create` and `db:drop` run on the server's `postgres` maintenance database, so the database user
needs the `CREATEDB` privilege. A query error's `code` is the PostgreSQL SQLSTATE (for example
`23505` for a unique violation), whichever driver ran it.

## Seed data

`brails db:seed` runs `db/seeds.js` with the app's database set for models:

**`db/seeds.js`**

```js
import User from "../app/models/user.js";

export default async function seed() {
  await User.create({ name: "Ada" });
}
```

The file can also do its work at the top level; a default-exported function is called with the
connection.

## Tests with a database

`bun test` sets `NODE_ENV=test`, so `config/database.js` gives its `test` block. In a generated app
that reads `DATABASE_URL`: point it at a test database. Three helpers from `bun-on-rails` set the
database up and keep tests apart:

**`test/models/post.test.js`**

```js
import { beforeAll, test, expect } from "bun:test";
import { setupDatabase, withinTransaction } from "bun-on-rails";
import Post from "../../app/models/post.js";

beforeAll(() => setupDatabase());

test("a post can be created", () =>
  withinTransaction(async () => {
    await Post.create({ title: "Hello" });
    expect(await Post.count()).toBe(1);
  }));
```

| Helper                        | Does                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupDatabase({ root })`     | connects to the database `config/database.js` names (a connection already set is used as it is), loads `db/schema.js` into an empty database, then runs pending migrations. Drops nothing     |
| `withinTransaction(callback)` | runs `callback` in a transaction and rolls it back afterwards, even when it succeeds. Models use the transaction, and a failing assertion comes back unchanged                                |
| `cleanDatabase()`             | empties every table except `schema_migrations` and restarts their ids, in the database the test config names. Refuses unless `NODE_ENV` is `test`, so a dev server or a script cannot call it |

A `connection.transaction()` that the code under test opens inside `withinTransaction` joins the
test's transaction, so it is rolled back with the test. Called inside an open transaction,
`withinTransaction` rolls back to a savepoint, so the outer commit keeps nothing it wrote.

`bun test` sets `NODE_ENV=test` itself, so neither helper checks which database it is given:
`cleanDatabase()` empties the one `DATABASE_URL` names. Point it at a test database, never the
development one, when you run the tests.

## Not implemented yet

- **Automatic schema dump from `MigrationRunner`.** `brails db:migrate` and `db:rollback` rewrite
  `db/schema.js`; a `MigrationRunner` you call from your own script does not, so call
  `dumpSchema(connection, appRoot)` after it.
- **Model annotations.** Nothing writes schema comments into model files.
- **Other databases.** PostgreSQL is the only adapter.
