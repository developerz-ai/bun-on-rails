/**
 * scope(path) prefixes paths; resources(name, callback) nests under
 * /name/:singular_id. Plan 104 task R2.
 */

import { test, expect, describe } from "bun:test";
import { Router } from "../../src/routing/router.js";

const table = (router) =>
  router.routes.map((r) => `${r.method} ${r.path} ${r.controller}#${r.action}`);

describe("scope(path, callback)", () => {
  test("prefixes the path, not the controller", () => {
    const router = new Router();
    router.scope("/api", () => {
      router.get("/status", "status#show");
    });
    router.get("/after", "after#show");

    expect(table(router)).toEqual([
      "GET /api/status status#show",
      "GET /after after#show",
    ]);
  });

  test("takes the path with or without its slashes", () => {
    const router = new Router();
    router.scope("v1/", () => router.get("/ping", "ping#show"));

    expect(router.routes[0].path).toBe("/v1/ping");
  });

  test("nests inside a namespace, and a namespace inside it, in order", () => {
    const router = new Router();
    router.namespace("admin", () => {
      router.scope("/v1", () => {
        router.get("/users", "users#index");
        router.namespace("reports", () => router.get("/daily", "daily#show"));
      });
    });

    expect(table(router)).toEqual([
      "GET /admin/v1/users admin/users#index",
      "GET /admin/v1/reports/daily admin/reports/daily#show",
    ]);
  });

  test("a scope segment can be a param", () => {
    const router = new Router();
    router.scope("/:locale", () => router.get("/about", "pages#about"));

    expect(router.match("GET", "/fr/about").params).toEqual({ locale: "fr" });
  });

  test("restores the prefix when the callback throws", () => {
    const router = new Router();
    expect(() =>
      router.scope("/broken", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    router.get("/ok", "ok#show");

    expect(router.routes[0].path).toBe("/ok");
  });

  test("a path that is not a string throws, naming the call", () => {
    const router = new Router();
    expect(() => router.scope(42, () => {})).toThrow(
      "scope(path, callback): path must be a string",
    );
  });
});

describe("nested resources", () => {
  test("a resources callback nests under /parent/:parent_id", () => {
    const router = new Router();
    router.resources("posts", { only: ["show"] }, () => {
      router.resources("comments", { only: ["index", "create", "show"] });
    });
    router.resources("authors", { only: ["index"] });

    expect(table(router)).toEqual([
      "GET /posts/:id posts#show",
      "GET /posts/:post_id/comments comments#index",
      "POST /posts/:post_id/comments comments#create",
      "GET /posts/:post_id/comments/:id comments#show",
      "GET /authors authors#index",
    ]);
  });

  test("the callback can be the second argument", () => {
    const router = new Router();
    router.resources("posts", () =>
      router.resources("comments", { only: ["index"] }),
    );

    expect(router.routes.map((r) => r.path)).toContain(
      "/posts/:post_id/comments",
    );
    expect(router.routes.map((r) => r.path)).not.toContain("/comments");
  });

  test("the parent param is singularized by the inflector", () => {
    const router = new Router();
    router.resources("categories", { only: [] }, () => {
      router.resources("people", { only: [] }, () => {
        router.resources("addresses", { only: ["index"] });
      });
    });

    expect(router.routes[0].path).toBe(
      "/categories/:category_id/people/:person_id/addresses",
    );
  });

  test("nests inside a namespace", () => {
    const router = new Router();
    router.namespace("admin", () => {
      router.resources("posts", { only: [] }, () =>
        router.resources("comments", { only: ["index"] }),
      );
    });

    expect(table(router)).toEqual([
      "GET /admin/posts/:post_id/comments admin/comments#index",
    ]);
  });

  test("a nested request matches with both params", () => {
    const router = new Router();
    router.resources("posts", { only: [] }, () =>
      router.resources("comments", { only: ["show"] }),
    );

    const matched = router.match("GET", "/posts/7/comments/3");
    expect(matched.controller).toBe("comments");
    expect(matched.params).toEqual({ post_id: "7", id: "3" });
  });
});
