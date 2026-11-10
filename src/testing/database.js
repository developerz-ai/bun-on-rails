/**
 * Database Testing Utilities
 *
 * setupDatabase() connects to the app's test database and brings its schema up
 * to date; withinTransaction(cb) runs a test body in a transaction that always
 * rolls back; cleanDatabase() truncates every table. Pinned by
 * test/testing/database.test.js, and against PostgreSQL by
 * test/testing/database.pg.test.js.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { getEnvironment } from '../config/loader.js'
import { getConnection, setConnection } from '../database/connection.js'
import { connectToAppDatabase } from '../database/config.js'
import { MigrationRunner } from '../database/migration.js'
import { PostgresAdapter } from '../database/adapters/postgres.js'
import { loadSchema } from '../database/schema.js'

const TABLES = 'SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename'

/**
 * Connect to the app's database (config/database.js, for NODE_ENV=test, which
 * `bun test` sets) and bring its schema up to date: an empty database gets
 * db/schema.js, then every pending migration in db/migrations runs. Nothing is
 * dropped, so every test file can call it. A connection already set (by
 * setConnection, or an app that booted) is used as it is.
 *
 * @param {{ root?: string }} [options] - root: the app root (default: cwd)
 * @returns {Promise<Connection>} the connection, also set for models
 */
export async function setupDatabase({ root = process.cwd() } = {}) {
  const current = getConnection()
  if (current?.connected) {
    return current
  }

  const connection = await connectToAppDatabase(root)
  setConnection(connection)

  const schemaPath = join(root, 'db', 'schema.js')
  if (existsSync(schemaPath) && (await connection.query(TABLES)).length === 0) {
    await loadSchema(connection, root)
  }
  const migrationsDir = join(root, 'db', 'migrations')
  if (existsSync(migrationsDir)) {
    await new MigrationRunner(connection, migrationsDir).migrate()
  }
  return connection
}

/**
 * Empty every table except schema_migrations and restart their ids. Refuses
 * unless NODE_ENV is 'test': a test run whose DATABASE_URL points at the
 * development database would otherwise truncate it.
 *
 * @returns {Promise<string[]>} the tables emptied
 */
export async function cleanDatabase() {
  const environment = getEnvironment()
  if (environment !== 'test') {
    throw new Error(
      `cleanDatabase() truncates every table, so it runs only when NODE_ENV is 'test' (it is '${environment}')`
    )
  }
  const connection = connected('cleanDatabase')
  const tables = (await connection.query(TABLES))
    .map(row => row.tablename)
    .filter(name => name !== 'schema_migrations')
  if (tables.length > 0) {
    const adapter = new PostgresAdapter()
    await connection.query(
      `TRUNCATE TABLE ${tables.map(t => adapter.quoteTableName(t)).join(', ')} RESTART IDENTITY CASCADE`
    )
  }
  return tables
}

/**
 * Run `callback` in a transaction, then roll it back, whether the callback
 * succeeded or threw: what a test writes is gone afterwards. Model queries
 * inside it use the transaction. What the callback throws (a failing
 * assertion) comes back unchanged.
 *
 * @param {Function} callback - async (tx) => any
 * @returns {Promise<any>} the callback's value
 */
export async function withinTransaction(callback) {
  const connection = connected('withinTransaction')
  const rollback = new Error('withinTransaction rolls back')
  let result
  try {
    await connection.transaction(async (tx) => {
      result = await callback(tx)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) {
      throw error
    }
  }
  return result
}

function connected(name) {
  const connection = getConnection()
  if (!connection?.connected) {
    throw new Error(`${name} needs a connected database: call setupDatabase() first, or setConnection(connection)`)
  }
  return connection
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
