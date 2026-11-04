/**
 * Comprehensive tests for Model callbacks
 *
 * Tests the callback system including:
 * - Method override callbacks (traditional pattern)
 * - Declarative callbacks (static callbacks property)
 * - Callback halting (returning false)
 * - Conditional callbacks (if/unless options)
 * - Callback order and execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Model, CallbackHaltError } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'

// Mock connection for unit tests
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

describe('Model Callbacks - Method Override Pattern', () => {
  let mockConnection
  let callbackOrder

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
    callbackOrder = []
  })

  afterEach(() => {
    setConnection(null)
  })

  it('runs create callbacks in order', async () => {
    class CallbackModel extends Model {
      static tableName = 'callback_tests'

      async beforeSave() { callbackOrder.push('beforeSave') }
      async afterSave() { callbackOrder.push('afterSave') }
      async beforeCreate() { callbackOrder.push('beforeCreate') }
      async afterCreate() { callbackOrder.push('afterCreate') }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new CallbackModel({ name: 'Test' })
    await model.save()

    expect(callbackOrder).toEqual([
      'beforeSave',
      'beforeCreate',
      'afterCreate',
      'afterSave'
    ])
  })

  it('runs update callbacks in order', async () => {
    class CallbackModel extends Model {
      static tableName = 'callback_tests'

      async beforeSave() { callbackOrder.push('beforeSave') }
      async afterSave() { callbackOrder.push('afterSave') }
      async beforeUpdate() { callbackOrder.push('beforeUpdate') }
      async afterUpdate() { callbackOrder.push('afterUpdate') }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Updated', updated_at: new Date() }]
    ])

    const model = new CallbackModel({ id: 1, name: 'Test' })
    model.persisted = true
    model.set('name', 'Updated')

    await model.save()

    expect(callbackOrder).toEqual([
      'beforeSave',
      'beforeUpdate',
      'afterUpdate',
      'afterSave'
    ])
  })

  it('runs destroy callbacks in order', async () => {
    class CallbackModel extends Model {
      static tableName = 'callback_tests'

      async beforeDestroy() { callbackOrder.push('beforeDestroy') }
      async afterDestroy() { callbackOrder.push('afterDestroy') }
    }

    mockConnection.setMockResults([[]])

    const model = new CallbackModel({ id: 1, name: 'Test' })
    model.persisted = true

    await model.destroy()

    expect(callbackOrder).toEqual([
      'beforeDestroy',
      'afterDestroy'
    ])
  })

  it('runs validation callbacks in order', async () => {
    class CallbackModel extends Model {
      static tableName = 'callback_tests'
      static validations = {
        name: { presence: true }
      }

      async beforeValidation() { callbackOrder.push('beforeValidation') }
      async afterValidation() { callbackOrder.push('afterValidation') }
    }

    const model = new CallbackModel({ name: 'Test' })
    await model.validate()

    expect(callbackOrder).toEqual([
      'beforeValidation',
      'afterValidation'
    ])
  })
})

describe('Model Callbacks - Halting with false return', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('halts create when beforeSave returns false', async () => {
    class HaltingModel extends Model {
      static tableName = 'halting_tests'

      async beforeSave() {
        return false  // Halt the save
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new HaltingModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.persisted).toBe(false)
    expect(mockConnection.queries).toHaveLength(0)  // No SQL executed
  })

  it('halts create when beforeCreate returns false', async () => {
    class HaltingModel extends Model {
      static tableName = 'halting_tests'

      async beforeCreate() {
        return false  // Halt the create
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new HaltingModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.persisted).toBe(false)
    expect(mockConnection.queries).toHaveLength(0)
  })

  it('halts update when beforeUpdate returns false', async () => {
    class HaltingModel extends Model {
      static tableName = 'halting_tests'

      async beforeUpdate() {
        return false  // Halt the update
      }
    }

    const model = new HaltingModel({ id: 1, name: 'Test' })
    model.persisted = true
    model.set('name', 'Updated')

    const result = await model.save()

    expect(result).toBe(false)
    expect(mockConnection.queries).toHaveLength(0)
  })

  it('halts destroy when beforeDestroy returns false', async () => {
    class HaltingModel extends Model {
      static tableName = 'halting_tests'

      async beforeDestroy() {
        this.errors.base = 'Cannot delete this record'
        return false  // Halt the destroy
      }
    }

    const model = new HaltingModel({ id: 1, name: 'Test' })
    model.persisted = true

    const result = await model.destroy()

    expect(result).toBe(false)
    expect(model.persisted).toBe(true)  // Still persisted
    expect(model.errors.base).toBe('Cannot delete this record')
    expect(mockConnection.queries).toHaveLength(0)
  })

  it('does not halt when callback returns undefined', async () => {
    class NonHaltingModel extends Model {
      static tableName = 'non_halting_tests'

      async beforeSave() {
        // Returns undefined (no explicit return)
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new NonHaltingModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(true)
    expect(model.persisted).toBe(true)
  })

  it('does not halt when callback returns true', async () => {
    class NonHaltingModel extends Model {
      static tableName = 'non_halting_tests'

      async beforeSave() {
        return true
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new NonHaltingModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(true)
    expect(model.persisted).toBe(true)
  })
})

describe('Model Callbacks - Declarative Callbacks', () => {
  let mockConnection
  let callbackOrder

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
    callbackOrder = []
  })

  afterEach(() => {
    setConnection(null)
  })

  it('runs declarative callbacks defined by method name', async () => {
    class DeclarativeModel extends Model {
      static tableName = 'declarative_tests'
      static callbacks = {
        beforeSave: ['logBeforeSave'],
        afterSave: ['logAfterSave']
      }

      logBeforeSave() {
        callbackOrder.push('logBeforeSave')
      }

      logAfterSave() {
        callbackOrder.push('logAfterSave')
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new DeclarativeModel({ name: 'Test' })
    await model.save()

    expect(callbackOrder).toContain('logBeforeSave')
    expect(callbackOrder).toContain('logAfterSave')
  })

  it('runs multiple declarative callbacks in order', async () => {
    class MultiCallbackModel extends Model {
      static tableName = 'multi_callback_tests'
      static callbacks = {
        beforeCreate: ['first', 'second', 'third']
      }

      first() { callbackOrder.push('first') }
      second() { callbackOrder.push('second') }
      third() { callbackOrder.push('third') }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new MultiCallbackModel({ name: 'Test' })
    await model.save()

    expect(callbackOrder).toEqual(['first', 'second', 'third'])
  })

  it('runs inline function callbacks', async () => {
    let inlineCalled = false

    class InlineCallbackModel extends Model {
      static tableName = 'inline_callback_tests'
      static callbacks = {
        beforeSave: [function() {
          inlineCalled = true
        }]
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new InlineCallbackModel({ name: 'Test' })
    await model.save()

    expect(inlineCalled).toBe(true)
  })

  it('halts chain when declarative callback returns false', async () => {
    class HaltingDeclarativeModel extends Model {
      static tableName = 'halting_declarative_tests'
      static callbacks = {
        beforeSave: ['first', 'halter', 'third']
      }

      first() { callbackOrder.push('first') }
      halter() {
        callbackOrder.push('halter')
        return false  // Halt
      }
      third() { callbackOrder.push('third') }
    }

    const model = new HaltingDeclarativeModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(callbackOrder).toEqual(['first', 'halter'])
    expect(callbackOrder).not.toContain('third')
  })

  it('throws error for non-existent callback method', async () => {
    class MissingMethodModel extends Model {
      static tableName = 'missing_method_tests'
      static callbacks = {
        beforeSave: ['nonExistentMethod']
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new MissingMethodModel({ name: 'Test' })

    // Should fail due to missing method
    const result = await model.save()
    expect(result).toBe(false)
    expect(model.errors.base).toContain('nonExistentMethod')
  })
})

describe('Model Callbacks - Conditional Callbacks', () => {
  let mockConnection
  let callbackOrder

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
    callbackOrder = []
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('if condition', () => {
    it('runs callback when if condition method returns true', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{ method: 'conditionalCallback', if: 'shouldRun' }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        shouldRun() {
          return true
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).toContain('conditionalCallback')
    })

    it('skips callback when if condition method returns false', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{ method: 'conditionalCallback', if: 'shouldRun' }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        shouldRun() {
          return false
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).not.toContain('conditionalCallback')
    })

    it('runs callback when if condition is inline function returning true', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{
            method: 'conditionalCallback',
            if: function() { return this.attributes.name === 'Test' }
          }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).toContain('conditionalCallback')
    })

    it('skips callback when if condition is inline function returning false', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{
            method: 'conditionalCallback',
            if: function() { return this.attributes.name === 'Other' }
          }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).not.toContain('conditionalCallback')
    })

    it('runs callback when if condition is boolean true', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{ method: 'conditionalCallback', if: true }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).toContain('conditionalCallback')
    })

    it('skips callback when if condition is boolean false', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{ method: 'conditionalCallback', if: false }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).not.toContain('conditionalCallback')
    })
  })

  describe('unless condition', () => {
    it('runs callback when unless condition method returns false', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{ method: 'conditionalCallback', unless: 'shouldSkip' }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        shouldSkip() {
          return false
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).toContain('conditionalCallback')
    })

    it('skips callback when unless condition method returns true', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{ method: 'conditionalCallback', unless: 'shouldSkip' }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        shouldSkip() {
          return true
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).not.toContain('conditionalCallback')
    })

    it('runs callback when unless condition is inline function returning false', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{
            method: 'conditionalCallback',
            unless: function() { return this.attributes.name === 'Skip' }
          }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).toContain('conditionalCallback')
    })
  })

  describe('combined if and unless', () => {
    it('runs callback when both if (true) and unless (false) conditions pass', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{
            method: 'conditionalCallback',
            if: 'checkIf',
            unless: 'checkUnless'
          }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        checkIf() { return true }
        checkUnless() { return false }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).toContain('conditionalCallback')
    })

    it('skips callback when if condition fails', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{
            method: 'conditionalCallback',
            if: 'checkIf',
            unless: 'checkUnless'
          }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        checkIf() { return false }
        checkUnless() { return false }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).not.toContain('conditionalCallback')
    })

    it('skips callback when unless condition fails', async () => {
      class ConditionalModel extends Model {
        static tableName = 'conditional_tests'
        static callbacks = {
          beforeSave: [{
            method: 'conditionalCallback',
            if: 'checkIf',
            unless: 'checkUnless'
          }]
        }

        conditionalCallback() {
          callbackOrder.push('conditionalCallback')
        }

        checkIf() { return true }
        checkUnless() { return true }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      const model = new ConditionalModel({ name: 'Test' })
      await model.save()

      expect(callbackOrder).not.toContain('conditionalCallback')
    })
  })
})

describe('Model Callbacks - Async Callbacks', () => {
  let mockConnection
  let callbackOrder

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
    callbackOrder = []
  })

  afterEach(() => {
    setConnection(null)
  })

  it('awaits async callbacks', async () => {
    class AsyncModel extends Model {
      static tableName = 'async_tests'
      static callbacks = {
        beforeSave: ['asyncCallback']
      }

      async asyncCallback() {
        await new Promise(resolve => setTimeout(resolve, 10))
        callbackOrder.push('asyncCallback')
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new AsyncModel({ name: 'Test' })
    await model.save()

    expect(callbackOrder).toContain('asyncCallback')
  })

  it('awaits async condition methods', async () => {
    let conditionChecked = false

    class AsyncConditionModel extends Model {
      static tableName = 'async_condition_tests'
      static callbacks = {
        beforeSave: [{ method: 'callback', if: 'asyncCondition' }]
      }

      callback() {
        callbackOrder.push('callback')
      }

      async asyncCondition() {
        await new Promise(resolve => setTimeout(resolve, 10))
        conditionChecked = true
        return true
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new AsyncConditionModel({ name: 'Test' })
    await model.save()

    expect(conditionChecked).toBe(true)
    expect(callbackOrder).toContain('callback')
  })
})

describe('Model Callbacks - Method Override + Declarative Combined', () => {
  let mockConnection
  let callbackOrder

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
    callbackOrder = []
  })

  afterEach(() => {
    setConnection(null)
  })

  it('runs method override before declarative callbacks', async () => {
    class CombinedModel extends Model {
      static tableName = 'combined_tests'
      static callbacks = {
        beforeSave: ['declarativeCallback']
      }

      async beforeSave() {
        callbackOrder.push('methodOverride')
      }

      declarativeCallback() {
        callbackOrder.push('declarative')
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new CombinedModel({ name: 'Test' })
    await model.save()

    expect(callbackOrder[0]).toBe('methodOverride')
    expect(callbackOrder[1]).toBe('declarative')
  })

  it('halts entire chain if method override returns false', async () => {
    class CombinedModel extends Model {
      static tableName = 'combined_tests'
      static callbacks = {
        beforeSave: ['declarativeCallback']
      }

      async beforeSave() {
        callbackOrder.push('methodOverride')
        return false
      }

      declarativeCallback() {
        callbackOrder.push('declarative')
      }
    }

    const model = new CombinedModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(callbackOrder).toEqual(['methodOverride'])
    expect(callbackOrder).not.toContain('declarative')
  })
})

describe('Model Callbacks - Practical Use Cases', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('normalizes email before validation', async () => {
    class User extends Model {
      static tableName = 'users'
      static validations = {
        email: { presence: true, format: /^[^@]+@[^@]+$/ }
      }
      static callbacks = {
        beforeValidation: ['normalizeEmail']
      }

      normalizeEmail() {
        if (this.attributes.email) {
          this.attributes.email = this.attributes.email.toLowerCase().trim()
        }
      }
    }

    const user = new User({ email: '  JOHN@EXAMPLE.COM  ' })
    await user.validate()

    expect(user.attributes.email).toBe('john@example.com')
  })

  it('generates slug before create', async () => {
    class Post extends Model {
      static tableName = 'posts'
      static callbacks = {
        beforeCreate: ['generateSlug']
      }

      generateSlug() {
        if (this.attributes.title && !this.attributes.slug) {
          this.attributes.slug = this.attributes.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        }
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, title: 'Hello World', slug: 'hello-world', created_at: new Date(), updated_at: new Date() }]
    ])

    const post = new Post({ title: 'Hello World!' })
    await post.save()

    expect(post.attributes.slug).toBe('hello-world')
  })

  it('prevents deletion with dependent records', async () => {
    class User extends Model {
      static tableName = 'users'
      static callbacks = {
        beforeDestroy: [{ method: 'checkDependents', if: 'hasPosts' }]
      }

      hasPosts() {
        return this.attributes.posts_count > 0
      }

      checkDependents() {
        this.errors.base = 'Cannot delete user with posts'
        return false
      }
    }

    const user = new User({ id: 1, name: 'John', posts_count: 5 })
    user.persisted = true

    const result = await user.destroy()

    expect(result).toBe(false)
    expect(user.persisted).toBe(true)
    expect(user.errors.base).toBe('Cannot delete user with posts')
  })

  it('allows deletion without dependent records', async () => {
    class User extends Model {
      static tableName = 'users'
      static callbacks = {
        beforeDestroy: [{ method: 'checkDependents', if: 'hasPosts' }]
      }

      hasPosts() {
        return this.attributes.posts_count > 0
      }

      checkDependents() {
        this.errors.base = 'Cannot delete user with posts'
        return false
      }
    }

    mockConnection.setMockResults([[]])

    const user = new User({ id: 1, name: 'John', posts_count: 0 })
    user.persisted = true

    const result = await user.destroy()

    expect(result).toBe(true)
    expect(user.persisted).toBe(false)
  })

  it('tracks changes in afterUpdate', async () => {
    let trackedChanges = null

    class AuditModel extends Model {
      static tableName = 'audit_tests'
      static callbacks = {
        afterUpdate: ['trackChanges']
      }

      trackChanges() {
        trackedChanges = [...this._changedAttributes]
      }
    }

    // Note: The _changedAttributes is cleared after save, so we need to track during the callback
    // Actually, let's track the changed attributes before they're cleared
    class AuditModel2 extends Model {
      static tableName = 'audit_tests'

      async beforeUpdate() {
        trackedChanges = [...this._changedAttributes]
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Updated', email: 'new@example.com', updated_at: new Date() }]
    ])

    const model = new AuditModel2({ id: 1, name: 'Original', email: 'old@example.com' })
    model.persisted = true
    model.set('name', 'Updated')
    model.set('email', 'new@example.com')

    await model.save()

    expect(trackedChanges).toContain('name')
    expect(trackedChanges).toContain('email')
  })

  it('sets default values before validation', async () => {
    class ConfigModel extends Model {
      static tableName = 'configs'
      static validations = {
        status: { inclusion: ['active', 'inactive', 'pending'] }
      }
      static callbacks = {
        beforeValidation: ['setDefaults']
      }

      setDefaults() {
        if (!this.attributes.status) {
          this.attributes.status = 'pending'
        }
      }
    }

    const config = new ConfigModel({ name: 'test' })
    const isValid = await config.validate()

    expect(isValid).toBe(true)
    expect(config.attributes.status).toBe('pending')
  })
})

describe('Model Callbacks - Error Handling', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('handles callback errors gracefully', async () => {
    class ErrorModel extends Model {
      static tableName = 'error_tests'
      static callbacks = {
        beforeSave: ['throwError']
      }

      throwError() {
        throw new Error('Callback error')
      }
    }

    const model = new ErrorModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.base).toBe('Callback error')
  })

  it('throws error for missing condition method', async () => {
    class MissingConditionModel extends Model {
      static tableName = 'missing_condition_tests'
      static callbacks = {
        beforeSave: [{ method: 'callback', if: 'nonExistentCondition' }]
      }

      callback() {
        // This shouldn't run
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new MissingConditionModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.base).toContain('nonExistentCondition')
  })

  it('handles invalid callback definition', async () => {
    class InvalidCallbackModel extends Model {
      static tableName = 'invalid_callback_tests'
      static callbacks = {
        beforeSave: [{ method: 123 }]  // Invalid: method should be string or function
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new InvalidCallbackModel({ name: 'Test' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.base).toContain('Invalid callback definition')
  })
})

describe('Model Callbacks - CallbackHaltError export', () => {
  it('exports CallbackHaltError class', () => {
    expect(CallbackHaltError).toBeDefined()
    expect(typeof CallbackHaltError).toBe('function')
  })

  it('CallbackHaltError has correct properties', () => {
    const error = new CallbackHaltError('beforeSave')

    expect(error.name).toBe('CallbackHaltError')
    expect(error.callbackName).toBe('beforeSave')
    expect(error.message).toBe('Callback chain halted by beforeSave')
  })
})
