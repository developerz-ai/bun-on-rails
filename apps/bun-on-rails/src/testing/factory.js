/**
 * Factory - Test data generation (like FactoryBot)
 */

export class Factory {
  constructor() {
    this.definitions = new Map()
    this.sequences = new Map()
  }

  /**
   * Define a factory
   * @param {string} name
   * @param {Object} definition
   */
  define(name, definition) {
    this.definitions.set(name, definition)
  }

  /**
   * Build an instance without saving
   * @param {string} name
   * @param {Object} overrides
   * @returns {Promise<Model>}
   */
  async build(name, overrides = {}) {
    const definition = this.definitions.get(name)
    if (!definition) {
      throw new Error(`Factory '${name}' not defined`)
    }

    const attributes = await this.resolveAttributes(definition, overrides)
    const ModelClass = await this.getModelClass(name)
    return new ModelClass(attributes)
  }

  /**
   * Create and save an instance
   * @param {string} name
   * @param {Object} overrides
   * @returns {Promise<Model>}
   */
  async create(name, overrides = {}) {
    const instance = await this.build(name, overrides)
    await instance.save()
    return instance
  }

  /**
   * Build multiple instances
   * @param {string} name
   * @param {number} count
   * @param {Object} overrides
   * @returns {Promise<Model[]>}
   */
  async buildList(name, count, overrides = {}) {
    const instances = []
    for (let i = 0; i < count; i++) {
      instances.push(await this.build(name, overrides))
    }
    return instances
  }

  /**
   * Create multiple instances
   * @param {string} name
   * @param {number} count
   * @param {Object} overrides
   * @returns {Promise<Model[]>}
   */
  async createList(name, count, overrides = {}) {
    const instances = []
    for (let i = 0; i < count; i++) {
      instances.push(await this.create(name, overrides))
    }
    return instances
  }

  /**
   * Get next value in a sequence
   * @param {string} name
   * @returns {number}
   */
  sequence(name) {
    const current = this.sequences.get(name) || 0
    const next = current + 1
    this.sequences.set(name, next)
    return next
  }

  /**
   * Reset all sequences
   */
  resetSequences() {
    this.sequences.clear()
  }

  /**
   * Resolve attributes from definition
   */
  async resolveAttributes(definition, overrides) {
    const attributes = {}

    for (const [key, value] of Object.entries(definition)) {
      if (typeof value === 'function') {
        attributes[key] = await value(this)
      } else {
        attributes[key] = value
      }
    }

    return { ...attributes, ...overrides }
  }

  /**
   * Get model class by name
   */
  async getModelClass(_name) {
    // TODO: Load model from app/models
    // For now, return the base Model class
    const { Model } = await import('../database/model.js')
    return Model
  }
}

// Global factory instance
export const factory = new Factory()

/**
 * Example factory definitions
 *
 * factory.define('user', {
 *   email: (f) => `user${f.sequence('user')}@example.com`,
 *   name: 'Test User',
 *   password: 'password123'
 * })
 *
 * factory.define('post', {
 *   title: 'Test Post',
 *   body: 'Test body content',
 *   userId: async (f) => {
 *     const user = await f.create('user')
 *     return user.id
 *   }
 * })
 */
