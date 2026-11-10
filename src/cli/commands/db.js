/**
 * brails db:migrate and db:rollback. They connect to the app's database (the
 * one config/database.js names, as at boot), run db/migrations, and rewrite
 * db/schema.js afterwards. Pinned by test/cli/db_commands.test.js.
 *
 * The other db:* commands are registered in ./index.js as not implemented.
 */

import { join } from 'path'
import { createConfig, getEnvironment } from '../../config/loader.js'
import { Connection } from '../../database/connection.js'
import { selectDatabaseConfig } from '../../database/config.js'
import { MigrationRunner } from '../../database/migration.js'
import { dumpSchema } from '../../database/schema.js'
import { resolveAppRoot } from './dev.js'

/**
 * Connect to the database the app at `root` is configured for.
 *
 * @param {string} root - application root
 * @returns {Promise<Connection>}
 */
export async function connectToAppDatabase(root) {
  const config = createConfig()
  config.setAppRoot(root)
  await config.load({ root })

  const dbConfig = selectDatabaseConfig(config.section('database'), getEnvironment())
  if (!dbConfig) {
    throw new Error(
      `No database configured for ${root}: set DATABASE_URL (config/database.js reads it), ` +
        `or give config/database.js a url`
    )
  }

  const connection = new Connection(dbConfig)
  await connection.connect()
  return connection
}

/**
 * Run `work` with a connection to the app's database, then rewrite
 * db/schema.js and disconnect.
 */
async function withAppDatabase(root, work) {
  const connection = await connectToAppDatabase(root)
  try {
    const result = await work(connection)
    await dumpSchema(connection, root)
    return result
  } finally {
    await connection.disconnect()
  }
}

/**
 * Run every pending migration in `<root>/db/migrations`.
 *
 * @param {string} root - application root
 * @returns {Promise<string[]>} the versions that ran
 */
export async function migrate(root) {
  return withAppDatabase(root, (connection) =>
    new MigrationRunner(connection, join(root, 'db', 'migrations')).migrate()
  )
}

/**
 * Roll back the latest `steps` migrations.
 *
 * @param {string} root - application root
 * @param {number} steps
 * @returns {Promise<string[]>} the versions rolled back
 */
export async function rollback(root, steps = 1) {
  return withAppDatabase(root, (connection) =>
    new MigrationRunner(connection, join(root, 'db', 'migrations')).rollback(steps)
  )
}

export const dbMigrateCommand = {
  name: 'db:migrate',
  description: 'Run pending migrations and update db/schema.js',

  async run() {
    const executed = await migrate(resolveAppRoot())
    console.log(executed.length > 0 ? `Done: ${executed.length} migrated; db/schema.js updated.` : 'No pending migrations.')
  }
}

export const dbRollbackCommand = {
  name: 'db:rollback',
  description: 'Roll back the latest migration (--step=N for more) and update db/schema.js',

  async run(args) {
    const raw = args.options?.step ?? '1'
    const steps = Number(raw)
    if (!Number.isInteger(steps) || steps < 1) {
      throw new Error(`--step must be a positive integer, got "${raw}"`)
    }
    const rolledBack = await rollback(resolveAppRoot(), steps)
    console.log(rolledBack.length > 0 ? `Done: ${rolledBack.length} rolled back; db/schema.js updated.` : 'Nothing to roll back.')
  }
}
