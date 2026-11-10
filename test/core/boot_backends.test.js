/**
 * Boot refuses a config that names a backend the framework does not have
 * (plan 105 S2), instead of logging success and doing something else:
 * cache.store 'redis' used the memory store, jobs.adapter 'bullmq' logged
 * "Job queue initialized with BullMQ" and initialized nothing, and
 * websocket.enabled logged "WebSocket enabled" with no upgrade path.
 */

import { test, expect, describe } from "bun:test";
import { Application, NotImplementedError } from "../../src/index.js";

const boot = (config) =>
  new Application({
    config: { logging: { level: "error" }, ...config },
  }).initialize();

const refuses = async (config, api) => {
  const error = await boot(config).then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(NotImplementedError);
  expect(error.api).toBe(api);
};

describe("a planned backend in config fails at boot", () => {
  test("cache.store 'redis'", () =>
    refuses({ cache: { store: "redis" } }, "cache.store 'redis'"));

  test("cache.store 'redis' with Redis configured", () =>
    refuses(
      { cache: { store: "redis" }, redis: { url: "redis://127.0.0.1:1" } },
      "cache.store 'redis'",
    ));

  test("jobs.adapter 'bullmq'", () =>
    refuses({ jobs: { adapter: "bullmq" } }, "jobs.adapter 'bullmq'"));

  test("jobs.worker", () => refuses({ jobs: { worker: true } }, "jobs.worker"));

  test("websocket.enabled", () =>
    refuses({ websocket: { enabled: true } }, "websocket.enabled"));
});

describe("an unknown backend fails at boot, naming the built-in one", () => {
  test("cache.store 'memcached'", async () => {
    await expect(boot({ cache: { store: "memcached" } })).rejects.toThrow(
      "Unknown cache.store 'memcached'. The built-in store is 'memory'.",
    );
  });

  test("jobs.adapter 'sidekiq'", async () => {
    await expect(boot({ jobs: { adapter: "sidekiq" } })).rejects.toThrow(
      "Unknown jobs.adapter 'sidekiq'. The built-in adapter is 'memory' (jobs run with performNow).",
    );
  });
});

describe("the defaults still boot", () => {
  test("cache.store 'memory', jobs.adapter 'memory', websocket off", async () => {
    const app = new Application({
      config: {
        logging: { level: "error" },
        cache: { store: "memory" },
        jobs: { adapter: "memory" },
      },
    });
    await app.initialize();
    await app.cache.set("k", 1);
    expect(await app.cache.get("k")).toBe(1);
  });
});
