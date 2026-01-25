/**
 * Base Model class - Active Record style ORM
 *
 * Provides Rails-like Active Record pattern for database interactions
 * with support for associations, validations, and query building.
 *
 * @module @bun-on-rails/database/model
 */

import { QueryBuilder, RecordNotFoundError } from './query_builder.js'
import { getConnection } from './connection.js'
import { PostgresAdapter } from './adapters/postgres.js'
import { tableize } from '../support/inflector.js'
import { runValidations } from './validations.js'

// Re-export for convenience
export { RecordNotFoundError }

/**
 * Base Model class for Active Record pattern
 *
 * @example
 * class User extends Model {
 *   static tableName = 'users'
 *   static associations = {
 *     hasMany: ['posts'],
 *     hasOne: ['profile']
 *   }
 *   static validations = {
 *     email: { presence: true, format: /^[^@]+@[^@]+$/ }
 *   }
 * }
 *
 * // Finding records
 * const user = await User.find(1)
 * const users = await User.findAll({ where: { active: true } })
 *
 * // Query building
 * const posts = await Post.where({ published: true }).order({ created_at: 'desc' }).limit(10).all()
 */
export class Model {
  /**
   * Table name for this model (defaults to pluralized, snake_case class name)
   * @type {string|null}
   */
  static tableName = null

  /**
   * Primary key column name
   * @type {string}
   */
  static primaryKey = 'id'

  /**
   * Association definitions
   * @type {Object}
   * @property {Array<string|Object>} belongsTo - belongsTo associations
   * @property {Array<string|Object>} hasMany - hasMany associations
   * @property {Array<string|Object>} hasOne - hasOne associations
   * @property {Array<string|Object>} hasAndBelongsToMany - many-to-many associations
   */
  static associations = {}

  /**
   * Validation rules
   * @type {Object}
   */
  static validations = {}

  /**
   * Named scopes
   * @type {Object}
   */
  static scopes = {}

  /**
   * Track whether scopes have been initialized as methods
   * @private
   * @type {boolean}
   */
  static _scopesInitialized = false

  /**
   * Create a new model instance
   * @param {Object} attributes - Initial attributes
   */
  constructor(attributes = {}) {
    this.attributes = { ...attributes }
    this.errors = {}
    this.persisted = false
    this._originalAttributes = {}
    this._changedAttributes = new Set()
  }

  /**
   * Get an attribute value
   * @param {string} name - Attribute name
   * @returns {any}
   */
  get(name) {
    return this.attributes[name]
  }

  /**
   * Set an attribute value
   * @param {string} name - Attribute name
   * @param {any} value - Value to set
   */
  set(name, value) {
    if (this.attributes[name] !== value) {
      this._changedAttributes.add(name)
      this.attributes[name] = value
    }
  }

  /**
   * Get the primary key value
   * @returns {any}
   */
  get id() {
    return this.attributes[this.constructor.primaryKey]
  }

  /**
   * Check if record is new (not persisted)
   * @returns {boolean}
   */
  get isNew() {
    return !this.persisted
  }

  /**
   * Check if record has unsaved changes
   * @returns {boolean}
   */
  get isDirty() {
    return this._changedAttributes.size > 0
  }

  /**
   * Get list of changed attribute names
   * @returns {string[]}
   */
  get changedAttributes() {
    return Array.from(this._changedAttributes)
  }

  // ============================================
  // Finders - Static Methods
  // ============================================

  /**
   * Find a record by primary key
   *
   * @param {number|string} id - Primary key value
   * @returns {Promise<Model>}
   * @throws {RecordNotFoundError} If record not found
   *
   * @example
   * const user = await User.find(1)
   * const post = await Post.find(42)
   */
  static async find(id) {
    const record = await this.findBy({ [this.primaryKey]: id })

    if (!record) {
      throw new RecordNotFoundError(this.name, id)
    }

    return record
  }

  /**
   * Find a record by primary key, return null if not found
   *
   * @param {number|string} id - Primary key value
   * @returns {Promise<Model|null>}
   *
   * @example
   * const user = await User.findById(1)
   * if (user) { ... }
   */
  static async findById(id) {
    return this.findBy({ [this.primaryKey]: id })
  }

  /**
   * Find a record by attributes
   *
   * @param {Object} conditions - Attributes to match
   * @returns {Promise<Model|null>}
   *
   * @example
   * const user = await User.findBy({ email: 'john@example.com' })
   * const post = await Post.findBy({ slug: 'hello-world', published: true })
   */
  static async findBy(conditions) {
    return this.where(conditions).first()
  }

  /**
   * Find a record by attributes, throw if not found
   *
   * @param {Object} conditions - Attributes to match
   * @returns {Promise<Model>}
   * @throws {RecordNotFoundError} If record not found
   */
  static async findBy_(conditions) {
    const record = await this.findBy(conditions)
    if (!record) {
      throw new RecordNotFoundError(this.name)
    }
    return record
  }

  /**
   * Find all records matching conditions
   *
   * @param {Object} options - Query options
   * @param {Object} options.where - WHERE conditions
   * @param {Object|string} options.order - ORDER BY clause
   * @param {number} options.limit - LIMIT clause
   * @param {number} options.offset - OFFSET clause
   * @param {string|string[]} options.include - Associations to eager load
   * @returns {Promise<Model[]>}
   *
   * @example
   * // All records
   * const users = await User.findAll()
   *
   * // With conditions
   * const activeUsers = await User.findAll({ where: { active: true } })
   *
   * // With ordering and limit
   * const recentPosts = await Post.findAll({
   *   where: { published: true },
   *   order: { created_at: 'desc' },
   *   limit: 10
   * })
   *
   * // With eager loading
   * const posts = await Post.findAll({
   *   include: ['author', 'comments']
   * })
   */
  static async findAll(options = {}) {
    let query = this.query()

    // Apply where conditions
    if (options.where) {
      query = query.where(options.where)
    }

    // Apply ordering
    if (options.order) {
      query = query.order(options.order)
    }

    // Apply limit
    if (options.limit !== undefined) {
      query = query.limit(options.limit)
    }

    // Apply offset
    if (options.offset !== undefined) {
      query = query.offset(options.offset)
    }

    // Apply eager loading
    if (options.include) {
      const includes = Array.isArray(options.include)
        ? options.include
        : [options.include]
      query = query.includes(...includes)
    }

    return query.all()
  }

  /**
   * Find or create a record by attributes
   *
   * @param {Object} attributes - Attributes to find/create with
   * @returns {Promise<Model>}
   */
  static async findOrCreateBy(attributes) {
    const existing = await this.findBy(attributes)
    if (existing) return existing

    return this.create(attributes)
  }

  /**
   * Find or initialize a record by attributes (doesn't save)
   *
   * @param {Object} attributes - Attributes to find/initialize with
   * @returns {Promise<Model>}
   */
  static async findOrInitializeBy(attributes) {
    const existing = await this.findBy(attributes)
    if (existing) return existing

    return new this(attributes)
  }

  // ============================================
  // Query Building - Static Methods
  // ============================================

  /**
   * Start a new query builder
   * Also ensures scope methods are initialized
   * @returns {QueryBuilder}
   */
  static query() {
    // Ensure scope methods are available
    this._initializeScopes()
    return new QueryBuilder(this)
  }

  /**
   * Build a query with conditions
   *
   * @param {Object|string} conditions - WHERE conditions
   * @returns {QueryBuilder}
   *
   * @example
   * const users = await User.where({ active: true }).all()
   * const posts = await Post.where({ author_id: 1 }).order({ created_at: 'desc' }).all()
   */
  static where(conditions) {
    return this.query().where(conditions)
  }

  /**
   * Eager load associations
   *
   * @param {...string} associations - Association names to load
   * @returns {QueryBuilder}
   *
   * @example
   * const posts = await Post.includes('author', 'comments').all()
   */
  static includes(...associations) {
    return this.query().includes(...associations)
  }

  /**
   * Order query results
   *
   * @param {Object|string} order - Order specification
   * @returns {QueryBuilder}
   */
  static order(order) {
    return this.query().order(order)
  }

  /**
   * Limit query results
   *
   * @param {number} limit - Maximum records to return
   * @returns {QueryBuilder}
   */
  static limit(limit) {
    return this.query().limit(limit)
  }

  /**
   * Offset query results
   *
   * @param {number} offset - Number of records to skip
   * @returns {QueryBuilder}
   */
  static offset(offset) {
    return this.query().offset(offset)
  }

  /**
   * Select specific columns
   *
   * @param {...string} columns - Column names to select
   * @returns {QueryBuilder}
   */
  static select(...columns) {
    return this.query().select(...columns)
  }

  /**
   * Get first record
   * @returns {Promise<Model|null>}
   */
  static async first() {
    return this.query().first()
  }

  /**
   * Get last record
   * @returns {Promise<Model|null>}
   */
  static async last() {
    return this.query().last()
  }

  /**
   * Get all records
   * @returns {Promise<Model[]>}
   */
  static async all() {
    return this.query().all()
  }

  /**
   * Count all records
   * @returns {Promise<number>}
   */
  static async count() {
    return this.query().count()
  }

  /**
   * Check if any records exist
   * @param {Object} conditions - Optional conditions
   * @returns {Promise<boolean>}
   */
  static async exists(conditions = null) {
    const query = conditions ? this.where(conditions) : this.query()
    return query.exists()
  }

  /**
   * Get distinct values for a column
   * @param {string} column - Column name
   * @returns {Promise<any[]>}
   */
  static async pluck(column) {
    return this.query().pluck(column)
  }

  /**
   * Get IDs of all records
   * @returns {Promise<number[]>}
   */
  static async ids() {
    return this.query().ids()
  }

  // ============================================
  // Scopes
  // ============================================

  /**
   * Initialize scope methods on the model class
   *
   * This method creates static methods for each scope defined in `static scopes`.
   * It's called automatically when accessing scopes for the first time.
   *
   * @private
   * @returns {void}
   *
   * @example
   * class Post extends Model {
   *   static scopes = {
   *     published: (q) => q.where({ published: true }),
   *     byAuthor: (q, authorId) => q.where({ author_id: authorId })
   *   }
   * }
   *
   * // After initialization, these work directly:
   * Post.published().all()
   * Post.byAuthor(userId).all()
   */
  static _initializeScopes() {
    // Only initialize once per class
    if (this.hasOwnProperty('_scopesInitialized') && this._scopesInitialized) {
      return
    }

    // Mark as initialized for this specific class
    Object.defineProperty(this, '_scopesInitialized', {
      value: true,
      writable: false,
      configurable: false
    })

    // Create a method for each scope
    const scopeNames = Object.keys(this.scopes)
    for (const scopeName of scopeNames) {
      // Skip if method already exists (don't override existing methods)
      if (typeof this[scopeName] === 'function') {
        continue
      }

      // Define the scope method on the class
      Object.defineProperty(this, scopeName, {
        value: function(...args) {
          return this.scope(scopeName, ...args)
        },
        writable: false,
        configurable: true,
        enumerable: false
      })
    }
  }

  /**
   * Apply a named scope
   *
   * @param {string} name - Scope name
   * @param {...any} args - Scope arguments
   * @returns {QueryBuilder}
   *
   * @example
   * class Post extends Model {
   *   static scopes = {
   *     published: (q) => q.where({ published: true }),
   *     byAuthor: (q, authorId) => q.where({ author_id: authorId })
   *   }
   * }
   *
   * const posts = await Post.scope('published').all()
   * const userPosts = await Post.scope('byAuthor', userId).all()
   */
  static scope(name, ...args) {
    const scopeFn = this.scopes[name]
    if (!scopeFn) {
      throw new Error(`Unknown scope: ${name}`)
    }
    return scopeFn(this.query(), ...args)
  }

  // ============================================
  // Persistence - Static Methods
  // ============================================

  /**
   * Create a new record and save to database
   *
   * @param {Object} attributes - Record attributes
   * @returns {Promise<Model>}
   *
   * @example
   * const user = await User.create({ name: 'John', email: 'john@example.com' })
   */
  static async create(attributes) {
    const record = new this(attributes)
    await record.save()
    return record
  }

  /**
   * Update records matching conditions
   *
   * @param {Object} conditions - WHERE conditions
   * @param {Object} attributes - Attributes to update
   * @returns {Promise<number>} Number of updated records
   */
  static async updateWhere(conditions, attributes) {
    return this.where(conditions).updateAll(attributes)
  }

  /**
   * Delete records matching conditions
   *
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<number>} Number of deleted records
   */
  static async deleteWhere(conditions) {
    return this.where(conditions).deleteAll()
  }

  /**
   * Delete all records
   * @returns {Promise<number>}
   */
  static async deleteAll() {
    return this.query().deleteAll()
  }

  // ============================================
  // Persistence - Instance Methods
  // ============================================

  /**
   * Save the current record (insert or update)
   *
   * @returns {Promise<boolean>} True if saved successfully
   *
   * @example
   * const user = new User({ name: 'John' })
   * await user.save()
   *
   * user.name = 'Jane'
   * await user.save()
   */
  async save() {
    // Run validations (async for uniqueness validation etc.)
    if (!(await this.validate())) {
      return false
    }

    const connection = getConnection()
    const adapter = new PostgresAdapter()
    const tableName = this.constructor.tableName || tableize(this.constructor.name)

    try {
      // Run callbacks
      await this.beforeSave()

      if (this.persisted) {
        // Update existing record
        await this.beforeUpdate()

        const data = { ...this.attributes }
        delete data[this.constructor.primaryKey]

        // Add updated_at if not present
        if (data.updated_at === undefined) {
          data.updated_at = new Date()
        }

        const { sql, params } = adapter.updateSQL(
          tableName,
          data,
          [{ column: this.constructor.primaryKey, operator: '=', value: this.id }],
          { returning: true }
        )

        const result = await connection.query(sql, params)
        if (result[0]) {
          this.attributes = { ...result[0] }
        }

        await this.afterUpdate()
      } else {
        // Insert new record
        await this.beforeCreate()

        const data = { ...this.attributes }

        // Add timestamps if not present
        const now = new Date()
        if (data.created_at === undefined) {
          data.created_at = now
        }
        if (data.updated_at === undefined) {
          data.updated_at = now
        }

        // Remove undefined id
        if (data[this.constructor.primaryKey] === undefined) {
          delete data[this.constructor.primaryKey]
        }

        const { sql, params } = adapter.insertSQL(tableName, data, { returning: true })

        const result = await connection.query(sql, params)
        if (result[0]) {
          this.attributes = { ...result[0] }
        }

        this.persisted = true
        await this.afterCreate()
      }

      this._originalAttributes = { ...this.attributes }
      this._changedAttributes.clear()

      await this.afterSave()
      return true
    } catch (error) {
      this.errors.base = error.message
      return false
    }
  }

  /**
   * Save the record, throw error on failure
   * @returns {Promise<boolean>}
   * @throws {Error} On validation or database error
   */
  async save_() {
    const success = await this.save()
    if (!success) {
      const errorMsg = Object.entries(this.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      throw new Error(`Validation failed: ${errorMsg}`)
    }
    return success
  }

  /**
   * Update attributes and save
   *
   * @param {Object} attributes - Attributes to update
   * @returns {Promise<boolean>}
   *
   * @example
   * await user.update({ name: 'Jane', active: false })
   */
  async update(attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      this.set(key, value)
    }
    return this.save()
  }

  /**
   * Update attributes and save, throw on failure
   * @param {Object} attributes
   * @returns {Promise<boolean>}
   */
  async update_(attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      this.set(key, value)
    }
    return this.save_()
  }

  /**
   * Delete the record from database
   *
   * @returns {Promise<boolean>}
   *
   * @example
   * await user.destroy()
   */
  async destroy() {
    if (!this.persisted) {
      return false
    }

    const connection = getConnection()
    const adapter = new PostgresAdapter()
    const tableName = this.constructor.tableName || tableize(this.constructor.name)

    try {
      await this.beforeDestroy()

      const { sql, params } = adapter.deleteSQL(
        tableName,
        [{ column: this.constructor.primaryKey, operator: '=', value: this.id }]
      )

      await connection.query(sql, params)

      this.persisted = false
      await this.afterDestroy()

      return true
    } catch (error) {
      this.errors.base = error.message
      return false
    }
  }

  /**
   * Reload attributes from database
   * @returns {Promise<Model>}
   */
  async reload() {
    if (!this.persisted) {
      throw new Error('Cannot reload unpersisted record')
    }

    const fresh = await this.constructor.find(this.id)
    this.attributes = { ...fresh.attributes }
    this._originalAttributes = { ...fresh.attributes }
    this._changedAttributes.clear()

    return this
  }

  // ============================================
  // Validations
  // ============================================

  /**
   * Run all validations on the model and populate the errors object
   *
   * Uses the comprehensive validators from the validations module including:
   * - presence, length, format, numericality
   * - email, url, date, array
   * - inclusion, exclusion
   * - uniqueness (async, requires database)
   * - custom, confirmation, acceptance
   *
   * Callbacks:
   * - beforeValidation: Called before validations run. Can modify attributes or add errors.
   * - afterValidation: Called after validations run. Can modify errors or perform cleanup.
   *
   * @returns {Promise<boolean>} True if valid, false otherwise
   *
   * @example
   * const user = new User({ email: 'invalid' })
   * const isValid = await user.validate()
   * if (!isValid) {
   *   console.log(user.errors)
   *   // { email: ['is not a valid email'] }
   * }
   */
  async validate() {
    // Clear previous errors
    this.errors = {}

    // Run beforeValidation callback
    await this.beforeValidation()

    // Run all validations using the comprehensive validation system
    const validationErrors = await runValidations(this)

    // Convert array errors to the format expected by the model
    // The validations module returns { field: ['error1', 'error2'] }
    // We'll store first error as string for backwards compatibility
    // but keep full array in _fullErrors
    this._fullErrors = validationErrors

    // Populate errors object - first error as string for backwards compatibility
    for (const [field, errors] of Object.entries(validationErrors)) {
      if (errors && errors.length > 0) {
        // Store first error as string for backwards compat with existing tests
        this.errors[field] = this._formatErrorForField(field, errors[0])
      }
    }

    // Run afterValidation callback
    await this.afterValidation()

    return Object.keys(this.errors).length === 0
  }

  /**
   * Format error message for a field
   * Prepends field name if error doesn't include it for context
   *
   * @private
   * @param {string} field - Field name
   * @param {string} error - Error message
   * @returns {string} Formatted error message
   */
  _formatErrorForField(field, error) {
    // Handle presence error
    if (error === 'is required') {
      return `${field} can't be blank`
    }

    // Handle length errors
    const minMatch = error.match(/must be at least (\d+) characters/)
    if (minMatch) {
      return `${field} is too short (minimum is ${minMatch[1]})`
    }

    const maxMatch = error.match(/must be at most (\d+) characters/)
    if (maxMatch) {
      return `${field} is too long (maximum is ${maxMatch[1]})`
    }

    const exactMatch = error.match(/must be exactly (\d+) characters/)
    if (exactMatch) {
      return `${field} must be exactly ${exactMatch[1]} characters`
    }

    // Handle format/email errors
    if (error === 'is invalid' || error === 'is not a valid email') {
      return `${field} is invalid`
    }

    // Handle numericality errors
    if (error === 'must be a number') {
      return `${field} is not a number`
    }

    // Handle greater than (must check before "greater than or equal to")
    const gteMatch = error.match(/must be greater than or equal to (-?\d+)/)
    if (gteMatch) {
      return `${field} must be greater than or equal to ${gteMatch[1]}`
    }

    const gtMatch = error.match(/must be greater than (-?\d+)/)
    if (gtMatch) {
      return `${field} must be greater than ${gtMatch[1]}`
    }

    // Handle less than (must check before "less than or equal to")
    const lteMatch = error.match(/must be less than or equal to (-?\d+)/)
    if (lteMatch) {
      return `${field} must be less than or equal to ${lteMatch[1]}`
    }

    const ltMatch = error.match(/must be less than (-?\d+)/)
    if (ltMatch) {
      return `${field} must be less than ${ltMatch[1]}`
    }

    // Handle inclusion/exclusion errors
    if (error.startsWith('must be one of:')) {
      return `${field} is not included in the list`
    }

    if (error.startsWith('cannot be one of:')) {
      return `${field} is reserved`
    }

    // For custom validators or unmatched errors, return as-is
    return error
  }

  /**
   * Get all errors for a specific field
   *
   * @param {string} field - Field name
   * @returns {string[]} Array of error messages for the field
   *
   * @example
   * const errors = user.errorsFor('email')
   * // ['is not a valid email', 'has already been taken']
   */
  errorsFor(field) {
    return this._fullErrors?.[field] || []
  }

  /**
   * Get all errors as a flat array of messages
   *
   * @returns {string[]} Array of all error messages
   *
   * @example
   * const allErrors = user.fullMessages()
   * // ['name can\'t be blank', 'email is not a valid email']
   */
  fullMessages() {
    const messages = []
    for (const [field, errors] of Object.entries(this._fullErrors || {})) {
      for (const error of errors) {
        messages.push(`${field} ${error}`)
      }
    }
    return messages
  }

  /**
   * Check if a specific field has errors
   *
   * @param {string} field - Field name
   * @returns {boolean} True if field has errors
   */
  hasError(field) {
    return Boolean(this.errors[field])
  }

  /**
   * Check if model is valid (async)
   * @returns {Promise<boolean>}
   *
   * @example
   * if (await user.isValid()) {
   *   console.log('User is valid!')
   * }
   */
  async isValid() {
    return this.validate()
  }

  /**
   * Check if model is invalid (async)
   * @returns {Promise<boolean>}
   *
   * @example
   * if (await user.isInvalid()) {
   *   console.log('User has errors:', user.errors)
   * }
   */
  async isInvalid() {
    return !(await this.validate())
  }

  // ============================================
  // Associations
  // ============================================

  /**
   * Load associated records
   *
   * @param {string} name - Association name
   * @returns {Promise<Model|Model[]>}
   */
  async loadAssociation(name) {
    const associations = this.constructor.associations
    let assocType = null
    let assocConfig = null

    // Find association
    for (const type of ['belongsTo', 'hasMany', 'hasOne', 'hasAndBelongsToMany']) {
      const assocs = associations[type] || []
      for (const assoc of assocs) {
        const assocName = typeof assoc === 'string' ? assoc : assoc.name
        if (assocName === name) {
          assocType = type
          assocConfig = typeof assoc === 'string' ? { name: assoc } : assoc
          break
        }
      }
      if (assocType) break
    }

    if (!assocType) {
      throw new Error(`Unknown association: ${name}`)
    }

    // Get associated model
    const AssociatedModel = assocConfig.model || this._getAssociatedModel(name)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association: ${name}`)
    }

    // Load based on type
    if (assocType === 'belongsTo') {
      const fk = assocConfig.foreignKey || `${name}_id`
      const fkValue = this.attributes[fk]
      if (!fkValue) return null
      return AssociatedModel.find(fkValue)
    }

    if (assocType === 'hasMany') {
      const fk = assocConfig.foreignKey || this.constructor.name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + '_id'
      return AssociatedModel.where({ [fk]: this.id }).all()
    }

    if (assocType === 'hasOne') {
      const fk = assocConfig.foreignKey || this.constructor.name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + '_id'
      return AssociatedModel.where({ [fk]: this.id }).first()
    }

    return null
  }

  /**
   * Get associated model class from registry
   * @private
   */
  _getAssociatedModel(name) {
    const className = name.charAt(0).toUpperCase() + name.slice(1)
    if (globalThis._modelRegistry && globalThis._modelRegistry[className]) {
      return globalThis._modelRegistry[className]
    }
    return null
  }

  // ============================================
  // Callbacks
  // ============================================

  /**
   * Called before validation runs
   * Override in subclasses to modify attributes or add errors before validation
   *
   * @example
   * class User extends Model {
   *   async beforeValidation() {
   *     // Normalize email
   *     if (this.attributes.email) {
   *       this.attributes.email = this.attributes.email.toLowerCase().trim()
   *     }
   *   }
   * }
   */
  async beforeValidation() {}

  /**
   * Called after validation runs
   * Override in subclasses to modify errors or perform post-validation logic
   *
   * @example
   * class User extends Model {
   *   async afterValidation() {
   *     // Add conditional error
   *     if (this.attributes.role === 'admin' && !this.attributes.admin_code) {
   *       this.errors.admin_code = 'is required for admin users'
   *     }
   *   }
   * }
   */
  async afterValidation() {}

  async beforeSave() {}
  async afterSave() {}
  async beforeCreate() {}
  async afterCreate() {}
  async beforeUpdate() {}
  async afterUpdate() {}
  async beforeDestroy() {}
  async afterDestroy() {}

  // ============================================
  // Serialization
  // ============================================

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return { ...this.attributes }
  }

  /**
   * Convert to JSON string
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this.toJSON())
  }

  // ============================================
  // Utility
  // ============================================

  /**
   * Get the table name for this model
   * @returns {string}
   */
  static getTableName() {
    return this.tableName || tableize(this.name)
  }

  /**
   * Register model in global registry (for eager loading)
   * Also initializes scope methods on the model
   */
  static register() {
    if (!globalThis._modelRegistry) {
      globalThis._modelRegistry = {}
    }
    globalThis._modelRegistry[this.name] = this

    // Initialize scope methods
    this._initializeScopes()
  }
}

export default Model
