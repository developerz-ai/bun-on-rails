# Project Structure

## What `brails new` creates

```
myapp/
├── app/
│   └── controllers/
│       ├── home_controller.js     # GET /
│       └── health_controller.js   # GET /health
├── config/
│   ├── database.js                # connects when DATABASE_URL is set
│   └── routes.js
├── .env.example                   # variable names only
├── .gitignore
├── package.json                   # depends on bun-on-rails
└── README.md
```

## What the framework loads at boot

`brails dev` loads each of these from the app root if it exists. A missing directory is
skipped.

| Path                           | Loaded as                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `config/routes.js`             | the routes. See [Routing & Controllers](../routing/overview.md)                                               |
| `app/controllers/**/*.js`      | controllers, named by path: `posts_controller.js` is `posts`, `admin/users_controller.js` is `admin/users`    |
| `app/models/**/*.js`           | models. See [Database Overview](../database/overview.md); the app connects at boot when `DATABASE_URL` is set |
| `app/jobs/**/*.js`             | job classes. `performNow` runs a job inline; `performLater` queues it in-process                              |
| `app/mailers/**/*.js`          | mailer classes. Delivery is not implemented yet                                                               |
| `app/channels/**/*.js`         | WebSocket channel classes. The channel server wiring is not implemented yet                                   |
| `config/<name>.js`             | the config section `<name>`: `config/security.js` exporting `{ csrf: false }` sets `security.csrf`            |
| `config/environments/<env>.js` | overrides for the current environment, taken from `BUN_ENV`, else `NODE_ENV`, else `development`              |
| `config/initializers/*.js`     | functions run once at boot, in file-name order, each called with the application. One that throws fails boot  |

Each file in those directories default-exports its class (or function, for initializers).
A file under `app/` that fails to import is skipped with a warning in the log, and its routes
answer `404`. An initializer is different: one that fails to import, or throws, fails boot.

## Naming

| Kind       | File                                  | Name / class               |
| ---------- | ------------------------------------- | -------------------------- |
| Controller | `app/controllers/posts_controller.js` | `posts`, `PostsController` |
| Model      | `app/models/post.js`                  | `Post`                     |
| Job        | `app/jobs/send_welcome_email_job.js`  | `SendWelcomeEmailJob`      |
| Table      | (from the model)                      | plural snake_case: `posts` |

## Environment variables

Bun loads `.env` automatically. Keep secrets there and out of git (`.gitignore` already
excludes it), and list the names, without values, in `.env.example`.

## Next steps

- [Quick Start](./quick-start.md): add a resource.
- [Routing & Controllers](../routing/overview.md): routes, params, filters.
