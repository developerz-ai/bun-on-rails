# Background Jobs

> **Status.** Jobs do not run in the background yet. `performNow` runs a job inline, where you
> call it. `performLater`, `performIn` and `performAt` throw
> `NotImplementedError`, so a job is never dropped silently. BullMQ is a dependency, but nothing is wired to it.

What exists today is the `Job` base class (`src/jobs/job.js`), so job code can be written now and
moved to a queue when one is wired.

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

`performNow(data)` creates the job, awaits `perform(data)` and returns its result. An error
thrown by `perform` reaches the caller. Pass plain data such as IDs, not records, so the job will
keep working once it runs from a queue.

## Not implemented yet

- **Enqueuing.** `performLater(data)`, `performIn(ms, data)` and `performAt(date, data)` throw
  `NotImplementedError`.
- **Workers.** Nothing processes a queue, and no command starts a worker.
- **Job settings.** `Job` declares `static queue`, `attempts`, `backoff`, `priority`, `unique`,
  `uniqueKey` and `schedule`, but nothing reads them yet.
- **Job callbacks.** `beforePerform`, `afterPerform`, `onError` and `onRetry` exist on `Job`, but
  `performNow` does not call them.
- **Generators.** `brails generate job` is not implemented yet: write the file by hand.
