# Plan 107: jobs and mail in-process

**Goal.** The two features an app reaches for first after models and controllers work without
Redis or a mail server: a job enqueued with `performLater` runs, and a mail sent with `deliver()`
goes somewhere you can see. Both throw `NotImplementedError` today (plan 105). BullMQ and real
mail transports (SMTP, SendGrid, SES) stay planned; these tasks use the adapters that are already
the defaults, `jobs.adapter: 'memory'` and `mail.adapter: 'console'`.

**Rule for every task.** A test that fails first; the guide, README and CHANGELOG change in the same
PR.

## Tasks

| Id  | What                                                                                                                                                                                                                                      | Where                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| J1  | `performLater` / `performIn` / `performAt` run jobs in-process, with `attempts`, `backoff` and the callbacks; `enqueuedJobs()` / `performEnqueuedJobs()` for tests; a setting the memory queue cannot honor (`unique`, `schedule`) throws | `src/jobs/`                    |
| M1  | `Mail#deliver()` hands the message to the configured adapter: `console` prints it, `test` keeps it in `deliveries()`; `deliverLater()` goes through the job queue                                                                         | `src/mail/`                    |
| G1  | `brails generate scaffold`, once an app can take a JSON API without the session CSRF check (decided in that task)                                                                                                                         | `src/cli/commands/generate.js` |

`brails console` is not here: Bun 1.3 has no `node:repl` (`repl.start` is undefined), so it waits.
