/**
 * Database Testing Utilities
 */

import { NotImplementedError } from '../support/not_implemented.js'

/**
 * Set up the test database
 */
export async function setupDatabase() {
  // TODO: Load schema
  // TODO: Run migrations if needed
  // TODO: Clear data
  throw new NotImplementedError('setupDatabase', 'test-database isolation')
}

/**
 * Clean the database between tests
 */
export async function cleanDatabase() {
  // TODO: Truncate all tables
  // TODO: Reset sequences
  throw new NotImplementedError('cleanDatabase', 'test-database isolation')
}

/**
 * Run a test within a transaction that rolls back
 * @param {Function} callback
 */
export async function withinTransaction(_callback) {
  // TODO: Begin transaction
  // TODO: Run callback
  // TODO: Rollback transaction
  throw new NotImplementedError('withinTransaction', 'test-database isolation')
}

/**
 * Create multiple parallel test databases
 * @param {number} count
 */
export async function createTestDatabases(_count) {
  // TODO: Create myapp_test_0, myapp_test_1, etc.
  throw new NotImplementedError('createTestDatabases', 'test-database isolation')
}

/**
 * Get database for current worker
 * @returns {string}
 */
export function getWorkerDatabase() {
  const workerId = process.env.VITEST_WORKER_ID || process.env.JEST_WORKER_ID || 0
  const baseName = process.env.DATABASE_NAME || 'app_test'
  return workerId === 0 ? baseName : `${baseName}_${workerId}`
}

/**
 * Database cleaner strategies
 */
export const CleaningStrategies = {
  /**
   * Truncate tables (fast but doesn't reset auto-increment)
   */
  truncation: async (_tables) => {
    // TODO: TRUNCATE each table
    throw new NotImplementedError('CleaningStrategies.truncation', 'test-database isolation')
  },

  /**
   * Delete all rows (slower but resets state)
   */
  deletion: async (_tables) => {
    // TODO: DELETE FROM each table
    throw new NotImplementedError('CleaningStrategies.deletion', 'test-database isolation')
  },

  /**
   * Transaction rollback (fastest, used per-test)
   */
  transaction: async (_callback) => {
    // TODO: Wrap in transaction, rollback after
    throw new NotImplementedError('CleaningStrategies.transaction', 'test-database isolation')
  }
}

/**
 * Assert database state
 */
export const DatabaseAssertions = {
  /**
   * Assert record exists
   * @param {typeof Model} Model
   * @param {Object} conditions
   */
  assertExists: async (Model, conditions) => {
    const record = await Model.findBy(conditions)
    if (!record) {
      throw new Error(`Expected ${Model.name} with ${JSON.stringify(conditions)} to exist`)
    }
  },

  /**
   * Assert record does not exist
   * @param {typeof Model} Model
   * @param {Object} conditions
   */
  assertNotExists: async (Model, conditions) => {
    const record = await Model.findBy(conditions)
    if (record) {
      throw new Error(`Expected ${Model.name} with ${JSON.stringify(conditions)} to not exist`)
    }
  },

  /**
   * Assert record count
   * @param {typeof Model} Model
   * @param {number} expected
   * @param {Object} conditions
   */
  assertCount: async (Model, expected, conditions = {}) => {
    const count = await Model.where(conditions).count()
    if (count !== expected) {
      throw new Error(`Expected ${expected} ${Model.name} records, found ${count}`)
    }
  }
}
