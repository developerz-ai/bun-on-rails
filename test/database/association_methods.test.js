/**
 * register() wires association methods; includes() fills them (plan 106 O2)
 *
 * `static associations` declared `comments`, but post.comments() existed only
 * after an internal defineAssociations(Post) nothing called, so the guide
 * said association methods were not wired up. And includes() set a plain
 * property of the same name, which would shadow the method. Now
 * Model.register() defines the methods, and includes() fills their cache:
 * `await post.comments()` gives the loaded records without a query.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Model } from "../../src/database/model.js";
import { setConnection } from "../../src/database/connection.js";

class WiredAuthor extends Model {
  static tableName = "authors";
}
class WiredComment extends Model {
  static tableName = "comments";
}
class WiredTag extends Model {
  static tableName = "tags";
}
class WiredPost extends Model {
  static tableName = "posts";
  static associations = {
    belongsTo: [
      { name: "author", model: "WiredAuthor", foreignKey: "author_id" },
    ],
    hasMany: [
      { name: "comments", model: "WiredComment", foreignKey: "post_id" },
    ],
    hasAndBelongsToMany: [
      {
        name: "tags",
        model: "WiredTag",
        joinTable: "posts_tags",
        foreignKey: "post_id",
        associationForeignKey: "tag_id",
      },
    ],
  };
}
for (const M of [WiredAuthor, WiredComment, WiredTag, WiredPost]) M.register();

let log;
beforeEach(() => {
  log = [];
  setConnection({
    connected: true,
    query: async (sql) => {
      log.push(sql.replace(/\s+/g, " "));
      if (/FROM "posts"/.test(sql))
        return [
          { id: 1, author_id: 7 },
          { id: 2, author_id: null },
        ];
      if (/FROM "authors"/.test(sql)) return [{ id: 7, name: "Ada" }];
      if (/FROM "comments"/.test(sql))
        return [{ id: 10, post_id: 1, body: "First" }];
      if (/FROM "posts_tags"/.test(sql)) return [{ post_id: 1, tag_id: 5 }];
      if (/FROM "tags"/.test(sql)) return [{ id: 5, name: "bun" }];
      return [];
    },
  });
});
afterEach(() => setConnection(null));

describe("register() wires association methods", () => {
  test("each declared association is a method, with no defineAssociations call", () => {
    const post = new WiredPost({ id: 1, author_id: 7 });
    expect(typeof post.author).toBe("function");
    expect(typeof post.comments).toBe("function");
    expect(typeof post.tags).toBe("function");
  });

  test("a method loads what is not loaded yet", async () => {
    const post = new WiredPost({ id: 1, author_id: 7 });
    expect((await post.author()).get("name")).toBe("Ada");
    expect((await post.comments()).map((c) => c.get("body"))).toEqual([
      "First",
    ]);
    expect(log.some((sql) => sql.includes('FROM "authors"'))).toBe(true);
  });
});

describe("includes() fills the methods", () => {
  test("after includes(), each method answers from what was loaded, with no query", async () => {
    const posts = await WiredPost.includes("author", "comments", "tags").all();
    const queries = log.length;

    expect((await posts[0].author()).get("name")).toBe("Ada");
    expect(await posts[1].author()).toBeNull();
    expect((await posts[0].comments()).map((c) => c.get("body"))).toEqual([
      "First",
    ]);
    expect(await posts[1].comments()).toEqual([]);
    expect((await posts[0].tags()).map((t) => t.get("name"))).toEqual(["bun"]);
    expect(log.length).toBe(queries);
  });

  test("the method is not shadowed by a property", async () => {
    const [post] = await WiredPost.includes("comments").all();
    expect(typeof post.comments).toBe("function");
    expect(Object.hasOwn(post, "comments")).toBe(false);
  });
});
