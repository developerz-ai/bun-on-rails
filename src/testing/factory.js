/**
 * Factory - Test data generation (like FactoryBot)
 *
 * A factory builds the class given as `model` (a class, or the name of a
 * registered one), else the registered model named after the factory: 'user'
 * is User, 'blog_post' is BlogPost. Pinned by test/testing/factory.test.js.
 */

import { classify } from '../support/inflector.js'
import { resolveAssociationModel } from '../database/associations.js'

export class Factory {
  constructor() {
    this.definitions = new Map()
    this.sequences = new Map()
  }

  /**
   * Define a factory
   * @param {string} name
   * @param {Object} attributes - values, or functions of the factory
   * @param {{ model?: Function|string }} [options] - the model class, or a registered model's name
   */
  define(name, attributes, { model } = {}) {
    this.definitions.set(name, { attributes, model })
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

    const ModelClass = this.modelFor(name, definition.model)
    const attributes = await this.resolveAttributes(definition.attributes, overrides)
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
   * The model a factory builds. There is no fallback to the base Model, which
   * saved to a table named "models".
   */
  modelFor(name, model) {
    const ModelClass = resolveAssociationModel({ model }, name)
    if (!ModelClass) {
      const className = typeof model === 'string' ? model : classify(name)
      throw new Error(
        `Factory '${name}' has no model: register ${className} with ${className}.register(), ` +
          `or pass one: factory.define('${name}', attributes, { model: ${className} })`
      )
    }
    return ModelClass
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
