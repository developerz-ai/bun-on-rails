/**
 * Associations - Model relationship handling
 *
 * Provides Rails-like associations for models including:
 * - belongsTo: Parent relationship (Post belongs to User)
 * - hasMany: Collection relationship (User has many Posts)
 * - hasOne: Single child relationship (User has one Profile)
 * - hasAndBelongsToMany: Many-to-many through join table
 *
 * @module bun-on-rails/database/associations
 */

import { singularize, classify, underscore } from '../support/inflector.js'

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
 *
 * Creates an async method on model instances to load child records.
 * Uses caching to avoid repeated queries for the same association.
 *
 * @param {typeof Model} modelClass - The model class to add the association to
 * @param {Object} config - Association configuration
 * @param {string} config.name - Association name (e.g., 'posts', 'comments')
 * @param {typeof Model} [config.model] - Associated model class (inferred from name if not provided)
 * @param {string} [config.foreignKey] - Foreign key column name on child table (defaults to `${ownerModelName}_id`)
 * @param {Object} [config.order] - Default ordering for results (e.g., { created_at: 'desc' })
 * @param {Object} [config.scope] - Default scope conditions
 *
 * @example
 * // Basic usage - infers Post model and user_id foreign key
 * class User extends Model {
 *   static associations = {
 *     hasMany: ['posts']
 *   }
 * }
 *
 * // With explicit configuration
 * class User extends Model {
 *   static associations = {
 *     hasMany: [
 *       { name: 'authored_posts', model: Post, foreignKey: 'author_id' },
 *       { name: 'comments', order: { created_at: 'desc' } }
 *     ]
 *   }
 * }
 *
 * // Loading the association
 * const user = await User.find(1)
 * const posts = await user.posts()        // Loads and caches posts
 * const posts2 = await user.posts()       // Returns cached posts
 * const posts3 = await user.posts({ reload: true }) // Force reload
 *
 * @private
 */
function defineHasMany(modelClass, config) {
  const { name, model, foreignKey, order, scope } = config

  // Infer model name from association name if not explicitly provided
  // 'posts' -> 'Post', 'blog_comments' -> 'BlogComment'
  const associatedModelName = model
    ? (typeof model === 'string' ? model : null)
    : classify(singularize(name))

  // Infer foreign key from owner model name
  // User.hasMany posts -> foreign key is user_id on posts table
  // BlogPost.hasMany comments -> foreign key is blog_post_id on comments table
  const fk = foreignKey || foreignKeyForModel(modelClass.name)

  // Cache key for storing loaded association
  const cacheKey = `_association_${name}`

  /**
   * Association method that loads and caches child records
   *
   * @param {Object} [options] - Loading options
   * @param {boolean} [options.reload=false] - Force reload from database
   * @param {Object} [options.where] - Additional WHERE conditions
   * @param {Object} [options.order] - Override default ordering
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset results
   * @returns {Promise<Model[]>} Array of associated records
   */
  modelClass.prototype[name] = async function (options = {}) {
    const { reload = false, where: extraWhere, order: customOrder, limit, offset } = options

    // Return cached value if available and not forcing reload (and no custom options)
    const hasCustomOptions = extraWhere || customOrder || limit !== undefined || offset !== undefined
    if (!reload && !hasCustomOptions && this[cacheKey] !== undefined) {
      return this[cacheKey]
    }

    // Get our primary key value
    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    // Return empty array if primary key is not set
    if (pkValue === null || pkValue === undefined) {
      if (!hasCustomOptions) {
        this[cacheKey] = []
      }
      return []
    }

    // Resolve the associated model class
    const AssociatedModel = resolveModel(model, associatedModelName)

    if (!AssociatedModel) {
      throw new Error(
        `Cannot resolve model for hasMany association '${name}' on ${modelClass.name}. ` +
        `Either register the model or provide explicit model config.`
      )
    }

    // Build query with WHERE clause using the foreign key
    let query = AssociatedModel.where({ [fk]: pkValue })

    // Apply default scope if provided
    if (scope) {
      query = query.where(scope)
    }

    // Apply extra where conditions if provided
    if (extraWhere) {
      query = query.where(extraWhere)
    }

    // Apply ordering (custom order takes precedence over default)
    if (customOrder) {
      query = query.order(customOrder)
    } else if (order) {
      query = query.order(order)
    }

    // Apply limit and offset
    if (limit !== undefined) {
      query = query.limit(limit)
    }
    if (offset !== undefined) {
      query = query.offset(offset)
    }

    // Execute query
    const records = await query.all()

    // Only cache if no custom options were provided
    if (!hasCustomOptions) {
      this[cacheKey] = records
    }

    return records
  }

  // Define method to build (but not save) a new associated record
  // user.buildPost({ title: 'Hello' }) returns new Post instance with user_id set
  const singularName = singularize(name)
  modelClass.prototype[`build${capitalize(singularName)}`] = function (attributes = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    // Set the foreign key to point to this record
    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    return new AssociatedModel({
      ...attributes,
      [fk]: pkValue
    })
  }

  // Define method to create and save a new associated record
  // user.createPost({ title: 'Hello' }) creates, saves, and returns Post with user_id set
  modelClass.prototype[`create${capitalize(singularName)}`] = async function (attributes = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    // Set the foreign key to point to this record
    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    const record = await AssociatedModel.create({
      ...attributes,
      [fk]: pkValue
    })

    // Clear cache so next load includes the new record
    if (record.persisted) {
      this[cacheKey] = undefined
    }

    return record
  }

  // Define method to get count of associated records
  // user.postsCount() returns number of posts
  modelClass.prototype[`${name}Count`] = async function (conditions = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    if (pkValue === null || pkValue === undefined) {
      return 0
    }

    let query = AssociatedModel.where({ [fk]: pkValue })

    // Apply default scope
    if (scope) {
      query = query.where(scope)
    }

    // Apply additional conditions
    if (Object.keys(conditions).length > 0) {
      query = query.where(conditions)
    }

    return query.count()
  }

  // Define method to check if any associated records exist
  // user.hasPosts() returns boolean
  modelClass.prototype[`has${capitalize(name)}`] = async function (conditions = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    if (pkValue === null || pkValue === undefined) {
      return false
    }

    let query = AssociatedModel.where({ [fk]: pkValue })

    // Apply default scope
    if (scope) {
      query = query.where(scope)
    }

    // Apply additional conditions
    if (Object.keys(conditions).length > 0) {
      query = query.where(conditions)
    }

    return query.exists()
  }

  // Define method to clear the association cache
  modelClass.prototype[`clear${capitalize(name)}Cache`] = function () {
    this[cacheKey] = undefined
  }
}

/**
 * Define hasOne association
 *
 * Creates an async method on model instances to load a single child record.
 * Similar to hasMany but returns a single record instead of an array.
 * Uses caching to avoid repeated queries for the same association.
 *
 * @param {typeof Model} modelClass - The model class to add the association to
 * @param {Object} config - Association configuration
 * @param {string} config.name - Association name (e.g., 'profile', 'address')
 * @param {typeof Model} [config.model] - Associated model class (inferred from name if not provided)
 * @param {string} [config.foreignKey] - Foreign key column name on child table (defaults to `${ownerModelName}_id`)
 * @param {Object} [config.scope] - Default scope conditions
 *
 * @example
 * // Basic usage - infers Profile model and user_id foreign key
 * class User extends Model {
 *   static associations = {
 *     hasOne: ['profile']
 *   }
 * }
 *
 * // With explicit configuration
 * class User extends Model {
 *   static associations = {
 *     hasOne: [
 *       { name: 'home_address', model: Address, foreignKey: 'owner_id' },
 *       { name: 'settings', scope: { active: true } }
 *     ]
 *   }
 * }
 *
 * // Loading the association
 * const user = await User.find(1)
 * const profile = await user.profile()       // Loads and caches profile
 * const profile2 = await user.profile()      // Returns cached profile
 * const profile3 = await user.profile({ reload: true }) // Force reload
 *
 * @private
 */
function defineHasOne(modelClass, config) {
  const { name, model, foreignKey, scope } = config

  // Infer model name from association name if not explicitly provided
  // 'profile' -> 'Profile', 'home_address' -> 'HomeAddress'
  const associatedModelName = model
    ? (typeof model === 'string' ? model : null)
    : classify(name)

  // Infer foreign key from owner model name
  // User.hasOne profile -> foreign key is user_id on profiles table
  // BlogPost.hasOne summary -> foreign key is blog_post_id on summaries table
  const fk = foreignKey || foreignKeyForModel(modelClass.name)

  // Cache key for storing loaded association
  const cacheKey = `_association_${name}`

  /**
   * Association method that loads and caches a single child record
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

    // Get our primary key value
    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    // Return null if primary key is not set
    if (pkValue === null || pkValue === undefined) {
      this[cacheKey] = null
      return null
    }

    // Resolve the associated model class
    const AssociatedModel = resolveModel(model, associatedModelName)

    if (!AssociatedModel) {
      throw new Error(
        `Cannot resolve model for hasOne association '${name}' on ${modelClass.name}. ` +
        `Either register the model or provide explicit model config.`
      )
    }

    // Build query with WHERE clause using the foreign key
    let query = AssociatedModel.where({ [fk]: pkValue })

    // Apply default scope if provided
    if (scope) {
      query = query.where(scope)
    }

    // Get the first record (hasOne returns single record)
    const record = await query.first()

    // Cache the result
    this[cacheKey] = record

    return record
  }

  // Define setter for the association
  // Allows: user.profile = profileInstance (sets foreign key on child automatically)
  Object.defineProperty(modelClass.prototype, `${name}=`, {
    value: function (record) {
      if (record === null || record === undefined) {
        this[cacheKey] = null
      } else {
        // Set the foreign key on the associated record to point to this record
        const pkColumn = this.constructor.primaryKey || 'id'
        const pkValue = this.attributes[pkColumn]
        record.attributes[fk] = pkValue
        this[cacheKey] = record
      }
    },
    writable: false,
    enumerable: false
  })

  // Define method to build (but not save) a new associated record
  // user.buildProfile({ bio: 'Hello' }) returns new Profile instance with user_id set
  modelClass.prototype[`build${capitalize(name)}`] = function (attributes = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    // Set the foreign key to point to this record
    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    return new AssociatedModel({
      ...attributes,
      [fk]: pkValue
    })
  }

  // Define method to create and save a new associated record
  // user.createProfile({ bio: 'Hello' }) creates, saves, and returns Profile with user_id set
  modelClass.prototype[`create${capitalize(name)}`] = async function (attributes = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    // Set the foreign key to point to this record
    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    const record = await AssociatedModel.create({
      ...attributes,
      [fk]: pkValue
    })

    // Cache the record if it was persisted
    if (record.persisted) {
      this[cacheKey] = record
    }

    return record
  }

  // Define method to check if the associated record exists
  // user.hasProfile() returns boolean
  modelClass.prototype[`has${capitalize(name)}`] = async function (conditions = {}) {
    const AssociatedModel = resolveModel(model, associatedModelName)
    if (!AssociatedModel) {
      throw new Error(`Cannot resolve model for association '${name}'`)
    }

    const pkColumn = this.constructor.primaryKey || 'id'
    const pkValue = this.attributes[pkColumn]

    if (pkValue === null || pkValue === undefined) {
      return false
    }

    let query = AssociatedModel.where({ [fk]: pkValue })

    // Apply default scope
    if (scope) {
      query = query.where(scope)
    }

    // Apply additional conditions
    if (Object.keys(conditions).length > 0) {
      query = query.where(conditions)
    }

    return query.exists()
  }

  // Define method to clear the association cache
  modelClass.prototype[`clear${capitalize(name)}Cache`] = function () {
    this[cacheKey] = undefined
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
 * This class provides a standalone API for eager loading associations
 * without using the query builder chain.
 *
 * The main eager loading implementation is in QueryBuilder._eagerLoad()
 * which is called automatically when using Model.includes().
 *
 * @example
 * // Preferred: Use the query builder chain
 * const posts = await Post.includes('user', 'comments').all()
 *
 * // Alternative: Use EagerLoader directly
 * const posts = await Post.all()
 * const loader = new EagerLoader(Post, ['user', 'comments'])
 * await loader.load(posts)
 * // Now posts[0].user and posts[0].comments are pre-loaded
 */
export class EagerLoader {
  /**
   * Create an eager loader
   * @param {typeof Model} model - The model class
   * @param {string[]} associations - Association names to load
   */
  constructor(model, associations) {
    this.model = model
    this.associations = associations
  }

  /**
   * Load all associations for a set of records
   *
   * This method batch-loads associations to prevent N+1 queries:
   * - belongsTo: Collects unique foreign keys, loads all parent records in one query
   * - hasMany: Collects primary keys, loads all child records in one query, groups by FK
   * - hasOne: Same as hasMany but takes first match per parent
   *
   * @param {Model[]} records - Records to load associations for
   * @returns {Promise<void>}
   *
   * @example
   * const posts = await Post.all()
   * const loader = new EagerLoader(Post, ['user', 'comments'])
   * await loader.load(posts)
   *
   * // All posts now have user and comments attached
   * posts.forEach(post => {
   *   console.log(post.user.name)    // No additional query
   *   console.log(post.comments)     // No additional query
   * })
   */
  async load(records) {
    if (!records || records.length === 0) {
      return
    }

    const associations = this.model.associations || {}

    for (const assocName of this.associations) {
      // Handle nested associations (e.g., 'comments.author')
      const parts = assocName.split('.')
      const topLevel = parts[0]
      const nested = parts.slice(1)

      // Find association config
      let assocConfig = null
      let assocType = null

      if (this._hasAssociation(associations.belongsTo, topLevel)) {
        assocType = 'belongsTo'
        assocConfig = this._findAssocConfig(associations.belongsTo, topLevel)
      } else if (this._hasAssociation(associations.hasMany, topLevel)) {
        assocType = 'hasMany'
        assocConfig = this._findAssocConfig(associations.hasMany, topLevel)
      } else if (this._hasAssociation(associations.hasOne, topLevel)) {
        assocType = 'hasOne'
        assocConfig = this._findAssocConfig(associations.hasOne, topLevel)
      }

      if (!assocType || !assocConfig) {
        console.warn(`Association '${topLevel}' not found on ${this.model.name}`)
        continue
      }

      await this._loadAssociation(records, topLevel, assocType, assocConfig, nested)
    }
  }

  /**
   * Check if an association exists in an association list
   * @private
   */
  _hasAssociation(assocs, name) {
    if (!assocs) return false
    return assocs.some(a => (typeof a === 'string' ? a : a.name) === name)
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
    const AssociatedModel = this._getAssociatedModel(config, name)

    if (!AssociatedModel) {
      console.warn(`Could not resolve model for association '${name}'`)
      return
    }

    if (type === 'belongsTo') {
      await this._loadBelongsTo(records, name, foreignKey, AssociatedModel, nestedParts)
    } else if (type === 'hasMany') {
      await this._loadHasMany(records, name, foreignKey, AssociatedModel, nestedParts)
    } else if (type === 'hasOne') {
      await this._loadHasOne(records, name, foreignKey, AssociatedModel, nestedParts)
    }
  }

  /**
   * Batch load belongsTo associations
   * @private
   */
  async _loadBelongsTo(records, name, foreignKey, AssociatedModel, nestedParts) {
    // Collect unique foreign key values
    const fkValues = [...new Set(
      records.map(r => r.attributes[foreignKey]).filter(v => v !== null && v !== undefined)
    )]

    if (fkValues.length === 0) {
      records.forEach(r => { r[name] = null })
      return
    }

    // Load all associated records in one query
    const associatedRecords = await AssociatedModel.where({
      [AssociatedModel.primaryKey]: fkValues
    }).all()

    // Create lookup map
    const lookup = new Map(
      associatedRecords.map(r => [r.attributes[AssociatedModel.primaryKey], r])
    )

    // Assign to parent records
    records.forEach(r => {
      r[name] = lookup.get(r.attributes[foreignKey]) || null
    })

    // Handle nested associations
    if (nestedParts.length > 0 && associatedRecords.length > 0) {
      const nestedLoader = new EagerLoader(AssociatedModel, [nestedParts.join('.')])
      await nestedLoader.load(associatedRecords)
    }
  }

  /**
   * Batch load hasMany associations
   * @private
   */
  async _loadHasMany(records, name, foreignKey, AssociatedModel, nestedParts) {
    // Collect primary key values
    const pkValues = records.map(r => r.attributes[this.model.primaryKey])

    // Load all child records in one query
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
      const nestedLoader = new EagerLoader(AssociatedModel, [nestedParts.join('.')])
      await nestedLoader.load(associatedRecords)
    }
  }

  /**
   * Batch load hasOne associations
   * @private
   */
  async _loadHasOne(records, name, foreignKey, AssociatedModel, nestedParts) {
    // Collect primary key values
    const pkValues = records.map(r => r.attributes[this.model.primaryKey])

    // Load all child records in one query
    const associatedRecords = await AssociatedModel.where({
      [foreignKey]: pkValues
    }).all()

    // Create lookup (first match wins)
    const lookup = new Map()
    associatedRecords.forEach(r => {
      const fk = r.attributes[foreignKey]
      if (!lookup.has(fk)) lookup.set(fk, r)
    })

    // Assign to parent records
    records.forEach(r => {
      r[name] = lookup.get(r.attributes[this.model.primaryKey]) || null
    })

    // Handle nested associations
    if (nestedParts.length > 0 && associatedRecords.length > 0) {
      const nestedLoader = new EagerLoader(AssociatedModel, [nestedParts.join('.')])
      await nestedLoader.load(associatedRecords)
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
    return foreignKeyForModel(this.model.name)
  }

  /**
   * Get the associated model class
   * @private
   */
  _getAssociatedModel(config, name) {
    // If model class is directly provided
    if (config.model && typeof config.model !== 'string') {
      return config.model
    }

    // Try to resolve from model name
    const modelName = config.model || this._singularize(name)
    const className = capitalize(modelName)

    // Try global registry
    if (globalThis._modelRegistry && globalThis._modelRegistry[className]) {
      return globalThis._modelRegistry[className]
    }

    return null
  }

  /**
   * Simple singularize helper
   * @private
   */
  _singularize(str) {
    if (str.endsWith('ies')) return str.slice(0, -3) + 'y'
    if (str.endsWith('es')) return str.slice(0, -2)
    if (str.endsWith('s')) return str.slice(0, -1)
    return str
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

/**
 * Generate foreign key column name from model class name
 *
 * @param {string} className - The model class name (e.g., 'User', 'BlogPost')
 * @returns {string} The foreign key column name (e.g., 'user_id', 'blog_post_id')
 * @private
 *
 * @example
 * foreignKeyForModel('User')      // 'user_id'
 * foreignKeyForModel('BlogPost')  // 'blog_post_id'
 * foreignKeyForModel('HTMLParser') // 'html_parser_id'
 */
function foreignKeyForModel(className) {
  return `${underscore(className)}_id`
}
