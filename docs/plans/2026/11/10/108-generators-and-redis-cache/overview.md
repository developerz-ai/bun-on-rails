# Plan 108: generators for what works, and the Redis cache

**Goal.** Plan 107 made jobs and mail work in-process; their generators still exit as not
implemented. And `cache.store: 'redis'` fails at boot (plan 105) although `ioredis` is a
dependency and CI can run a Redis service.

**Rule for every task.** A test that fails first; the guide, README and CHANGELOG change in the same
PR; Redis behaviour is also run against a real Redis.

## Tasks

| Id  | What                                                                                                                   | Where                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| G2  | `brails generate job` and `brails generate mailer`, each with a test that passes against the framework                 | `src/cli/commands/generate.js` |
| C1  | `cache.store: 'redis'` works: the `RedisStore` methods on `ioredis`, tested against Redis when `TEST_REDIS_URL` is set | `src/cache/cache.js`, boot     |
