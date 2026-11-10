/**
 * Jobs run in-process on the memory adapter (plan 107 J1)
 *
 * performLater, performIn and performAt threw NotImplementedError (plan 105),
 * and before that resolved undefined without running anything; the job
 * callbacks were never called. With jobs.adapter 'memory' (the default) a job
 * now runs in this process: performLater on the next tick, performIn and
 * performAt on a timer, retried up to `attempts` times with `backoff`, with
 * beforePerform / afterPerform / onRetry / onError around it.
 * enqueuedJobs() and performEnqueuedJobs() let a test see and run them.
 */

import { test, expect, describe, beforeEach, spyOn } from "bun:test";
import {
  Job,
  enqueuedJobs,
  performEnqueuedJobs,
  clearEnqueuedJobs,
} from "../../src/index.js";

const ran = [];

class GreetJob extends Job {
  async beforePerform() {
    ran.push("before");
  }
  async perform({ name }) {
    ran.push(`hello ${name}`);
    return name;
  }
  async afterPerform() {
    ran.push("after");
  }
}

let failures = 0;
class FlakyJob extends Job {
  static attempts = 3;
  static backoff = { type: "fixed", delay: 1 };
  async perform() {
    if (failures-- > 0) throw new Error("flaky");
    ran.push("done");
  }
  async onRetry(error, attempt) {
    ran.push(`retry ${attempt}: ${error.message}`);
  }
  async onError(error) {
    ran.push(`gave up: ${error.message}`);
  }
}

beforeEach(() => {
  ran.length = 0;
  clearEnqueuedJobs();
});

describe("enqueuing", () => {
  test("performLater returns an id and runs the job after the current work, not inline", async () => {
    const id = await GreetJob.performLater({ name: "Ada" });

    expect(typeof id).toBe("string");
    expect(ran).toEqual([]);
    expect(enqueuedJobs()).toEqual([
      { id, job: "GreetJob", data: { name: "Ada" }, runAt: expect.any(Date) },
    ]);

    await Bun.sleep(5);
    expect(ran).toEqual(["before", "hello Ada", "after"]);
    expect(enqueuedJobs()).toEqual([]);
  });

  test("performIn waits for its delay", async () => {
    await GreetJob.performIn(40, { name: "later" });
    await Bun.sleep(10);
    expect(ran).toEqual([]);
    await Bun.sleep(60);
    expect(ran).toContain("hello later");
  });

  test("performAt with a time in the past runs right away", async () => {
    await GreetJob.performAt(new Date(Date.now() - 1000), { name: "now" });
    await Bun.sleep(5);
    expect(ran).toContain("hello now");
  });

  test("performEnqueuedJobs runs everything pending now, delays included", async () => {
    await GreetJob.performIn(60_000, { name: "tomorrow" });
    await performEnqueuedJobs();
    expect(ran).toEqual(["before", "hello tomorrow", "after"]);
    expect(enqueuedJobs()).toEqual([]);
  });
});

describe("long delays", () => {
  test("a job 30 days out does not run now (beyond setTimeout's 24.8-day limit)", async () => {
    await GreetJob.performIn(30 * 24 * 60 * 60 * 1000, { name: "next month" });
    await Bun.sleep(20);
    expect(ran).toEqual([]);
    expect(enqueuedJobs()).toHaveLength(1);
  });
});

describe("retries", () => {
  test("a failing job is retried with its backoff until it succeeds", async () => {
    failures = 2;
    await FlakyJob.performLater({});
    await performEnqueuedJobs();
    expect(ran).toEqual(["retry 1: flaky", "retry 2: flaky", "done"]);
  });

  test("after its last attempt onError runs, and the error is logged, not thrown at the process", async () => {
    failures = 5;
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      await FlakyJob.performLater({});
      await performEnqueuedJobs();
      expect(ran).toEqual([
        "retry 1: flaky",
        "retry 2: flaky",
        "gave up: flaky",
      ]);
      expect(logged.mock.calls.flat().join(" ")).toContain(
        "FlakyJob failed after 3 attempts: flaky",
      );
    } finally {
      logged.mockRestore();
    }
  });
});

describe("a callback that throws", () => {
  test("onRetry throwing is logged, and the retries go on", async () => {
    failures = 1;
    class LoudRetryJob extends FlakyJob {
      async onRetry() {
        throw new Error("retry hook broke");
      }
    }
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      await LoudRetryJob.performLater({});
      await Bun.sleep(20);
      expect(ran).toEqual(["done"]);
      expect(logged.mock.calls.flat().join(" ")).toContain(
        "LoudRetryJob#onRetry threw: retry hook broke",
      );
    } finally {
      logged.mockRestore();
    }
  });

  test("onError throwing on the timer path is logged, not an unhandled rejection", async () => {
    failures = 5;
    class LoudErrorJob extends FlakyJob {
      async onError() {
        throw new Error("error hook broke");
      }
    }
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      await LoudErrorJob.performLater({});
      await Bun.sleep(30);
      const lines = logged.mock.calls.flat().join(" ");
      expect(lines).toContain("LoudErrorJob#onError threw: error hook broke");
      expect(lines).toContain("LoudErrorJob failed after 3 attempts: flaky");
    } finally {
      logged.mockRestore();
    }
  });
});

describe("performNow", () => {
  test("runs the callbacks too, and returns perform's value", async () => {
    expect(await GreetJob.performNow({ name: "inline" })).toBe("inline");
    expect(ran).toEqual(["before", "hello inline", "after"]);
  });
});

describe("a setting the memory queue cannot honor throws", () => {
  test("unique", async () => {
    class OnceJob extends Job {
      static unique = true;
      async perform() {}
    }
    await expect(OnceJob.performLater({})).rejects.toThrow(
      "OnceJob.unique is not implemented yet (planned: queued jobs with BullMQ",
    );
  });

  test("schedule", async () => {
    class NightlyJob extends Job {
      static schedule = "0 3 * * *";
      async perform() {}
    }
    await expect(NightlyJob.performLater({})).rejects.toThrow(
      "NightlyJob.schedule is not implemented yet",
    );
  });
});
