import { createConfig, getEnvironment } from '../config/loader.js'
import { Connection } from './connection.js'

/**
 * Which database config/database.js names for an environment.
 *
 * The file holds one config (`{ url }`, or `{ database, host, ... }`), or one
 * block per environment (`{ development: {...}, test: {...} }`). The
 * application (at boot) and the `brails db:*` commands both read it through
 * this function, so they always agree on the database.
 */

/**
 * @param {Object} section - the `database` config section
 * @param {string} environment - e.g. getEnvironment()
 * @returns {Object|null} the connection config, or null when none is named
 */
export function selectDatabaseConfig(section, environment) {
  const forEnvironment = section?.[environment]
  const config = forEnvironment && typeof forEnvironment === 'object' ? forEnvironment : section
  if (!config || (!config.url && !config.database)) {
    return null
  }
  return config
}

/**
 * The connection config for the app at `root`, for the current environment.
 * The `brails db:*` commands and setupDatabase() read it here.
 *
 * @param {string} root - application root
 * @returns {Promise<Object>}
 */
export async function appDatabaseConfig(root) {
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
  return dbConfig
}

/**
 * Connect to the database the app at `root` is configured for.
 *
 * @param {string} root - application root
 * @returns {Promise<Connection>}
 */
export async function connectToAppDatabase(root) {
  const connection = new Connection(await appDatabaseConfig(root))
  await connection.connect()
  return connection
}
