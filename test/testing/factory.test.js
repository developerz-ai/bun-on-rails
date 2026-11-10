/**
 * A factory builds the model it names (plan 105 S9)
 *
 * Factory#getModelClass returned the base Model for every name (its TODO was
 * "Load model from app/models"), so factory.create('user') saved a Model to
 * the table "models", never a User. A factory now builds the class given as
 * `model` (a class or a registered name), else the registered model named
 * after the factory ('user' is User, 'blog_post' is BlogPost), and throws
 * when there is none.
 */

import { test, expect, describe, afterEach } from "bun:test";
import { Factory } from "../../src/testing/factory.js";
import { Model } from "../../src/database/model.js";
import { setConnection } from "../../src/database/connection.js";

class FactoryUser extends Model {
  static tableName = "users";
}
class FactoryBlogPost extends Model {}
FactoryUser.register();
FactoryBlogPost.register();

afterEach(() => setConnection(null));

describe("factory model", () => {
  test("a registered model named after the factory", async () => {
    const factory = new Factory();
    factory.define("factory_blog_post", { title: "Hello" });
    const post = await factory.build("factory_blog_post");
    expect(post).toBeInstanceOf(FactoryBlogPost);
    expect(post.get("title")).toBe("Hello");
  });

  test("model: a registered name", async () => {
    const factory = new Factory();
    factory.define("admin", { role: "admin" }, { model: "FactoryUser" });
    expect(await factory.build("admin")).toBeInstanceOf(FactoryUser);
  });

  test("model: a class", async () => {
    const factory = new Factory();
    factory.define("member", { role: "member" }, { model: FactoryUser });
    expect(await factory.build("member")).toBeInstanceOf(FactoryUser);
  });

  test("create inserts into the model's table", async () => {
    const statements = [];
    setConnection({
      connected: true,
      query: async (sql) => {
        statements.push(sql);
        return Object.assign([{ id: 1 }], { count: 1 });
      },
    });
    const factory = new Factory();
    factory.define("admin", { role: "admin" }, { model: "FactoryUser" });

    await factory.create("admin");
    expect(statements[0]).toStartWith('INSERT INTO "users"');
  });

  test("no model to build throws, naming both fixes", async () => {
    const factory = new Factory();
    factory.define("ghost", { name: "Boo" });
    await expect(factory.build("ghost")).rejects.toThrow(
      "Factory 'ghost' has no model: register Ghost with Ghost.register(), or pass one: factory.define('ghost', attributes, { model: Ghost })",
    );
  });
});
