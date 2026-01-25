/**
 * Unit tests for Model finder methods
 *
 * Tests Model.find(), Model.findBy(), Model.findAll() and QueryBuilder
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test'
import { Model, RecordNotFoundError } from '../../src/database/model.js'
import { QueryBuilder } from '../../src/database/query_builder.js'
import { Connection, setConnection } from '../../src/database/connection.js'

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
}

// Test model class
class User extends Model {
  static tableName = 'users'
  static primaryKey = 'id'
  static associations = {
    hasMany: ['posts'],
    hasOne: ['profile']
  }
  static validations = {
    name: { presence: true },
    email: { presence: true, format: /^[^@]+@[^@]+$/ }
  }
  static scopes = {
    active: (q) => q.where({ is_active: true }),
    byRole: (q, role) => q.where({ role })
  }
}

class Post extends Model {
  static tableName = 'posts'
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }
}

// Register models for eager loading tests
User.register()
Post.register()

describe('Model Finders', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('Model.find(id)', () => {
    it('finds a record by primary key', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const user = await User.find(1)

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
      expect(user.attributes.name).toBe('John')
      expect(user.attributes.email).toBe('john@example.com')
      expect(user.persisted).toBe(true)
    })

    it('throws RecordNotFoundError when record not found', async () => {
      mockConnection.setMockResults([[]])

      await expect(User.find(999)).rejects.toThrow(RecordNotFoundError)
      await expect(User.find(999)).rejects.toThrow('User with id 999 not found')
    })

    it('works with string ids', async () => {
      mockConnection.setMockResults([
        [{ id: 'uuid-123', name: 'Test' }]
      ])

      const user = await User.find('uuid-123')
      expect(user.id).toBe('uuid-123')
    })
  })

  describe('Model.findById(id)', () => {
    it('returns record when found', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const user = await User.findById(1)
      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
    })

    it('returns null when not found (does not throw)', async () => {
      mockConnection.setMockResults([[]])

      const user = await User.findById(999)
      expect(user).toBeNull()
    })
  })

  describe('Model.findBy(conditions)', () => {
    it('finds a record by single condition', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const user = await User.findBy({ email: 'john@example.com' })

      expect(user).toBeInstanceOf(User)
      expect(user.attributes.email).toBe('john@example.com')
    })

    it('finds a record by multiple conditions', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', role: 'admin', is_active: true }]
      ])

      const user = await User.findBy({ role: 'admin', is_active: true })

      expect(user).toBeInstanceOf(User)
      expect(user.attributes.role).toBe('admin')
    })

    it('returns null when no record matches', async () => {
      mockConnection.setMockResults([[]])

      const user = await User.findBy({ email: 'nonexistent@example.com' })
      expect(user).toBeNull()
    })
  })

  describe('Model.findBy_(conditions)', () => {
    it('returns record when found', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const user = await User.findBy_({ name: 'John' })
      expect(user).toBeInstanceOf(User)
    })

    it('throws RecordNotFoundError when not found', async () => {
      mockConnection.setMockResults([[]])

      await expect(User.findBy_({ name: 'Nobody' })).rejects.toThrow(RecordNotFoundError)
    })
  })

  describe('Model.findAll(options)', () => {
    it('returns all records when no options provided', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
          { id: 3, name: 'Bob' }
        ]
      ])

      const users = await User.findAll()

      expect(users).toHaveLength(3)
      expect(users[0]).toBeInstanceOf(User)
      expect(users[0].attributes.name).toBe('John')
      expect(users[1].attributes.name).toBe('Jane')
      expect(users[2].attributes.name).toBe('Bob')
    })

    it('applies where conditions', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', is_active: true }]
      ])

      const users = await User.findAll({ where: { is_active: true } })

      expect(users).toHaveLength(1)
      expect(mockConnection.queries[0].sql).toContain('WHERE')
    })

    it('applies order clause', async () => {
      mockConnection.setMockResults([
        [
          { id: 3, name: 'Bob' },
          { id: 2, name: 'Jane' },
          { id: 1, name: 'John' }
        ]
      ])

      await User.findAll({ order: { name: 'desc' } })

      expect(mockConnection.queries[0].sql).toContain('ORDER BY')
    })

    it('applies limit and offset', async () => {
      mockConnection.setMockResults([
        [{ id: 2, name: 'Jane' }]
      ])

      await User.findAll({ limit: 1, offset: 1 })

      expect(mockConnection.queries[0].sql).toContain('LIMIT')
      expect(mockConnection.queries[0].sql).toContain('OFFSET')
    })

    it('returns empty array when no records match', async () => {
      mockConnection.setMockResults([[]])

      const users = await User.findAll({ where: { name: 'Nobody' } })
      expect(users).toEqual([])
    })
  })

  describe('Model.first()', () => {
    it('returns the first record', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const user = await User.first()

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
      expect(mockConnection.queries[0].sql).toContain('LIMIT 1')
    })

    it('returns null when no records exist', async () => {
      mockConnection.setMockResults([[]])

      const user = await User.first()
      expect(user).toBeNull()
    })
  })

  describe('Model.last()', () => {
    it('returns the last record', async () => {
      mockConnection.setMockResults([
        [{ id: 3, name: 'Bob' }]
      ])

      const user = await User.last()

      expect(user).toBeInstanceOf(User)
      expect(mockConnection.queries[0].sql).toContain('DESC')
    })
  })

  describe('Model.count()', () => {
    it('returns count of records', async () => {
      mockConnection.setMockResults([
        [{ count: '5' }]
      ])

      const count = await User.count()
      expect(count).toBe(5)
    })
  })

  describe('Model.exists()', () => {
    it('returns true when records exist', async () => {
      mockConnection.setMockResults([
        [{ count: '1' }]
      ])

      const exists = await User.exists({ name: 'John' })
      expect(exists).toBe(true)
    })

    it('returns false when no records exist', async () => {
      mockConnection.setMockResults([
        [{ count: '0' }]
      ])

      const exists = await User.exists({ name: 'Nobody' })
      expect(exists).toBe(false)
    })
  })
})

describe('QueryBuilder', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('where()', () => {
    it('builds simple equality conditions', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ name: 'John' }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('WHERE')
      expect(query.params).toContain('John')
    })

    it('handles null values with IS NULL', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ deleted_at: null }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('IS NULL')
    })

    it('handles array values with IN', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ role: ['admin', 'moderator'] }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('IN')
      expect(query.params).toContain('admin')
      expect(query.params).toContain('moderator')
    })

    it('handles comparison operators', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ age: { '>': 18 } }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('>')
      expect(query.params).toContain(18)
    })

    it('handles LIKE operator', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ name: { like: '%John%' } }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('LIKE')
    })

    it('chains multiple where calls', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ is_active: true }).where({ role: 'admin' }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('AND')
    })
  })

  describe('whereNot()', () => {
    it('builds NOT conditions', async () => {
      mockConnection.setMockResults([[]])

      await User.where({ is_active: true }).whereNot({ role: 'banned' }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('!=')
    })

    it('handles null with IS NOT NULL', async () => {
      mockConnection.setMockResults([[]])

      const qb = new QueryBuilder(User)
      await qb.whereNot({ deleted_at: null }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('IS NOT NULL')
    })
  })

  describe('order()', () => {
    it('orders by single column ascending', async () => {
      mockConnection.setMockResults([[]])

      await User.order('name').all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('ORDER BY')
      expect(query.sql).toContain('ASC')
    })

    it('orders by single column descending', async () => {
      mockConnection.setMockResults([[]])

      await User.order({ created_at: 'desc' }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('DESC')
    })

    it('orders by multiple columns', async () => {
      mockConnection.setMockResults([[]])

      await User.order({ role: 'asc', name: 'desc' }).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('ORDER BY')
    })
  })

  describe('limit() and offset()', () => {
    it('applies limit', async () => {
      mockConnection.setMockResults([[]])

      await User.limit(10).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('LIMIT 10')
    })

    it('applies offset', async () => {
      mockConnection.setMockResults([[]])

      await User.offset(20).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('OFFSET 20')
    })

    it('chains limit and offset', async () => {
      mockConnection.setMockResults([[]])

      await User.limit(10).offset(20).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('LIMIT 10')
      expect(query.sql).toContain('OFFSET 20')
    })
  })

  describe('select()', () => {
    it('selects specific columns', async () => {
      mockConnection.setMockResults([[]])

      await User.select('id', 'name').all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('"id"')
      expect(query.sql).toContain('"name"')
      expect(query.sql).not.toContain('*')
    })
  })

  describe('distinct()', () => {
    it('adds DISTINCT to query', async () => {
      mockConnection.setMockResults([[]])

      const qb = new QueryBuilder(User)
      await qb.distinct().all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('DISTINCT')
    })
  })

  describe('page() and per()', () => {
    it('paginates results with per() after page()', async () => {
      mockConnection.setMockResults([[]])

      // page(2) with default per page (25) = offset 25
      // then per(10) sets limit to 10
      await User.query().page(2).per(10).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('LIMIT 10')
      // page(2) with default perPage of 25 = offset 25
      expect(query.sql).toContain('OFFSET 25')
    })

    it('paginates with per() setting page size', async () => {
      mockConnection.setMockResults([[]])

      // Setting per first, then page uses that per value
      const qb = User.query()
      qb._perPage = 10  // Set per page value
      await qb.page(2).all()

      const query = mockConnection.queries[0]
      expect(query.sql).toContain('LIMIT 10')
      expect(query.sql).toContain('OFFSET 10')
    })
  })

  describe('toSQL()', () => {
    it('generates SQL without executing', () => {
      const { sql, params } = User.where({ name: 'John' }).limit(5).toSQL()

      expect(sql).toContain('SELECT')
      expect(sql).toContain('FROM')
      expect(sql).toContain('users')
      expect(sql).toContain('WHERE')
      expect(sql).toContain('LIMIT')
      expect(params).toContain('John')
    })
  })
})

describe('Model Scopes', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('applies defined scopes', async () => {
    mockConnection.setMockResults([[]])

    await User.scope('active').all()

    const query = mockConnection.queries[0]
    expect(query.sql).toContain('is_active')
  })

  it('applies scopes with arguments', async () => {
    mockConnection.setMockResults([[]])

    await User.scope('byRole', 'admin').all()

    const query = mockConnection.queries[0]
    expect(query.params).toContain('admin')
  })

  it('throws error for unknown scope', () => {
    expect(() => User.scope('nonexistent')).toThrow('Unknown scope: nonexistent')
  })
})

describe('Model Validations', () => {
  it('validates presence', () => {
    const user = new User({ email: 'test@example.com' })
    expect(user.isValid()).toBe(false)
    expect(user.errors.name).toContain("can't be blank")
  })

  it('validates format', () => {
    const user = new User({ name: 'John', email: 'invalid-email' })
    expect(user.isValid()).toBe(false)
    expect(user.errors.email).toContain('invalid')
  })

  it('passes validation with valid data', () => {
    const user = new User({ name: 'John', email: 'john@example.com' })
    expect(user.isValid()).toBe(true)
    expect(Object.keys(user.errors)).toHaveLength(0)
  })
})

describe('Model Instance Methods', () => {
  describe('get() and set()', () => {
    it('gets attribute values', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })
      expect(user.get('name')).toBe('John')
      expect(user.get('email')).toBe('john@example.com')
    })

    it('sets attribute values and tracks changes', () => {
      const user = new User({ name: 'John' })
      user.set('name', 'Jane')

      expect(user.get('name')).toBe('Jane')
      expect(user.isDirty).toBe(true)
      expect(user.changedAttributes).toContain('name')
    })

    it('does not track unchanged values', () => {
      const user = new User({ name: 'John' })
      user.set('name', 'John')

      expect(user.isDirty).toBe(false)
    })
  })

  describe('isNew', () => {
    it('returns true for new records', () => {
      const user = new User({ name: 'John' })
      expect(user.isNew).toBe(true)
    })

    it('returns false for persisted records', () => {
      const user = new User({ id: 1, name: 'John' })
      user.persisted = true
      expect(user.isNew).toBe(false)
    })
  })

  describe('toJSON()', () => {
    it('returns plain object', () => {
      const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
      const json = user.toJSON()

      expect(json).toEqual({ id: 1, name: 'John', email: 'john@example.com' })
      expect(json).not.toBeInstanceOf(User)
    })
  })
})

describe('RecordNotFoundError', () => {
  it('includes model name and id in message', () => {
    const error = new RecordNotFoundError('User', 123)

    expect(error.message).toBe('User with id 123 not found')
    expect(error.model).toBe('User')
    expect(error.id).toBe(123)
    expect(error.name).toBe('RecordNotFoundError')
  })

  it('works without id', () => {
    const error = new RecordNotFoundError('User')

    expect(error.message).toBe('User record not found')
  })
})

describe('QueryBuilder Immutability', () => {
  it('returns new QueryBuilder on each chain method', () => {
    const q1 = User.query()
    const q2 = q1.where({ name: 'John' })
    const q3 = q2.limit(10)

    expect(q1).not.toBe(q2)
    expect(q2).not.toBe(q3)
    expect(q1.conditions).toHaveLength(0)
    expect(q2.conditions).toHaveLength(1)
    expect(q2.limitValue).toBeNull()
    expect(q3.limitValue).toBe(10)
  })
})

describe('Model.getTableName()', () => {
  it('uses explicit tableName if set', () => {
    expect(User.getTableName()).toBe('users')
  })

  it('infers table name from class name', () => {
    class BlogPost extends Model {}
    expect(BlogPost.getTableName()).toBe('blog_posts')
  })
})
