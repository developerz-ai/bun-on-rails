# Vibe Coding with BunOnRails

Vibe coding means staying in the flow of building features, often with an AI assistant writing
much of the code. Conventions help: when every file has one obvious place and shape, you and the
assistant spend less time on wiring. This page is the short version of what works today, and the
list of what is not implemented yet, so neither of you reaches for it.

## The loop today

```bash
bun add -g bun-on-rails
brails new myapp
cd myapp
brails dev
```

`brails new` writes a small app and runs `bun install`; `brails dev` serves it on port 3000 (or
`PORT`). Then:

1. Add a route to `config/routes.js`.
2. Add or edit a controller in `app/controllers/<name>_controller.js`. Actions return JSON with
   `this.render({ ... })`.
3. Restart `brails dev`: it does not reload on change.
4. Check it with `curl`, and write tests with `bun test`.

See [Routing & Controllers](../routing/overview.md) for routes, params, responses and filters.
For data, connect PostgreSQL yourself (see [Database Overview](../database/overview.md)).

## Patterns an assistant can rely on

```js
import { Controller } from "bun-on-rails";
import Post from "../models/post.js";

export default class PostsController extends Controller {
  async show() {
    const post = await Post.findById(this.params.id);
    if (!post) return this.notFound();
    return this.render({ post });
  }

  async create() {
    const post = await Post.create({
      title: this.params.title,
      user_id: this.params.user_id,
    });
    if (!post.persisted) return this.unprocessableEntity(post.errors);
    return this.render({ post }, { status: 201 });
  }
}
```

- Import from `bun-on-rails`. There are no subpath imports.
- Put files where [Convention over Configuration](../core-concepts/convention-over-configuration.md)
  says, named the way it says.
- Read and write model attributes with `get` / `set` or `update`. `post.title = "x"` is not saved.
- End every query chain with a terminal method such as `.all()` or `.first()`: a query builder is
  not a promise.
- `create` returns the record even when it fails: check `persisted` or `errors`.
- Writes (`POST`, `PUT`, `PATCH`, `DELETE`) must echo the session's `this.csrfToken` in an
  `X-CSRF-Token` header while CSRF protection is on. An API that authenticates with a header
  can turn it off (see [CSRF protection](../routing/overview.md#csrf-protection)).

## Not implemented yet

Tell your assistant, or it will write code against these. Each fails when used: a planned command exits with an error, and a planned API throws `NotImplementedError` naming itself.

- **Generators beyond migration, model and controller.** `brails g migration`, `g model` and `g controller` work; `g scaffold`, `g job`, `g auth` and the rest are not implemented yet.
- **`brails console`, `brails credentials`** are not implemented yet either. (`brails routes` lists the routes.)
- **Background jobs.** `performLater` throws `NotImplementedError`; only `performNow` runs a job (see
  [Background Jobs](../jobs/overview.md)).
- **Authentication, mail delivery, file storage, WebSocket channels, HTML views and React
  helpers.** See the status table in [Core Philosophy](../core-concepts/philosophy.md#batteries-included).

## A note for AI agents

Read the module (`node_modules/bun-on-rails/src/`) before relying on it. Several modules are
planned, not built: their methods throw `NotImplementedError`, naming themselves, so code that calls
them fails at the call rather than silently.
