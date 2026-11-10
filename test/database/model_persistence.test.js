/**
 * Unit tests for Model persistence methods
 *
 * Tests Model.create(), Model.save(), Model.update(), Model.destroy()
 * and related persistence operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Model, RecordNotFoundError } from '../../src/database/model.js'
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
    const rows = this.mockResults.shift() || []
    // Like postgres.js and Bun.sql: the result carries the affected-row count.
    return Object.assign(rows, { count: rows.count ?? rows.length })
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

// Test model classes
class User extends Model {
  static tableName = 'users'
  static primaryKey = 'id'
  static validations = {
    name: { presence: true },
    email: { presence: true, format: /^[^@]+@[^@]+$/ }
  }
}

// Post model for testing associations (reserved for future integration tests)
class _Post extends Model {
  static tableName = 'posts'
  static associations = {
    belongsTo: ['user']
  }
  static validations = {
    title: { presence: true, length: { max: 200 } }
  }
}

class NoValidationModel extends Model {
  static tableName = 'items'
}

describe('Model Persistence - Static Methods', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('Model.create(attributes)', () => {
    it('creates a new record and saves to database', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com', created_at: new Date(), updated_at: new Date() }]
      ])

      const user = await User.create({ name: 'John', email: 'john@example.com' })

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
      expect(user.attributes.name).toBe('John')
      expect(user.attributes.email).toBe('john@example.com')
      expect(user.persisted).toBe(true)

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('INSERT INTO')
      expect(query.sql).toContain('users')
      expect(query.sql).toContain('RETURNING')
    })

    it('returns model with errors when validation fails', async () => {
      const user = await User.create({ name: 'John' }) // Missing email

      expect(user).toBeInstanceOf(User)
      expect(user.persisted).toBe(false)
      expect(user.errors.email).toBeDefined()
      expect(mockConnection.queries).toHaveLength(0) // No query executed
    })

    it('adds timestamps automatically', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: new Date(), updated_at: new Date() }]
      ])

      await NoValidationModel.create({ name: 'Test' })

      const query = mockConnection.getLastQuery()
      expect(query.params).toContainEqual(expect.any(Date))
    })

    it('does not override provided timestamps', async () => {
      const customDate = new Date('2020-01-01')
      mockConnection.setMockResults([
        [{ id: 1, name: 'Test', created_at: customDate, updated_at: customDate }]
      ])

      await NoValidationModel.create({
        name: 'Test',
        created_at: customDate
      })

      const query = mockConnection.getLastQuery()
      expect(query.params).toContain(customDate)
    })
  })

  describe('Model.updateWhere(conditions, attributes)', () => {
    it('updates all matching records', async () => {
      mockConnection.setMockResults([[{ count: '3' }]])

      await User.updateWhere({ is_active: true }, { role: 'member' })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('UPDATE')
      expect(query.sql).toContain('users')
      expect(query.sql).toContain('SET')
      expect(query.sql).toContain('WHERE')
    })
  })

  describe('Model.deleteWhere(conditions)', () => {
    it('deletes all matching records', async () => {
      mockConnection.setMockResults([[]])

      await User.deleteWhere({ is_active: false })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('DELETE FROM')
      expect(query.sql).toContain('users')
      expect(query.sql).toContain('WHERE')
    })
  })

  describe('Model.deleteAll()', () => {
    it('deletes all records', async () => {
      mockConnection.setMockResults([[]])

      await User.deleteAll()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('DELETE FROM')
      expect(query.sql).toContain('users')
    })
  })

  describe('Model.findOrCreateBy(attributes)', () => {
    it('returns existing record if found', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const user = await User.findOrCreateBy({ email: 'john@example.com' })

      expect(user.id).toBe(1)
      expect(user.persisted).toBe(true)
      expect(mockConnection.queries).toHaveLength(1) // Only find query
    })

    it('creates new record if not found', async () => {
      mockConnection.setMockResults([
        [], // Find returns empty
        [{ id: 2, name: 'Jane', email: 'jane@example.com', created_at: new Date(), updated_at: new Date() }] // Create returns new record
      ])

      const user = await User.findOrCreateBy({ name: 'Jane', email: 'jane@example.com' })

      expect(user.id).toBe(2)
      expect(user.persisted).toBe(true)
      expect(mockConnection.queries).toHaveLength(2) // Find + insert
    })
  })

  describe('Model.findOrInitializeBy(attributes)', () => {
    it('returns existing record if found', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const user = await User.findOrInitializeBy({ email: 'john@example.com' })

      expect(user.id).toBe(1)
      expect(user.persisted).toBe(true)
    })

    it('returns new unsaved record if not found', async () => {
      mockConnection.setMockResults([[]])

      const user = await User.findOrInitializeBy({ name: 'New', email: 'new@example.com' })

      expect(user.id).toBeUndefined()
      expect(user.persisted).toBe(false)
      expect(user.isNew).toBe(true)
      expect(user.attributes.name).toBe('New')
      expect(user.attributes.email).toBe('new@example.com')
    })
  })
})

describe('Model Persistence - Instance Methods', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('save()', () => {
    describe('for new records (INSERT)', () => {
      it('inserts record and returns true on success', async () => {
        mockConnection.setMockResults([
          [{ id: 1, name: 'John', email: 'john@example.com', created_at: new Date(), updated_at: new Date() }]
        ])

        const user = new User({ name: 'John', email: 'john@example.com' })
        const result = await user.save()

        expect(result).toBe(true)
        expect(user.id).toBe(1)
        expect(user.persisted).toBe(true)
        expect(user.isNew).toBe(false)

        const query = mockConnection.getLastQuery()
        expect(query.sql).toContain('INSERT INTO')
        expect(query.sql).toContain('RETURNING')
      })

      it('returns false when validation fails', async () => {
        const user = new User({ name: 'John' }) // Missing email
        const result = await user.save()

        expect(result).toBe(false)
        expect(user.persisted).toBe(false)
        expect(user.errors.email).toBeDefined()
        expect(mockConnection.queries).toHaveLength(0)
      })

      it('clears changed attributes after save', async () => {
        mockConnection.setMockResults([
          [{ id: 1, name: 'John', email: 'john@example.com', created_at: new Date(), updated_at: new Date() }]
        ])

        const user = new User({ name: 'John', email: 'john@example.com' })
        await user.save()

        expect(user.isDirty).toBe(false)
        expect(user.changedAttributes).toHaveLength(0)
      })

      it('throws a database error instead of returning false (save_errors.test.js)', async () => {
        mockConnection.query = async () => {
          throw new Error('Database connection failed')
        }

        const user = new User({ name: 'John', email: 'john@example.com' })

        await expect(user.save()).rejects.toThrow('Database connection failed')
        expect(user.persisted).toBe(false)
      })
    })

    describe('for existing records (UPDATE)', () => {
      it('updates record and returns true on success', async () => {
        mockConnection.setMockResults([
          [{ id: 1, name: 'Jane', email: 'john@example.com', updated_at: new Date() }]
        ])

        const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
        user.persisted = true
        user._originalAttributes = { id: 1, name: 'John', email: 'john@example.com' }

        user.set('name', 'Jane')
        const result = await user.save()

        expect(result).toBe(true)
        expect(user.attributes.name).toBe('Jane')

        const query = mockConnection.getLastQuery()
        expect(query.sql).toContain('UPDATE')
        expect(query.sql).toContain('SET')
        expect(query.sql).toContain('WHERE')
        expect(query.sql).toContain('RETURNING')
      })

      it('automatically updates updated_at timestamp', async () => {
        const beforeUpdate = new Date()
        mockConnection.setMockResults([
          [{ id: 1, name: 'Jane', email: 'john@example.com', updated_at: new Date() }]
        ])

        const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
        user.persisted = true

        user.set('name', 'Jane')
        await user.save()

        const query = mockConnection.getLastQuery()
        // Find the updated_at parameter
        const hasUpdatedAt = query.params.some(p => p instanceof Date && p >= beforeUpdate)
        expect(hasUpdatedAt).toBe(true)
      })
    })
  })

  describe('save_()', () => {
    it('throws error on validation failure', async () => {
      const user = new User({ name: 'John' }) // Missing email

      await expect(user.save_()).rejects.toThrow('Validation failed')
    })

    it('returns true on success', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com', created_at: new Date(), updated_at: new Date() }]
      ])

      const user = new User({ name: 'John', email: 'john@example.com' })
      const result = await user.save_()

      expect(result).toBe(true)
    })
  })

  describe('update(attributes)', () => {
    it('updates attributes and saves', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Jane', email: 'jane@example.com', is_active: false, updated_at: new Date() }]
      ])

      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      const result = await user.update({ name: 'Jane', email: 'jane@example.com', is_active: false })

      expect(result).toBe(true)
      expect(user.attributes.name).toBe('Jane')
      expect(user.attributes.email).toBe('jane@example.com')
      expect(user.attributes.is_active).toBe(false)

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('UPDATE')
    })

    it('returns false on validation failure', async () => {
      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      const result = await user.update({ email: 'invalid-email' })

      expect(result).toBe(false)
      expect(user.errors.email).toBeDefined()
    })

    it('tracks changed attributes', async () => {
      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      // Manually set attributes (simulating update without save)
      user.set('name', 'Jane')
      user.set('email', 'jane@example.com')

      expect(user.isDirty).toBe(true)
      expect(user.changedAttributes).toContain('name')
      expect(user.changedAttributes).toContain('email')
    })
  })

  describe('update_(attributes)', () => {
    it('throws error on validation failure', async () => {
      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      await expect(user.update_({ email: 'invalid' })).rejects.toThrow('Validation failed')
    })

    it('returns true on success', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Jane', email: 'jane@example.com', updated_at: new Date() }]
      ])

      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      const result = await user.update_({ name: 'Jane', email: 'jane@example.com' })

      expect(result).toBe(true)
    })
  })

  describe('destroy()', () => {
    it('deletes persisted record and returns true', async () => {
      mockConnection.setMockResults([[]])

      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      const result = await user.destroy()

      expect(result).toBe(true)
      expect(user.persisted).toBe(false)

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('DELETE FROM')
      expect(query.sql).toContain('users')
      expect(query.sql).toContain('WHERE')
    })

    it('returns false for unpersisted record', async () => {
      const user = new User({ name: 'John', email: 'john@example.com' })

      const result = await user.destroy()

      expect(result).toBe(false)
      expect(mockConnection.queries).toHaveLength(0)
    })

    it('throws a database error instead of returning false (save_errors.test.js)', async () => {
      mockConnection.query = async () => {
        throw new Error('Foreign key constraint violation')
      }

      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      await expect(user.destroy()).rejects.toThrow('Foreign key constraint violation')
      expect(user.persisted).toBe(true) // Still marked as persisted because delete failed
    })
  })

  describe('reload()', () => {
    it('reloads attributes from database', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Jane Updated', email: 'jane@example.com' }]
      ])

      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true

      const result = await user.reload()

      expect(result).toBe(user)
      expect(user.attributes.name).toBe('Jane Updated')
      expect(user.attributes.email).toBe('jane@example.com')
    })

    it('clears dirty state after reload', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      user.persisted = true
      user.set('name', 'Dirty Change')

      expect(user.isDirty).toBe(true)

      await user.reload()

      expect(user.isDirty).toBe(false)
      expect(user.changedAttributes).toHaveLength(0)
    })

    it('throws error for unpersisted record', async () => {
      const user = new User({ name: 'John', email: 'john@example.com' })

      await expect(user.reload()).rejects.toThrow('Cannot reload unpersisted record')
    })

    it('throws RecordNotFoundError if record no longer exists', async () => {
      mockConnection.setMockResults([[]])

      const user = new User({ id: 999, name: 'John', email: 'john@example.com' })
      user.persisted = true

      await expect(user.reload()).rejects.toThrow(RecordNotFoundError)
    })
  })
})

describe('Model Callbacks', () => {
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

  class CallbackModel extends Model {
    static tableName = 'callback_tests'

    async beforeSave() {
      callbackOrder.push('beforeSave')
    }
    async afterSave() {
      callbackOrder.push('afterSave')
    }
    async beforeCreate() {
      callbackOrder.push('beforeCreate')
    }
    async afterCreate() {
      callbackOrder.push('afterCreate')
    }
    async beforeUpdate() {
      callbackOrder.push('beforeUpdate')
    }
    async afterUpdate() {
      callbackOrder.push('afterUpdate')
    }
    async beforeDestroy() {
      callbackOrder.push('beforeDestroy')
    }
    async afterDestroy() {
      callbackOrder.push('afterDestroy')
    }
  }

  it('runs create callbacks in order', async () => {
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
    mockConnection.setMockResults([[]])

    const model = new CallbackModel({ id: 1, name: 'Test' })
    model.persisted = true

    await model.destroy()

    expect(callbackOrder).toEqual([
      'beforeDestroy',
      'afterDestroy'
    ])
  })
})

describe('Model Validations in Persistence', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  class StrictModel extends Model {
    static tableName = 'strict_models'
    static validations = {
      name: { presence: true },
      count: {
        numericality: {
          greaterThan: 0,
          lessThanOrEqualTo: 100
        }
      },
      status: { inclusion: ['active', 'inactive', 'pending'] },
      code: { length: { is: 6 } }
    }
  }

  it('validates presence before save', async () => {
    const model = new StrictModel({ count: 50, status: 'active', code: '123456' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.name).toContain("can't be blank")
  })

  it('validates numericality before save', async () => {
    const model = new StrictModel({ name: 'Test', count: 150, status: 'active', code: '123456' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.count).toContain('less than or equal to')
  })

  it('validates inclusion before save', async () => {
    const model = new StrictModel({ name: 'Test', count: 50, status: 'invalid', code: '123456' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.status).toContain('not included in the list')
  })

  it('validates length before save', async () => {
    const model = new StrictModel({ name: 'Test', count: 50, status: 'active', code: '123' })
    const result = await model.save()

    expect(result).toBe(false)
    expect(model.errors.code).toContain('exactly 6 characters')
  })

  it('passes all validations', async () => {
    mockConnection.setMockResults([
      [{ id: 1, name: 'Test', count: 50, status: 'active', code: '123456', created_at: new Date(), updated_at: new Date() }]
    ])

    const model = new StrictModel({ name: 'Test', count: 50, status: 'active', code: '123456' })
    const result = await model.save()

    expect(result).toBe(true)
    expect(Object.keys(model.errors)).toHaveLength(0)
  })
})

describe('QueryBuilder Persistence Methods', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('updateAll()', () => {
    it('generates correct UPDATE SQL', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ is_active: true }).updateAll({ role: 'member', updated_at: new Date() })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('UPDATE')
      expect(query.sql).toContain('"users"')
      expect(query.sql).toContain('SET')
      expect(query.sql).toContain('WHERE')
    })

    it('handles multiple conditions', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ is_active: true }).where({ role: 'admin' }).updateAll({ role: 'superadmin' })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('WHERE')
      expect(query.sql).toContain('AND')
    })
  })

  describe('deleteAll()', () => {
    it('generates correct DELETE SQL', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ is_active: false }).deleteAll()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('DELETE FROM')
      expect(query.sql).toContain('"users"')
      expect(query.sql).toContain('WHERE')
    })

    it('deletes all records without conditions', async () => {
      mockConnection.setMockResults([[]])

      await User.query().deleteAll()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('DELETE FROM')
      expect(query.sql).toContain('"users"')
      expect(query.sql).not.toContain('WHERE')
    })
  })
})

describe('Model Attribute Tracking', () => {
  describe('isDirty', () => {
    it('returns false for fresh model', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })
      // Note: constructor doesn't track changes
      expect(user.isDirty).toBe(false)
    })

    it('returns true after set()', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })
      user.set('name', 'Jane')

      expect(user.isDirty).toBe(true)
    })

    it('returns false when setting same value', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })
      user.set('name', 'John')

      expect(user.isDirty).toBe(false)
    })
  })

  describe('changedAttributes', () => {
    it('tracks all changed attribute names', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })
      user.set('name', 'Jane')
      user.set('email', 'jane@example.com')

      expect(user.changedAttributes).toContain('name')
      expect(user.changedAttributes).toContain('email')
    })
  })

  describe('get() and set()', () => {
    it('gets attribute value', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })

      expect(user.get('name')).toBe('John')
      expect(user.get('email')).toBe('john@example.com')
    })

    it('sets attribute value', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })
      user.set('name', 'Jane')

      expect(user.get('name')).toBe('Jane')
    })
  })
})
