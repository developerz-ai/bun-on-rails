/**
 * Cache - Caching layer
 */

export class Cache {
  constructor(store) {
    this.store = store
  }

  /**
   * Get a value from cache
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    return await this.store.get(key)
  }

  /**
   * Set a value in cache
   * @param {string} key
   * @param {any} value
   * @param {Object} options
   */
  async set(key, value, options = {}) {
    return await this.store.set(key, value, options)
  }

  /**
   * Get or set with callback
   * @param {string} key
   * @param {Function} callback
   * @param {Object} options
   * @returns {Promise<any>}
   */
  async fetch(key, callback, options = {}) {
    let value = await this.get(key)
    if (value === null || value === undefined) {
      value = await callback()
      await this.set(key, value, options)
    }
    return value
  }

  /**
   * Delete a key
   * @param {string} key
   */
  async delete(key) {
    return await this.store.delete(key)
  }

  /**
   * Delete keys matching pattern
   * @param {string} pattern
   */
  async deleteMatching(pattern) {
    return await this.store.deleteMatching(pattern)
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    return await this.store.exists(key)
  }

  /**
   * Increment a numeric value
   * @param {string} key
   * @param {number} amount
   * @returns {Promise<number>}
   */
  async increment(key, amount = 1) {
    return await this.store.increment(key, amount)
  }

  /**
   * Decrement a numeric value
   * @param {string} key
   * @param {number} amount
   * @returns {Promise<number>}
   */
  async decrement(key, amount = 1) {
    return await this.store.decrement(key, amount)
  }

  /**
   * Clear all cache
   */
  async clear() {
    return await this.store.clear()
  }
}

/**
 * Memory Store - In-memory cache for development
 */
export class MemoryStore {
  constructor() {
    this.data = new Map()
    this.expiry = new Map()
  }

  async get(key) {
    if (this.isExpired(key)) {
      this.data.delete(key)
      this.expiry.delete(key)
      return null
    }
    return this.data.get(key)
  }

  async set(key, value, options = {}) {
    this.data.set(key, value)
    if (options.ttl) {
      this.expiry.set(key, Date.now() + options.ttl * 1000)
    }
  }

  async delete(key) {
    this.data.delete(key)
    this.expiry.delete(key)
  }

  async deleteMatching(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'))
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        this.data.delete(key)
        this.expiry.delete(key)
      }
    }
  }

  async exists(key) {
    return this.data.has(key) && !this.isExpired(key)
  }

  async increment(key, amount = 1) {
    const value = (await this.get(key)) || 0
    const newValue = value + amount
    await this.set(key, newValue)
    return newValue
  }

  async decrement(key, amount = 1) {
    return await this.increment(key, -amount)
  }

  async clear() {
    this.data.clear()
    this.expiry.clear()
  }

  isExpired(key) {
    const exp = this.expiry.get(key)
    return exp && Date.now() > exp
  }
}

/**
 * Redis Store - Production cache
 */
export class RedisStore {
  constructor(client) {
    this.client = client
  }

  async get(key) {
    // TODO: Get from Redis, parse JSON
  }

  async set(key, value, options = {}) {
    // TODO: Set in Redis with optional TTL
  }

  async delete(key) {
    // TODO: DEL key
  }

  async deleteMatching(pattern) {
    // TODO: SCAN and DEL matching keys
  }

  async exists(key) {
    // TODO: EXISTS key
  }

  async increment(key, amount = 1) {
    // TODO: INCRBY
  }

  async decrement(key, amount = 1) {
    // TODO: DECRBY
  }

  async clear() {
    // TODO: FLUSHDB (be careful!)
  }
}
