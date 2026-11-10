# Routing & Controllers

A request reaches your code in two steps. `config/routes.js` maps the method and path to a
`controller#action`, and the controller's method returns a `Response`.

Every example on this page is a complete file. Drop them into an app made by
`brails new` and they run as shown. The test suite does exactly that
(`test/docs/routing_guide.test.js`).

## Routes

`config/routes.js` exports a function that receives the router:

**`config/routes.js`**

```js [config/routes.js]
export default (router) => {
  router.root("home#index");
  router.get("/health", "health#index");
  router.get("/csrf", "csrf#show");

  router.resources("posts", { only: ["index", "show", "create"] });
  router.post("/posts/:id/publish", "posts#publish");

  router.namespace("admin", () => {
    router.resources("users", { only: ["index", "show"] });
  });
};
```

| Method                                                    | Defines                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `root(target)`                                            | `GET /`                                                                                                                         |
| `get` / `post` / `put` / `patch` / `delete(path, target)` | one route. `:name` segments become params                                                                                       |
| `resources(name, { only, except, controller })`           | the seven resourceful routes below, filtered by `only` / `except`. `controller` overrides the controller name                   |
| `resource(name, { controller })`                          | a singular resource: `show`, `new`, `edit`, `create`, `update`, `destroy` on `/name`, with no `:id`                             |
| `namespace(name, callback)`                               | prefixes the path with `/name` and the controller with `name/`, so `admin/users` is `app/controllers/admin/users_controller.js` |

`resources('posts')` defines:

| Verb            | Path              | Action    |
| --------------- | ----------------- | --------- |
| `GET`           | `/posts`          | `index`   |
| `GET`           | `/posts/new`      | `new`     |
| `POST`          | `/posts`          | `create`  |
| `GET`           | `/posts/:id`      | `show`    |
| `GET`           | `/posts/:id/edit` | `edit`    |
| `PATCH` / `PUT` | `/posts/:id`      | `update`  |
| `DELETE`        | `/posts/:id`      | `destroy` |

How a request is matched:

- Routes are tried in the order they are defined, and the first match wins.
- A path matches segment by segment. `/posts/:id` matches `/posts/7` but not `/posts/7/` or
  `/posts`. There are no wildcard segments.
- No match answers `404` with `{"error":"Not Found"}`. So does a route whose controller file
  or action does not exist.

## Controllers

A controller lives in `app/controllers/<name>_controller.js` and default-exports a class that
extends `Controller`. The route target `posts#show` calls `show()` on
`app/controllers/posts_controller.js`.

**`app/controllers/posts_controller.js`**

```js [app/controllers/posts_controller.js]
import { Controller } from "bun-on-rails";

const posts = [{ id: "1", title: "Hello" }];

export default class PostsController extends Controller {
  static beforeAction = ["requireToken"];

  requireToken() {
    if (this.request.method === "GET") return;
    if (this.request.headers.get("authorization") !== "Bearer secret") {
      return this.unauthorized();
    }
  }

  index() {
    return this.render({ posts });
  }

  show() {
    const post = posts.find((p) => p.id === this.params.id);
    return post ? this.render({ post }) : this.notFound();
  }

  create() {
    if (!this.params.title) {
      return this.unprocessableEntity({ title: ["is required"] });
    }
    const post = { id: String(posts.length + 1), title: this.params.title };
    posts.push(post);
    return this.render({ post }, { status: 201 });
  }

  publish() {
    return this.redirect(`/posts/${this.params.id}`);
  }
}
```

**`app/controllers/admin/users_controller.js`**

```js [app/controllers/admin/users_controller.js]
import { Controller } from "bun-on-rails";

export default class UsersController extends Controller {
  index() {
    return this.render({ users: [] });
  }

  show() {
    return this.render({ user: { id: this.params.id } });
  }
}
```

### Params

`this.params` merges three sources, and a later one wins on the same key:

1. path params (`:id`);
2. the query string;
3. a JSON or form-encoded body on `POST`, `PUT` and `PATCH`.

`this.request` is the raw `Request`.

### Responses

| Call                                     | Response                                            |
| ---------------------------------------- | --------------------------------------------------- |
| `this.render(data, { status, headers })` | JSON body, status `200` unless given                |
| `this.redirect(url, { status })`         | `302` with `Location: url` unless a status is given |
| `this.head(status)`                      | empty body                                          |
| `this.notFound(message)`                 | `404` `{"error": message}`                          |
| `this.unauthorized(message)`             | `401` `{"error": message}`                          |
| `this.forbidden(message)`                | `403` `{"error": message}`                          |
| `this.unprocessableEntity(errors)`       | `422` `{"errors": errors}`                          |

An action that throws answers `500` with `{"error": message}` (in production the message is
`Internal Server Error`). An error with a `status` property answers with that status instead.

### Filters

`static beforeAction` and `static afterAction` list method names, and the filters run in that
order around every action of the controller. A before filter that returns a `Response` ends
the request with it, and the action does not run. In the example, `requireToken` lets reads
through and answers `401` to a write without the token.

Filters take no `only` / `except` options yet: a filter runs for every action, so check
`this.request.method` or the action yourself, as `requireToken` does.

### CSRF protection

`POST`, `PUT`, `PATCH` and `DELETE` are CSRF-checked by default. A write must carry an
`X-CSRF-Token` header (or a `_csrf` param) equal to its session's token, or it gets `403` with
`{"error":"CSRF token mismatch"}` before any controller runs.

Every session gets a token on its first request, and an action reads it as `this.csrfToken`.
Hand it to the client, which then sends it back with the session cookie on each write:

**`app/controllers/csrf_controller.js`**

```js [app/controllers/csrf_controller.js]
import { Controller } from "bun-on-rails";

export default class CsrfController extends Controller {
  show() {
    return this.render({ csrfToken: this.csrfToken });
  }
}
```

`GET /csrf` answers `{"csrfToken":"…"}` and sets the `_session` cookie. A browser app keeps
the cookie and puts the token in an `X-CSRF-Token` header (or a `_csrf` form field).

The check protects cookie-authenticated browser sessions. An API that authenticates each
request with a header, as `requireToken` does here, can turn it off:

**`config/security.js`**

```js [config/security.js]
// Writes are authenticated with a bearer token, not a cookie, so the
// cookie-based CSRF check does not apply to this app.
export default {
  csrf: false,
};
```

## Try it

With the files above, `config/security.js` included, in a `brails new` app, run `brails dev`:

```bash
curl localhost:3000/posts                                   # 200 {"posts":[{"id":"1","title":"Hello"}]}
curl localhost:3000/posts/1                                 # 200 {"post":{"id":"1","title":"Hello"}}
curl localhost:3000/posts/9                                 # 404 {"error":"Not Found"}
curl -X POST localhost:3000/posts -d title=Second           # 401 {"error":"Unauthorized"}
curl -X POST localhost:3000/posts -H 'authorization: Bearer secret' \
  -H 'content-type: application/json' -d '{"title":"Second"}' # 201 {"post":{"id":"2","title":"Second"}}
curl localhost:3000/admin/users/7                           # 200 {"user":{"id":"7"}}
```

## Not implemented yet

- **Nested resources.** `resources('posts', () => router.resources('comments'))` defines
  `/comments`, not `/posts/:post_id/comments`, because `scope()` ignores its path for now.
  Write nested paths out with `get` / `post`, as `/posts/:id/publish` does above.
- **`scope(path, callback)`** and **`middleware(list, callback)`** run the callback without a
  path prefix or middleware.
- **Filter options**: see [Filters](#filters).
- **HTML views.** `render` returns JSON only.
