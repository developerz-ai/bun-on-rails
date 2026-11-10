# Plan 106: the ORM contract

**Goal.** A model behaves the way the guide says and a Rails user expects, with one implementation of
each thing. Plan 105 found these while making the test support and the demo work:

- `save()` and `destroy()` catch every exception and turn it into `record.errors.base` plus `false`:
  a unique violation loses its SQLSTATE, a `TypeError` in a callback reads like a validation
  failure, and inside `connection.transaction()` the caller carries on in a transaction PostgreSQL
  has already aborted.
- Association methods are not wired: `static associations` declares `comments`, but
  `post.comments()` exists only after an internal `defineAssociations(Post)` nothing calls.
- `associations.js` holds a second eager loader, `EagerLoader`, that only its own tests use.
- A scope is a static method only: `Post.published().recent()` throws, and the guide says to write
  `.scope('recent')`.

**Rule for every task.** A test that fails first; the guide and CHANGELOG change in the same PR;
database behaviour is also run against PostgreSQL 16.

## Tasks

| Id  | What                                                                                                                                                                        | Where                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| O1  | `save()` / `destroy()` throw what they do not handle (a `DatabaseError` with its SQLSTATE, a callback's error); `false` stays for validation failures and halting callbacks | `src/database/model.js`                                  |
| O2  | `register()` wires association methods (`post.comments()`, `post.user()`), and `includes()` fills the same cache                                                            | `src/database/model.js`, `src/database/associations.js`  |
| O3  | delete `EagerLoader`, the eager loader no app runs                                                                                                                          | `src/database/associations.js`                           |
| O4  | a scope chains on a query builder: `Post.published().recent()`                                                                                                              | `src/database/model.js`, `src/database/query_builder.js` |
