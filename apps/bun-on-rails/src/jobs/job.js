/**
 * Job - Background job base class
 */

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
  }

  /**
   * Enqueue job to run at specific time
   * @param {Date} at
   * @param {Object} data
   * @returns {Promise<string>} Job ID
   */
  static async performAt(_at, _data) {
    // TODO: Add to BullMQ with delay
  }

  /**
   * Enqueue job to run after delay
   * @param {number} ms
   * @param {Object} data
   * @returns {Promise<string>} Job ID
   */
  static async performIn(_ms, _data) {
    // TODO: Add to BullMQ with delay
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
  }

  /**
   * Get job by ID
   * @param {string} jobId
   */
  async getJob(_jobId) {
    // TODO: Get job from BullMQ
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    // TODO: Get counts by status
  }

  /**
   * Pause the queue
   */
  async pause() {
    // TODO: Pause queue
  }

  /**
   * Resume the queue
   */
  async resume() {
    // TODO: Resume queue
  }

  /**
   * Close the queue
   */
  async close() {
    // TODO: Close BullMQ connection
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
  }

  /**
   * Stop processing
   */
  async stop() {
    // TODO: Graceful shutdown
  }

  /**
   * Process a job
   * @param {Object} bullJob
   */
  async processJob(_bullJob) {
    // TODO: Load job class
    // TODO: Run perform with callbacks
    // TODO: Handle errors and retries
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
  }

  /**
   * Stop the scheduler
   */
  async stop() {
    // TODO: Remove scheduled jobs
  }
}
