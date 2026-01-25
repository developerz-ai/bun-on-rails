/**
 * Configuration Loader
 *
 * Loads and merges configuration files from config/ directory with environment support.
 *
 * Config files are loaded from:
 * - config/*.js - Base configuration
 * - config/environments/{env}.js - Environment-specific overrides
 *
 * Environment is determined by:
 * 1. BUN_ENV environment variable
 * 2. NODE_ENV environment variable
 * 3. Defaults to 'development'
 *
 * @module @bun-on-rails/config
 */

import { join, basename } from 'path'

/**
 * Get current environment
 * @returns {string} Current environment name
 */
export function getEnvironment() {
  return process.env.BUN_ENV || process.env.NODE_ENV || 'development'
}

/**
 * Check if running in development
 * @returns {boolean}
 */
export function isDevelopment() {
  return getEnvironment() === 'development'
}

/**
 * Check if running in production
 * @returns {boolean}
 */
export function isProduction() {
  return getEnvironment() === 'production'
}

/**
 * Check if running in test
 * @returns {boolean}
 */
export function isTest() {
  return getEnvironment() === 'test'
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object to merge
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

/**
 * Load a single config file
 * @param {string} filePath - Path to config file
 * @returns {Promise<Object|null>} Config object or null if not found
 */
async function loadConfigFile(filePath) {
  try {
    const module = await import(filePath)
    // Support both default export and named exports
    return module.default || module
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      return null
    }
    throw error
  }
}

/**
 * Get all .js files in a directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>} Array of file paths
 */
async function getConfigFiles(dirPath) {
  const { Glob } = await import('bun')
  const glob = new Glob('*.js')
  const files = []

  try {
    for await (const file of glob.scan({ cwd: dirPath, absolute: true })) {
      files.push(file)
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  return files
}

/**
 * Configuration container
 */
export class Config {
  constructor() {
    this._config = {}
    this._loaded = false
    this._appRoot = process.cwd()
  }

  /**
   * Set the application root directory
   * @param {string} root - Application root path
   */
  setAppRoot(root) {
    this._appRoot = root
  }

  /**
   * Get the application root directory
   * @returns {string}
   */
  get appRoot() {
    return this._appRoot
  }

  /**
   * Get current environment
   * @returns {string}
   */
  get env() {
    return getEnvironment()
  }

  /**
   * Load all configuration files
   * @param {Object} options - Load options
   * @param {string} [options.root] - Application root (defaults to cwd)
   * @returns {Promise<Config>} This config instance
   */
  async load(options = {}) {
    const root = options.root || this._appRoot
    this._appRoot = root

    const configDir = join(root, 'config')
    const envDir = join(configDir, 'environments')
    const env = getEnvironment()

    // Load all base config files
    const baseFiles = await getConfigFiles(configDir)

    for (const filePath of baseFiles) {
      const filename = basename(filePath, '.js')

      // Skip special directories/files
      if (filename === 'environments' || filename === 'initializers') {
        continue
      }

      const config = await loadConfigFile(filePath)
      if (config) {
        this._config[filename] = config
      }
    }

    // Load environment-specific config
    const envConfigPath = join(envDir, `${env}.js`)
    const envConfig = await loadConfigFile(envConfigPath)

    if (envConfig) {
      // Environment config can override any base config
      for (const [key, value] of Object.entries(envConfig)) {
        if (this._config[key]) {
          this._config[key] = deepMerge(this._config[key], value)
        } else {
          this._config[key] = value
        }
      }

      // Also store the full environment config for reference
      this._config._environment = envConfig
    }

    this._loaded = true
    return this
  }

  /**
   * Get a configuration value by dot notation
   * @param {string} key - Configuration key (e.g., 'database.host')
   * @param {any} [defaultValue] - Default value if not found
   * @returns {any}
   * @example
   * config.get('database.host')
   * config.get('cache.ttl', 3600)
   */
  get(key, defaultValue = undefined) {
    const keys = key.split('.')
    let value = this._config

    for (const k of keys) {
      if (value === undefined || value === null) {
        return defaultValue
      }
      value = value[k]
    }

    return value === undefined ? defaultValue : value
  }

  /**
   * Set a configuration value by dot notation
   * @param {string} key - Configuration key (e.g., 'database.host')
   * @param {any} value - Value to set
   * @example
   * config.set('database.host', 'localhost')
   */
  set(key, value) {
    const keys = key.split('.')
    let obj = this._config

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {}
      }
      obj = obj[k]
    }

    obj[keys[keys.length - 1]] = value
  }

  /**
   * Check if a configuration key exists
   * @param {string} key - Configuration key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined
  }

  /**
   * Get a required configuration value (throws if not found)
   * @param {string} key - Configuration key
   * @returns {any}
   * @throws {Error} If configuration key is not found
   */
  require(key) {
    const value = this.get(key)
    if (value === undefined) {
      throw new Error(`Required configuration key "${key}" is not set`)
    }
    return value
  }

  /**
   * Get a configuration section
   * @param {string} section - Section name (e.g., 'database')
   * @returns {Object}
   */
  section(section) {
    return this._config[section] || {}
  }

  /**
   * Merge additional configuration
   * @param {Object} config - Configuration to merge
   */
  merge(config) {
    this._config = deepMerge(this._config, config)
  }

  /**
   * Get all configuration as a plain object
   * @returns {Object}
   */
  all() {
    return { ...this._config }
  }

  /**
   * Check if configuration has been loaded
   * @returns {boolean}
   */
  get loaded() {
    return this._loaded
  }
}

// Default configuration values for the framework
export const defaultConfig = {
  server: {
    host: '0.0.0.0',
    port: 3000,
    hostname: 'localhost'
  },

  database: {
    adapter: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: null,
    username: null,
    password: null,
    pool: {
      min: 2,
      max: 10
    },
    ssl: false
  },

  redis: {
    // Redis is not configured by default - set host or url to enable
    host: null,
    port: 6379,
    db: 0,
    password: null
  },

  cache: {
    store: 'memory', // 'memory' | 'redis'
    ttl: 3600 // 1 hour default
  },

  jobs: {
    adapter: 'memory', // 'memory' | 'bullmq'
    redis: null, // Uses main redis if null
    concurrency: 5
  },

  mail: {
    adapter: 'console', // 'console' | 'smtp' | 'sendgrid' | 'ses'
    from: 'noreply@example.com'
  },

  storage: {
    adapter: 'local', // 'local' | 's3'
    path: 'storage'
  },

  session: {
    secret: null, // Required in production
    ttl: 86400 * 7 // 1 week
  },

  logging: {
    level: 'info', // 'debug' | 'info' | 'warn' | 'error'
    format: 'pretty' // 'pretty' | 'json'
  }
}

/**
 * Create a new config instance with defaults
 * @param {Object} [overrides] - Configuration overrides
 * @returns {Config}
 */
export function createConfig(overrides = {}) {
  const config = new Config()
  config.merge(defaultConfig)
  config.merge(overrides)
  return config
}

// Global config instance
let globalConfig = null

/**
 * Get or create the global config instance
 * @returns {Config}
 */
export function getConfig() {
  if (!globalConfig) {
    globalConfig = createConfig()
  }
  return globalConfig
}

/**
 * Set the global config instance
 * @param {Config} config
 */
export function setConfig(config) {
  globalConfig = config
}

/**
 * Load configuration from app directory
 * @param {Object} [options] - Load options
 * @param {string} [options.root] - Application root
 * @returns {Promise<Config>}
 */
export async function loadConfig(options = {}) {
  const config = createConfig()
  await config.load(options)
  globalConfig = config
  return config
}

// Export environment helpers for convenience
export { getEnvironment as env }
