/**
 * Planned APIs throw NotImplementedError at the call (plan 105 S1).
 *
 * One call per module, through the package entry, so a caller sees the
 * error rather than an `undefined` that looks like success. The guard in
 * no_silent_stubs.test.js keeps every other stub from going silent.
 */

import { test, expect, describe } from "bun:test";
import {
  Job,
  Mailer,
  Storage,
  Channel,
  Model,
  NotImplementedError,
  useResource,
  Form,
  withinTransaction,
  request,
} from "../../src/index.js";
import { RedisStore } from "../../src/cache/cache.js";
import { defineAssociations } from "../../src/database/associations.js";

describe("NotImplementedError", () => {
  test("names the API and the planned feature", () => {
    const error = new NotImplementedError("Job.performLater", "queued jobs");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NotImplementedError");
    expect(error.api).toBe("Job.performLater");
    expect(error.feature).toBe("queued jobs");
    expect(error.message).toBe(
      'Job.performLater is not implemented yet (planned: queued jobs; see "Planned" in the README)',
    );
  });
});

const refuses = async (call, api) => {
  const outcome = await Promise.resolve()
    .then(call)
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  expect(outcome.error).toBeInstanceOf(NotImplementedError);
  expect(outcome.error.api).toBe(api);
};

describe("a planned API throws instead of resolving undefined", () => {
  test("Job.performLater: queues nothing", () =>
    refuses(() => Job.performLater({ id: 1 }), "Job.performLater"));

  test("Mail#deliver: sends nothing", () =>
    refuses(
      () => Mailer.mail({ to: "a@example.com", subject: "Hi" }).deliver(),
      "Mail#deliver",
    ));

  test("Storage#upload: stores nothing", () =>
    refuses(() => new Storage({}).upload(new Blob(["x"])), "Storage#upload"));

  test("Channel#send: sends nothing", () =>
    refuses(() => new Channel({}, {}).send({ hi: 1 }), "Channel#send"));

  test("RedisStore#get: is not a permanent cache miss", () =>
    refuses(() => new RedisStore({}).get("k"), "RedisStore#get"));

  test("useResource and Form: no placeholder values", async () => {
    await refuses(() => useResource("posts"), "useResource");
    await refuses(() => Form({}), "Form");
  });

  test("request.get: does not resolve undefined", () =>
    refuses(() => request.get("/posts"), "TestRequest#request"));

  test("withinTransaction: does not skip the test body silently", async () => {
    let ran = false;
    await refuses(
      () =>
        withinTransaction(async () => {
          ran = true;
        }),
      "withinTransaction",
    );
    expect(ran).toBe(false); // it refuses loudly instead of passing without running
  });

  test("a hasAndBelongsToMany reader names the model and association", async () => {
    class Article extends Model {
      static tableName = "articles";
      static associations = { hasAndBelongsToMany: ["tags"] };
    }
    defineAssociations(Article);
    await refuses(() => new Article({ id: 1 }).tags(), "Article#tags");
  });
});
