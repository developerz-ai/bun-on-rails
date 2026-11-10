# Database Overview

BunOnRails has an Active Record-style ORM: models with validations, callbacks and scopes, a
chainable query builder, and migrations. It lives in `src/database/`.

> **Status.** The ORM works once your app hands it a connection, but nothing wires it up for
> you yet:
>
> - The app does **not** connect to a database at boot. `config/database.js` is read into the
>   config and nothing else uses it. You open the connection yourself (below).
> - No database command is implemented. Every `brails db:*` command is registered but not implemented yet and exits 1. Run migrations from a script with `MigrationRunner` (see [Running migrations](./migrations.md#running-migrations)).
> - PostgreSQL is the only adapter (`src/database/adapters/postgres.js`).

## Connect to PostgreSQL

Open a connection in an initializer. The app runs every `config/initializers/*.js` at boot, in
file-name order, and passes each default-exported function the application:

**`config/initializers/database.js`**

```js
import { Connection, setConnection } from "bun-on-rails";

export default async function connectDatabase() {
  const connection = new Connection({ url: process.env.DATABASE_URL });
  await connection.connect();
  setConnection(connection);
}
```

Put `DATABASE_URL=postgres://user:password@localhost:5432/myapp` in `.env`: Bun loads it
automatically. Both `postgres://` and `postgresql://` URLs work. `setConnection` makes this the
connection every model and query uses.

If the initializer throws (a wrong password, a database that is down), boot fails: `brails dev`
exits 1 with `Initializer config/initializers/database.js failed: <the cause>`.

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

## Not implemented yet

- **Connecting at boot from `config/database.js`.** Use an initializer, as above.
- **`brails db:*` commands.** `brails db:migrate`, `db:rollback`, `db:setup` and the rest are registered but not implemented yet: each exits 1.
- **Automatic schema dump.** Running migrations does not update `db/schema.js`. Call
  `dumpSchema` yourself (see [Dump the schema](./migrations.md#dump-the-schema)).
- **Model annotations.** Nothing writes schema comments into model files.
- **Many-to-many associations.** `hasAndBelongsToMany` does not load anything yet: its join
  query is a TODO, and `includes()` skips it with a warning.
- **Other databases.** PostgreSQL is the only adapter.
