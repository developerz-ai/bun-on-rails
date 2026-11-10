/**
 * A model does not silently ignore what it is told (plan 105 S13)
 *
 * `post.title = 'x'` set a plain property that save() never read, so the
 * change was dropped without a word (the demo's publish() saved nothing that
 * way), and a hook named `beforeValidate` was never called (the framework
 * calls `beforeValidation`), so the demo's slug was never generated. Now each
 * attribute a record holds is a property too: reading it gives the attribute,
 * assigning it calls set(). And a method named like a lifecycle hook, but
 * not quite (`beforeValidate`), throws on the first validation, naming the
 * hook it was meant to be.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Model } from "../../src/database/model.js";
import { setConnection } from "../../src/database/connection.js";

class Article extends Model {
  static tableName = "articles";
  published() {
    return this.get("published") === true;
  }
}

/** Answers an INSERT/UPDATE with the row it was given, plus an id. */
function fakeConnection() {
  const statements = [];
  setConnection({
    connected: true,
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (/^INSERT/.test(sql)) {
        const columns = [...sql.matchAll(/"(\w+)"/g)].map((m) => m[1]).slice(1);
        const row = Object.fromEntries(columns.map((c, i) => [c, params[i]]));
        return Object.assign([{ id: "1", ...row }], { count: 1 });
      }
      return Object.assign([{ id: "1" }], { count: 1 });
    },
  });
  return statements;
}

afterEach(() => setConnection(null));

describe("attributes are properties", () => {
  test("reading a property gives the attribute", () => {
    const article = new Article({ title: "Hello", views: 3 });
    expect(article.title).toBe("Hello");
    expect(article.views).toBe(3);
  });

  test("assigning one sets the attribute, marks it dirty, and save() writes it", async () => {
    const statements = fakeConnection();
    const article = await Article.create({ title: "Before", body: "Text" });

    article.title = "After";
    expect(article.get("title")).toBe("After");
    expect(article.changedAttributes).toEqual(["title"]);

    await article.save();
    const update = statements.at(-1);
    expect(update.sql).toStartWith('UPDATE "articles" SET "title" = $1');
    expect(update.params[0]).toBe("After");
  });

  test("after a save, every column the database returned is a property", async () => {
    fakeConnection();
    const article = await Article.create({ title: "T", body: "B" });
    expect(article.id).toBe("1");
    expect(article.body).toBe("B");
  });

  test("a model's own methods and getters win over an attribute of the same name", () => {
    const article = new Article({ published: true, errors: "column" });
    expect(typeof article.published).toBe("function");
    expect(article.published()).toBe(true);
    expect(article.errors).toEqual({});
  });

  test("properties stay out of JSON and Object.keys", () => {
    const article = new Article({ title: "Hello" });
    expect(JSON.parse(JSON.stringify(article))).toEqual({ title: "Hello" });
    expect(Object.keys(article)).not.toContain("title");
  });
});

describe("a misspelled lifecycle hook", () => {
  test("throws on the first validation, naming the hook it was meant to be", async () => {
    class Draft extends Model {
      beforeValidate() {}
    }
    await expect(new Draft({}).validate()).rejects.toThrow(
      "Draft#beforeValidate is not a lifecycle hook, so it would never run: did you mean beforeValidation?",
    );
  });

  test("a domain method named after/before something else is fine", async () => {
    class Story extends Model {
      afterPublish() {}
      beforeValidation() {}
    }
    expect(await new Story({}).validate()).toBe(true);
  });
});
