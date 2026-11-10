# Background Jobs

> **Status.** Jobs run in the background of the app's own process: `performLater`, `performIn` and
> `performAt` queue them in memory (`jobs.adapter: 'memory'`, the default), with retries. A queue
> that survives a restart, in Redis with BullMQ, and a separate worker process are planned.

## Defining a job

**`app/jobs/send_welcome_email_job.js`**

```js
import { Job } from "bun-on-rails";

export default class SendWelcomeEmailJob extends Job {
  async perform({ userId }) {
    // ...look the user up and send the email
    return `sent to ${userId}`;
  }
}
```

A job extends `Job` and implements `perform(data)`. The app imports every file under
`app/jobs/` at boot.

## Running a job

```js
import SendWelcomeEmailJob from "../jobs/send_welcome_email_job.js";

await SendWelcomeEmailJob.performNow({ userId: user.id }); // "sent to 1"
```

`performNow(data)` creates the job, runs `beforePerform`, `perform(data)` and `afterPerform`, and
returns what `perform` returned. An error reaches the caller. Pass plain data such as IDs, not
records, so the job will keep working once it runs from a queue.

## Queueing a job

```js
await SendWelcomeEmailJob.performLater({ userId: user.id }); // on the next tick
await SendWelcomeEmailJob.performIn(60_000, { userId: user.id }); // in a minute
await SendWelcomeEmailJob.performAt(new Date("2026-12-01"), {
  userId: user.id,
});
```

Each returns the job's id at once, and the job runs later in this process. A job that throws is
retried up to `static attempts` times (default 3), waiting `static backoff` between tries:
`{ type: "exponential", delay: 1000 }` (the default: 1s, then 2s) or `{ type: "fixed", delay }`.
`onRetry(error, attempt)` runs before each retry; after the last attempt `onError(error)` runs and
the failure is logged. `beforePerform` and `afterPerform` run around every attempt.

The queue is memory: the process stays alive until its queued jobs have run, and jobs still
waiting are lost if it dies. `static unique` and `static schedule` need a persistent queue, so a
job that sets them throws when it is queued.

### In tests

```js
import {
  enqueuedJobs,
  performEnqueuedJobs,
  clearEnqueuedJobs,
} from "bun-on-rails";

await SendWelcomeEmailJob.performLater({ userId: 1 });
enqueuedJobs(); // [{ id, job: "SendWelcomeEmailJob", data: { userId: 1 }, runAt }]
await performEnqueuedJobs(); // runs every waiting job now, delays included
```

`clearEnqueuedJobs()` drops the waiting jobs, for a clean slate between tests.

## Not implemented yet

- **A persistent queue and workers.** Jobs live in the app's memory. `jobs.adapter: 'bullmq'`
  (Redis) and `jobs.worker: true` fail at boot with `NotImplementedError`.
- **Queue settings.** `static queue` and `priority` are not read: the memory queue is one queue,
  run in time order. `unique`, `uniqueKey` and `schedule` throw when the job is queued.
- **Generators.** `brails generate job` is not implemented yet: write the file by hand.
