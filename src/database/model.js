/**
 * Base Model class - Active Record style ORM
 */

export class Model {
  static tableName = null
  static primaryKey = 'id'
  static associations = {}
  static validations = {}
  static scopes = {}

  constructor(attributes = {}) {
    this.attributes = attributes
    this.errors = {}
    this.persisted = false
  }

  // ============================================
  // Finders
  // ============================================

  /**
   * Find a record by primary key
   * @param {number|string} id
   * @returns {Promise<Model>}
   */
  static async find(_id) {
    // TODO: Implement
  }

  /**
   * Find a record by attributes
   * @param {Object} conditions
   * @returns {Promise<Model|null>}
   */
  static async findBy(_conditions) {
    // TODO: Implement
  }

  /**
   * Find all records matching conditions
   * @param {Object} options
   * @returns {Promise<Model[]>}
   */
  static async findAll(_options = {}) {
    // TODO: Implement
  }

  /**
   * Build a query with conditions
   * @param {Object} conditions
   * @returns {QueryBuilder}
   */
  static where(_conditions) {
    // TODO: Implement
  }

  // ============================================
  // Persistence
  // ============================================

  /**
   * Create a new record
   * @param {Object} attributes
   * @returns {Promise<Model>}
   */
  static async create(_attributes) {
    // TODO: Implement
  }

  /**
   * Save the current record
   * @returns {Promise<boolean>}
   */
  async save() {
    // TODO: Validate
    // TODO: Run callbacks
    // TODO: Insert or update
  }

  /**
   * Update attributes
   * @param {Object} attributes
   * @returns {Promise<boolean>}
   */
  async update(_attributes) {
    // TODO: Implement
  }

  /**
   * Delete the record
   * @returns {Promise<boolean>}
   */
  async destroy() {
    // TODO: Implement
  }

  // ============================================
  // Validations
  // ============================================

  /**
   * Run validations on the model
   * @returns {boolean}
   */
  validate() {
    // TODO: Implement validation runner
  }

  /**
   * Check if model is valid
   * @returns {boolean}
   */
  isValid() {
    return this.validate()
  }

  // ============================================
  // Associations
  // ============================================

  /**
   * Load associated records
   * @param {string} name
   * @returns {Promise<Model|Model[]>}
   */
  async loadAssociation(_name) {
    // TODO: Implement
  }

  // ============================================
  // Scopes
  // ============================================

  /**
   * Apply a named scope
   * @param {string} name
   * @param {...any} args
   * @returns {QueryBuilder}
   */
  static scope(_name, ..._args) {
    // TODO: Implement
  }

  // ============================================
  // Callbacks
  // ============================================

  async beforeSave() {}
  async afterSave() {}
  async beforeCreate() {}
  async afterCreate() {}
  async beforeUpdate() {}
  async afterUpdate() {}
  async beforeDestroy() {}
  async afterDestroy() {}
}
