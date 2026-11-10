/**
 * The in-process job queue: jobs.adapter 'memory', the default.
 *
 * Job.performLater / performIn / performAt enqueue here, and each job runs in
 * this process when its time comes: retried up to `attempts` times with
 * `backoff`, with beforePerform / afterPerform / onRetry / onError around it.
 * A process stays alive until its queued jobs have run; a job is gone if the
 * process dies first (the BullMQ adapter, planned, keeps them in Redis).
 * enqueuedJobs() and performEnqueuedJobs() let a test see and run them.
 * Pinned by test/jobs/memory_queue.test.js.
 */

import { NotImplementedError } from '../support/not_implemented.js'

const pending = new Map()
let lastId = 0

/**
 * Settings only a persistent queue can honor throw rather than being ignored.
 * @param {typeof Job} JobClass
 */
function assertHonorable(JobClass) {
  for (const setting of ['unique', 'schedule']) {
    if (JobClass[setting]) {
      throw new NotImplementedError(`${JobClass.name}.${setting}`, 'queued jobs with BullMQ')
    }
  }
  backoffDelay(JobClass, 1)
}

/** Milliseconds to wait before retry number `attempt` (1-based). */
function backoffDelay(JobClass, attempt) {
  const { type = 'exponential', delay = 1000 } = JobClass.backoff ?? {}
  if (type === 'fixed') return delay
  if (type === 'exponential') return delay * 2 ** (attempt - 1)
  throw new Error(`${JobClass.name}.backoff type '${type}' is unknown; use 'fixed' or 'exponential'`)
}

/**
 * Queue `JobClass` with `data` to run at `runAt`.
 * @returns {string} the job id
 */
export function enqueue(JobClass, data, runAt) {
  assertHonorable(JobClass)
  const entry = { id: `job-${++lastId}`, JobClass, data, runAt }
  entry.timer = setTimeout(() => runEntry(entry), Math.max(0, runAt.getTime() - Date.now()))
  pending.set(entry.id, entry)
  return entry.id
}

async function runEntry(entry) {
  if (!pending.delete(entry.id)) return // performEnqueuedJobs took it
  clearTimeout(entry.timer)
  await performWithRetries(entry.JobClass, entry.data)
}

/**
 * Run a queued job: retried with its backoff until it succeeds or runs out of
 * attempts; then onError runs and the failure is logged, since nobody awaits
 * a queued job's promise.
 */
async function performWithRetries(JobClass, data) {
  const attempts = Math.max(1, JobClass.attempts ?? 1)
  const job = new JobClass()
  for (let attempt = 1; ; attempt++) {
    try {
      return await performOnce(job, data)
    } catch (error) {
      if (attempt < attempts) {
        await job.onRetry(error, attempt)
        await Bun.sleep(backoffDelay(JobClass, attempt))
        continue
      }
      await job.onError(error)
      console.error(`${JobClass.name} failed after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${error.message}`)
      return undefined
    }
  }
}

/** beforePerform, perform, afterPerform: what performNow and a queued run share. */
export async function performOnce(job, data) {
  await job.beforePerform()
  const result = await job.perform(data)
  await job.afterPerform()
  return result
}

/**
 * The jobs waiting to run, oldest first.
 * @returns {Array<{ id: string, job: string, data: any, runAt: Date }>}
 */
export function enqueuedJobs() {
  return [...pending.values()]
    .sort((a, b) => a.runAt - b.runAt)
    .map(({ id, JobClass, data, runAt }) => ({ id, job: JobClass.name, data, runAt }))
}

/**
 * Run every job waiting now, in run-at order, delays included, and wait for
 * them. Jobs they enqueue are left to run on their own timers.
 */
export async function performEnqueuedJobs() {
  const due = [...pending.values()].sort((a, b) => a.runAt - b.runAt)
  for (const entry of due) {
    pending.delete(entry.id)
    clearTimeout(entry.timer)
  }
  for (const entry of due) {
    await performWithRetries(entry.JobClass, entry.data)
  }
}

/** Drop every waiting job without running it (between tests). */
export function clearEnqueuedJobs() {
  for (const entry of pending.values()) clearTimeout(entry.timer)
  pending.clear()
}
