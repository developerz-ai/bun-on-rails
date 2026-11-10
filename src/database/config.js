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
