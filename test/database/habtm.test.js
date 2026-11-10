/**
 * hasAndBelongsToMany loads through its join table (plan 105 S5)
 *
 * post.loadAssociation('tags') returned null for a hasAndBelongsToMany
 * association, Post.includes('tags') set nothing, and the defineAssociations
 * reader threw NotImplementedError. All three now read the join table
 * (posts_tags by default: the two table names in lexical order) and load the
 * associated records in one more query.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Model } from "../../src/database/model.js";
import { setConnection } from "../../src/database/connection.js";
import { defineAssociations } from "../../src/database/associations.js";

class Tag extends Model {
  static tableName = "tags";
}
class Post extends Model {
  static tableName = "posts";
  static associations = { hasAndBelongsToMany: ["tags"] };
}
class Article extends Model {
  static tableName = "articles";
  static associations = {
    hasAndBelongsToMany: [
      {
        name: "labels",
        model: "Tag",
        joinTable: "article_labels",
        foreignKey: "article_ref",
        associationForeignKey: "label_ref",
      },
    ],
  };
}
Tag.register();
Post.register();
Article.register();
defineAssociations(Post);

/** Answers by table: join rows, tags, posts. Logs every statement. */
function fakeConnection({ joinRows, tags, posts = [] }) {
  const log = [];
  return {
    log,
    connected: true,
    async query(sql, params = []) {
      log.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (/FROM "(posts_tags|article_labels)"/.test(sql)) return joinRows;
      if (/FROM "tags"/.test(sql)) return tags;
      if (/FROM "posts"/.test(sql)) return posts;
      return [];
    },
  };
}

const TAGS = [
  { id: 10, name: "bun" },
  { id: 11, name: "rails" },
];

let connection;
afterEach(() => setConnection(null));

describe("hasAndBelongsToMany", () => {
  beforeEach(() => {
    connection = fakeConnection({
      joinRows: [
        { post_id: 1, tag_id: 10 },
        { post_id: 1, tag_id: 11 },
        { post_id: 2, tag_id: 10 },
      ],
      tags: TAGS,
      posts: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    setConnection(connection);
  });

  test("loadAssociation reads posts_tags, then the tags", async () => {
    const tags = await new Post({ id: 1 }).loadAssociation("tags");

    expect(tags.map((t) => t.constructor.name)).toEqual(["Tag", "Tag"]);
    expect(tags.map((t) => t.get("name"))).toEqual(["bun", "rails"]);
    expect(connection.log[0]).toEqual({
      sql: 'SELECT "post_id", "tag_id" FROM "posts_tags" WHERE "post_id" IN ($1)',
      params: [1],
    });
    expect(connection.log[1].sql).toStartWith('SELECT * FROM "tags" WHERE');
  });

  test("includes() gives each post its own tags, in two queries for all of them", async () => {
    const posts = await Post.includes("tags").all();

    const tags = await Promise.all(posts.map((p) => p.tags()));
    expect(tags.map((list) => list.map((t) => t.get("name")))).toEqual([
      ["bun", "rails"],
      ["bun"],
      [],
    ]);
    expect(connection.log.map((q) => q.sql.split(" WHERE")[0])).toEqual([
      'SELECT * FROM "posts"',
      'SELECT "post_id", "tag_id" FROM "posts_tags"',
      'SELECT * FROM "tags"',
    ]);
  });

  test("the defineAssociations reader loads the same", async () => {
    const tags = await new Post({ id: 2 }).tags();
    expect(tags.map((t) => t.get("name"))).toEqual(["bun"]);
  });

  test("joinTable, foreignKey and associationForeignKey override the defaults", async () => {
    connection = fakeConnection({
      joinRows: [
        { article_ref: 1, label_ref: 10 },
        { article_ref: 1, label_ref: 11 },
      ],
      tags: TAGS,
    });
    setConnection(connection);
    const labels = await new Article({ id: 1 }).loadAssociation("labels");
    expect(labels).toHaveLength(2);
    expect(connection.log[0].sql).toBe(
      'SELECT "article_ref", "label_ref" FROM "article_labels" WHERE "article_ref" IN ($1)',
    );
  });

  test("a query with no limit or offset says neither (it printed LIMIT null OFFSET null)", () => {
    expect(Post.where({ id: 1 }).toSQL().sql).toBe(
      'SELECT * FROM "posts" WHERE "id" = $1',
    );
    expect(Post.query().limit(5).toSQL().sql).toBe(
      'SELECT * FROM "posts" LIMIT 5',
    );
  });

  test("with no join rows, no tags are queried", async () => {
    setConnection(fakeConnection({ joinRows: [], tags: TAGS }));
    expect(await new Post({ id: 9 }).loadAssociation("tags")).toEqual([]);
  });
});
