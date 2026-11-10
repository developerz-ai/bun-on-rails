# Database Overview

BunOnRails has an Active Record-style ORM: models with validations, callbacks and scopes, a
chainable query builder, and migrations. It lives in `src/database/`.

> **Status.**
>
> - The app connects at boot when `config/database.js` names a database (below).
> - `brails db:migrate` and `brails db:rollback` run migrations (see [Running migrations](./migrations.md#running-migrations)); the other `brails db:*` commands are not implemented yet and exit 1.
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

## Not implemented yet

- **The other `brails db:*` commands.** `db:create`, `db:drop`, `db:reset`, `db:seed`, `db:setup`,
  `db:schema:load` and `db:schema:dump` are registered but not implemented yet: each exits 1.
- **Automatic schema dump from `MigrationRunner`.** `brails db:migrate` and `db:rollback` rewrite
  `db/schema.js`; a `MigrationRunner` you call from your own script does not, so call
  `dumpSchema(connection, appRoot)` after it.
- **Model annotations.** Nothing writes schema comments into model files.
- **Many-to-many associations.** `hasAndBelongsToMany` does not load anything yet: its join
  query is a TODO, and `includes()` skips it with a warning.
- **Other databases.** PostgreSQL is the only adapter.
