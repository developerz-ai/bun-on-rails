# Convention Over Configuration

BunOnRails wires an app together from where its files live and what they are called. This page
lists the conventions the code follows today, and how to override them.

## What the app loads at boot

| Location                                     | Loaded as                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `config/<name>.js`                           | the config section `<name>`: `config/server.js` is `server`                            |
| `config/environments/<env>.js`               | overrides for the current environment (`BUN_ENV`, else `NODE_ENV`, else `development`) |
| `config/routes.js`                           | the routes                                                                             |
| `config/initializers/*.js`                   | each default-exported function is called with the application, in file-name order      |
| `app/controllers/**/*_controller.js`         | controllers, found by the route target                                                 |
| `app/models/**/*.js`                         | models                                                                                 |
| `app/jobs/`, `app/mailers/`, `app/channels/` | imported, but nothing runs them yet                                                    |

`db/migrations/` is not loaded at boot: a script runs it with `MigrationRunner` (see
[Migrations](../database/migrations.md)).

## Naming

| Kind                  | File                                        | Class                 | Used as                          |
| --------------------- | ------------------------------------------- | --------------------- | -------------------------------- |
| Model                 | `app/models/post.js`                        | `Post`                | table `posts`                    |
| Model                 | `app/models/blog_post.js`                   | `BlogPost`            | table `blog_posts`               |
| Controller            | `app/controllers/posts_controller.js`       | `PostsController`     | route target `posts#index`       |
| Namespaced controller | `app/controllers/admin/users_controller.js` | `UsersController`     | route target `admin/users#index` |
| Job                   | `app/jobs/send_welcome_email_job.js`        | `SendWelcomeEmailJob` |                                  |

A controller is found by its file path, and its class name does not matter. A model's class name
does: it gives the table name and the name associations look the model up by.

## Database conventions

| What        | Convention                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Table       | the class name, snake_case and pluralized (`Category` is `categories`). Set `static tableName` to override                        |
| Primary key | `id`                                                                                                                              |
| Foreign key | `belongsTo: ["user"]` reads `user_id`; `hasMany: ["comments"]` on `Post` reads `comments.post_id`                                 |
| Join table  | `hasAndBelongsToMany: ["tags"]` on `Post` reads `posts_tags` (both table names, in lexical order), columns `post_id` and `tag_id` |
| Timestamps  | `created_at` and `updated_at`: set on insert, `updated_at` refreshed on update. `static timestamps = false` opts out              |
| Booleans    | plain names such as `published`; no prefix rule                                                                                   |

```js
import { Model } from "bun-on-rails";

export default class Post extends Model {
  static associations = {
    belongsTo: ["user"],
    hasMany: ["comments"],
  };
}

Post.register();
```

See [Models](../database/models.md) for what `register()` does.

## Overriding a convention

**`app/models/person.js`**

```js
import { Model } from "bun-on-rails";

export default class Person extends Model {
  static tableName = "people";
  static primaryKey = "person_id";
}
```

**`app/models/post.js`**

```js
import { Model } from "bun-on-rails";

export default class Post extends Model {
  static associations = {
    belongsTo: [{ name: "author", model: "User", foreignKey: "author_id" }],
  };
}

Post.register();
```

Routes can point anywhere:

**`config/routes.js`**

```js
export default (router) => {
  router.get("/u/:username", "users#show");
  router.resources("articles", { controller: "posts" });
};
```

See [Routing & Controllers](../routing/overview.md) for every routing option.

## Not implemented yet

- **Generators beyond migration, model and controller.** `brails generate migration`, `model` and `controller` write those files in place; scaffold, job, mailer, channel and auth generators are not implemented yet.
