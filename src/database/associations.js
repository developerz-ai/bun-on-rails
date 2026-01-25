/**
 * Associations - Model relationship handling
 *
 * Provides Rails-like associations for models including:
 * - belongsTo: Parent relationship (Post belongs to User)
 * - hasMany: Collection relationship (User has many Posts)
 * - hasOne: Single child relationship (User has one Profile)
 * - hasAndBelongsToMany: Many-to-many through join table
 *
 * @module @bun-on-rails/database/associations
 */

import { singularize, classify } from '../support/inflector.js'

/**
 * Define association methods on a model class
 *
 * @param {typeof Model} modelClass - The model class to define associations on
 *
 * @example
 * class Post extends Model {
 *   static associations = {
 *     belongsTo: ['user'],
 *     hasMany: ['comments']
 *   }
 * }
 *
 * defineAssociations(Post)
 * // Now post.user() and post.comments() are available
 */
export function defineAssociations(modelClass) {
  const associations = modelClass.associations || {}

  // belongsTo: Post.user()
  if (associations.belongsTo) {
    for (const assoc of associations.belongsTo) {
      const config = normalizeAssociation(assoc)
      defineBelongsTo(modelClass, config)
    }
  }

  // hasMany: User.posts()
  if (associations.hasMany) {
    for (const assoc of associations.hasMany) {
      const config = normalizeAssociation(assoc)
      defineHasMany(modelClass, config)
    }
  }

  // hasOne: User.profile()
  if (associations.hasOne) {
    for (const assoc of associations.hasOne) {
      const config = normalizeAssociation(assoc)
      defineHasOne(modelClass, config)
    }
  }

  // hasAndBelongsToMany: Post.tags()
  if (associations.hasAndBelongsToMany) {
    for (const assoc of associations.hasAndBelongsToMany) {
      const config = normalizeAssociation(assoc)
      defineHasAndBelongsToMany(modelClass, config)
    }
  }
}

/**
 * Normalize association config (string or object)
 *
 * @param {string|Object} assoc - Association definition
 * @returns {Object} Normalized config object with at least { name }
 * @private
 */
function normalizeAssociation(assoc) {
  if (typeof assoc === 'string') {
    return { name: assoc }
  }
  return assoc
}

/**
 * Define belongsTo association
 *
 * Creates an async method on model instances to load the parent record.
 * Uses caching to avoid repeated queries for the same association.
 *
 * @param {typeof Model} modelClass - The model class to add the association to
 * @param {Object} config - Association configuration
 * @param {string} config.name - Association name (e.g., 'user')
 * @param {typeof Model} [config.model] - Associated model class (inferred from name if not provided)
 * @param {string} [config.foreignKey] - Foreign key column name (defaults to `${name}_id`)
 *
 * @example
 * // Basic usage - infers User model and user_id foreign key
 * static associations = {
 *   belongsTo: ['user']
 * }
 *
 * // With explicit configuration
 * static associations = {
 *   belongsTo: [{ name: 'author', model: User, foreignKey: 'author_id' }]
 * }
 *
 * // Loading the association
 * const post = await Post.find(1)
 * const user = await post.user()  // Loads and caches the user
 * const user2 = await post.user() // Returns cached user
 */
function defineBelongsTo(modelClass, config) {
  const { name, model, foreignKey } = config

  // Infer model name from association name if not explicitly provided
  // 'user' -> 'User', 'blog_author' -> 'BlogAuthor'
  const associatedModelName = model
    ? (typeof model === 'string' ? model : null)
    : classify(name)

  // Infer foreign key from association name
  // 'user' -> 'user_id', 'blog_author' -> 'blog_author_id'
  const fk = foreignKey || `${name}_id`

  // Cache key for storing loaded association
  const cacheKey = `_association_${name}`

  /**
   * Association method that loads and caches the parent record
   *
   * @param {Object} [options] - Loading options
   * @param {boolean} [options.reload=false] - Force reload from database
   * @returns {Promise<Model|null>} The associated record or null if not found
   */
  modelClass.prototype[name] = async function (options = {}) {
    const { reload = false } = options

    // Return cached value if available and not forcing reload
    if (!reload && this[cacheKey] !== undefined) {
      return this[cacheKey]
    }

    // Get foreign key value
    const fkValue = this.attributes[fk]

    // Return null if foreign key is not set
    if (fkValue === null || fkValue === undefined) {
      this[cacheKey] = null
      return null
    }

    // Resolve the associated model class
    const AssociatedModel = resolveModel(model, associatedModelName)

    if (!AssociatedModel) {
      throw new Error(
        `Cannot resolve model for belongsTo association '${name}' on ${modelClass.name}. ` +
        `Either register the model or provide explicit model config.`
      )
    }

    // Load the parent record by primary key
    try {
      const record = await AssociatedModel.findById(fkValue)
      this[cacheKey] = record
      return record
    } catch (error) {
      // If record not found, cache null
      this[cacheKey] = null
      return null
    }
  }

  // Define setter for the association
  // Allows: post.user = userInstance (sets user_id automatically)
  Object.defineProperty(modelClass.prototype, `${name}=`, {
    value: function (record) {
      if (record === null || record === undefined) {
        this.attributes[fk] = null
        this[cacheKey] = null
      } else {
        // Get the primary key from the associated record
        const pkColumn = record.constructor.primaryKey || 'id'
        this.attributes[fk] = record.attributes[pkColumn]
        this[cacheKey] = record
      }
    },
    writable: false,
    enumerable: false
  })

  // Define method to build (but not save) associated record
  // post.buildUser({ name: 'John' }) returns new User instance
  modelClass.prototype[`build${capitalize(name)}`] = function (attributes = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }
    return new AssociatedModel(attributes)
  }

  // Define method to create and save associated record
  // post.createUser({ name: 'John' }) creates, saves, and returns User
  modelClass.prototype[`create${capitalize(name)}`] = async function (attributes = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    const record = await AssociatedModel.create(attributes)
    if (record.persisted) {
      // Update our foreign key to point to the new record
      const pkColumn = AssociatedModel.primaryKey || 'id'
      this.attributes[fk] = record.attributes[pkColumn]
      this[cacheKey] = record
    }
    return record
  }
}

/**
 * Define hasMany association
 * @private
 */
function defineHasMany(modelClass, config) {
  const { name, model, foreignKey } = config
  const _associatedModel = model || capitalize(singularize(name))
  const _fk = foreignKey || `${modelClass.name.toLowerCase()}_id`

  modelClass.prototype[name] = async function () {
    // TODO: Query for associated records
    // TODO: Support scopes and ordering
  }
}

/**
 * Define hasOne association
 * @private
 */
function defineHasOne(modelClass, config) {
  const { name, model, foreignKey } = config
  const _associatedModel = model || capitalize(name)
  const _fk = foreignKey || `${modelClass.name.toLowerCase()}_id`

  modelClass.prototype[name] = async function () {
    // TODO: Query for single associated record
  }
}

/**
 * Define hasAndBelongsToMany association
 * @private
 */
function defineHasAndBelongsToMany(modelClass, config) {
  const { name, model, joinTable: _joinTable } = config
  const _associatedModel = model || capitalize(singularize(name))

  modelClass.prototype[name] = async function () {
    // TODO: Query through join table
  }
}

/**
 * Eager loading support
 *
 * Batch loads associations for multiple records to prevent N+1 queries.
 *
 * @example
 * const posts = await Post.all()
 * const loader = new EagerLoader(Post.query(), ['user', 'comments'])
 * await loader.load(posts)
 * // Now posts[0].user and posts[0].comments are pre-loaded
 */
export class EagerLoader {
  /**
   * Create an eager loader
   * @param {QueryBuilder} baseQuery - The base query builder
   * @param {string[]} associations - Association names to load
   */
  constructor(baseQuery, associations) {
    this.baseQuery = baseQuery
    this.associations = associations
  }

  /**
   * Load all associations for a set of records
   * @param {Model[]} records - Records to load associations for
   */
  async load(_records) {
    // TODO: Parse nested associations (e.g., 'comments.author')
    // TODO: Batch load to prevent N+1
    // TODO: Attach loaded records to parents
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Resolve model class from various sources
 *
 * @param {typeof Model|string|null} model - Explicit model class or name
 * @param {string} inferredName - Inferred model class name
 * @returns {typeof Model|null} The resolved model class or null
 * @private
 */
function resolveModel(model, inferredName) {
  // If model class is directly provided
  if (model && typeof model !== 'string') {
    return model
  }

  // Determine the class name to look up
  const className = (typeof model === 'string') ? model : inferredName

  // Look up in global model registry
  if (globalThis._modelRegistry && globalThis._modelRegistry[className]) {
    return globalThis._modelRegistry[className]
  }

  return null
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 * @private
 */
function capitalize(str) {
  if (!str || str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}
