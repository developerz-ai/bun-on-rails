/**
 * Comprehensive tests for Model scopes, callbacks, and pagination
 *
 * Tests:
 * - Named scopes (static scopes definition)
 * - Automatic scope methods generation
 * - Scope chaining with query builder
 * - Model lifecycle callbacks (before/after save, create, update, destroy)
 * - Declarative callbacks (static callbacks property)
 * - Callback conditions (if/unless)
 * - Callback halting (returning false)
 * - Pagination (page, per, paginate)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Model, RecordNotFoundError, PaginatedResult } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'
import { QueryBuilder } from '../../src/database/query_builder.js'

// Mock connection for tests
class MockConnection {
  constructor() {
    this.connected = true
    this.queries = []
    this.mockResults = []
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params })
    return this.mockResults.shift() || []
  }

  setMockResults(results) {
    this.mockResults = [...results]
  }

  getLastQuery() {
    return this.queries[this.queries.length - 1]
  }

  clearQueries() {
    this.queries = []
  }
}

// Test models for scopes
class Post extends Model {
  static tableName = 'posts'

  static scopes = {
    published: (q) => q.where({ published: true }),
    draft: (q) => q.where({ published: false }),
    byAuthor: (q, authorId) => q.where({ author_id: authorId }),
    recent: (q) => q.order({ created_at: 'desc' }).limit(10),
    withTitle: (q, title) => q.where({ title })
  }
}

class Article extends Model {
  static tableName = 'articles'

  // Scopes with multiple parameters
  static scopes = {
    inCategory: (q, category) => q.where({ category }),
    publishedBetween: (q, startDate, endDate) => q.where('published_at >= ? AND published_at <= ?', [startDate, endDate])
  }
}

// Test models for callbacks
const callbackLog = []

class User extends Model {
  static tableName = 'users'

  static callbacks = {
    beforeSave: ['normalizeEmail', 'setDefaults'],
    afterSave: ['logSave'],
    beforeCreate: ['generateUuid'],
    afterCreate: ['sendWelcomeEmail'],
    beforeUpdate: ['validateStatusTransition'],
    afterUpdate: ['notifyChanges'],
    beforeDestroy: [{ method: 'checkCanDelete', if: 'hasPosts' }],
    afterDestroy: ['cleanupFiles']
  }

  normalizeEmail() {
    callbackLog.push('normalizeEmail')
    if (this.attributes.email) {
      this.attributes.email = this.attributes.email.toLowerCase().trim()
    }
  }

  setDefaults() {
    callbackLog.push('setDefaults')
    if (!this.attributes.role) {
      this.attributes.role = 'user'
    }
  }

  logSave() {
    callbackLog.push('logSave')
  }

  generateUuid() {
    callbackLog.push('generateUuid')
    if (!this.attributes.uuid) {
      this.attributes.uuid = 'test-uuid-123'
    }
  }

  sendWelcomeEmail() {
    callbackLog.push('sendWelcomeEmail')
  }

  validateStatusTransition() {
    callbackLog.push('validateStatusTransition')
    // Example: prevent status downgrade
    if (this._originalAttributes.status === 'active' && this.attributes.status === 'pending') {
      return false  // Halt the update
    }
  }

  notifyChanges() {
    callbackLog.push('notifyChanges')
  }

  checkCanDelete() {
    callbackLog.push('checkCanDelete')
    if (this.attributes.posts_count > 0) {
      return false  // Halt the deletion
    }
  }

  hasPosts() {
    return this.attributes.posts_count > 0
  }

  cleanupFiles() {
    callbackLog.push('cleanupFiles')
  }
}

// Model with instance method callbacks (legacy style)
class Product extends Model {
  static tableName = 'products'

  async beforeSave() {
    callbackLog.push('Product.beforeSave')
    if (!this.attributes.sku) {
      this.attributes.sku = 'SKU-' + Date.now()
    }
  }

  async afterCreate() {
    callbackLog.push('Product.afterCreate')
  }

  async beforeDestroy() {
    callbackLog.push('Product.beforeDestroy')
    if (this.attributes.inventory_count > 0) {
      return false  // Can't delete product with inventory
    }
  }
}

// Model with conditional callbacks
class Order extends Model {
  static tableName = 'orders'

  static callbacks = {
    beforeSave: [
      { method: 'calculateTotal', if: 'hasItems' },
      { method: 'skipIfCancelled', unless: 'isCancelled' }
    ]
  }

  hasItems() {
    return this.attributes.items_count > 0
  }

  isCancelled() {
    return this.attributes.status === 'cancelled'
  }

  calculateTotal() {
    callbackLog.push('calculateTotal')
    this.attributes.total = 100  // Mock calculation
  }

  skipIfCancelled() {
    callbackLog.push('skipIfCancelled')
  }
}

// Model with inline function callbacks
class Comment extends Model {
  static tableName = 'comments'

  static callbacks = {
    beforeSave: [
      function() {
        callbackLog.push('inline-beforeSave')
        this.attributes.processed = true
      }
    ],
    afterCreate: [
      async function() {
        callbackLog.push('inline-afterCreate')
      }
    ]
  }
}

let mockConnection

beforeEach(() => {
  mockConnection = new MockConnection()
  setConnection(mockConnection)
  callbackLog.length = 0  // Clear callback log
})

afterEach(() => {
  setConnection(null)
  callbackLog.length = 0
})

// ============================================
// Scopes Tests
// ============================================

describe('Model - Named Scopes', () => {
  it('applies scope via scope() method', async () => {
    const query = Post.scope('published')

    expect(query).toBeInstanceOf(QueryBuilder)
    expect(query.conditions).toEqual([{ column: 'published', operator: '=', value: true }])
  })

  it('applies scope with parameters', async () => {
    const query = Post.scope('byAuthor', 42)

    expect(query).toBeInstanceOf(QueryBuilder)
    expect(query.conditions).toEqual([{ column: 'author_id', operator: '=', value: 42 }])
  })

  it('throws error for unknown scope', () => {
    expect(() => {
      Post.scope('nonexistent')
    }).toThrow('Unknown scope: nonexistent')
  })

  it('chains scopes with query builder methods', async () => {
    const query = Post.scope('published').order({ created_at: 'desc' }).limit(5)

    expect(query.conditions).toEqual([{ column: 'published', operator: '=', value: true }])
    expect(query.orders).toEqual([{ column: 'created_at', direction: 'DESC' }])
    expect(query.limitValue).toBe(5)
  })

  it('applies multiple scopes via method chaining', async () => {
    // Can't chain scopes directly, but can use where() after scope
    const query = Post.scope('published').where({ featured: true })

    expect(query.conditions.length).toBe(2)
    expect(query.conditions[0]).toEqual({ column: 'published', operator: '=', value: true })
    expect(query.conditions[1]).toEqual({ column: 'featured', operator: '=', value: true })
  })
})

describe('Model - Automatic Scope Methods', () => {
  it('creates static methods for each scope', () => {
    // Trigger scope initialization
    Post.query()

    expect(typeof Post.published).toBe('function')
    expect(typeof Post.draft).toBe('function')
    expect(typeof Post.byAuthor).toBe('function')
    expect(typeof Post.recent).toBe('function')
  })

  it('scope methods return QueryBuilder', () => {
    const query = Post.published()

    expect(query).toBeInstanceOf(QueryBuilder)
    expect(query.conditions).toEqual([{ column: 'published', operator: '=', value: true }])
  })

  it('scope methods accept parameters', () => {
    const query = Post.byAuthor(99)

    expect(query.conditions).toEqual([{ column: 'author_id', operator: '=', value: 99 }])
  })

  it('scope methods return QueryBuilder that can be chained with query methods', () => {
    // Scope methods return QueryBuilder, which can be chained with query builder methods
    const query = Post.published().order({ created_at: 'desc' }).limit(10)

    expect(query.conditions).toEqual([{ column: 'published', operator: '=', value: true }])
    expect(query.orders).toEqual([{ column: 'created_at', direction: 'DESC' }])
    expect(query.limitValue).toBe(10)
  })

  it('scope methods work with query builder methods', () => {
    const query = Post.draft().where({ author_id: 1 }).order({ title: 'asc' })

    expect(query.conditions.length).toBe(2)
    expect(query.conditions[0]).toEqual({ column: 'published', operator: '=', value: false })
    expect(query.conditions[1]).toEqual({ column: 'author_id', operator: '=', value: 1 })
    expect(query.orders).toEqual([{ column: 'title', direction: 'ASC' }])
  })

  it('initializes scopes only once per class', () => {
    Post.query()
    const publishedMethod1 = Post.published

    Post.query()
    const publishedMethod2 = Post.published

    // Should be the same function reference
    expect(publishedMethod1).toBe(publishedMethod2)
  })

  it('refuses a scope named like an existing static method (scope_chaining.test.js)', () => {
    // Add a method with the same name as a scope
    class TestModel extends Model {
      static scopes = {
        custom: (q) => q.where({ test: true })
      }

      // Existing method - should not be overridden
      static custom() {
        return 'existing-method'
      }
    }

    expect(() => TestModel.query()).toThrow("TestModel scope 'custom' would shadow")
  })

  it('handles scopes with multiple parameters', () => {
    // Initialize scopes first
    Article.query()

    const startDate = new Date('2024-01-01')
    const endDate = new Date('2024-12-31')
    const query = Article.publishedBetween(startDate, endDate)

    expect(query).toBeInstanceOf(QueryBuilder)
    expect(query.conditions.length).toBe(1)
    expect(query.conditions[0].raw).toBeDefined()
    // Values are wrapped in an array because where() uses ...values
    expect(query.conditions[0].values).toEqual([[startDate, endDate]])
  })
})

describe('Model - Scopes Inheritance', () => {
  it('child class gets parent scopes', () => {
    class ExtendedPost extends Post {
      static scopes = {
        ...Post.scopes,
        featured: (q) => q.where({ featured: true })
      }
    }

    ExtendedPost.query()

    expect(typeof ExtendedPost.published).toBe('function')
    expect(typeof ExtendedPost.featured).toBe('function')
  })
})

// ============================================
// Callbacks Tests
// ============================================

describe('Model - Declarative Callbacks', () => {
  it('runs beforeSave callbacks in order', async () => {
    const user = new User({ name: 'John', email: ' JOHN@EXAMPLE.COM ' })
    mockConnection.setMockResults([[{ id: 1, name: 'John', email: 'john@example.com', role: 'user', uuid: 'test-uuid-123', created_at: new Date(), updated_at: new Date() }]])

    await user.save()

    expect(callbackLog).toContain('normalizeEmail')
    expect(callbackLog).toContain('setDefaults')
    expect(callbackLog.indexOf('normalizeEmail')).toBeLessThan(callbackLog.indexOf('setDefaults'))
  })

  it('normalizeEmail callback works correctly', async () => {
    const user = new User({ name: 'John', email: ' JOHN@EXAMPLE.COM ' })
    mockConnection.setMockResults([[{ id: 1, name: 'John', email: 'john@example.com', created_at: new Date(), updated_at: new Date() }]])

    await user.save()

    expect(user.attributes.email).toBe('john@example.com')
  })

  it('setDefaults callback sets default role', async () => {
    const user = new User({ name: 'John', email: 'john@example.com' })
    mockConnection.setMockResults([[{ id: 1, name: 'John', email: 'john@example.com', role: 'user', created_at: new Date(), updated_at: new Date() }]])

    await user.save()

    expect(user.attributes.role).toBe('user')
  })

  it('runs afterSave callbacks', async () => {
    const user = new User({ name: 'John', email: 'john@example.com' })
    mockConnection.setMockResults([[{ id: 1, name: 'John', email: 'john@example.com', created_at: new Date(), updated_at: new Date() }]])

    await user.save()

    expect(callbackLog).toContain('logSave')
  })

  it('runs beforeCreate and afterCreate for new records', async () => {
    const user = new User({ name: 'John', email: 'john@example.com' })
    mockConnection.setMockResults([[{ id: 1, name: 'John', email: 'john@example.com', uuid: 'test-uuid-123', created_at: new Date(), updated_at: new Date() }]])

    await user.save()

    expect(callbackLog).toContain('generateUuid')
    expect(callbackLog).toContain('sendWelcomeEmail')
    expect(user.attributes.uuid).toBe('test-uuid-123')
  })

  it('runs beforeUpdate and afterUpdate for existing records', async () => {
    const user = new User({ id: 1, name: 'John', email: 'john@example.com', status: 'pending' })
    user.persisted = true
    user._originalAttributes = { ...user.attributes }

    mockConnection.setMockResults([[{ id: 1, name: 'Jane', email: 'john@example.com', status: 'pending', updated_at: new Date() }]])

    user.set('name', 'Jane')
    await user.save()

    expect(callbackLog).toContain('validateStatusTransition')
    expect(callbackLog).toContain('notifyChanges')
  })

  it('beforeUpdate can halt update when returning false', async () => {
    const user = new User({ id: 1, name: 'John', email: 'john@example.com', status: 'active' })
    user.persisted = true
    user._originalAttributes = { ...user.attributes }

    user.set('status', 'pending')  // This should be blocked by validateStatusTransition
    const result = await user.save()

    expect(result).toBe(false)
    expect(callbackLog).toContain('validateStatusTransition')
    expect(callbackLog).not.toContain('notifyChanges')  // afterUpdate should not run
  })

  it('runs beforeDestroy and afterDestroy', async () => {
    const user = new User({ id: 1, name: 'John', posts_count: 5 })
    user.persisted = true

    mockConnection.setMockResults([[]])

    await user.destroy()

    // checkCanDelete runs because hasPosts is true, but returns false to halt
    expect(callbackLog).toContain('checkCanDelete')
    // cleanupFiles should NOT run because checkCanDelete halted the destroy
    expect(callbackLog).not.toContain('cleanupFiles')
  })

  it('beforeDestroy with condition prevents deletion when condition is true', async () => {
    const user = new User({ id: 1, name: 'John', posts_count: 5 })
    user.persisted = true

    const result = await user.destroy()

    expect(result).toBe(false)
    expect(callbackLog).toContain('checkCanDelete')
    expect(callbackLog).not.toContain('cleanupFiles')  // afterDestroy should not run
  })

  it('beforeDestroy with condition allows deletion when condition is false', async () => {
    const user = new User({ id: 1, name: 'John', posts_count: 0 })
    user.persisted = true

    mockConnection.setMockResults([[]])

    const result = await user.destroy()

    expect(result).toBe(true)
    // checkCanDelete should NOT run because hasPosts is false (condition not met)
    expect(callbackLog).not.toContain('checkCanDelete')
    // cleanupFiles should run because destroy succeeded
    expect(callbackLog).toContain('cleanupFiles')
  })
})

describe('Model - Instance Method Callbacks', () => {
  it('runs instance method beforeSave', async () => {
    const product = new Product({ name: 'Widget' })
    mockConnection.setMockResults([[{ id: 1, name: 'Widget', sku: 'SKU-123', created_at: new Date(), updated_at: new Date() }]])

    await product.save()

    expect(callbackLog).toContain('Product.beforeSave')
    expect(product.attributes.sku).toMatch(/^SKU-/)
  })

  it('runs instance method afterCreate', async () => {
    const product = new Product({ name: 'Widget' })
    mockConnection.setMockResults([[{ id: 1, name: 'Widget', created_at: new Date(), updated_at: new Date() }]])

    await product.save()

    expect(callbackLog).toContain('Product.afterCreate')
  })

  it('instance method beforeDestroy can halt deletion', async () => {
    const product = new Product({ id: 1, name: 'Widget', inventory_count: 10 })
    product.persisted = true

    const result = await product.destroy()

    expect(result).toBe(false)
    expect(callbackLog).toContain('Product.beforeDestroy')
  })
})

describe('Model - Conditional Callbacks', () => {
  it('runs callback when if condition is true', async () => {
    const order = new Order({ items_count: 5 })
    mockConnection.setMockResults([[{ id: 1, items_count: 5, total: 100, created_at: new Date(), updated_at: new Date() }]])

    await order.save()

    expect(callbackLog).toContain('calculateTotal')
    expect(order.attributes.total).toBe(100)
  })

  it('skips callback when if condition is false', async () => {
    const order = new Order({ items_count: 0 })
    mockConnection.setMockResults([[{ id: 1, items_count: 0, created_at: new Date(), updated_at: new Date() }]])

    await order.save()

    expect(callbackLog).not.toContain('calculateTotal')
  })

  it('runs callback when unless condition is false', async () => {
    const order = new Order({ status: 'pending', items_count: 0 })
    mockConnection.setMockResults([[{ id: 1, status: 'pending', items_count: 0, created_at: new Date(), updated_at: new Date() }]])

    await order.save()

    expect(callbackLog).toContain('skipIfCancelled')
  })

  it('skips callback when unless condition is true', async () => {
    const order = new Order({ status: 'cancelled', items_count: 0 })
    mockConnection.setMockResults([[{ id: 1, status: 'cancelled', items_count: 0, created_at: new Date(), updated_at: new Date() }]])

    await order.save()

    expect(callbackLog).not.toContain('skipIfCancelled')
  })
})

describe('Model - Inline Function Callbacks', () => {
  it('runs inline function callback', async () => {
    const comment = new Comment({ body: 'Great post!' })
    mockConnection.setMockResults([[{ id: 1, body: 'Great post!', processed: true, created_at: new Date(), updated_at: new Date() }]])

    await comment.save()

    expect(callbackLog).toContain('inline-beforeSave')
    expect(comment.attributes.processed).toBe(true)
  })

  it('runs async inline function callback', async () => {
    const comment = new Comment({ body: 'Great post!' })
    mockConnection.setMockResults([[{ id: 1, body: 'Great post!', created_at: new Date(), updated_at: new Date() }]])

    await comment.save()

    expect(callbackLog).toContain('inline-afterCreate')
  })
})

describe('Model - Callback Execution Order', () => {
  it('executes create callbacks in correct order', async () => {
    const user = new User({ name: 'John', email: ' JOHN@EXAMPLE.COM ' })
    mockConnection.setMockResults([[{ id: 1, name: 'John', email: 'john@example.com', uuid: 'test-uuid-123', role: 'user', created_at: new Date(), updated_at: new Date() }]])

    await user.save()

    const expectedOrder = ['normalizeEmail', 'setDefaults', 'generateUuid', 'sendWelcomeEmail', 'logSave']
    const actualOrder = callbackLog.filter(log => expectedOrder.includes(log))

    // beforeSave callbacks run first (normalizeEmail, setDefaults)
    expect(actualOrder.indexOf('normalizeEmail')).toBeLessThan(actualOrder.indexOf('generateUuid'))
    expect(actualOrder.indexOf('setDefaults')).toBeLessThan(actualOrder.indexOf('generateUuid'))

    // beforeCreate runs (generateUuid)
    // afterCreate runs (sendWelcomeEmail)
    expect(actualOrder.indexOf('generateUuid')).toBeLessThan(actualOrder.indexOf('sendWelcomeEmail'))

    // afterSave runs last (logSave)
    expect(actualOrder.indexOf('sendWelcomeEmail')).toBeLessThan(actualOrder.indexOf('logSave'))
  })

  it('executes update callbacks in correct order', async () => {
    const user = new User({ id: 1, name: 'John', email: 'john@example.com', status: 'pending' })
    user.persisted = true
    user._originalAttributes = { ...user.attributes }

    mockConnection.setMockResults([[{ id: 1, name: 'Jane', email: 'john@example.com', status: 'pending', updated_at: new Date() }]])

    user.set('name', 'Jane')
    await user.save()

    const expectedOrder = ['normalizeEmail', 'setDefaults', 'validateStatusTransition', 'notifyChanges', 'logSave']
    const actualOrder = callbackLog.filter(log => expectedOrder.includes(log))

    // beforeSave callbacks run first
    expect(actualOrder.indexOf('normalizeEmail')).toBeLessThan(actualOrder.indexOf('validateStatusTransition'))

    // beforeUpdate runs
    // afterUpdate runs
    expect(actualOrder.indexOf('validateStatusTransition')).toBeLessThan(actualOrder.indexOf('notifyChanges'))

    // afterSave runs last
    expect(actualOrder.indexOf('notifyChanges')).toBeLessThan(actualOrder.indexOf('logSave'))
  })
})

// ============================================
// Pagination Tests
// ============================================

describe('Model - Pagination', () => {
  it('page() sets current page and offset', () => {
    const query = Post.page(2)

    expect(query._currentPage).toBe(2)
    expect(query.offsetValue).toBe(25)  // Default 25 per page, so page 2 starts at offset 25
  })

  it('per() sets records per page', () => {
    const query = Post.per(10)

    expect(query._perPage).toBe(10)
    expect(query.limitValue).toBe(10)
  })

  it('page() and per() work together', () => {
    const query = Post.page(3).per(20)

    expect(query._currentPage).toBe(3)
    expect(query._perPage).toBe(20)
    expect(query.offsetValue).toBe(40)  // Page 3 with 20 per page = offset 40
    expect(query.limitValue).toBe(20)
  })

  it('per() then page() calculates correct offset', () => {
    const query = Post.per(15).page(2)

    expect(query._perPage).toBe(15)
    expect(query._currentPage).toBe(2)
    expect(query.offsetValue).toBe(15)  // Page 2 with 15 per page = offset 15
  })

  it('paginate() returns PaginatedResult instance', async () => {
    const records = [
      { id: 1, title: 'Post 1', published: true },
      { id: 2, title: 'Post 2', published: true }
    ]

    // Mock count query and records query
    mockConnection.setMockResults([
      [{ count: 50 }],  // Total count
      records  // Actual records
    ])

    const result = await Post.page(1).per(10).paginate()

    expect(result).toBeInstanceOf(PaginatedResult)
  })

  it('paginate() includes correct metadata', async () => {
    const records = [
      { id: 1, title: 'Post 1', published: true },
      { id: 2, title: 'Post 2', published: true }
    ]

    mockConnection.setMockResults([
      [{ count: 50 }],
      records
    ])

    const result = await Post.page(2).per(10).paginate()

    expect(result.currentPage).toBe(2)
    expect(result.perPage).toBe(10)
    expect(result.totalCount).toBe(50)
    expect(result.totalPages).toBe(5)
  })

  it('paginate() calculates hasNextPage correctly', async () => {
    mockConnection.setMockResults([
      [{ count: 50 }],
      []
    ])

    const result1 = await Post.page(1).per(10).paginate()
    expect(result1.hasNextPage).toBe(true)

    mockConnection.setMockResults([
      [{ count: 50 }],
      []
    ])

    const result2 = await Post.page(5).per(10).paginate()
    expect(result2.hasNextPage).toBe(false)
  })

  it('paginate() calculates hasPreviousPage correctly', async () => {
    mockConnection.setMockResults([
      [{ count: 50 }],
      []
    ])

    const result1 = await Post.page(1).per(10).paginate()
    expect(result1.hasPreviousPage).toBe(false)

    mockConnection.setMockResults([
      [{ count: 50 }],
      []
    ])

    const result2 = await Post.page(2).per(10).paginate()
    expect(result2.hasPreviousPage).toBe(true)
  })

  it('paginate() with scopes', async () => {
    mockConnection.setMockResults([
      [{ count: 20 }],
      [{ id: 1, title: 'Post 1', published: true }]
    ])

    const result = await Post.published().page(1).per(10).paginate()

    expect(result.totalCount).toBe(20)
    expect(result.records.length).toBe(1)
  })

  it('paginate() with where conditions', async () => {
    mockConnection.setMockResults([
      [{ count: 15 }],
      [{ id: 1, title: 'Featured Post', published: true, featured: true }]
    ])

    const result = await Post.where({ featured: true }).page(1).per(5).paginate()

    expect(result.totalCount).toBe(15)
  })

  it('static paginate() method with options', async () => {
    mockConnection.setMockResults([
      [{ count: 100 }],
      [{ id: 1, title: 'Post 1' }]
    ])

    const result = await Post.paginate({ page: 3, perPage: 20 })

    expect(result.currentPage).toBe(3)
    expect(result.perPage).toBe(20)
  })

  it('paginate() defaults to page 1 and 25 per page', async () => {
    mockConnection.setMockResults([
      [{ count: 100 }],
      []
    ])

    const result = await Post.paginate()

    expect(result.currentPage).toBe(1)
    expect(result.perPage).toBe(25)
  })

  it('PaginatedResult.toJSON() includes all metadata', async () => {
    mockConnection.setMockResults([
      [{ count: 50 }],
      [{ id: 1, title: 'Post 1' }]
    ])

    const result = await Post.page(2).per(10).paginate()
    const json = result.toJSON()

    expect(json.records).toBeDefined()
    expect(json.pagination).toBeDefined()
    expect(json.pagination.currentPage).toBe(2)
    expect(json.pagination.perPage).toBe(10)
    expect(json.pagination.totalCount).toBe(50)
    expect(json.pagination.totalPages).toBe(5)
    expect(json.pagination.hasNextPage).toBe(true)
    expect(json.pagination.hasPreviousPage).toBe(true)
    expect(json.pagination.firstPage).toBe(false)
    expect(json.pagination.lastPage).toBe(false)
  })

  it('handles edge case of empty results', async () => {
    mockConnection.setMockResults([
      [{ count: 0 }],
      []
    ])

    const result = await Post.page(1).per(10).paginate()

    expect(result.records).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.totalPages).toBe(0)
    expect(result.hasNextPage).toBe(false)
    expect(result.hasPreviousPage).toBe(false)
  })

  it('handles page beyond total pages', async () => {
    mockConnection.setMockResults([
      [{ count: 25 }],
      []
    ])

    const result = await Post.page(10).per(10).paginate()

    expect(result.totalPages).toBe(3)
    expect(result.currentPage).toBe(10)
    expect(result.lastPage).toBe(true)  // Beyond last page counts as last page
    expect(result.hasNextPage).toBe(false)
  })
})

describe('Model - Pagination Integration', () => {
  it('combines scopes, conditions, ordering, and pagination', async () => {
    mockConnection.setMockResults([
      [{ count: 30 }],
      [
        { id: 3, title: 'Post 3', published: true, author_id: 1, created_at: new Date('2024-03-01') },
        { id: 2, title: 'Post 2', published: true, author_id: 1, created_at: new Date('2024-02-01') }
      ]
    ])

    const result = await Post
      .published()
      .where({ author_id: 1 })
      .order({ created_at: 'desc' })
      .page(1)
      .per(2)
      .paginate()

    expect(result.records.length).toBe(2)
    expect(result.totalCount).toBe(30)
    expect(result.perPage).toBe(2)
  })
})
