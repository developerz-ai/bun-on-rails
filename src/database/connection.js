/**
 * Database Connection - Connection pooling and query execution
 *
 * Supports PostgreSQL and YugabyteDB with Bun.sql native driver
 * and postgres.js fallback for enhanced compatibility.
 *
 * @module bun-on-rails/database/connection
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { getConfig } from '../config/loader.js'

// Inside connection.transaction(callback), getConnection() returns the
// transaction's connection, so model queries written in the callback join the
// transaction (pinned by test/database/transactions.test.js).
const transactionScope = new AsyncLocalStorage()

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
 * The SQLSTATE of a driver error: postgres.js reports it as `code`, Bun.SQL as
 * `errno` (its `code` is a generic ERR_POSTGRES_SERVER_ERROR). DatabaseError#code
 * is always the SQLSTATE (e.g. '23505' for a unique violation).
 * @param {Error & { errno?: string, code?: string }} error
 * @returns {string|null}
 */
function sqlState(error) {
  return error?.errno ?? error?.code ?? null
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
    // The scheme is the adapter: postgres:// and postgresql:// are both supported names.
    adapter: parsed.protocol.replace(/:$/, ''),
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
    if (this._useBunSql && typeof Bun?.SQL === 'function') {
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
        { code: sqlState(error) }
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

    // `Bun.sql` is the default client, a tagged-template function: calling it
    // with options builds a query helper, not a client. Bun.SQL constructs one.
    // Its timeouts are in seconds.
    this._client = new Bun.SQL({
      url: connectionUrl,
      max: pool.max,
      idleTimeout: pool.idleTimeout,
      connectionTimeout: pool.connectTimeout,
      tls: Boolean(ssl)
    })

    // Test the connection with the same call queries use
    await this._client.unsafe('SELECT 1')
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
      ssl: ssl ? 'require' : false,
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
        { code: sqlState(error), query: sql, params }
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

    // Already inside a transaction on this connection: join it. Opening a second
    // one would let inner writes commit even when the outer callback throws.
    const active = transactionScope.getStore()
    if (active && active.owner === this) {
      return await callback(active)
    }

    try {
      return await this._runInTransaction(callback)
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error
      }
      throw new DatabaseError(
        `Transaction failed: ${error.message}`,
        { code: sqlState(error) }
      )
    }
  }

  /**
   * Run `callback` in a transaction on either driver (Bun.sql and postgres.js
   * share `begin` and `unsafe`). The callback gets a transaction connection,
   * and getConnection() returns it for the callback's whole async extent, so
   * models use it too. A nested transaction() joins the open transaction.
   * @private
   */
  async _runInTransaction(callback) {
    return await this._client.begin(async (sql) => {
      const txConn = {
        owner: this,
        connected: true,
        query: async (query, params = []) => {
          if (params.length === 0) {
            return await sql.unsafe(query)
          }
          return await sql.unsafe(query, params)
        },
        transaction: async (nested) => await nested(txConn)
      }
      return await transactionScope.run(txConn, () => callback(txConn))
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
    const { PostgresAdapter } = await import('./adapters/postgres.js')
    const adapter = new PostgresAdapter()

    await this.query(`DROP TABLE ${ifExists} ${adapter.quoteTableName(name)} ${cascade}`.trim())
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

    const { PostgresAdapter } = await import('./adapters/postgres.js')
    const adapter = new PostgresAdapter()
    let sql = `ALTER TABLE ${adapter.quoteTableName(table)} ADD COLUMN ${adapter.quoteIdentifier(column)} ${type}`

    if (options.notNull) sql += ' NOT NULL'
    if (options.default !== undefined) {
      const defaultVal = typeof options.default === 'string'
        ? `'${options.default.replace(/'/g, "''")}'`
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

    const { PostgresAdapter } = await import('./adapters/postgres.js')
    const adapter = new PostgresAdapter()
    await this.query(`ALTER TABLE ${adapter.quoteTableName(table)} DROP COLUMN ${adapter.quoteIdentifier(column)}`)
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

    const { PostgresAdapter } = await import('./adapters/postgres.js')
    const adapter = new PostgresAdapter()

    const cols = Array.isArray(columns) ? columns : [columns]
    const indexName = options.name || `index_${table}_on_${cols.join('_')}`

    let sql = `CREATE`
    if (options.unique) sql += ' UNIQUE'
    sql += ` INDEX ${adapter.quoteIdentifier(indexName)} ON ${adapter.quoteTableName(table)}`
    if (options.using) sql += ` USING ${options.using}`
    sql += ` (${cols.map(c => adapter.quoteIdentifier(c)).join(', ')})`
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
    const { PostgresAdapter } = await import('./adapters/postgres.js')
    const adapter = new PostgresAdapter()
    await this.query(`DROP INDEX ${ifExists} ${adapter.quoteIdentifier(name)}`)
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
 * Pool exhausted error
 */
export class PoolExhaustedError extends DatabaseError {
  constructor(timeout) {
    super(`Connection pool exhausted. Timed out after ${timeout}ms waiting for available connection.`)
    this.name = 'PoolExhaustedError'
  }
}

/**
 * Pool connection wrapper
 *
 * Wraps a Connection to track pool state
 * @private
 */
class PooledConnection {
  constructor(connection, pool) {
    this._connection = connection
    this._pool = pool
    this._inUse = false
    this._lastUsed = Date.now()
    this._id = Math.random().toString(36).substring(7)
  }

  get id() {
    return this._id
  }

  get inUse() {
    return this._inUse
  }

  get lastUsed() {
    return this._lastUsed
  }

  get connected() {
    return this._connection.connected
  }

  markInUse() {
    this._inUse = true
    this._lastUsed = Date.now()
  }

  markAvailable() {
    this._inUse = false
    this._lastUsed = Date.now()
  }

  async query(sql, params) {
    this._lastUsed = Date.now()
    return await this._connection.query(sql, params)
  }

  async transaction(callback) {
    this._lastUsed = Date.now()
    return await this._connection.transaction(callback)
  }

  async disconnect() {
    return await this._connection.disconnect()
  }
}

/**
 * Connection Pool - Manages a pool of database connections
 *
 * Provides connection pooling with min/max limits, connection queuing,
 * idle timeout, and health checking.
 *
 * Note: Both Bun.sql and postgres.js have built-in connection pooling.
 * This class provides an additional abstraction layer for explicit pool
 * management and better control over connection lifecycle.
 *
 * Configuration options:
 * - All Connection options (adapter, host, port, database, etc.)
 * - pool.min: Minimum connections to keep (default: 2)
 * - pool.max: Maximum connections allowed (default: 10)
 * - pool.idleTimeout: Seconds before idle connections are closed (default: 30)
 * - pool.acquireTimeout: Milliseconds to wait for connection (default: 10000)
 * - pool.validateOnAcquire: Check connection health on acquire (default: true)
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
  constructor(config = {}) {
    this.config = {
      ...config,
      pool: {
        min: 2,
        max: 10,
        idleTimeout: 30,
        acquireTimeout: 10000,
        validateOnAcquire: true,
        ...config.pool
      }
    }

    this._connections = []
    this._waiters = []
    this._initialized = false
    this._draining = false
    this._idleCheckInterval = null
    this._stats = {
      acquired: 0,
      released: 0,
      waiting: 0,
      created: 0,
      destroyed: 0,
      timedOut: 0,
      errors: 0
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
   * Check if pool is draining
   * @returns {boolean}
   */
  get draining() {
    return this._draining
  }

  /**
   * Get pool statistics
   * @returns {Object}
   */
  get stats() {
    return {
      ...this._stats,
      total: this._connections.length,
      available: this._connections.filter(c => !c.inUse).length,
      inUse: this._connections.filter(c => c.inUse).length,
      waiting: this._waiters.length
    }
  }

  /**
   * Get pool size
   * @returns {number}
   */
  get size() {
    return this._connections.length
  }

  /**
   * Get number of available connections
   * @returns {number}
   */
  get available() {
    return this._connections.filter(c => !c.inUse).length
  }

  /**
   * Initialize the connection pool
   *
   * Creates minimum number of connections and starts idle connection cleanup.
   *
   * @returns {Promise<ConnectionPool>}
   * @throws {DatabaseError} If connection fails
   */
  async initialize() {
    if (this._initialized) {
      return this
    }

    const { min } = this.config.pool

    // Create minimum connections
    const createPromises = []
    for (let i = 0; i < min; i++) {
      createPromises.push(this._createConnection())
    }

    await Promise.all(createPromises)
    this._initialized = true

    // Start idle connection cleanup
    this._startIdleCheck()

    return this
  }

  /**
   * Create a new connection for the pool
   * @private
   * @returns {Promise<PooledConnection>}
   */
  async _createConnection() {
    const connection = new Connection(this.config)
    await connection.connect()

    const pooled = new PooledConnection(connection, this)
    this._connections.push(pooled)
    this._stats.created++

    return pooled
  }

  /**
   * Destroy a connection
   * @private
   * @param {PooledConnection} pooled
   */
  async _destroyConnection(pooled) {
    const index = this._connections.indexOf(pooled)
    if (index !== -1) {
      this._connections.splice(index, 1)
    }

    try {
      await pooled.disconnect()
    } catch (error) {
      // Ignore disconnect errors
    }

    this._stats.destroyed++
  }

  /**
   * Validate a connection by running a simple query
   * @private
   * @param {PooledConnection} pooled
   * @returns {Promise<boolean>}
   */
  async _validateConnection(pooled) {
    try {
      await pooled.query('SELECT 1')
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Start idle connection cleanup interval
   * @private
   */
  _startIdleCheck() {
    const { idleTimeout } = this.config.pool

    // Check every half of idle timeout
    const interval = (idleTimeout * 1000) / 2

    this._idleCheckInterval = setInterval(async () => {
      await this._cleanupIdleConnections()
    }, interval)
  }

  /**
   * Stop idle connection cleanup
   * @private
   */
  _stopIdleCheck() {
    if (this._idleCheckInterval) {
      clearInterval(this._idleCheckInterval)
      this._idleCheckInterval = null
    }
  }

  /**
   * Clean up idle connections above minimum
   * @private
   */
  async _cleanupIdleConnections() {
    const { min, idleTimeout } = this.config.pool
    const now = Date.now()
    const idleMs = idleTimeout * 1000

    // Find idle connections above minimum
    const idleConnections = this._connections
      .filter(c => !c.inUse && (now - c.lastUsed) > idleMs)
      .slice(0, Math.max(0, this._connections.length - min))

    // Destroy idle connections
    for (const conn of idleConnections) {
      await this._destroyConnection(conn)
    }
  }

  /**
   * Get a connection from the pool
   *
   * If no connection is available and pool is not at max capacity,
   * creates a new connection. If at max capacity, waits for a connection
   * to be released.
   *
   * @param {Object} options - Acquire options
   * @param {number} options.timeout - Override default acquire timeout
   * @returns {Promise<PooledConnection>}
   * @throws {Error} If pool not initialized
   * @throws {PoolExhaustedError} If timeout waiting for connection
   */
  async acquire(options = {}) {
    if (!this._initialized) {
      throw new Error('Connection pool not initialized. Call initialize() first.')
    }

    if (this._draining) {
      throw new Error('Connection pool is draining. Cannot acquire new connections.')
    }

    const timeout = options.timeout ?? this.config.pool.acquireTimeout
    const { max, validateOnAcquire } = this.config.pool

    // Try to get an available connection
    let pooled = this._findAvailableConnection()

    if (pooled) {
      // Validate if enabled
      if (validateOnAcquire) {
        const valid = await this._validateConnection(pooled)
        if (!valid) {
          // Connection is bad, destroy and try again
          await this._destroyConnection(pooled)
          this._stats.errors++
          return this.acquire(options)
        }
      }

      pooled.markInUse()
      this._stats.acquired++
      return pooled
    }

    // No available connection, can we create a new one?
    if (this._connections.length < max) {
      try {
        pooled = await this._createConnection()
        pooled.markInUse()
        this._stats.acquired++
        return pooled
      } catch (error) {
        this._stats.errors++
        throw error
      }
    }

    // Pool is at max capacity, wait for a connection
    return this._waitForConnection(timeout)
  }

  /**
   * Find an available connection
   * @private
   * @returns {PooledConnection|null}
   */
  _findAvailableConnection() {
    // Prefer connections that were used more recently (warmer)
    const available = this._connections
      .filter(c => !c.inUse)
      .sort((a, b) => b.lastUsed - a.lastUsed)

    return available[0] || null
  }

  /**
   * Wait for a connection to become available
   * @private
   * @param {number} timeout
   * @returns {Promise<PooledConnection>}
   */
  _waitForConnection(timeout) {
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: null
      }

      // Set timeout
      waiter.timer = setTimeout(() => {
        const index = this._waiters.indexOf(waiter)
        if (index !== -1) {
          this._waiters.splice(index, 1)
        }
        this._stats.timedOut++
        reject(new PoolExhaustedError(timeout))
      }, timeout)

      this._waiters.push(waiter)
      this._stats.waiting = this._waiters.length
    })
  }

  /**
   * Return a connection to the pool
   *
   * If there are waiters, hands the connection to the next waiter.
   * Otherwise marks the connection as available.
   *
   * @param {PooledConnection} pooled - Connection to release
   */
  release(pooled) {
    if (!pooled || !(pooled instanceof PooledConnection)) {
      return
    }

    // Check if this connection belongs to this pool
    if (!this._connections.includes(pooled)) {
      return
    }

    this._stats.released++

    // If there are waiters, give connection to next waiter
    if (this._waiters.length > 0) {
      const waiter = this._waiters.shift()
      clearTimeout(waiter.timer)
      this._stats.waiting = this._waiters.length

      pooled.markInUse()
      this._stats.acquired++
      waiter.resolve(pooled)
      return
    }

    // Mark as available
    pooled.markAvailable()
  }

  /**
   * Execute a callback with a connection from the pool
   *
   * Automatically acquires a connection, runs the callback,
   * and releases the connection (even on error).
   *
   * @param {Function} callback - Async function receiving connection
   * @param {Object} options - Acquire options
   * @returns {Promise<any>}
   */
  async withConnection(callback, options = {}) {
    const conn = await this.acquire(options)
    try {
      return await callback(conn)
    } finally {
      this.release(conn)
    }
  }

  /**
   * Execute a query using a connection from the pool
   *
   * Convenience method for simple queries.
   *
   * @param {string} sql - SQL query
   * @param {any[]} params - Query parameters
   * @returns {Promise<any[]>}
   */
  async query(sql, params = []) {
    return this.withConnection(async (conn) => {
      return conn.query(sql, params)
    })
  }

  /**
   * Execute within a transaction using a connection from the pool
   *
   * @param {Function} callback - Async function receiving transaction
   * @returns {Promise<any>}
   */
  async transaction(callback) {
    return this.withConnection(async (conn) => {
      return conn.transaction(callback)
    })
  }

  /**
   * Drain the pool - close all connections
   *
   * Stops accepting new acquire requests, waits for all connections
   * to be released, then closes all connections.
   *
   * @param {Object} options - Drain options
   * @param {number} options.timeout - Timeout for draining (default: 30000ms)
   * @returns {Promise<void>}
   */
  async drain(options = {}) {
    if (!this._initialized) {
      return
    }

    const timeout = options.timeout ?? 30000
    this._draining = true

    // Stop idle check
    this._stopIdleCheck()

    // Reject all waiters
    for (const waiter of this._waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Connection pool is draining'))
    }
    this._waiters = []
    this._stats.waiting = 0

    // Wait for all connections to be released (with timeout)
    const start = Date.now()
    while (this._connections.some(c => c.inUse)) {
      if (Date.now() - start > timeout) {
        // Force close
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Close all connections
    // Make a copy of the connections array to avoid modification during iteration
    const connectionsToClose = [...this._connections]
    for (const conn of connectionsToClose) {
      try {
        await conn.disconnect()
      } catch (error) {
        // Ignore disconnect errors
      }
      this._stats.destroyed++
    }

    this._connections = []
    this._initialized = false
    this._draining = false
    this._stats = {
      acquired: 0,
      released: 0,
      waiting: 0,
      created: 0,
      destroyed: 0,
      timedOut: 0,
      errors: 0
    }
  }

  /**
   * Alias for drain()
   * @returns {Promise<void>}
   */
  async close() {
    return this.drain()
  }

  /**
   * End the pool (alias for drain)
   * @returns {Promise<void>}
   */
  async end() {
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
  const inTransaction = transactionScope.getStore()
  if (inTransaction) {
    return inTransaction
  }
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
