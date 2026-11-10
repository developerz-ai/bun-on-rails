# Introduction to BunOnRails

BunOnRails is a full-stack JavaScript framework built on [Bun](https://bun.sh) with Rails-like
conventions: the file you need is where you expect it, and the framework wires it up.

It is young. Version 0.1 runs an HTTP app with routes, controllers, params, filters and JSON
responses. Most of the rest is designed and partly built, and this page says which is which.

## Convention over configuration

Files live in predictable places and are picked up by name. There is nothing to register:

```
app/
├── controllers/   # posts_controller.js serves the posts#… routes
├── models/        # post.js defines Post
├── jobs/
├── mailers/
└── channels/
config/
├── routes.js      # path -> controller#action
├── <name>.js      # the config section <name>
├── environments/  # per-environment overrides
└── initializers/  # run once at boot
```

[Project Structure](./project-structure.md) covers each one.

## What works today

- **CLI**: `brails new` creates an app, `brails dev` and `brails start` serve it.
- **Routing**: a Rails-like DSL with `resources`, `resource` and `namespace`.
- **Controllers**: classes with params, JSON responses, redirects and before/after filters.
- **Config**: per-section files, per-environment overrides and initializers.
- **ORM query layer**: an Active-Record-style `Model` with a query builder, validations and
  associations on a PostgreSQL adapter. It is not yet connected at app boot. See the
  [Database Overview](../database/overview.md).
- **Jobs**: a `Job` base class whose `performNow` runs a job inline.
- **Caching**: an in-process memory store.

## Planned

These are designed and partly built, but not usable yet:

- the code generators (`brails generate`), the database commands (`brails db:migrate` and the
  rest), `brails console` and `brails routes`;
- connecting to the database at boot, and test-database isolation;
- queued jobs (`performLater`), mail delivery, S3 file storage, and the Redis cache;
- WebSocket channels, the React hooks and forms, and HTML views;
- authentication;
- CSRF tokens. The check is on, but no token is issued yet, see
  [CSRF protection](../routing/overview.md#csrf-protection).

`brails help` lists the planned commands. Each exits with an error rather than pretending to
work.

## Getting started

Start with [Installation](./installation.md), then the [Quick Start](./quick-start.md).

## Community

- **GitHub**: [github.com/developerz-ai/bun-on-rails](https://github.com/developerz-ai/bun-on-rails)
- **Issues**: [github.com/developerz-ai/bun-on-rails/issues](https://github.com/developerz-ai/bun-on-rails/issues)

## License

BunOnRails is open source software licensed under the
[MIT License](https://github.com/developerz-ai/bun-on-rails/blob/main/LICENSE).
