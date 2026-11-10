# Quick Start

Build a small JSON API in a few minutes. It assumes the CLI is installed
([Installation](./installation.md)).

## Create the app

```bash
brails new blog
cd blog
brails dev
```

`curl localhost:3000` answers with the app's name. Leave `brails dev` running in one terminal
and use another for the steps below.

## Add a resource

Routes map a path to `controller#action`. Add the posts resource to `config/routes.js`:

**`config/routes.js`**

```js [config/routes.js]
export default (router) => {
  router.root("home#index");
  router.get("/health", "health#index");
  router.resources("posts", { only: ["index", "show"] });
};
```

`resources('posts', { only: ['index', 'show'] })` maps `GET /posts` to `posts#index` and
`GET /posts/:id` to `posts#show`. Now write the controller:

**`app/controllers/posts_controller.js`**

```js [app/controllers/posts_controller.js]
import { Controller } from "bun-on-rails";

const posts = [
  { id: "1", title: "Hello, BunOnRails" },
  { id: "2", title: "Routes and controllers" },
];

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

The file name decides the controller: `posts_controller.js` serves the `posts#…` targets.
`this.params.id` comes from the `:id` segment.

## Try it

Restart `brails dev` so it picks up the new files, then:

```bash
curl localhost:3000/posts     # 200 {"posts":[{"id":"1","title":"Hello, BunOnRails"},{"id":"2",...}]}
curl localhost:3000/posts/2   # 200 {"post":{"id":"2","title":"Routes and controllers"}}
curl localhost:3000/posts/9   # 404 {"error":"Not Found"}
```

## Next steps

- [Routing & Controllers](../routing/overview.md): writes, params, filters, namespaces, and
  what is not implemented yet.
- [Project Structure](./project-structure.md): where each kind of file goes.
- [Database Overview](../database/overview.md): the Active-Record-style ORM.
