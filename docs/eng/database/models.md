# Models

A model is a class that extends `Model`. Each one maps to a table. The examples assume the app
has a connection (see [Connect to PostgreSQL](./overview.md#connect-to-postgresql)) and that the
tables exist (see [Migrations](./migrations.md)).

## Defining a model

**`app/models/post.js`**

```js
import { Model } from "bun-on-rails";

export default class Post extends Model {}

Post.register();
```

The app imports every file under `app/models/` at boot. `Post.register()` adds the class to the
registry that associations use to find a model by name; call it for every model that takes part
in an association.

| Setting             | Default                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `static tableName`  | the class name, snake_case and pluralized: `Post` is `posts`, `BlogPost` is `blog_posts`, `Category` is `categories` |
| `static primaryKey` | `id`                                                                                                                 |

The same rule names the table for queries, `save()`, `update` and `delete`. Set `tableName` only
when your table does not follow it, such as `static tableName = "tbl_legacy"`.

`save()` fills in `created_at` and `updated_at` when it inserts a row, and refreshes `updated_at`
on every update, so a model's table needs both columns (`t.timestamps()` in a migration). For a
table without them, turn this off:

```js
export default class Setting extends Model {
  static timestamps = false;
}
```

## Attributes

A record keeps its column values in `record.attributes`, under their column names
(`created_at`, `user_id`). Read and write them with `get` and `set`:

```js
const post = await Post.find(1);

post.get("title"); // "Hello"
post.set("title", "Updated");
post.isDirty; // true
post.changedAttributes; // ["title"]
await post.save();
```

Assigning a property (`post.title = "x"`) does **not** change the attribute, and `save()` ignores
it. Use `set` or `update`.

`record.id` is the primary key value, and `record.persisted` (or its opposite, `record.isNew`)
says whether the row exists. `bigint` columns, `id` included, come back as strings (`"1"`).

## Create, read, update, delete

```js
// Create: returns the record. Check persisted or errors.
const post = await Post.create({ title: "Hello", user_id: user.id });

// Build, then save: save() returns true or false.
const draft = new Post({ title: "Draft", user_id: user.id });
await draft.save();

// Read
await Post.find(1); // throws RecordNotFoundError when missing
await Post.findById(1); // null when missing
await Post.findBy({ title: "Hello" }); // first match or null
await Post.findAll({
  where: { published: true },
  order: { created_at: "desc" },
  limit: 10,
});
await Post.first(); // lowest primary key, or null
await Post.last();
await Post.findOrCreateBy({ title: "About" });
await Post.findOrInitializeBy({ title: "Contact" }); // not saved

// Update
await post.update({ title: "New title" }); // sets, then saves; true or false
await post.reload();

// Delete
await post.destroy(); // true or false
await Post.deleteWhere({ published: false });
await Post.updateWhere({ published: false }, { published: true });
```

`findAll` takes `where`, `order`, `limit`, `offset` and `include`. For anything more, use the
[query builder](./queries.md).

`save()`, `update()` and `destroy()` return `false` instead of throwing. A failed validation puts
messages in `record.errors`, and a database error puts its message in `record.errors.base`.
`save_()` and `update_()` throw instead.

## Validations

```js
export default class User extends Model {
  static validations = {
    email: { presence: true, email: true, uniqueness: true },
    name: { length: { min: 2, max: 100 } },
    age: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
    role: { inclusion: { in: ["admin", "member"] } },
    username: { format: { with: /^[a-z0-9_]+$/ }, exclusion: { in: ["root"] } },
    password: { presence: { on: "create" } },
  };
}
```

| Validator      | Options                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `presence`     | `allowBlank`, `allowNull`                                                                                                    |
| `length`       | `min`, `max`, `is`, `in: [min, max]`                                                                                         |
| `format`       | `with`, `without` (or a bare regular expression)                                                                             |
| `numericality` | `onlyInteger`, `greaterThan`, `greaterThanOrEqualTo`, `lessThan`, `lessThanOrEqualTo`, `equalTo`, `otherThan`, `odd`, `even` |
| `inclusion`    | `in`                                                                                                                         |
| `exclusion`    | `in`                                                                                                                         |
| `email`, `url` | none                                                                                                                         |
| `uniqueness`   | `scope`, `caseSensitive`. Queries the database                                                                               |
| `acceptance`   | none                                                                                                                         |
| `confirmation` | `field` (default `<name>_confirmation`)                                                                                      |
| `custom`       | `validate: (value, record) => message or null`                                                                               |

Every validator also takes `message`, `on: "create"` or `on: "update"`, and `if` / `unless` (a
function `(record, value) => boolean`, or the name of a method or attribute). Most validators,
such as `length`, `format`, `numericality`, `inclusion` and `email`, pass a blank value: add
`presence` to require one.

Validations run on `save()`, and on `validate()` or `isValid()`, which return a boolean:

```js
const user = new User({ email: "nope", password: "secret" });
await user.isValid(); // false
user.errors; // { email: "email is invalid" }
user.errorsFor("email"); // ["is not a valid email"]
user.fullMessages(); // ["email is not a valid email"]
```

`record.errors` holds the first message per attribute. `errorsFor(name)` returns every message
for one attribute, and `fullMessages()` all of them.

`addValidator(name, (value, options) => message or null)` registers a validator of your own
under `name`.

## Callbacks

Define a method with a callback's name:

```js
export default class Post extends Model {
  beforeSave() {
    if (!this.get("slug") && this.get("title")) {
      this.set("slug", this.get("title").toLowerCase().replace(/\s+/g, "-"));
    }
  }
}
```

Or list method names in `static callbacks`, which run after the method of the same name:

```js
export default class User extends Model {
  static callbacks = { beforeSave: ["normalizeEmail"] };

  normalizeEmail() {
    this.set("email", this.get("email")?.toLowerCase());
  }
}
```

The order on save is `beforeValidation`, `afterValidation`, `beforeSave`, then `beforeCreate` and
`afterCreate` (new record) or `beforeUpdate` and `afterUpdate` (existing record), then
`afterSave`. `destroy()` runs `beforeDestroy` and `afterDestroy`. A `before` callback other than
`beforeValidation` that returns `false` stops the save or destroy, which then returns `false`.

## Scopes

```js
export default class Post extends Model {
  static scopes = {
    published: (query) => query.where({ published: true }),
    popular: (query, min = 100) => query.where({ views: { ">": min } }),
  };
}

await Post.published().all();
await Post.published().scope("popular", 500).all();
```

Each scope becomes a static method that returns a query builder. A builder does not have the
scope methods, so chain a second scope with `.scope(name, ...args)`. A builder is not a promise:
end the chain with `.all()`, `.first()` or another [terminal method](./queries.md#terminal-methods).

## Associations

```js
export default class Post extends Model {
  static associations = {
    belongsTo: ["user"], // posts.user_id
    hasMany: ["comments"], // comments.post_id
  };
}

Post.register();
```

`hasOne` works like `hasMany` and loads one record. An entry can also be an object:
`{ name: "author", model: "User", foreignKey: "user_id" }`.

`hasAndBelongsToMany: ["tags"]` on `Post` reads the join table `posts_tags` (the two table names in
lexical order) with the columns `post_id` and `tag_id`. `joinTable`, `foreignKey` and
`associationForeignKey` override them:
`{ name: "labels", model: "Tag", joinTable: "post_labels", associationForeignKey: "label_id" }`.

The associated class is found in the `register()` registry: `user` and `comments` resolve to the
`User` and `Comment` classes.

Load associations for many records with `includes()`, one query per association (two for
`hasAndBelongsToMany`, the join table then the records). Each record gets a property named after
the association, and a name the model does not declare throws:

```js
const posts = await Post.includes("user", "comments").all();
posts[0].user; // a User, or null
posts[0].comments; // an array of Comment

await Post.includes("comments.user").all(); // nested
```

These properties are not attributes, so `render` and `toJSON()` leave them out.

For one record, `await post.loadAssociation("comments")` loads any `belongsTo`, `hasMany`,
`hasOne` or `hasAndBelongsToMany` association. The class is the one given as `model` (a class, or the name of a registered
one), else the association name singularized and capitalized: `comments` is `Comment`, `author` is
`Author`. `includes()` resolves classes the same way. Register each model with `Model.register()`.

## Not implemented yet

- **Association methods** such as `post.user()` or `user.posts()` are not wired up. Use
  `includes()` or `loadAssociation()`.
- **Model annotations.** Nothing writes the schema into model files.
