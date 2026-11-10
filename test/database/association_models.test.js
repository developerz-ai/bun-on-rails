/**
 * Resolving an association's model class
 *
 * Three copies of this logic disagreed, and each was wrong somewhere:
 * - Model#loadAssociation used a string `model` as if it were the class (so
 *   `model: "Comment"` crashed), and capitalised the association name, so a
 *   hasMany like `comments` looked up `Comments` and never resolved.
 * - The eager loader and the query builder singularised with a hand-rolled
 *   rule that strips a trailing "es": `notes` became `Not`, `images` `Imag`.
 * One resolver, on the inflector's classify(), now serves all three.
 */

import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { setConnection } from "../../src/database/connection.js";
import { Model } from "../../src/database/model.js";
import { resolveAssociationModel } from "../../src/database/associations.js";

class Author extends Model {}
class Comment extends Model {}
class Note extends Model {}
class BlogPost extends Model {}
class Post extends Model {
  static associations = {
    belongsTo: ["author"],
    hasMany: [
      "comments",
      "notes",
      { name: "remarks", model: "Comment", foreignKey: "post_id" },
    ],
  };
}

let saved;
beforeAll(() => {
  saved = globalThis._modelRegistry;
  globalThis._modelRegistry = {};
  for (const m of [Author, Comment, Note, BlogPost, Post]) m.register();
});
afterAll(() => {
  globalThis._modelRegistry = saved;
});
afterEach(() => setConnection(null));

/** Records each query; answers SELECTs with the given rows. */
function connectionReturning(rows) {
  const seen = [];
  const run = async (sql, params) => {
    seen.push({ sql, params });
    return Object.assign(
      rows.map((r) => ({ ...r })),
      { count: rows.length },
    );
  };
  return { seen, connection: { query: run, execute: run, connected: true } };
}

describe("resolveAssociationModel", () => {
  test("a class is used as given", () => {
    expect(resolveAssociationModel({ model: Note }, "anything")).toBe(Note);
  });

  test("a string names a registered class", () => {
    expect(resolveAssociationModel({ model: "Comment" }, "remarks")).toBe(
      Comment,
    );
  });

  test("otherwise the association name is classified: singular, PascalCase", () => {
    expect(resolveAssociationModel({}, "author")).toBe(Author);
    expect(resolveAssociationModel({}, "comments")).toBe(Comment);
    expect(resolveAssociationModel({}, "notes")).toBe(Note);
    expect(resolveAssociationModel({}, "blog_posts")).toBe(BlogPost);
  });

  test("an unregistered class resolves to null", () => {
    expect(resolveAssociationModel({}, "widgets")).toBeNull();
  });
});

describe("Model#loadAssociation", () => {
  const post = () => {
    const p = new Post({ id: 7, author_id: 3 });
    p.persisted = true;
    return p;
  };

  test("loads a hasMany, inferring the class and the post_id key", async () => {
    const { seen, connection } = connectionReturning([{ id: 1, post_id: 7 }]);
    setConnection(connection);
    const comments = await post().loadAssociation("comments");
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBeInstanceOf(Comment);
    expect(seen[0].sql).toContain('FROM "comments"');
    expect(seen[0].sql).toContain('"post_id"');
  });

  test("loads a hasMany whose model is given as a string", async () => {
    const { seen, connection } = connectionReturning([{ id: 2, post_id: 7 }]);
    setConnection(connection);
    const remarks = await post().loadAssociation("remarks");
    expect(remarks[0]).toBeInstanceOf(Comment);
    expect(seen[0].sql).toContain('FROM "comments"');
  });
});

describe("eager loading with includes()", () => {
  test("resolves a hasMany whose name ends in -es (notes -> Note)", async () => {
    const { seen, connection } = connectionReturning([{ id: 7, author_id: 3 }]);
    setConnection(connection);
    const warn = console.warn;
    const warnings = [];
    console.warn = (...a) => warnings.push(a.join(" "));
    try {
      await Post.includes("notes").all();
    } finally {
      console.warn = warn;
    }
    expect(warnings).toEqual([]);
    expect(seen.some((q) => q.sql.includes('FROM "notes"'))).toBe(true);
  });
});
