/**
 * Database Connection - Connection pooling and query execution
 *
 * Supports PostgreSQL and YugabyteDB with Bun.sql native driver
 * and postgres.js fallback for enhanced compatibility.
 *
 * @module @bun-on-rails/database/connection
 */

import { getConfig } from '../config/loader.js'

// Connection adapter types
export const ADAPTERS = {
  POSTGRESQL: 'postgresql',
  POSTGRES: 'postgres',
  YUGABYTE: 'yugabyte',
  YUGABYTEDB: 'yugabytedb'
}

// Supported adapters that map to PostgreSQL protocol
const POSTGRES_ADAPTERS = [
  ADAPTERS.POSTGRESQL,
  ADAPTERS.POSTGRES,
  ADAPTERS.YUGABYTE,
  ADAPTERS.YUGABYTEDB
]

/**
 * Database connection error
 */
export class DatabaseError extends Error {
  constructor(message, { code = null, query = null, params = null } = {}) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
    this.query = query
    this.params = params
  }
}

/**
 * Connection not established error
 */
export class ConnectionNotEstablishedError extends DatabaseError {
  constructor() {
    super('Database connection not established. Call connect() first.')
    this.name = 'ConnectionNotEstablishedError'
  }
}

/**
 * Parse database URL into configuration object
 * @param {string} url - Database URL
 * @returns {Object} Configuration object
 */
export function parseDatabaseUrl(url) {
  const parsed = new URL(url)

  return {
    adapter: parsed.protocol.replace(':', '').replace('sql', ''),
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 5432,
    database: parsed.pathname.slice(1),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: parsed.searchParams.get('ssl') === 'true' ||
         parsed.searchParams.get('sslmode') === 'require'
  }
}

/**
 * Build connection string from configuration
 * @param {Object} config - Database configuration
 * @returns {string} Connection string
 */
export function buildConnectionString(config) {
  const {
    host = 'localhost',
    port = 5432,
    database,
    username,
    password,
    ssl = false
  } = config

  let url = `postgres://${username || ''}${password ? ':' + encodeURIComponent(password) : ''}`
  if (username) url += '@'
  url += `${host}:${port}/${database}`

  if (ssl) {
    url += '?sslmode=require'
  }

  return url
}

/**
 * Database Connection class
 *
 * Handles database connections using Bun.sql (native, fast) or postgres.js (fallback).
 *
 * Configuration options:
 * - adapter: 'postgresql' | 'postgres' | 'yugabyte' | 'yugabytedb'
 * - host: Database host (default: 'localhost')
 * - port: Database port (default: 5432)
 * - database: Database name (required)
 * - username: Database user
 * - password: Database password
 * - ssl: Enable SSL connection (default: false)
 * - pool: Pool configuration { min, max, idleTimeout, connectTimeout }
 * - useBunSql: Force Bun.sql usage (default: true, falls back to postgres.js)
 *
 * @example
 * const conn = new Connection({
 *   adapter: 'postgresql',
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp_development',
 *   username: 'postgres',
 *   password: 'secret'
 * })
 *
 * await conn.connect()
 * const users = await conn.query('SELECT * FROM users WHERE id = $1', [1])
 */
export class Connection {
  constructor(config = {}) {
    // Allow URL-based config
    if (config.url || config.connectionString) {
      const urlConfig = parseDatabaseUrl(config.url || config.connectionString)
      this.config = { ...urlConfig, ...config }
    } else {
      this.config = config
    }

    // Defaults
    this.config.adapter = this.config.adapter || 'postgresql'
    this.config.host = this.config.host || 'localhost'
    this.config.port = this.config.port || 5432
    this.config.pool = {
      min: 2,
      max: 10,
      idleTimeout: 30,
      connectTimeout: 10,
      ...this.config.pool
    }

    this._client = null
    this._connected = false
    this._useBunSql = this.config.useBunSql !== false
    this._adapter = null
  }

  /**
   * Check if connection is established
   * @returns {boolean}
   */
  get connected() {
    return this._connected
  }

  /**
   * Get the underlying client (Bun.sql or postgres.js)
   * @returns {Object|null}
   */
  get client() {
    return this._client
  }

  /**
   * Get the adapter type being used
   * @returns {string|null} 'bun' or 'postgres'
   */
  get adapterType() {
    return this._adapter
  }

  /**
   * Connect to the database
   *
   * Attempts to use Bun.sql first for maximum performance.
   * Falls back to postgres.js if Bun.sql is not available or fails.
   *
   * @returns {Promise<Connection>} This connection instance
   * @throws {DatabaseError} If connection fails
   *
   * @example
   * const conn = new Connection({ database: 'myapp', username: 'user' })
   * await conn.connect()
   */
  async connect() {
    if (this._connected) {
      return this
    }

    const { adapter } = this.config

    // Validate adapter
    if (!POSTGRES_ADAPTERS.includes(adapter)) {
      throw new DatabaseError(
        `Unsupported database adapter: ${adapter}. ` +
        `Supported adapters: ${POSTGRES_ADAPTERS.join(', ')}`
      )
    }

    // Try Bun.sql first (native, faster)
    if (this._useBunSql && typeof Bun?.sql === 'function') {
      try {
        await this._connectBunSql()
        this._adapter = 'bun'
        this._connected = true
        return this
      } catch (error) {
        // Bun.sql failed, fall back to postgres.js
        console.warn(
          `[BunOnRails] Bun.sql connection failed: ${error.message}. ` +
          `Falling back to postgres.js`
        )
      }
    }

    // Fall back to postgres.js
    try {
      await this._connectPostgresJs()
      this._adapter = 'postgres'
      this._connected = true
      return this
    } catch (error) {
      throw new DatabaseError(
        `Failed to connect to database: ${error.message}`,
        { code: error.code }
      )
    }
  }

  /**
   * Connect using Bun.sql native driver
   * @private
   */
  async _connectBunSql() {
    const { ssl, pool } = this.config

    // Bun.sql uses connection URL
    const connectionUrl = buildConnectionString(this.config)

    // Create Bun.sql connection
    this._client = Bun.sql({
      url: connectionUrl,
      max: pool.max,
      idleTimeout: pool.idleTimeout,
      connectionTimeout: pool.connectTimeout * 1000,
      ssl: ssl ? 'require' : false
    })

    // Test connection by running a simple query
    await this._client`SELECT 1`
  }

  /**
   * Connect using postgres.js library
   * @private
   */
  async _connectPostgresJs() {
    const { host, port, database, username, password, ssl, pool } = this.config

    // Dynamically import postgres.js
    const postgres = (await import('postgres')).default

    // Create postgres.js connection
    this._client = postgres({
      host,
      port,
      database,
      username,
      password,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      max: pool.max,
      idle_timeout: pool.idleTimeout,
      connect_timeout: pool.connectTimeout,
      // YugabyteDB compatibility
      connection: {
        application_name: 'bun-on-rails'
      }
    })

    // Test connection
    await this._client`SELECT 1`
  }

  /**
   * Close all connections
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this._connected) {
      return
    }

    try {
      if (this._adapter === 'bun') {
        // Bun.sql close
        await this._client.close()
      } else if (this._adapter === 'postgres') {
        // postgres.js close
        await this._client.end()
      }
    } finally {
      this._client = null
      this._connected = false
      this._adapter = null
    }
  }

  /**
   * Execute a raw SQL query
   *
   * Uses parameterized queries for security (SQL injection protection).
   *
   * @param {string} sql - SQL query with $1, $2, etc. placeholders
   * @param {any[]} params - Query parameters
   * @returns {Promise<any[]>} Query results
   * @throws {ConnectionNotEstablishedError} If not connected
   * @throws {DatabaseError} If query fails
   *
   * @example
   * const users = await conn.query('SELECT * FROM users WHERE id = $1', [1])
   * const posts = await conn.query(
   *   'SELECT * FROM posts WHERE user_id = $1 AND published = $2',
   *   [userId, true]
   * )
   */
  async query(sql, params = []) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    try {
      if (this._adapter === 'bun') {
        return await this._queryBunSql(sql, params)
      } else {
        return await this._queryPostgresJs(sql, params)
      }
    } catch (error) {
      throw new DatabaseError(
        `Query failed: ${error.message}`,
        { code: error.code, query: sql, params }
      )
    }
  }

  /**
   * Execute query using Bun.sql
   * @private
   */
  async _queryBunSql(sql, params) {
    // Bun.sql uses tagged template literals or unsafe for raw SQL
    if (params.length === 0) {
      return await this._client.unsafe(sql)
    }

    // For parameterized queries, we need to use unsafe with the query
    // Bun.sql expects $1, $2, etc. which is what we use
    return await this._client.unsafe(sql, params)
  }

  /**
   * Execute query using postgres.js
   * @private
   */
  async _queryPostgresJs(sql, params) {
    if (params.length === 0) {
      return await this._client.unsafe(sql)
    }

    return await this._client.unsafe(sql, params)
  }

  /**
   * Execute within a transaction
   *
   * Automatically rolls back on error, commits on success.
   *
   * @param {Function} callback - Async function receiving transaction connection
   * @returns {Promise<any>} Result from callback
   * @throws {ConnectionNotEstablishedError} If not connected
   * @throws {DatabaseError} If transaction fails
   *
   * @example
   * await conn.transaction(async (tx) => {
   *   await tx.query('INSERT INTO users (name) VALUES ($1)', ['John'])
   *   await tx.query('INSERT INTO profiles (user_id) VALUES (lastval())')
   * })
   */
  async transaction(callback) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    try {
      if (this._adapter === 'bun') {
        return await this._transactionBunSql(callback)
      } else {
        return await this._transactionPostgresJs(callback)
      }
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Transaction failed: ${error.message}`,
        { code: error.code }
      )
    }
  }

  /**
   * Execute transaction using Bun.sql
   * @private
   */
  async _transactionBunSql(callback) {
    // Bun.sql transaction
    return await this._client.begin(async (sql) => {
      // Create a transaction-scoped connection wrapper
      const txConn = {
        query: async (query, params = []) => {
          if (params.length === 0) {
            return await sql.unsafe(query)
          }
          return await sql.unsafe(query, params)
        }
      }
      return await callback(txConn)
    })
  }

  /**
   * Execute transaction using postgres.js
   * @private
   */
  async _transactionPostgresJs(callback) {
    // postgres.js transaction
    return await this._client.begin(async (sql) => {
      const txConn = {
        query: async (query, params = []) => {
          if (params.length === 0) {
            return await sql.unsafe(query)
          }
          return await sql.unsafe(query, params)
        }
      }
      return await callback(txConn)
    })
  }

  /**
   * Create a new table
   * @param {string} name - Table name
   * @param {Function} callback - Callback receiving TableBuilder
   * @returns {Promise<void>}
   */
  async createTable(name, callback) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    const { TableBuilder } = await import('./migration.js')
    const builder = new TableBuilder(name)
    callback(builder)

    const sql = builder.toSQL()
    await this.query(sql)
  }

  /**
   * Drop a table
   * @param {string} name - Table name
   * @param {Object} options - Options { ifExists, cascade }
   * @returns {Promise<void>}
   */
  async dropTable(name, options = {}) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    const ifExists = options.ifExists !== false ? 'IF EXISTS' : ''
    const cascade = options.cascade ? 'CASCADE' : ''

    await this.query(`DROP TABLE ${ifExists} "${name}" ${cascade}`.trim())
  }

  /**
   * Add a column to an existing table
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @param {string} type - Column type
   * @param {Object} options - Column options { notNull, default, unique }
   * @returns {Promise<void>}
   */
  async addColumn(table, column, type, options = {}) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    let sql = `ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`

    if (options.notNull) sql += ' NOT NULL'
    if (options.default !== undefined) {
      const defaultVal = typeof options.default === 'string'
        ? `'${options.default}'`
        : options.default
      sql += ` DEFAULT ${defaultVal}`
    }
    if (options.unique) sql += ' UNIQUE'

    await this.query(sql)
  }

  /**
   * Remove a column from a table
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @returns {Promise<void>}
   */
  async removeColumn(table, column) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    await this.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`)
  }

  /**
   * Add an index
   * @param {string} table - Table name
   * @param {string|string[]} columns - Column(s) to index
   * @param {Object} options - { unique, name, using, where }
   * @returns {Promise<void>}
   */
  async addIndex(table, columns, options = {}) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    const cols = Array.isArray(columns) ? columns : [columns]
    const indexName = options.name || `index_${table}_on_${cols.join('_')}`

    let sql = `CREATE`
    if (options.unique) sql += ' UNIQUE'
    sql += ` INDEX "${indexName}" ON "${table}"`
    if (options.using) sql += ` USING ${options.using}`
    sql += ` (${cols.map(c => `"${c}"`).join(', ')})`
    if (options.where) sql += ` WHERE ${options.where}`

    await this.query(sql)
  }

  /**
   * Remove an index
   * @param {string} table - Table name (unused for PostgreSQL but kept for compatibility)
   * @param {string} indexName - Index name or column(s)
   * @param {Object} options - { ifExists }
   * @returns {Promise<void>}
   */
  async removeIndex(table, indexName, options = {}) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    // If indexName is an array, construct the default index name
    const name = Array.isArray(indexName)
      ? `index_${table}_on_${indexName.join('_')}`
      : indexName

    const ifExists = options.ifExists !== false ? 'IF EXISTS' : ''
    await this.query(`DROP INDEX ${ifExists} "${name}"`)
  }

  /**
   * Check if a table exists
   * @param {string} table - Table name
   * @returns {Promise<boolean>}
   */
  async tableExists(table) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    const result = await this.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      )`,
      [table]
    )

    return result[0]?.exists === true
  }

  /**
   * Get list of all tables
   * @returns {Promise<string[]>}
   */
  async tables() {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    const result = await this.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    )

    return result.map(row => row.table_name)
  }

  /**
   * Get column information for a table
   * @param {string} table - Table name
   * @returns {Promise<Object[]>} Column definitions
   */
  async columns(table) {
    if (!this._connected) {
      throw new ConnectionNotEstablishedError()
    }

    const result = await this.query(
      `SELECT
        column_name,
        data_type,
        column_default,
        is_nullable,
        character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    )

    return result.map(row => ({
      name: row.column_name,
      type: row.data_type,
      default: row.column_default,
      nullable: row.is_nullable === 'YES',
      maxLength: row.character_maximum_length
    }))
  }
}

/**
 * Connection Pool - Manages a pool of database connections
 *
 * Note: Both Bun.sql and postgres.js have built-in connection pooling.
 * This class provides an abstraction layer and additional functionality.
 *
 * @example
 * const pool = new ConnectionPool({
 *   host: 'localhost',
 *   database: 'myapp',
 *   pool: { min: 2, max: 10 }
 * })
 *
 * await pool.initialize()
 * const conn = await pool.acquire()
 * try {
 *   await conn.query('SELECT * FROM users')
 * } finally {
 *   pool.release(conn)
 * }
 */
export class ConnectionPool {
  constructor(config) {
    this.config = config
    this._connection = null
    this._initialized = false
    this._stats = {
      acquired: 0,
      released: 0,
      waiting: 0
    }
  }

  /**
   * Check if pool is initialized
   * @returns {boolean}
   */
  get initialized() {
    return this._initialized
  }

  /**
   * Get pool statistics
   * @returns {Object}
   */
  get stats() {
    return { ...this._stats }
  }

  /**
   * Initialize the connection pool
   * @returns {Promise<ConnectionPool>}
   */
  async initialize() {
    if (this._initialized) {
      return this
    }

    // Create the shared connection (which handles pooling internally)
    this._connection = new Connection(this.config)
    await this._connection.connect()
    this._initialized = true

    return this
  }

  /**
   * Get a connection from the pool
   *
   * Note: Bun.sql and postgres.js handle connection pooling internally,
   * so this returns the shared connection object.
   *
   * @returns {Promise<Connection>}
   * @throws {Error} If pool not initialized
   */
  async acquire() {
    if (!this._initialized) {
      throw new Error('Connection pool not initialized. Call initialize() first.')
    }

    this._stats.acquired++
    return this._connection
  }

  /**
   * Return a connection to the pool
   *
   * Note: For compatibility. The underlying libraries handle pooling.
   *
   * @param {Connection} _connection - Connection to release
   */
  release(_connection) {
    this._stats.released++
  }

  /**
   * Execute a callback with a connection from the pool
   * @param {Function} callback - Async function receiving connection
   * @returns {Promise<any>}
   */
  async withConnection(callback) {
    const conn = await this.acquire()
    try {
      return await callback(conn)
    } finally {
      this.release(conn)
    }
  }

  /**
   * Close all connections
   * @returns {Promise<void>}
   */
  async drain() {
    if (!this._initialized) {
      return
    }

    await this._connection.disconnect()
    this._connection = null
    this._initialized = false
    this._stats = { acquired: 0, released: 0, waiting: 0 }
  }

  /**
   * Alias for drain()
   * @returns {Promise<void>}
   */
  async close() {
    return this.drain()
  }
}

// Global connection instance
let _globalConnection = null

/**
 * Get or create the global database connection
 * @param {Object} [config] - Database configuration
 * @returns {Connection}
 */
export function getConnection(config = null) {
  if (!_globalConnection && config) {
    _globalConnection = new Connection(config)
  }
  return _globalConnection
}

/**
 * Set the global database connection
 * @param {Connection} connection
 */
export function setConnection(connection) {
  _globalConnection = connection
}

/**
 * Connect using configuration from config/database.js
 * @returns {Promise<Connection>}
 */
export async function connectFromConfig() {
  const config = getConfig()
  const dbConfig = config.get('database')

  if (!dbConfig) {
    throw new DatabaseError('No database configuration found')
  }

  const connection = new Connection(dbConfig)
  await connection.connect()

  _globalConnection = connection
  return connection
}

/**
 * Disconnect the global connection
 * @returns {Promise<void>}
 */
export async function disconnect() {
  if (_globalConnection) {
    await _globalConnection.disconnect()
    _globalConnection = null
  }
}
