# BunOnRails

A full-stack JavaScript framework for [Bun](https://bun.sh) with Rails-like conventions: files go
where you expect them, and the framework wires them up.

[![CI](https://github.com/developerz-ai/bun-on-rails/actions/workflows/ci.yml/badge.svg)](https://github.com/developerz-ai/bun-on-rails/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Status: 0.1, early.** The HTTP core works: routing, controllers, params, filters and JSON
> responses, the database through models and `brails db:migrate`, jobs queued in-process, and mail
> through the console and test adapters. Mail transports, storage, WebSockets, React integration and
> authentication are planned. The [list below](#planned) says which is which.

## Quick Start

```bash
bun add -g bun-on-rails
brails new myapp
cd myapp
brails dev
```

Then open `http://localhost:3000`. `brails new` writes the app and runs `bun install`.
`brails dev` serves it, with no database or other services needed.

## Example

Routes map a path to `controller#action`, and the controller file is found by name:

**`config/routes.js`**

```js [config/routes.js]
export default (router) => {
  router.root("home#index");
  router.resources("posts", { only: ["index", "show"] });
};
```

**`app/controllers/posts_controller.js`**

```js [app/controllers/posts_controller.js]
import { Controller } from "bun-on-rails";

const posts = [{ id: "1", title: "Hello, BunOnRails" }];

export default class PostsController extends Controller {
  index() {
    return this.render({ posts });
  }

  show() {
    const post = posts.find((p) => p.id === this.params.id);
    return post ? this.render({ post }) : this.notFound();
  }
}
```

`GET /posts` returns `{"posts":[…]}`, `GET /posts/1` returns that post, and `GET /posts/9`
returns a `404`.

## What works today

| Area        | What you get                                                                                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI         | `brails new` creates an app, `brails dev` and `brails start` serve it, the `brails db:*` commands create, migrate, seed and reset the database, `brails routes` lists the routes, `brails generate` writes migrations, models, controllers and scaffolds, `brails test` runs the tests, and `brails help` lists every command |
| Routing     | a Rails-like DSL: `root`, the HTTP verbs, `resources` with `only` / `except` and nesting, `resource`, `namespace`, `scope`                                                                                                                                                                                                    |
| Controllers | classes found by file name, with merged params, JSON responses, redirects, before/after filters, and per-session CSRF tokens                                                                                                                                                                                                  |
| Config      | one file per section in `config/`, per-environment overrides, initializers                                                                                                                                                                                                                                                    |
| ORM         | an Active-Record-style `Model` with a query builder, validations and associations on PostgreSQL, connected at boot when `DATABASE_URL` is set                                                                                                                                                                                 |
| Jobs        | a `Job` base class: `performNow` runs a job inline; `performLater`, `performIn` and `performAt` queue it in-process, with retries                                                                                                                                                                                             |
| Mail        | mailers whose `deliver()` goes through the `console` (prints) or `test` adapter, and `deliverLater()` through the job queue                                                                                                                                                                                                   |
| Cache       | an in-process memory store                                                                                                                                                                                                                                                                                                    |
| Testing     | `request(app)` for controller tests without a server, and `setupDatabase`, `withinTransaction` (each test rolled back) and `cleanDatabase` against PostgreSQL                                                                                                                                                                 |

## Planned

These are designed and partly built, but not usable yet. A planned API throws `NotImplementedError`, naming
itself, instead of doing nothing:

- **CLI**: the job, mailer, channel and auth generators, `brails console`
  and `brails credentials`. Each exits with an error until it lands.
- **Jobs**: a persistent queue in Redis with BullMQ, and a worker process (the in-process queue works).
- **Mail transports** (SMTP, SendGrid, Postmark, SES) and mail templates, **S3 file storage**, and the **Redis cache**.
- **Real-time**: WebSocket channels (the broadcast manager exists, the channel server does
  not).
- **Routing**: route-scoped middleware (`router.middleware(list, callback)`); use a controller filter.
- **Frontend**: the React hooks and forms, and HTML views. Controllers render JSON.
- **Authentication**.

## Documentation

The guides live in [`docs/`](./docs):

- [Getting Started](./docs/eng/getting-started/introduction.md): installation, quick start,
  project structure
- [Routing & Controllers](./docs/eng/routing/overview.md)
- [Database & ORM](./docs/eng/database/overview.md)
- [Background Jobs](./docs/eng/jobs/overview.md)
- [Deployment](./docs/eng/deployment/overview.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). `bin/check` is the gate every change passes.

## License

MIT. See [LICENSE](./LICENSE).
