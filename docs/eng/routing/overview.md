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

`brails routes` prints the routes an app defines, in match order; `brails routes posts` keeps the
ones whose path or controller#action contains `posts`.

How a request is matched:

- Routes are tried in the order they are defined, and the first match wins.
- A path matches segment by segment. `/posts/:id` matches `/posts/7` but not `/posts/7/` or
  `/posts`. There are no wildcard segments.
- No match answers `404` with `{"error":"Not Found"}`. So does a route whose controller file
  or action does not exist.

### Nesting and scopes

```js
router.resources("posts", { only: ["show"] }, () => {
  router.resources("comments", { only: ["index", "create"] });
});

router.scope("/:locale", () => {
  router.get("/about", "pages#about");
});
```

defines:

| Verb   | Path                       | Controller#action |
| ------ | -------------------------- | ----------------- |
| `GET`  | `/posts/:id`               | `posts#show`      |
| `GET`  | `/posts/:post_id/comments` | `comments#index`  |
| `POST` | `/posts/:post_id/comments` | `comments#create` |
| `GET`  | `/:locale/about`           | `pages#about`     |

- A `resources` callback, as its last argument, nests the routes it defines under
  `/posts/:post_id`. The parent param is the singular of the name (`categories` nests under
  `:category_id`), and the controller keeps its plain name: `comments#index` reads
  `this.params.post_id`.
- `scope(path, callback)` prefixes the path only, where `namespace` prefixes the path and the
  controller. A scope segment can be a param, so `GET /fr/about` gives `this.params.locale`
  `"fr"`. Scopes, namespaces and nested resources stack in the order they are written.

## Controllers

A controller lives in `app/controllers/<name>_controller.js` and default-exports a class that
extends `Controller`. The route target `posts#show` calls `show()` on
`app/controllers/posts_controller.js`.

**`app/controllers/posts_controller.js`**

```js [app/controllers/posts_controller.js]
import { Controller } from "bun-on-rails";

const posts = [{ id: "1", title: "Hello" }];

export default class PostsController extends Controller {
  static beforeAction = { requireToken: { except: ["index", "show"] } };

  requireToken() {
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

`static beforeAction` and `static afterAction` name methods to run around an action, in order. A
before filter that returns a `Response` ends the request with it, and the action does not run; one
that returns `false` ends it with `403`. In the example, `requireToken` answers `401` to a write
without the token, and `except` lets `index` and `show` through.

Each filter can be limited to some actions:

```js
// keyed by method name
static beforeAction = { requireToken: { except: ["index", "show"] } };

// or a list, mixing plain names and objects
static beforeAction = ["loadUser", { name: "requireAdmin", only: ["destroy"] }];
```

The options are `only` and `except` (action names), and `if` and `unless` (a method name or a
function). A filter naming a method the controller does not have fails the request with `500`,
rather than being skipped, so a misspelled auth filter cannot silently stop guarding anything.

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

### Testing a controller

`request(app)` sends a request through an initialized app in-process, with no server: routing,
middleware and the action run as they would for a real request. It returns a response with
`status`, `json()` and assertions:

**`test/controllers/posts_controller.test.js`**

```js
import { beforeAll, test, expect } from "bun:test";
import { Application, request } from "bun-on-rails";

let app;
beforeAll(async () => {
  app = new Application({ root: process.cwd() });
  await app.initialize();
});

test("GET /posts/1", async () => {
  const res = await request(app).get("/posts/1");
  expect(res.status).toBe(200);
  await res.assertJson({ post: { id: "1", title: "Hello" } });
});
```

`get(path, query)`, `post(path, body)`, `put`, `patch` and `delete` send the request (a body as
JSON), and `header(name, value)` sets a header first. `assertJson(expected)` compares the whole body
and `assertJsonHas('post.title')` checks a key path; each throws when it does not match.
`as(user)` is planned with authentication and throws `NotImplementedError`.

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

- **`middleware(list, callback)`** runs the callback without adding the middleware.
- **HTML views.** `render` returns JSON only.
