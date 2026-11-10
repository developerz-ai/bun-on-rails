/**
 * hasAndBelongsToMany on PostgreSQL (plan 105 S5)
 *
 * Runs only when TEST_DATABASE_URL names a PostgreSQL server; it creates a
 * database of its own and drops it afterwards. Bigint ids come back from the
 * driver as strings, so this also checks that join rows and records match up.
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Model } from "../../src/database/model.js";
import { setConnection } from "../../src/database/connection.js";
import { connectToAppDatabase } from "../../src/database/config.js";
import { createDatabase, dropDatabase } from "../../src/cli/commands/db.js";

const serverUrl = process.env.TEST_DATABASE_URL;

class HabtmTag extends Model {
  static tableName = "tags";
}
class HabtmPost extends Model {
  static tableName = "posts";
  static associations = {
    hasAndBelongsToMany: [
      {
        name: "tags",
        model: "HabtmTag",
        foreignKey: "post_id",
        associationForeignKey: "tag_id",
      },
    ],
  };
}
HabtmTag.register();
HabtmPost.register();

describe.skipIf(!serverUrl)("hasAndBelongsToMany on PostgreSQL", () => {
  const root = mkdtempSync(join(tmpdir(), "habtm-pg-"));
  let connection;

  beforeAll(async () => {
    const url = new URL(serverUrl);
    url.pathname = `/bor_habtm_${process.pid}_${Date.now()}`;
    mkdirSync(join(root, "config"));
    writeFileSync(
      join(root, "config", "database.js"),
      `export default { test: { adapter: 'postgresql', url: ${JSON.stringify(url.toString())} } }\n`,
    );
    await createDatabase(root);
    connection = await connectToAppDatabase(root);
    setConnection(connection);
    for (const sql of [
      "CREATE TABLE posts (id bigserial PRIMARY KEY, title text NOT NULL)",
      "CREATE TABLE tags (id bigserial PRIMARY KEY, name text NOT NULL)",
      "CREATE TABLE posts_tags (post_id bigint NOT NULL REFERENCES posts, tag_id bigint NOT NULL REFERENCES tags)",
      "INSERT INTO posts (title) VALUES ('one'), ('two'), ('three')",
      "INSERT INTO tags (name) VALUES ('bun'), ('rails')",
      "INSERT INTO posts_tags (post_id, tag_id) VALUES (1, 1), (1, 2), (2, 2)",
    ]) {
      await connection.query(sql);
    }
  });

  afterAll(async () => {
    await connection?.disconnect();
    setConnection(null);
    await dropDatabase(root);
    rmSync(root, { recursive: true, force: true });
  });

  test("loadAssociation loads a post's tags through posts_tags", async () => {
    const post = await HabtmPost.find(1);
    const tags = await post.loadAssociation("tags");
    expect(tags.map((t) => t.get("name"))).toEqual(["bun", "rails"]);
    expect(tags[0]).toBeInstanceOf(HabtmTag);
  });

  test("includes() loads every post's tags", async () => {
    const posts = await HabtmPost.order("id").includes("tags").all();
    expect(
      posts.map((p) => [p.get("title"), p.tags.map((t) => t.get("name"))]),
    ).toEqual([
      ["one", ["bun", "rails"]],
      ["two", ["rails"]],
      ["three", []],
    ]);
  });
});
