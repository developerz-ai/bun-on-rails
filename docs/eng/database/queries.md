# Queries

Queries are built by chaining methods on a query builder and run by a terminal method such as
`all()` or `first()`. A builder is not a promise: `await Post.where({ published: true })`
without a terminal method returns the builder, not records.

The examples assume a connection (see [Connect to PostgreSQL](./overview.md#connect-to-postgresql)).

## Starting a query

`Model.query()` returns a builder for the model's table. These shortcuts exist on the model
itself: `where`, `order`, `limit`, `offset`, `select`, `includes`, `page`, `per`, `scope`, and
the terminals `all`, `first`, `last`, `count`, `exists`, `pluck`, `ids` and `paginate`. Every
other method is on the builder only, so start with `Post.query()`:

```js
await Post.where({ published: true }).all();
await Post.query().whereNot({ published: true }).all();
await Post.query().sum("views");
```

## Conditions

```js
Post.where({ published: true, user_id: 1 }); // =, joined with AND
Post.where({ title: ["Hello", "World"] }); // IN (...)
Post.where({ body: null }); // IS NULL
Post.where({ views: { ">": 100 } }); // >, >=, <, <=, !=
Post.where({ title: { ilike: "%hello%" } }); // like, ilike
Post.where({ views: { between: [100, 200] } });
Post.where({ id: { in: [1, 2] } }); // in, not_in

Post.query().whereNot({ published: true }); // !=, NOT IN, IS NOT NULL
Post.where({ views: 50 }).orWhere({ views: 500 }); // (views = 50 OR views = 500)
```

`orWhere` joins its condition to the condition right before it with `OR`.

A string condition is inserted into the SQL as written. Pass values after it, with a `?` for each,
and they are sent as query parameters, never spliced into the SQL:

```js
Post.where("views > ? AND views < ?", 10, 100);
Post.where({ status: "published" }).where("title ILIKE ?", `%${term}%`);
```

PostgreSQL-style `$1`, `$2` work too, numbered from 1 within the condition. A `?` inside a quoted (`'...'`, `$$...$$` or `$tag$...$tag$`)
literal is left alone, and a condition with no values is not scanned at all (so the jsonb `?`
operator still works). A placeholder count that does not match the values throws. Never build the
condition string itself from user input.

Column names in the object forms are quoted as one identifier, so `{ "users.name": "Ada" }` does
not reach a joined table. Use a string condition for that.

## Ordering, limits and columns

```js
Post.order("title"); // ASC
Post.order({ created_at: "desc", id: "asc" });
Post.order({ views: "desc" }).reorder("id"); // replaces the earlier order
Post.limit(10).offset(20);
Post.select("id", "title"); // plain column names
Post.select("user_id").distinct();
```

## Joins

```js
await Post.query()
  .join("users", "users.id = posts.user_id")
  .where("users.name = 'Ada'")
  .select("title")
  .all();
```

`join(table, on)` is an inner join; `leftJoin`, `rightJoin` and `fullJoin` take the same
arguments. Every joined column lands in the record's attributes, and a column name both tables
share (`id`) keeps one of the two values, so select the columns you need. After a join,
`first()` and `last()` fail because their default `ORDER BY "id"` is ambiguous: use
`limit(1).all()`.

## Eager loading

```js
await Post.includes("user", "comments").all();
await Post.includes("comments.user").all();
```

Each record gets a property per association. See [Associations](./models.md#associations).

## Scopes

```js
await Post.published().all();
await Post.where({ user_id: 1 }).scope("published").all();
```

See [Scopes](./models.md#scopes).

## Terminal methods

| Method                                | Returns                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `all()`                               | an array of records                                                       |
| `first()` / `last()`                  | one record or `null`, by primary key unless ordered                       |
| `count()`                             | a number                                                                  |
| `exists()`                            | a boolean                                                                 |
| `pluck(column)`                       | an array of that column's values                                          |
| `ids()`                               | an array of primary keys                                                  |
| `sum(column)` / `average(column)`     | a number                                                                  |
| `minimum(column)` / `maximum(column)` | the column's value                                                        |
| `paginate()`                          | a `PaginatedResult` (below)                                               |
| `findEach(fn, { batchSize })`         | calls `fn` with each record, loading `batchSize` at a time (default 1000) |
| `findInBatches(fn, { batchSize })`    | calls `fn` with each batch                                                |
| `updateAll(attributes)`               | runs `UPDATE` on the matching rows; returns how many changed              |
| `deleteAll()`                         | runs `DELETE` on the matching rows; returns how many were deleted         |

`sum`, `average`, `minimum`, `maximum`, `findEach`, `findInBatches`, `updateAll` and `deleteAll`
are on the builder only (`Post.query().sum("views")`). `updateAll` and `deleteAll` skip
validations and callbacks, and the number they return is not the count of affected rows yet.

`toSQL()` returns `{ sql, params }` without running the query, and `toSQLString()` the SQL with
the parameters filled in, for debugging.

## Pagination

```js
const result = await Post.where({ published: true }).page(2).per(20).paginate();

result.records; // the records on page 2
result.currentPage; // 2
result.perPage; // 20
result.totalCount; // matching rows across all pages
result.totalPages;
result.hasNextPage;
result.hasPreviousPage;

for (const post of result) {
  // iterates the records
}

this.render(result.toJSON()); // in an action: { records: [...], pagination: {...} }
```

`page` defaults to 1 and `per` to 25. `Post.paginate({ page: 2, perPage: 20 })` is a shortcut,
and `page(2).per(20).all()` returns just the records.

## Raw SQL

The connection runs SQL with `$1`-style parameters and returns plain row objects:

```js
import { getConnection } from "bun-on-rails";

const rows = await getConnection().query(
  "SELECT user_id, count(*)::int AS posts FROM posts WHERE views > $1 GROUP BY user_id",
  [100],
);
```

`connection.transaction(async (tx) => { await tx.query(...) })` runs its callback in a
transaction. If the callback throws, the transaction rolls back and `transaction` throws. Only
`tx.query` runs inside the transaction: model methods keep using the global connection.

## Not implemented yet

- **Aggregate columns in `select`.** Every argument is quoted as a column name, so
  `select("COUNT(*) AS n")` fails. Use raw SQL.
- **Model queries in a transaction.** Models always use the global connection, outside any
  `connection.transaction`. For the same reason `lock()`, which adds `FOR UPDATE`, holds the
  lock only for its own statement.
