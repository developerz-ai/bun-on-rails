/**
 * Associations - Model relationship handling
 */

/**
 * Define association methods on a model class
 * @param {typeof Model} modelClass
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
 */
function normalizeAssociation(assoc) {
  if (typeof assoc === 'string') {
    return { name: assoc }
  }
  return assoc
}

/**
 * Define belongsTo association
 */
function defineBelongsTo(modelClass, config) {
  const { name, model, foreignKey } = config
  const associatedModel = model || capitalize(name)
  const fk = foreignKey || `${name}_id`

  modelClass.prototype[name] = async function () {
    // TODO: Load and cache associated model
    // TODO: Use foreignKey to find parent record
  }
}

/**
 * Define hasMany association
 */
function defineHasMany(modelClass, config) {
  const { name, model, foreignKey } = config
  const associatedModel = model || capitalize(singularize(name))
  const fk = foreignKey || `${modelClass.name.toLowerCase()}_id`

  modelClass.prototype[name] = async function () {
    // TODO: Query for associated records
    // TODO: Support scopes and ordering
  }
}

/**
 * Define hasOne association
 */
function defineHasOne(modelClass, config) {
  const { name, model, foreignKey } = config
  const associatedModel = model || capitalize(name)
  const fk = foreignKey || `${modelClass.name.toLowerCase()}_id`

  modelClass.prototype[name] = async function () {
    // TODO: Query for single associated record
  }
}

/**
 * Define hasAndBelongsToMany association
 */
function defineHasAndBelongsToMany(modelClass, config) {
  const { name, model, joinTable } = config
  const associatedModel = model || capitalize(singularize(name))

  modelClass.prototype[name] = async function () {
    // TODO: Query through join table
  }
}

/**
 * Eager loading support
 */
export class EagerLoader {
  constructor(baseQuery, associations) {
    this.baseQuery = baseQuery
    this.associations = associations
  }

  /**
   * Load all associations for a set of records
   * @param {Model[]} records
   */
  async load(records) {
    // TODO: Parse nested associations (e.g., 'comments.author')
    // TODO: Batch load to prevent N+1
    // TODO: Attach loaded records to parents
  }
}

// Helper functions
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function singularize(str) {
  // TODO: Proper singularization
  if (str.endsWith('ies')) return str.slice(0, -3) + 'y'
  if (str.endsWith('s')) return str.slice(0, -1)
  return str
}
