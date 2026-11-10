/**
 * Query Builder - Chainable query interface
 *
 * Provides a fluent interface for building SQL queries with support
 * for eager loading associations.
 *
 * @module bun-on-rails/database/query_builder
 */

import { getConnection } from './connection.js'
import { PostgresAdapter } from './adapters/postgres.js'
import { trackQuery } from './n_plus_one_detector.js'
import { tableize } from '../support/inflector.js'
import { resolveAssociationModel, loadThroughJoinTable } from './associations.js'

const ASSOCIATION_TYPES = ['belongsTo', 'hasMany', 'hasOne', 'hasAndBelongsToMany']

/**
 * The number of rows an UPDATE or DELETE changed. Both drivers (postgres.js and
 * Bun.sql) report it as `count` on the result; the result's length is the rows
 * *returned*, which is 0 without RETURNING. A result without a numeric `count`
 * throws instead of reporting 0. Pinned by test/database/write_counts.test.js.
 *
 * @param {Array & { count?: number }} result
 * @param {string} sql
 * @returns {number}
 */
function affectedRows(result, sql) {
  if (typeof result?.count !== 'number') {
    throw new Error(`The database driver returned no affected-row count for: ${sql}`)
  }
  return result.count
}

/**
 * Record not found error
 */
export class RecordNotFoundError extends Error {
  constructor(model, id) {
    const message = id !== undefined
      ? `${model} with id ${id} not found`
      : `${model} record not found`
    super(message)
    this.name = 'RecordNotFoundError'
    this.model = model
    this.id = id
  }
}

/**
 * Paginated result wrapper containing records and pagination metadata
 *
 * @example
 * const result = await User.page(1).per(10).paginate()
 *
 * console.log(result.records)       // Array of User instances
 * console.log(result.currentPage)   // 1
 * console.log(result.perPage)       // 10
 * console.log(result.totalCount)    // 100
 * console.log(result.totalPages)    // 10
 * console.log(result.hasNextPage)   // true
 * console.log(result.hasPreviousPage) // false
 *
 * // Array-like behavior
 * console.log(result.length)        // 10
 * result.forEach(user => console.log(user.name))
 * for (const user of result) { console.log(user.name) }
 */
export class PaginatedResult {
  /**
   * Create a new PaginatedResult
   *
   * @param {Object} options
   * @param {Model[]} options.records - The paginated records
   * @param {number} options.currentPage - Current page number (1-based)
   * @param {number} options.perPage - Number of records per page
   * @param {number} options.totalCount - Total number of records matching query
   */
  constructor({ records, currentPage, perPage, totalCount }) {
    this.records = records
    this.currentPage = currentPage
    this.perPage = perPage
    this.totalCount = totalCount
  }

  /**
   * Total number of pages
   * @type {number}
   */
  get totalPages() {
    if (this.totalCount === 0) return 0
    return Math.ceil(this.totalCount / this.perPage)
  }

  /**
   * Whether there's a next page
   * @type {boolean}
   */
  get hasNextPage() {
    return this.currentPage < this.totalPages
  }

  /**
   * Whether there's a previous page
   * @type {boolean}
   */
  get hasPreviousPage() {
    return this.currentPage > 1
  }

  /**
   * Alias for hasNextPage (Rails-style)
   * @type {boolean}
   */
  get nextPage() {
    return this.hasNextPage ? this.currentPage + 1 : null
  }

  /**
   * Alias for hasPreviousPage (Rails-style)
   * @type {boolean}
   */
  get previousPage() {
    return this.hasPreviousPage ? this.currentPage - 1 : null
  }

  /**
   * Whether this is the first page
   * @type {boolean}
   */
  get firstPage() {
    return this.currentPage === 1
  }

  /**
   * Whether this is the last page
   * @type {boolean}
   */
  get lastPage() {
    return this.currentPage >= this.totalPages
  }

  /**
   * Number of records in current page
   * @type {number}
   */
  get length() {
    return this.records.length
  }

  /**
   * Offset of first record in this page (0-based)
   * @type {number}
   */
  get offset() {
    return (this.currentPage - 1) * this.perPage
  }

  /**
   * Whether the result is empty
   * @type {boolean}
   */
  get empty() {
    return this.records.length === 0
  }

  /**
   * Make PaginatedResult iterable
   * @returns {Iterator}
   */
  [Symbol.iterator]() {
    return this.records[Symbol.iterator]()
  }

  /**
   * Get record at index
   * @param {number} index
   * @returns {Model}
   */
  at(index) {
    return this.records[index]
  }

  /**
   * Map over records
   * @param {Function} fn
   * @returns {Array}
   */
  map(fn) {
    return this.records.map(fn)
  }

  /**
   * Filter records
   * @param {Function} fn
   * @returns {Array}
   */
  filter(fn) {
    return this.records.filter(fn)
  }

  /**
   * ForEach over records
   * @param {Function} fn
   */
  forEach(fn) {
    this.records.forEach(fn)
  }

  /**
   * Find a record
   * @param {Function} fn
   * @returns {Model|undefined}
   */
  find(fn) {
    return this.records.find(fn)
  }

  /**
   * Check if some records match
   * @param {Function} fn
   * @returns {boolean}
   */
  some(fn) {
    return this.records.some(fn)
  }

  /**
   * Check if every record matches
   * @param {Function} fn
   * @returns {boolean}
   */
  every(fn) {
    return this.records.every(fn)
  }

  /**
   * Reduce records
   * @param {Function} fn
   * @param {any} initial
   * @returns {any}
   */
  reduce(fn, initial) {
    return this.records.reduce(fn, initial)
  }

  /**
   * Convert to plain object (useful for JSON serialization)
   * @returns {Object}
   */
  toJSON() {
    return {
      records: this.records.map(r => r.toJSON ? r.toJSON() : r),
      pagination: {
        currentPage: this.currentPage,
        perPage: this.perPage,
        totalCount: this.totalCount,
        totalPages: this.totalPages,
        hasNextPage: this.hasNextPage,
        hasPreviousPage: this.hasPreviousPage,
        nextPage: this.nextPage,
        previousPage: this.previousPage,
        firstPage: this.firstPage,
        lastPage: this.lastPage
      }
    }
  }
}

/**
 * QueryBuilder class - Chainable query interface
 *
 * @example
 * // Basic query
 * const users = await User.where({ active: true }).limit(10).all()
 *
 * // With ordering
 * const posts = await Post.where({ published: true }).order({ created_at: 'desc' }).all()
 *
 * // With eager loading
 * const posts = await Post.includes('author', 'comments').all()
 */
export class QueryBuilder {
  constructor(model) {
    this.model = model
    this.conditions = []
    this.includesList = []
    this.orders = []
    this.limitValue = null
    this.offsetValue = null
    this.selectColumns = ['*']
    this.groupColumns = []
    this.havingConditions = []
    this.joinClauses = []
    this.distinctValue = false
    this.lockMode = null
    this._adapter = new PostgresAdapter()

    // The model's named scopes chain on the builder: Post.published().recent().
    // Model._initializeScopes refuses a scope that would shadow a builder member.
    for (const name of Object.keys(model?.scopes ?? {})) {
      if (name in this) continue
      Object.defineProperty(this, name, {
        value: (...args) => this.scope(name, ...args),
        writable: true,
        configurable: true,
        enumerable: false
      })
    }
  }

  /**
   * Clone the query builder for chaining
   * @private
   * @returns {QueryBuilder}
   */
  _clone() {
    const clone = new QueryBuilder(this.model)
    clone.conditions = [...this.conditions]
    clone.includesList = [...this.includesList]
    clone.orders = [...this.orders]
    clone.limitValue = this.limitValue
    clone.offsetValue = this.offsetValue
    clone.selectColumns = [...this.selectColumns]
    clone.groupColumns = [...this.groupColumns]
    clone.havingConditions = [...this.havingConditions]
    clone.joinClauses = [...this.joinClauses]
    clone.distinctValue = this.distinctValue
    clone.lockMode = this.lockMode
    clone._perPage = this._perPage
    clone._currentPage = this._currentPage
    return clone
  }

  /**
   * Add WHERE conditions
   *
   * @param {Object|string} conditions - Object of key/value pairs or raw SQL string
   * @param {...any} values - Values for placeholders when using raw SQL
   * @returns {QueryBuilder}
   *
   * @example
   * // Object conditions
   * query.where({ name: 'John', active: true })
   *
   * // With operators
   * query.where({ age: { '>': 18 } })
   * query.where({ status: { in: ['active', 'pending'] } })
   *
   * // Raw SQL
   * query.where('created_at > NOW() - INTERVAL 1 DAY')
   */
  where(conditions, ...values) {
    const clone = this._clone()

    if (typeof conditions === 'string') {
      // Raw SQL condition
      clone.conditions.push({ raw: conditions, values })
      return clone
    }

    // Object conditions
    for (const [column, value] of Object.entries(conditions)) {
      if (value === null) {
        clone.conditions.push({ column, operator: 'IS NULL', value: null })
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Operator-based condition: { age: { '>': 18 } }
        for (const [op, val] of Object.entries(value)) {
          const normalizedOp = normalizeOperator(op)
          clone.conditions.push({ column, operator: normalizedOp, value: val })
        }
      } else if (Array.isArray(value)) {
        // Array means IN operator
        clone.conditions.push({ column, operator: 'IN', value })
      } else {
        clone.conditions.push({ column, operator: '=', value })
      }
    }

    return clone
  }

  /**
   * Add WHERE NOT conditions
   * @param {Object} conditions
   * @returns {QueryBuilder}
   */
  whereNot(conditions) {
    const clone = this._clone()

    for (const [column, value] of Object.entries(conditions)) {
      if (value === null) {
        clone.conditions.push({ column, operator: 'IS NOT NULL', value: null })
      } else if (Array.isArray(value)) {
        clone.conditions.push({ column, operator: 'NOT IN', value })
      } else {
        clone.conditions.push({ column, operator: '!=', value })
      }
    }

    return clone
  }

  /**
   * Add OR WHERE conditions
   * @param {Object} conditions
   * @returns {QueryBuilder}
   */
  orWhere(conditions) {
    const clone = this._clone()

    for (const [column, value] of Object.entries(conditions)) {
      if (value === null) {
        clone.conditions.push({ column, operator: 'IS NULL', value: null, or: true })
      } else if (Array.isArray(value)) {
        clone.conditions.push({ column, operator: 'IN', value, or: true })
      } else {
        clone.conditions.push({ column, operator: '=', value, or: true })
      }
    }

    return clone
  }

  /**
   * Add ORDER BY clause
   *
   * @param {Object|string} order - Column name or object with column/direction
   * @returns {QueryBuilder}
   *
   * @example
   * query.order('created_at')           // ASC by default
   * query.order({ created_at: 'desc' }) // DESC
   * query.order({ name: 'asc', id: 'desc' }) // Multiple columns
   */
  order(order) {
    const clone = this._clone()

    if (typeof order === 'string') {
      clone.orders.push({ column: order, direction: 'ASC' })
    } else if (typeof order === 'object') {
      for (const [column, direction] of Object.entries(order)) {
        clone.orders.push({
          column,
          direction: (direction || 'ASC').toUpperCase()
        })
      }
    }

    return clone
  }

  /**
   * Set LIMIT
   * @param {number} limit
   * @returns {QueryBuilder}
   */
  limit(limit) {
    const clone = this._clone()
    clone.limitValue = limit
    return clone
  }

  /**
   * Set OFFSET
   * @param {number} offset
   * @returns {QueryBuilder}
   */
  offset(offset) {
    const clone = this._clone()
    clone.offsetValue = offset
    return clone
  }

  /**
   * Eager load associations
   *
   * @param {...string} associations - Association names to eager load
   * @returns {QueryBuilder}
   *
   * @example
   * // Load single association
   * Post.includes('author').all()
   *
   * // Load multiple associations
   * Post.includes('author', 'comments').all()
   *
   * // Nested associations
   * Post.includes('comments.author').all()
   */
  includes(...associations) {
    const clone = this._clone()
    clone.includesList.push(...associations)
    return clone
  }

  /**
   * Select specific columns
   * @param {...string} columns
   * @returns {QueryBuilder}
   */
  select(...columns) {
    const clone = this._clone()
    clone.selectColumns = columns
    return clone
  }

  /**
   * Group by columns
   * @param {...string} columns
   * @returns {QueryBuilder}
   */
  group(...columns) {
    const clone = this._clone()
    clone.groupColumns.push(...columns)
    return clone
  }

  /**
   * Add HAVING conditions
   * @param {Object|string} conditions
   * @returns {QueryBuilder}
   */
  having(conditions) {
    const clone = this._clone()

    if (typeof conditions === 'string') {
      clone.havingConditions.push({ raw: conditions })
    } else {
      for (const [column, value] of Object.entries(conditions)) {
        clone.havingConditions.push({ column, operator: '=', value })
      }
    }

    return clone
  }

  /**
   * Add DISTINCT
   * @returns {QueryBuilder}
   */
  distinct() {
    const clone = this._clone()
    clone.distinctValue = true
    return clone
  }

  /**
   * Add JOIN clause
   * @param {string} table - Table to join
   * @param {string} on - Join condition
   * @param {string} type - Join type (INNER, LEFT, RIGHT, FULL)
   * @returns {QueryBuilder}
   */
  join(table, on, type = 'INNER') {
    const clone = this._clone()
    clone.joinClauses.push({ table, on, type })
    return clone
  }

  /**
   * Add LEFT JOIN clause
   * @param {string} table
   * @param {string} on
   * @returns {QueryBuilder}
   */
  leftJoin(table, on) {
    return this.join(table, on, 'LEFT')
  }

  /**
   * Add RIGHT JOIN clause
   * @param {string} table
   * @param {string} on
   * @returns {QueryBuilder}
   */
  rightJoin(table, on) {
    return this.join(table, on, 'RIGHT')
  }

  /**
   * Add FULL OUTER JOIN clause
   * @param {string} table
   * @param {string} on
   * @returns {QueryBuilder}
   */
  fullJoin(table, on) {
    return this.join(table, on, 'FULL')
  }

  /**
   * Clear existing order and apply new ordering
   * @param {Object|string} order - New order specification
   * @returns {QueryBuilder}
   *
   * @example
   * // Override previous ordering
   * User.order({ name: 'asc' }).reorder({ created_at: 'desc' })
   */
  reorder(order) {
    const clone = this._clone()
    clone.orders = []

    if (typeof order === 'string') {
      clone.orders.push({ column: order, direction: 'ASC' })
    } else if (typeof order === 'object') {
      for (const [column, direction] of Object.entries(order)) {
        clone.orders.push({
          column,
          direction: (direction || 'ASC').toUpperCase()
        })
      }
    }

    return clone
  }

  /**
   * Apply a named scope to the query
   *
   * @param {string} name - Scope name defined in the model
   * @param {...any} args - Arguments to pass to the scope function
   * @returns {QueryBuilder}
   *
   * @example
   * // Define scopes on your model
   * class Post extends Model {
   *   static scopes = {
   *     published: (q) => q.where({ published: true }),
   *     recent: (q, days = 7) => q.where({ created_at: { '>': new Date(Date.now() - days * 86400000) } }),
   *     byAuthor: (q, authorId) => q.where({ author_id: authorId })
   *   }
   * }
   *
   * // Apply scopes in query chains
   * const recentPublishedPosts = await Post.where({ category: 'tech' })
   *   .scope('published')
   *   .scope('recent', 14)
   *   .order({ created_at: 'desc' })
   *   .all()
   *
   * // Chain multiple scopes
   * const posts = await Post.scope('published').scope('byAuthor', 1).all()
   */
  scope(name, ...args) {
    const scopes = this.model.scopes || {}
    const scopeFn = scopes[name]

    if (!scopeFn) {
      throw new Error(`Unknown scope: ${name}`)
    }

    // Apply the scope to a clone of this query builder
    return scopeFn(this._clone(), ...args)
  }

  /**
   * Remove all conditions, returning unscoped query
   * @returns {QueryBuilder}
   */
  unscoped() {
    const clone = new QueryBuilder(this.model)
    return clone
  }

  /**
   * Return a relation that returns no records
   * Useful for short-circuiting queries
   * @returns {QueryBuilder}
   */
  none() {
    const clone = this._clone()
    // Add an impossible condition using a valid column-based condition
    // We use 1=0 which always evaluates to false
    clone.conditions.push({ raw: '1 = 0', values: [] })
    return clone
  }

  /**
   * Merge another query's conditions into this one
   * @param {QueryBuilder} other - Another query builder
   * @returns {QueryBuilder}
   */
  merge(other) {
    const clone = this._clone()

    // Merge conditions
    clone.conditions.push(...other.conditions)

    // Merge includes
    clone.includesList.push(...other.includesList)

    // Merge orders (other's orders take precedence)
    if (other.orders.length > 0) {
      clone.orders = [...other.orders]
    }

    // Merge limit/offset (other's values take precedence)
    if (other.limitValue !== null) {
      clone.limitValue = other.limitValue
    }
    if (other.offsetValue !== null) {
      clone.offsetValue = other.offsetValue
    }

    // Merge joins
    clone.joinClauses.push(...other.joinClauses)

    // Merge group by
    clone.groupColumns.push(...other.groupColumns)

    // Merge having
    clone.havingConditions.push(...other.havingConditions)

    // Merge distinct
    if (other.distinctValue) {
      clone.distinctValue = true
    }

    // Merge lock
    if (other.lockMode) {
      clone.lockMode = other.lockMode
    }

    return clone
  }

  /**
   * Iterate over records in batches
   * Useful for processing large datasets without loading all into memory
   *
   * @param {Function} callback - Async function to process each record
   * @param {Object} options - Batch options
   * @param {number} options.batchSize - Number of records per batch (default: 1000)
   * @param {string} options.orderColumn - Column to order by (default: primary key)
   * @returns {Promise<void>}
   *
   * @example
   * await User.where({ active: true }).findEach(async (user) => {
   *   await user.sendNewsletter()
   * }, { batchSize: 100 })
   */
  async findEach(callback, options = {}) {
    const { batchSize = 1000, orderColumn } = options
    const pkColumn = orderColumn || this.model.primaryKey

    let lastId = 0
    let hasMore = true

    while (hasMore) {
      const batch = await this
        .where({ [pkColumn]: { '>': lastId } })
        .order({ [pkColumn]: 'asc' })
        .limit(batchSize)
        .all()

      if (batch.length === 0) {
        hasMore = false
        break
      }

      for (const record of batch) {
        await callback(record)
      }

      lastId = batch[batch.length - 1].attributes[pkColumn]
      hasMore = batch.length === batchSize
    }
  }

  /**
   * Iterate over records in batches, yielding each batch
   *
   * @param {Function} callback - Async function to process each batch
   * @param {Object} options - Batch options
   * @param {number} options.batchSize - Number of records per batch (default: 1000)
   * @param {string} options.orderColumn - Column to order by (default: primary key)
   * @returns {Promise<void>}
   *
   * @example
   * await User.where({ active: true }).findInBatches(async (batch) => {
   *   await processBatch(batch)
   * }, { batchSize: 500 })
   */
  async findInBatches(callback, options = {}) {
    const { batchSize = 1000, orderColumn } = options
    const pkColumn = orderColumn || this.model.primaryKey

    let lastId = 0
    let hasMore = true

    while (hasMore) {
      const batch = await this
        .where({ [pkColumn]: { '>': lastId } })
        .order({ [pkColumn]: 'asc' })
        .limit(batchSize)
        .all()

      if (batch.length === 0) {
        hasMore = false
        break
      }

      await callback(batch)

      lastId = batch[batch.length - 1].attributes[pkColumn]
      hasMore = batch.length === batchSize
    }
  }

  /**
   * Set lock mode for SELECT
   * @param {string} mode - 'UPDATE', 'SHARE', etc.
   * @returns {QueryBuilder}
   */
  lock(mode = 'UPDATE') {
    const clone = this._clone()
    clone.lockMode = mode
    return clone
  }

  /**
   * Execute and return all records
   * @returns {Promise<Model[]>}
   */
  async all() {
    const { sql, params } = this.toSQL()
    const connection = getConnection()

    if (!connection || !connection.connected) {
      throw new Error('Database connection not established')
    }

    // Track query for N+1 detection (development mode only)
    trackQuery(sql, params, { model: this.model.name })

    const rows = await connection.query(sql, params)
    const records = rows.map(row => this._hydrateRecord(row))

    // Eager load associations
    if (this.includesList.length > 0 && records.length > 0) {
      await this._eagerLoad(records)
    }

    return records
  }

  /**
   * Execute and return first record
   * @returns {Promise<Model|null>}
   */
  async first() {
    const clone = this.limit(1)
    if (clone.orders.length === 0) {
      // Qualified, so a joined table's own `id` does not make it ambiguous
      clone.orders.push({ column: `${this._getTableName()}.${this.model.primaryKey}`, direction: 'ASC' })
    }

    const results = await clone.all()
    return results[0] || null
  }

  /**
   * Execute and return first record, throw if not found
   * @returns {Promise<Model>}
   * @throws {RecordNotFoundError}
   */
  async first_() {
    const record = await this.first()
    if (!record) {
      throw new RecordNotFoundError(this.model.name)
    }
    return record
  }

  /**
   * Execute and return last record
   * @returns {Promise<Model|null>}
   */
  async last() {
    const clone = this._clone()
    clone.limitValue = 1

    // Reverse ordering or add default desc order
    if (clone.orders.length === 0) {
      // Qualified, so a joined table's own `id` does not make it ambiguous
      clone.orders.push({ column: `${this._getTableName()}.${this.model.primaryKey}`, direction: 'DESC' })
    } else {
      clone.orders = clone.orders.map(o => ({
        ...o,
        direction: o.direction === 'ASC' ? 'DESC' : 'ASC'
      }))
    }

    const results = await clone.all()
    return results[0] || null
  }

  /**
   * Count matching records
   * @returns {Promise<number>}
   */
  async count() {
    const clone = this._clone()
    clone.selectColumns = [{ expression: 'COUNT(*)', alias: 'count' }]
    clone.orders = []
    clone.limitValue = null
    clone.offsetValue = null

    const { sql, params } = clone.toSQL()
    const connection = getConnection()

    // Track query for N+1 detection (development mode only)
    trackQuery(sql, params, { model: this.model.name })

    const rows = await connection.query(sql, params)

    return parseInt(rows[0]?.count || 0, 10)
  }

  /**
   * Check if any records exist
   * @returns {Promise<boolean>}
   */
  async exists() {
    const count = await this.limit(1).count()
    return count > 0
  }

  /**
   * Get sum of a column
   * @param {string} column
   * @returns {Promise<number>}
   */
  async sum(column) {
    const clone = this._clone()
    clone.selectColumns = [{ expression: `SUM(${this._adapter.quoteIdentifier(column)})`, alias: 'sum' }]
    clone.orders = []
    clone.limitValue = null
    clone.offsetValue = null

    const { sql, params } = clone.toSQL()
    const connection = getConnection()
    const rows = await connection.query(sql, params)

    return parseFloat(rows[0]?.sum || 0)
  }

  /**
   * Get average of a column
   * @param {string} column
   * @returns {Promise<number>}
   */
  async average(column) {
    const clone = this._clone()
    clone.selectColumns = [{ expression: `AVG(${this._adapter.quoteIdentifier(column)})`, alias: 'avg' }]
    clone.orders = []
    clone.limitValue = null
    clone.offsetValue = null

    const { sql, params } = clone.toSQL()
    const connection = getConnection()
    const rows = await connection.query(sql, params)

    return parseFloat(rows[0]?.avg || 0)
  }

  /**
   * Get minimum value of a column
   * @param {string} column
   * @returns {Promise<any>}
   */
  async minimum(column) {
    const clone = this._clone()
    clone.selectColumns = [{ expression: `MIN(${this._adapter.quoteIdentifier(column)})`, alias: 'min' }]
    clone.orders = []
    clone.limitValue = null
    clone.offsetValue = null

    const { sql, params } = clone.toSQL()
    const connection = getConnection()
    const rows = await connection.query(sql, params)

    return rows[0]?.min
  }

  /**
   * Get maximum value of a column
   * @param {string} column
   * @returns {Promise<any>}
   */
  async maximum(column) {
    const clone = this._clone()
    clone.selectColumns = [{ expression: `MAX(${this._adapter.quoteIdentifier(column)})`, alias: 'max' }]
    clone.orders = []
    clone.limitValue = null
    clone.offsetValue = null

    const { sql, params } = clone.toSQL()
    const connection = getConnection()
    const rows = await connection.query(sql, params)

    return rows[0]?.max
  }

  /**
   * Get distinct values for a column
   * @param {string} column
   * @returns {Promise<any[]>}
   */
  async pluck(column) {
    const clone = this._clone()
    clone.selectColumns = [column]

    const results = await clone.all()
    return results.map(r => r.attributes[column])
  }

  /**
   * Get IDs of matching records
   * @returns {Promise<number[]>}
   */
  async ids() {
    return this.pluck(this.model.primaryKey)
  }

  /**
   * Pagination helper - set current page number
   *
   * Use with per() to configure pagination, then call paginate() to get
   * results with metadata.
   *
   * @param {number} pageNum - 1-based page number
   * @returns {QueryBuilder}
   *
   * @example
   * // Basic pagination
   * const result = await User.page(2).per(10).paginate()
   *
   * // Access records and metadata
   * result.records        // Array of User instances
   * result.currentPage    // 2
   * result.totalPages     // e.g., 10
   * result.hasNextPage    // true/false
   *
   * // Also works with all() for simple limit/offset
   * const users = await User.page(2).per(10).all()
   */
  page(pageNum) {
    const clone = this._clone()
    const perPageValue = clone._perPage || 25
    clone._currentPage = pageNum
    clone.offsetValue = (pageNum - 1) * perPageValue
    clone.limitValue = perPageValue
    return clone
  }

  /**
   * Set records per page for pagination
   *
   * Should be called before page() for proper offset calculation,
   * or after page() to adjust limit.
   *
   * @param {number} perPage - Number of records per page
   * @returns {QueryBuilder}
   *
   * @example
   * // Set per page before page
   * const result = await User.per(10).page(2).paginate()
   *
   * // Or after page (will adjust limit but offset based on previous perPage)
   * const result = await User.page(2).per(10).paginate()
   */
  per(perPage) {
    const clone = this._clone()
    clone._perPage = perPage
    clone.limitValue = perPage

    // Recalculate offset if page was already set
    if (clone._currentPage !== undefined) {
      clone.offsetValue = (clone._currentPage - 1) * perPage
    }

    return clone
  }

  /**
   * Execute paginated query and return results with metadata
   *
   * Returns a PaginatedResult object containing the records and pagination
   * metadata like totalCount, totalPages, hasNextPage, etc.
   *
   * @returns {Promise<PaginatedResult>}
   *
   * @example
   * // Get paginated results
   * const result = await Post.where({ published: true }).page(1).per(20).paginate()
   *
   * // Access data
   * console.log(result.records)        // Array of Post instances
   * console.log(result.currentPage)    // 1
   * console.log(result.perPage)        // 20
   * console.log(result.totalCount)     // 157
   * console.log(result.totalPages)     // 8
   * console.log(result.hasNextPage)    // true
   * console.log(result.hasPreviousPage) // false
   *
   * // Iterate over records
   * for (const post of result) {
   *   console.log(post.title)
   * }
   *
   * // Convert to JSON for API response
   * res.json(result.toJSON())
   */
  async paginate() {
    // Get current page and per page settings
    const currentPage = this._currentPage || 1
    const perPage = this._perPage || 25

    // Ensure pagination values are set
    const clone = this._clone()
    clone._currentPage = currentPage
    clone._perPage = perPage
    clone.limitValue = perPage
    clone.offsetValue = (currentPage - 1) * perPage

    // Execute count query (without limit/offset)
    const countClone = this._clone()
    countClone.limitValue = null
    countClone.offsetValue = null
    const totalCount = await countClone.count()

    // Execute records query
    const records = await clone.all()

    return new PaginatedResult({
      records,
      currentPage,
      perPage,
      totalCount
    })
  }

  /**
   * Delete all matching records
   * @returns {Promise<number>} Number of deleted records
   */
  async deleteAll() {
    const connection = getConnection()
    const tableName = this._getTableName()

    const whereClause = this._buildWhereClause()

    let sql = `DELETE FROM ${this._adapter.quoteTableName(tableName)}`
    if (whereClause.sql) {
      sql += ` WHERE ${whereClause.sql}`
    }

    const result = await connection.query(sql, whereClause.params)
    return affectedRows(result, sql)
  }

  /**
   * Update all matching records
   * @param {Object} attributes
   * @returns {Promise<number>} Number of updated records
   */
  async updateAll(attributes) {
    const connection = getConnection()
    const tableName = this._getTableName()

    const setClauses = []
    const params = []
    let paramIndex = 1

    for (const [column, value] of Object.entries(attributes)) {
      setClauses.push(`${this._adapter.quoteIdentifier(column)} = $${paramIndex++}`)
      params.push(value)
    }

    const whereClause = this._buildWhereClause(paramIndex)
    params.push(...whereClause.params)

    let sql = `UPDATE ${this._adapter.quoteTableName(tableName)} SET ${setClauses.join(', ')}`
    if (whereClause.sql) {
      sql += ` WHERE ${whereClause.sql}`
    }

    const result = await connection.query(sql, params)
    return affectedRows(result, sql)
  }

  /**
   * Build the SQL query
   * @returns {Object} { sql, params }
   */
  toSQL() {
    const tableName = this._getTableName()

    return this._adapter.selectSQL({
      table: tableName,
      columns: this.selectColumns,
      where: this.conditions,
      order: this.orders,
      limit: this.limitValue,
      offset: this.offsetValue,
      joins: this.joinClauses,
      groupBy: this.groupColumns,
      having: this.havingConditions,
      distinct: this.distinctValue,
      lock: this.lockMode
    })
  }

  /**
   * Get raw SQL string for debugging
   * @returns {string}
   */
  toSQLString() {
    const { sql, params } = this.toSQL()
    let result = sql
    params.forEach((param, i) => {
      const value = typeof param === 'string' ? `'${param}'` : param
      result = result.replace(`$${i + 1}`, value)
    })
    return result
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * The model's table: its `tableName`, else tableize(name), the same rule
   * Model.getTableName() and Model#save() use (test/database/table_names.test.js).
   * @private
   */
  _getTableName() {
    return this.model.tableName || tableize(this.model.name)
  }

  /**
   * Build WHERE clause
   * @private
   */
  _buildWhereClause(startIndex = 1) {
    if (this.conditions.length === 0) {
      return { sql: '', params: [] }
    }
    // One WHERE builder: the adapter's, which toSQL() uses too.
    const { sql, params } = this._adapter.whereClauseSQL(this.conditions, startIndex)
    return { sql, params }
  }

  /**
   * Hydrate a database row into a model instance
   * @private
   */
  _hydrateRecord(row) {
    const record = new this.model(row)
    record.persisted = true
    record._originalAttributes = { ...row }
    return record
  }

  /**
   * Eager load associations for a set of records
   * @private
   */
  async _eagerLoad(records) {
    const associations = this.model.associations || {}

    for (const include of this.includesList) {
      // Handle nested associations (e.g., 'comments.author')
      const parts = include.split('.')
      const assocName = parts[0]

      // Find association config. A name nothing declares throws: skipping it
      // left the property undefined, so a misspelled includes() went unnoticed.
      const assocType = ASSOCIATION_TYPES.find(type => this._findAssocConfig(associations[type], assocName))
      if (!assocType) {
        throw new Error(
          `Unknown association '${assocName}' in includes() on ${this.model.name}; ` +
            `declared: ${ASSOCIATION_TYPES.flatMap(type => (associations[type] || []).map(a => a.name ?? a)).join(', ') || 'none'}`
        )
      }
      const assocConfig = this._findAssocConfig(associations[assocType], assocName)

      await this._loadAssociation(records, assocName, assocType, assocConfig, parts.slice(1))
    }
  }

  /**
   * Find association config from array
   * @private
   */
  _findAssocConfig(assocs, name) {
    if (!assocs) return null

    for (const assoc of assocs) {
      if (assoc === name) return { name }
      if (assoc.name === name) return assoc
    }
    return null
  }

  /**
   * Load a single association for all records
   * @private
   */
  async _loadAssociation(records, name, type, config, nestedParts) {
    const foreignKey = config.foreignKey || this._inferForeignKey(name, type)
    const AssociatedModel = resolveAssociationModel(config, name)

    if (!AssociatedModel) {
      console.warn(`Could not resolve model for association '${name}'`)
      return
    }

    if (type === 'belongsTo') {
      // Collect all foreign key values
      const fkValues = [...new Set(records.map(r => r.attributes[foreignKey]).filter(Boolean))]

      if (fkValues.length === 0) {
        records.forEach(r => r[name] = null)
        return
      }

      // Load all associated records in one query
      const associatedRecords = await AssociatedModel.where({
        [AssociatedModel.primaryKey]: fkValues
      }).all()

      // Create lookup map
      const lookup = new Map(associatedRecords.map(r => [r.attributes[AssociatedModel.primaryKey], r]))

      // Assign to parent records
      records.forEach(r => {
        r[name] = lookup.get(r.attributes[foreignKey]) || null
      })

      // Handle nested associations
      if (nestedParts.length > 0 && associatedRecords.length > 0) {
        const nestedQuery = new QueryBuilder(AssociatedModel)
        nestedQuery.includesList = [nestedParts.join('.')]
        await nestedQuery._eagerLoad(associatedRecords)
      }
    } else if (type === 'hasMany') {
      // Collect all primary key values
      const pkValues = records.map(r => r.attributes[this.model.primaryKey])

      // Load all associated records in one query
      const associatedRecords = await AssociatedModel.where({
        [foreignKey]: pkValues
      }).all()

      // Group by foreign key
      const groups = new Map()
      associatedRecords.forEach(r => {
        const fk = r.attributes[foreignKey]
        if (!groups.has(fk)) groups.set(fk, [])
        groups.get(fk).push(r)
      })

      // Assign to parent records
      records.forEach(r => {
        r[name] = groups.get(r.attributes[this.model.primaryKey]) || []
      })

      // Handle nested associations
      if (nestedParts.length > 0 && associatedRecords.length > 0) {
        const nestedQuery = new QueryBuilder(AssociatedModel)
        nestedQuery.includesList = [nestedParts.join('.')]
        await nestedQuery._eagerLoad(associatedRecords)
      }
    } else if (type === 'hasAndBelongsToMany') {
      const groups = await loadThroughJoinTable(
        this.model,
        { ...config, name },
        records.map(r => r.attributes[this.model.primaryKey])
      )
      records.forEach(r => {
        r[name] = groups.get(String(r.attributes[this.model.primaryKey])) || []
      })

      const associatedRecords = [...new Set([...groups.values()].flat())]
      if (nestedParts.length > 0 && associatedRecords.length > 0) {
        const nestedQuery = new QueryBuilder(AssociatedModel)
        nestedQuery.includesList = [nestedParts.join('.')]
        await nestedQuery._eagerLoad(associatedRecords)
      }
    } else if (type === 'hasOne') {
      // Same as hasMany but only take first
      const pkValues = records.map(r => r.attributes[this.model.primaryKey])

      const associatedRecords = await AssociatedModel.where({
        [foreignKey]: pkValues
      }).all()

      // Create lookup (first match wins)
      const lookup = new Map()
      associatedRecords.forEach(r => {
        const fk = r.attributes[foreignKey]
        if (!lookup.has(fk)) lookup.set(fk, r)
      })

      records.forEach(r => {
        r[name] = lookup.get(r.attributes[this.model.primaryKey]) || null
      })
    }
  }

  /**
   * Infer foreign key name
   * @private
   */
  _inferForeignKey(assocName, type) {
    if (type === 'belongsTo') {
      return `${assocName}_id`
    }
    // For hasMany/hasOne, use the model's name
    const modelName = this.model.name
    return modelName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + '_id'
  }

}

/**
 * Normalize SQL operator
 * @private
 */
function normalizeOperator(op) {
  const operators = {
    '=': '=',
    '==': '=',
    '!=': '!=',
    '<>': '!=',
    '>': '>',
    '>=': '>=',
    '<': '<',
    '<=': '<=',
    'like': 'LIKE',
    'ilike': 'ILIKE',
    'in': 'IN',
    'not_in': 'NOT IN',
    'between': 'BETWEEN',
    'is': 'IS',
    'is_not': 'IS NOT'
  }
  return operators[op.toLowerCase()] || op.toUpperCase()
}

export default QueryBuilder
