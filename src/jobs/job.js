/**
 * Job - Background job base class
 */

import { NotImplementedError } from '../support/not_implemented.js'

export class Job {
  static queue = 'default'
  static attempts = 3
  static backoff = { type: 'exponential', delay: 1000 }
  static priority = 0
  static unique = false
  static uniqueKey = null
  static schedule = null

  /**
   * Perform the job - override in subclass
   * @param {Object} data
   */
  async perform(_data) {
    throw new Error('Subclass must implement perform()')
  }

  /**
   * Enqueue job to run later
   * @param {Object} data
   * @param {Object} options
   * @returns {Promise<string>} Job ID
   */
  static async performLater(_data, _options = {}) {
    // TODO: Add to BullMQ queue
    throw new NotImplementedError('Job.performLater', 'queued jobs')
  }

  /**
   * Enqueue job to run at specific time
   * @param {Date} at
   * @param {Object} data
   * @returns {Promise<string>} Job ID
   */
  static async performAt(_at, _data) {
    // TODO: Add to BullMQ with delay
    throw new NotImplementedError('Job.performAt', 'queued jobs')
  }

  /**
   * Enqueue job to run after delay
   * @param {number} ms
   * @param {Object} data
   * @returns {Promise<string>} Job ID
   */
  static async performIn(_ms, _data) {
    // TODO: Add to BullMQ with delay
    throw new NotImplementedError('Job.performIn', 'queued jobs')
  }

  /**
   * Run job immediately (synchronously)
   * @param {Object} data
   */
  static async performNow(data) {
    const job = new this()
    return await job.perform(data)
  }

  // Callbacks - override as needed
  async beforePerform() {}
  async afterPerform() {}
  async onError(_error) {}
  async onRetry(_error, _attemptNumber) {}
}

/**
 * Job Queue - BullMQ wrapper
 */
export class JobQueue {
  constructor(name, connection) {
    this.name = name
    this.connection = connection
    this.queue = null
  }

  /**
   * Initialize the queue
   */
  async initialize() {
    // TODO: Create BullMQ Queue instance
    throw new NotImplementedError('JobQueue#initialize', 'queued jobs')
  }

  /**
   * Add a job to the queue
   * @param {string} jobName
   * @param {Object} data
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async add(_jobName, _data, _options = {}) {
    // TODO: Add job to BullMQ
    throw new NotImplementedError('JobQueue#add', 'queued jobs')
  }

  /**
   * Get job by ID
   * @param {string} jobId
   */
  async getJob(_jobId) {
    // TODO: Get job from BullMQ
    throw new NotImplementedError('JobQueue#getJob', 'queued jobs')
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    // TODO: Get counts by status
    throw new NotImplementedError('JobQueue#getStats', 'queued jobs')
  }

  /**
   * Pause the queue
   */
  async pause() {
    // TODO: Pause queue
    throw new NotImplementedError('JobQueue#pause', 'queued jobs')
  }

  /**
   * Resume the queue
   */
  async resume() {
    // TODO: Resume queue
    throw new NotImplementedError('JobQueue#resume', 'queued jobs')
  }

  /**
   * Close the queue
   */
  async close() {
    // TODO: Close BullMQ connection
    throw new NotImplementedError('JobQueue#close', 'queued jobs')
  }
}

/**
 * Job Worker - Processes jobs from queues
 */
export class JobWorker {
  constructor(queues, connection) {
    this.queues = queues
    this.connection = connection
    this.workers = []
  }

  /**
   * Start processing jobs
   */
  async start() {
    // TODO: Create BullMQ Worker for each queue
    // TODO: Register job handlers
    throw new NotImplementedError('JobWorker#start', 'queued jobs')
  }

  /**
   * Stop processing
   */
  async stop() {
    // TODO: Graceful shutdown
    throw new NotImplementedError('JobWorker#stop', 'queued jobs')
  }

  /**
   * Process a job
   * @param {Object} bullJob
   */
  async processJob(_bullJob) {
    // TODO: Load job class
    // TODO: Run perform with callbacks
    // TODO: Handle errors and retries
    throw new NotImplementedError('JobWorker#processJob', 'queued jobs')
  }
}

/**
 * Scheduler - Manages scheduled/recurring jobs
 */
export class JobScheduler {
  constructor(connection) {
    this.connection = connection
    this.schedules = new Map()
  }

  /**
   * Register a scheduled job
   * @param {typeof Job} JobClass
   */
  register(JobClass) {
    if (JobClass.schedule) {
      this.schedules.set(JobClass.name, {
        cron: JobClass.schedule,
        JobClass
      })
    }
  }

  /**
   * Start the scheduler
   */
  async start() {
    // TODO: Set up cron jobs with BullMQ
    throw new NotImplementedError('JobScheduler#start', 'queued jobs')
  }

  /**
   * Stop the scheduler
   */
  async stop() {
    // TODO: Remove scheduled jobs
    throw new NotImplementedError('JobScheduler#stop', 'queued jobs')
  }
}
