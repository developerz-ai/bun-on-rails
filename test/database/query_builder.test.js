/**
 * Query Builder Tests
 *
 * Tests for the chainable QueryBuilder class that provides
 * a fluent interface for building SQL queries.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { QueryBuilder, RecordNotFoundError, PaginatedResult } from '../../src/database/query_builder.js'
import { setConnection } from '../../src/database/connection.js'

// Mock model class for testing
class User {
  static tableName = 'users'
  static primaryKey = 'id'
  static associations = {
    hasMany: ['posts'],
    hasOne: ['profile'],
    belongsTo: []
  }

  constructor(attributes = {}) {
    this.attributes = attributes
    this.persisted = false
    this._originalAttributes = {}
  }
}

class Post {
  static tableName = 'posts'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }

  constructor(attributes = {}) {
    this.attributes = attributes
    this.persisted = false
    this._originalAttributes = {}
  }
}

// Mock connection for testing
const mockConnection = {
  connected: true,
  query: mock(async (sql, params) => {
    // Return mock data based on query
    // Like postgres.js and Bun.sql: the result carries the affected-row count.
    return Object.assign([], { count: 0 })
  })
}

describe('QueryBuilder', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
    setConnection(mockConnection)
    mockConnection.query.mockReset()
  })

  afterEach(() => {
    setConnection(null)
  })

  // ============================================
  // Constructor and Basic Setup
  // ============================================
  describe('constructor', () => {
    test('initializes with default values', () => {
      expect(builder.model).toBe(User)
      expect(builder.conditions).toEqual([])
      expect(builder.includesList).toEqual([])
      expect(builder.orders).toEqual([])
      expect(builder.limitValue).toBeNull()
      expect(builder.offsetValue).toBeNull()
      expect(builder.selectColumns).toEqual(['*'])
      expect(builder.groupColumns).toEqual([])
      expect(builder.havingConditions).toEqual([])
      expect(builder.joinClauses).toEqual([])
      expect(builder.distinctValue).toBe(false)
      expect(builder.lockMode).toBeNull()
    })
  })

  // ============================================
  // WHERE clause tests
  // ============================================
  describe('where()', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.where({ name: 'John' })
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('adds simple equality condition', () => {
      const result = builder.where({ name: 'John' })
      expect(result.conditions).toHaveLength(1)
      expect(result.conditions[0]).toEqual({
        column: 'name',
        operator: '=',
        value: 'John'
      })
    })

    test('chains multiple where calls', () => {
      const result = builder
        .where({ name: 'John' })
        .where({ active: true })

      expect(result.conditions).toHaveLength(2)
      expect(result.conditions[0].column).toBe('name')
      expect(result.conditions[1].column).toBe('active')
    })

    test('handles multiple conditions in one call', () => {
      const result = builder.where({ name: 'John', active: true })
      expect(result.conditions).toHaveLength(2)
    })

    test('handles null value with IS NULL', () => {
      const result = builder.where({ deleted_at: null })
      expect(result.conditions[0]).toEqual({
        column: 'deleted_at',
        operator: 'IS NULL',
        value: null
      })
    })

    test('handles array value with IN operator', () => {
      const result = builder.where({ status: ['active', 'pending'] })
      expect(result.conditions[0]).toEqual({
        column: 'status',
        operator: 'IN',
        value: ['active', 'pending']
      })
    })

    test('handles comparison operators', () => {
      const result = builder.where({ age: { '>': 18 } })
      expect(result.conditions[0]).toEqual({
        column: 'age',
        operator: '>',
        value: 18
      })
    })

    test('handles multiple operators', () => {
      const result = builder.where({ age: { '>=': 18, '<=': 65 } })
      expect(result.conditions).toHaveLength(2)
      expect(result.conditions[0]).toEqual({
        column: 'age',
        operator: '>=',
        value: 18
      })
      expect(result.conditions[1]).toEqual({
        column: 'age',
        operator: '<=',
        value: 65
      })
    })

    test('handles LIKE operator', () => {
      const result = builder.where({ name: { like: 'John%' } })
      expect(result.conditions[0]).toEqual({
        column: 'name',
        operator: 'LIKE',
        value: 'John%'
      })
    })

    test('handles raw SQL string', () => {
      const result = builder.where('created_at > NOW() - INTERVAL 1 DAY')
      expect(result.conditions[0]).toEqual({
        raw: 'created_at > NOW() - INTERVAL 1 DAY',
        values: []
      })
    })

    test('handles raw SQL with values', () => {
      const result = builder.where('age > $1', 18)
      expect(result.conditions[0]).toEqual({
        raw: 'age > $1',
        values: [18]
      })
    })

    test('handles Date objects', () => {
      const date = new Date('2024-01-01')
      const result = builder.where({ created_at: date })
      expect(result.conditions[0]).toEqual({
        column: 'created_at',
        operator: '=',
        value: date
      })
    })

    test('does not modify original builder', () => {
      const original = builder.where({ name: 'John' })
      original.where({ active: true })

      expect(builder.conditions).toHaveLength(0)
      expect(original.conditions).toHaveLength(1)
    })
  })

  describe('whereNot()', () => {
    test('adds NOT condition', () => {
      const result = builder.whereNot({ status: 'deleted' })
      expect(result.conditions[0]).toEqual({
        column: 'status',
        operator: '!=',
        value: 'deleted'
      })
    })

    test('handles null with IS NOT NULL', () => {
      const result = builder.whereNot({ deleted_at: null })
      expect(result.conditions[0]).toEqual({
        column: 'deleted_at',
        operator: 'IS NOT NULL',
        value: null
      })
    })

    test('handles array with NOT IN', () => {
      const result = builder.whereNot({ status: ['deleted', 'archived'] })
      expect(result.conditions[0]).toEqual({
        column: 'status',
        operator: 'NOT IN',
        value: ['deleted', 'archived']
      })
    })
  })

  describe('orWhere()', () => {
    test('adds OR condition', () => {
      const result = builder
        .where({ status: 'active' })
        .orWhere({ status: 'pending' })

      expect(result.conditions).toHaveLength(2)
      expect(result.conditions[1].or).toBe(true)
    })
  })

  // ============================================
  // ORDER BY clause tests
  // ============================================
  describe('order()', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.order('created_at')
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('handles string column name (defaults to ASC)', () => {
      const result = builder.order('created_at')
      expect(result.orders).toHaveLength(1)
      expect(result.orders[0]).toEqual({
        column: 'created_at',
        direction: 'ASC'
      })
    })

    test('handles object with direction', () => {
      const result = builder.order({ created_at: 'desc' })
      expect(result.orders[0]).toEqual({
        column: 'created_at',
        direction: 'DESC'
      })
    })

    test('handles multiple columns', () => {
      const result = builder.order({ name: 'asc', created_at: 'desc' })
      expect(result.orders).toHaveLength(2)
      expect(result.orders[0]).toEqual({ column: 'name', direction: 'ASC' })
      expect(result.orders[1]).toEqual({ column: 'created_at', direction: 'DESC' })
    })

    test('chains multiple order calls', () => {
      const result = builder
        .order({ name: 'asc' })
        .order({ id: 'desc' })

      expect(result.orders).toHaveLength(2)
    })

    test('normalizes direction to uppercase', () => {
      const result = builder.order({ created_at: 'DESC' })
      expect(result.orders[0].direction).toBe('DESC')
    })
  })

  // ============================================
  // LIMIT clause tests
  // ============================================
  describe('limit()', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.limit(10)
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('sets limit value', () => {
      const result = builder.limit(10)
      expect(result.limitValue).toBe(10)
    })

    test('overrides previous limit', () => {
      const result = builder.limit(10).limit(5)
      expect(result.limitValue).toBe(5)
    })

    test('handles zero limit', () => {
      const result = builder.limit(0)
      expect(result.limitValue).toBe(0)
    })
  })

  // ============================================
  // OFFSET clause tests
  // ============================================
  describe('offset()', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.offset(20)
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('sets offset value', () => {
      const result = builder.offset(20)
      expect(result.offsetValue).toBe(20)
    })

    test('overrides previous offset', () => {
      const result = builder.offset(20).offset(40)
      expect(result.offsetValue).toBe(40)
    })

    test('handles zero offset', () => {
      const result = builder.offset(0)
      expect(result.offsetValue).toBe(0)
    })
  })

  // ============================================
  // INCLUDES (eager loading) tests
  // ============================================
  describe('includes()', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.includes('posts')
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('adds single association', () => {
      const result = builder.includes('posts')
      expect(result.includesList).toEqual(['posts'])
    })

    test('adds multiple associations', () => {
      const result = builder.includes('posts', 'profile')
      expect(result.includesList).toEqual(['posts', 'profile'])
    })

    test('chains multiple includes calls', () => {
      const result = builder
        .includes('posts')
        .includes('profile')

      expect(result.includesList).toEqual(['posts', 'profile'])
    })

    test('handles nested associations', () => {
      const postBuilder = new QueryBuilder(Post)
      const result = postBuilder.includes('comments.author')
      expect(result.includesList).toEqual(['comments.author'])
    })
  })

  // ============================================
  // SELECT clause tests
  // ============================================
  describe('select()', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.select('id', 'name')
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('sets select columns', () => {
      const result = builder.select('id', 'name', 'email')
      expect(result.selectColumns).toEqual(['id', 'name', 'email'])
    })

    test('overrides default * selector', () => {
      const result = builder.select('id')
      expect(result.selectColumns).toEqual(['id'])
    })

    test('handles single column', () => {
      const result = builder.select('id')
      expect(result.selectColumns).toEqual(['id'])
    })
  })

  // ============================================
  // JOIN clause tests
  // ============================================
  describe('join() / joins', () => {
    test('returns a new QueryBuilder instance', () => {
      const result = builder.join('posts', 'posts.user_id = users.id')
      expect(result).toBeInstanceOf(QueryBuilder)
      expect(result).not.toBe(builder)
    })

    test('adds INNER JOIN by default', () => {
      const result = builder.join('posts', 'posts.user_id = users.id')
      expect(result.joinClauses).toHaveLength(1)
      expect(result.joinClauses[0]).toEqual({
        table: 'posts',
        on: 'posts.user_id = users.id',
        type: 'INNER'
      })
    })

    test('adds LEFT JOIN', () => {
      const result = builder.leftJoin('posts', 'posts.user_id = users.id')
      expect(result.joinClauses[0].type).toBe('LEFT')
    })

    test('adds custom join type', () => {
      const result = builder.join('posts', 'posts.user_id = users.id', 'RIGHT')
      expect(result.joinClauses[0].type).toBe('RIGHT')
    })

    test('chains multiple joins', () => {
      const result = builder
        .join('posts', 'posts.user_id = users.id')
        .join('comments', 'comments.post_id = posts.id')

      expect(result.joinClauses).toHaveLength(2)
    })
  })

  // ============================================
  // GROUP BY clause tests
  // ============================================
  describe('group()', () => {
    test('adds group by columns', () => {
      const result = builder.group('status')
      expect(result.groupColumns).toEqual(['status'])
    })

    test('adds multiple group columns', () => {
      const result = builder.group('status', 'role')
      expect(result.groupColumns).toEqual(['status', 'role'])
    })

    test('chains group calls', () => {
      const result = builder.group('status').group('role')
      expect(result.groupColumns).toEqual(['status', 'role'])
    })
  })

  // ============================================
  // HAVING clause tests
  // ============================================
  describe('having()', () => {
    test('adds having condition', () => {
      const result = builder.having({ count: 5 })
      expect(result.havingConditions).toHaveLength(1)
      expect(result.havingConditions[0]).toEqual({
        column: 'count',
        operator: '=',
        value: 5
      })
    })

    test('handles raw SQL', () => {
      const result = builder.having('COUNT(*) > 5')
      expect(result.havingConditions[0]).toEqual({
        raw: 'COUNT(*) > 5'
      })
    })
  })

  // ============================================
  // DISTINCT tests
  // ============================================
  describe('distinct()', () => {
    test('sets distinct flag', () => {
      const result = builder.distinct()
      expect(result.distinctValue).toBe(true)
    })
  })

  // ============================================
  // LOCK tests
  // ============================================
  describe('lock()', () => {
    test('sets lock mode', () => {
      const result = builder.lock('UPDATE')
      expect(result.lockMode).toBe('UPDATE')
    })

    test('defaults to UPDATE', () => {
      const result = builder.lock()
      expect(result.lockMode).toBe('UPDATE')
    })
  })

  // ============================================
  // Pagination tests
  // ============================================
  describe('page() and per()', () => {
    test('calculates correct offset for page', () => {
      const result = builder.per(10).page(3)
      expect(result.offsetValue).toBe(20) // (3-1) * 10
      expect(result.limitValue).toBe(10)
    })

    test('uses default 25 per page', () => {
      const result = builder.page(2)
      expect(result.offsetValue).toBe(25) // (2-1) * 25
      expect(result.limitValue).toBe(25)
    })

    test('per() sets limit', () => {
      const result = builder.per(50)
      expect(result.limitValue).toBe(50)
    })

    test('page() tracks current page number', () => {
      const result = builder.page(3)
      expect(result._currentPage).toBe(3)
    })

    test('per() after page() recalculates offset', () => {
      // First set page with default per (25), then change per
      const result = builder.page(3).per(10)
      expect(result.offsetValue).toBe(20) // (3-1) * 10
      expect(result.limitValue).toBe(10)
    })

    test('chaining preserves pagination state', () => {
      const result = builder.per(10).page(2).where({ active: true })
      expect(result._perPage).toBe(10)
      expect(result._currentPage).toBe(2)
      expect(result.offsetValue).toBe(10)
      expect(result.limitValue).toBe(10)
    })
  })

  // ============================================
  // Paginate method tests
  // ============================================
  describe('paginate()', () => {
    test('returns PaginatedResult with correct metadata', async () => {
      // Mock count query returns 100 total
      let callCount = 0
      mockConnection.query.mockImplementation(async (sql) => {
        callCount++
        if (sql.includes('COUNT')) {
          return [{ count: '100' }]
        }
        // Return 10 mock records for page
        return Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }))
      })

      const result = await builder.page(1).per(10).paginate()

      expect(result.currentPage).toBe(1)
      expect(result.perPage).toBe(10)
      expect(result.totalCount).toBe(100)
      expect(result.totalPages).toBe(10)
      expect(result.hasNextPage).toBe(true)
      expect(result.hasPreviousPage).toBe(false)
      expect(result.records).toHaveLength(10)
    })

    test('uses default values when not specified', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '50' }]
        }
        return Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }))
      })

      const result = await builder.paginate()

      expect(result.currentPage).toBe(1)
      expect(result.perPage).toBe(25)
      expect(result.totalCount).toBe(50)
      expect(result.totalPages).toBe(2)
    })

    test('calculates correct totalPages', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '27' }]
        }
        return []
      })

      const result = await builder.per(10).page(1).paginate()

      expect(result.totalPages).toBe(3) // ceil(27/10)
    })

    test('returns 0 totalPages for empty results', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '0' }]
        }
        return []
      })

      const result = await builder.page(1).per(10).paginate()

      expect(result.totalCount).toBe(0)
      expect(result.totalPages).toBe(0)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPreviousPage).toBe(false)
    })

    test('hasNextPage is false on last page', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '30' }]
        }
        return Array.from({ length: 10 }, (_, i) => ({ id: i + 21 }))
      })

      const result = await builder.page(3).per(10).paginate()

      expect(result.hasNextPage).toBe(false)
      expect(result.lastPage).toBe(true)
    })

    test('hasPreviousPage is true on pages after first', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '50' }]
        }
        return Array.from({ length: 10 }, (_, i) => ({ id: i + 11 }))
      })

      const result = await builder.page(2).per(10).paginate()

      expect(result.hasPreviousPage).toBe(true)
      expect(result.previousPage).toBe(1)
      expect(result.firstPage).toBe(false)
    })

    test('nextPage returns correct page number', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '100' }]
        }
        return []
      })

      const result = await builder.page(3).per(10).paginate()

      expect(result.nextPage).toBe(4)
      expect(result.previousPage).toBe(2)
    })

    test('offset is calculated correctly', async () => {
      mockConnection.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT')) {
          return [{ count: '100' }]
        }
        return []
      })

      const result = await builder.page(3).per(10).paginate()

      expect(result.offset).toBe(20) // (3-1) * 10
    })
  })

  // ============================================
  // SQL Generation tests
  // ============================================
  describe('toSQL()', () => {
    test('generates simple SELECT', () => {
      const { sql, params } = builder.toSQL()
      expect(sql).toContain('SELECT')
      expect(sql).toContain('FROM')
      expect(sql).toContain('"users"')
      expect(params).toEqual([])
    })

    test('generates SELECT with where clause', () => {
      const { sql, params } = builder.where({ name: 'John' }).toSQL()
      expect(sql).toContain('WHERE')
      expect(sql).toContain('"name"')
      expect(sql).toContain('$1')
      expect(params).toEqual(['John'])
    })

    test('generates SELECT with order by', () => {
      const { sql } = builder.order({ created_at: 'desc' }).toSQL()
      expect(sql).toContain('ORDER BY')
      expect(sql).toContain('"created_at"')
      expect(sql).toContain('DESC')
    })

    test('generates SELECT with limit and offset', () => {
      const { sql } = builder.limit(10).offset(20).toSQL()
      expect(sql).toContain('LIMIT 10')
      expect(sql).toContain('OFFSET 20')
    })

    test('generates SELECT with joins', () => {
      const { sql } = builder
        .join('posts', 'posts.user_id = users.id')
        .toSQL()

      expect(sql).toContain('INNER JOIN')
      expect(sql).toContain('"posts"')
      expect(sql).toContain('posts.user_id = users.id')
    })

    test('generates SELECT with distinct', () => {
      const { sql } = builder.distinct().toSQL()
      expect(sql).toContain('SELECT DISTINCT')
    })

    test('generates SELECT with lock', () => {
      const { sql } = builder.lock('UPDATE').toSQL()
      expect(sql).toContain('FOR UPDATE')
    })

    test('generates SELECT with specific columns', () => {
      const { sql } = builder.select('id', 'name').toSQL()
      expect(sql).toContain('"id"')
      expect(sql).toContain('"name"')
      expect(sql).not.toContain('*')
    })

    test('generates SELECT with group by', () => {
      const { sql } = builder
        .select('status')
        .group('status')
        .toSQL()

      expect(sql).toContain('GROUP BY')
      expect(sql).toContain('"status"')
    })

    test('generates SELECT with IN clause', () => {
      const { sql, params } = builder
        .where({ status: ['active', 'pending'] })
        .toSQL()

      expect(sql).toContain('IN')
      expect(sql).toContain('$1')
      expect(sql).toContain('$2')
      expect(params).toEqual(['active', 'pending'])
    })

    test('generates SELECT with IS NULL', () => {
      const { sql, params } = builder
        .where({ deleted_at: null })
        .toSQL()

      expect(sql).toContain('IS NULL')
      expect(params).toEqual([])
    })
  })

  describe('toSQLString()', () => {
    test('returns interpolated SQL string', () => {
      const sql = builder.where({ name: 'John' }).toSQLString()
      expect(sql).toContain("'John'")
      expect(sql).not.toContain('$1')
    })
  })

  // ============================================
  // Complex query chain tests
  // ============================================
  describe('complex query chains', () => {
    test('builds complex query with multiple clauses', () => {
      const query = builder
        .select('id', 'name', 'email')
        .where({ active: true })
        .where({ role: 'admin' })
        .whereNot({ status: 'deleted' })
        .order({ created_at: 'desc' })
        .limit(10)
        .offset(20)

      const { sql, params } = query.toSQL()

      expect(sql).toContain('SELECT')
      expect(sql).toContain('"id"')
      expect(sql).toContain('WHERE')
      expect(sql).toContain('ORDER BY')
      expect(sql).toContain('LIMIT 10')
      expect(sql).toContain('OFFSET 20')
      expect(params).toHaveLength(3) // active, role, status (whereNot)
    })

    test('preserves immutability in chain', () => {
      const query1 = builder.where({ name: 'John' })
      const query2 = query1.where({ active: true })
      const query3 = query1.limit(5)

      expect(query1.conditions).toHaveLength(1)
      expect(query2.conditions).toHaveLength(2)
      expect(query3.conditions).toHaveLength(1)
      expect(query3.limitValue).toBe(5)
    })
  })
})

// ============================================
// RecordNotFoundError tests
// ============================================
describe('RecordNotFoundError', () => {
  test('creates error with model and id', () => {
    const error = new RecordNotFoundError('User', 42)
    expect(error.message).toBe('User with id 42 not found')
    expect(error.model).toBe('User')
    expect(error.id).toBe(42)
    expect(error.name).toBe('RecordNotFoundError')
  })

  test('creates error with model only', () => {
    const error = new RecordNotFoundError('User')
    expect(error.message).toBe('User record not found')
    expect(error.model).toBe('User')
    expect(error.id).toBeUndefined()
  })

  test('is an instance of Error', () => {
    const error = new RecordNotFoundError('User', 1)
    expect(error).toBeInstanceOf(Error)
  })
})

// ============================================
// Execution tests (with mock connection)
// ============================================
describe('Query Execution', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
    setConnection(mockConnection)
    mockConnection.query.mockReset()
    mockConnection.query.mockImplementation(async () => [])
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('all()', () => {
    test('executes query and returns records', async () => {
      mockConnection.query.mockImplementation(async () => [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ])

      const results = await builder.all()

      expect(mockConnection.query).toHaveBeenCalledTimes(1)
      expect(results).toHaveLength(2)
      expect(results[0]).toBeInstanceOf(User)
      expect(results[0].attributes).toEqual({ id: 1, name: 'John' })
      expect(results[0].persisted).toBe(true)
    })

    test('returns empty array when no records', async () => {
      mockConnection.query.mockImplementation(async () => [])

      const results = await builder.all()

      expect(results).toEqual([])
    })

    test('throws when not connected', async () => {
      setConnection({ connected: false })

      await expect(builder.all()).rejects.toThrow('Database connection not established')
    })
  })

  describe('first()', () => {
    test('returns first record', async () => {
      mockConnection.query.mockImplementation(async () => [
        { id: 1, name: 'John' }
      ])

      const result = await builder.first()

      expect(result).toBeInstanceOf(User)
      expect(result.attributes.name).toBe('John')
    })

    test('returns null when no records', async () => {
      mockConnection.query.mockImplementation(async () => [])

      const result = await builder.first()

      expect(result).toBeNull()
    })

    test('adds LIMIT 1', async () => {
      mockConnection.query.mockImplementation(async () => [])

      await builder.first()

      const call = mockConnection.query.mock.calls[0][0]
      expect(call).toContain('LIMIT 1')
    })
  })

  describe('first_()', () => {
    test('returns record when found', async () => {
      mockConnection.query.mockImplementation(async () => [
        { id: 1, name: 'John' }
      ])

      const result = await builder.first_()

      expect(result).toBeInstanceOf(User)
    })

    test('throws RecordNotFoundError when not found', async () => {
      mockConnection.query.mockImplementation(async () => [])

      await expect(builder.first_()).rejects.toThrow(RecordNotFoundError)
    })
  })

  describe('last()', () => {
    test('returns last record', async () => {
      mockConnection.query.mockImplementation(async () => [
        { id: 10, name: 'Last' }
      ])

      const result = await builder.last()

      expect(result).toBeInstanceOf(User)
    })

    test('reverses order for DESC', async () => {
      mockConnection.query.mockImplementation(async () => [])

      await builder.last()

      const call = mockConnection.query.mock.calls[0][0]
      expect(call).toContain('ORDER BY')
      expect(call).toContain('DESC')
    })

    test('returns null when no records', async () => {
      mockConnection.query.mockImplementation(async () => [])

      const result = await builder.last()

      expect(result).toBeNull()
    })
  })

  describe('count()', () => {
    test('returns count', async () => {
      mockConnection.query.mockImplementation(async () => [{ count: '42' }])

      const result = await builder.count()

      expect(result).toBe(42)
    })

    test('returns 0 when empty', async () => {
      mockConnection.query.mockImplementation(async () => [{ count: '0' }])

      const result = await builder.count()

      expect(result).toBe(0)
    })
  })

  describe('exists()', () => {
    test('returns true when records exist', async () => {
      mockConnection.query.mockImplementation(async () => [{ count: '1' }])

      const result = await builder.exists()

      expect(result).toBe(true)
    })

    test('returns false when no records', async () => {
      mockConnection.query.mockImplementation(async () => [{ count: '0' }])

      const result = await builder.exists()

      expect(result).toBe(false)
    })
  })

  describe('sum()', () => {
    test('returns sum of column', async () => {
      mockConnection.query.mockImplementation(async () => [{ sum: '100.50' }])

      const result = await builder.sum('price')

      expect(result).toBe(100.5)
    })

    test('returns 0 when no records', async () => {
      mockConnection.query.mockImplementation(async () => [{ sum: null }])

      const result = await builder.sum('price')

      expect(result).toBe(0)
    })
  })

  describe('average()', () => {
    test('returns average of column', async () => {
      mockConnection.query.mockImplementation(async () => [{ avg: '50.5' }])

      const result = await builder.average('score')

      expect(result).toBe(50.5)
    })
  })

  describe('minimum()', () => {
    test('returns minimum value', async () => {
      mockConnection.query.mockImplementation(async () => [{ min: 10 }])

      const result = await builder.minimum('age')

      expect(result).toBe(10)
    })
  })

  describe('maximum()', () => {
    test('returns maximum value', async () => {
      mockConnection.query.mockImplementation(async () => [{ max: 100 }])

      const result = await builder.maximum('age')

      expect(result).toBe(100)
    })
  })

  describe('pluck()', () => {
    test('returns array of column values', async () => {
      mockConnection.query.mockImplementation(async () => [
        { name: 'John' },
        { name: 'Jane' }
      ])

      const result = await builder.pluck('name')

      expect(result).toEqual(['John', 'Jane'])
    })
  })

  describe('ids()', () => {
    test('returns array of primary key values', async () => {
      mockConnection.query.mockImplementation(async () => [
        { id: 1 },
        { id: 2 },
        { id: 3 }
      ])

      const result = await builder.ids()

      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('deleteAll()', () => {
    test('executes DELETE query', async () => {
      mockConnection.query.mockImplementation(async () => Object.assign([], { count: 0 }))

      await builder.where({ status: 'deleted' }).deleteAll()

      const call = mockConnection.query.mock.calls[0][0]
      expect(call).toContain('DELETE FROM')
      expect(call).toContain('"users"')
      expect(call).toContain('WHERE')
    })
  })

  describe('updateAll()', () => {
    test('executes UPDATE query', async () => {
      mockConnection.query.mockImplementation(async () => Object.assign([], { count: 0 }))

      await builder.where({ status: 'pending' }).updateAll({ status: 'active' })

      const call = mockConnection.query.mock.calls[0][0]
      expect(call).toContain('UPDATE')
      expect(call).toContain('"users"')
      expect(call).toContain('SET')
      expect(call).toContain('WHERE')
    })
  })
})

// ============================================
// Additional JOIN tests
// ============================================
describe('Additional JOIN methods', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
  })

  test('rightJoin() adds RIGHT JOIN', () => {
    const result = builder.rightJoin('posts', 'posts.user_id = users.id')
    expect(result.joinClauses[0].type).toBe('RIGHT')
  })

  test('fullJoin() adds FULL JOIN', () => {
    const result = builder.fullJoin('posts', 'posts.user_id = users.id')
    expect(result.joinClauses[0].type).toBe('FULL')
  })
})

// ============================================
// Reorder tests
// ============================================
describe('reorder()', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
  })

  test('clears existing orders and applies new one', () => {
    const result = builder
      .order({ name: 'asc' })
      .reorder({ created_at: 'desc' })

    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]).toEqual({ column: 'created_at', direction: 'DESC' })
  })

  test('handles string argument', () => {
    const result = builder
      .order({ name: 'desc' })
      .reorder('id')

    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]).toEqual({ column: 'id', direction: 'ASC' })
  })
})

// ============================================
// Unscoped tests
// ============================================
describe('unscoped()', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
  })

  test('returns fresh query builder', () => {
    const result = builder
      .where({ active: true })
      .order({ name: 'asc' })
      .limit(10)
      .unscoped()

    expect(result.conditions).toHaveLength(0)
    expect(result.orders).toHaveLength(0)
    expect(result.limitValue).toBeNull()
  })
})

// ============================================
// None tests
// ============================================
describe('none()', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
  })

  test('returns a query that matches nothing', () => {
    const result = builder.none()
    expect(result.conditions).toHaveLength(1)
    expect(result.conditions[0]).toEqual({ raw: '1 = 0', values: [] })
  })

  test('generates SQL with impossible condition', () => {
    const { sql } = builder.none().toSQL()
    expect(sql).toContain('1 = 0')
  })
})

// ============================================
// Merge tests
// ============================================
describe('merge()', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
  })

  test('merges conditions from another query', () => {
    const query1 = builder.where({ active: true })
    const query2 = new QueryBuilder(User).where({ role: 'admin' })

    const result = query1.merge(query2)

    expect(result.conditions).toHaveLength(2)
  })

  test('merges orders (other takes precedence)', () => {
    const query1 = builder.order({ name: 'asc' })
    const query2 = new QueryBuilder(User).order({ created_at: 'desc' })

    const result = query1.merge(query2)

    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].column).toBe('created_at')
  })

  test('merges limit/offset (other takes precedence)', () => {
    const query1 = builder.limit(10).offset(0)
    const query2 = new QueryBuilder(User).limit(5).offset(10)

    const result = query1.merge(query2)

    expect(result.limitValue).toBe(5)
    expect(result.offsetValue).toBe(10)
  })

  test('merges joins', () => {
    const query1 = builder.join('posts', 'posts.user_id = users.id')
    const query2 = new QueryBuilder(User).join('comments', 'comments.user_id = users.id')

    const result = query1.merge(query2)

    expect(result.joinClauses).toHaveLength(2)
  })

  test('merges distinct flag', () => {
    const query1 = builder
    const query2 = new QueryBuilder(User).distinct()

    const result = query1.merge(query2)

    expect(result.distinctValue).toBe(true)
  })
})

// ============================================
// Batch processing tests
// ============================================
describe('findEach()', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
    setConnection(mockConnection)
    mockConnection.query.mockReset()
  })

  afterEach(() => {
    setConnection(null)
  })

  test('processes records in batches', async () => {
    const processedIds = []

    // First batch
    mockConnection.query.mockImplementationOnce(async () => [
      { id: 1, name: 'User 1' },
      { id: 2, name: 'User 2' }
    ])
    // Second batch (empty = no more)
    mockConnection.query.mockImplementationOnce(async () => [])

    await builder.findEach(async (record) => {
      processedIds.push(record.attributes.id)
    }, { batchSize: 2 })

    expect(processedIds).toEqual([1, 2])
  })

  test('continues until no more records', async () => {
    // First batch
    mockConnection.query.mockImplementationOnce(async () => [
      { id: 1 }, { id: 2 }
    ])
    // Second batch
    mockConnection.query.mockImplementationOnce(async () => [
      { id: 3 }
    ])
    // Third batch (empty)
    mockConnection.query.mockImplementationOnce(async () => [])

    const count = { value: 0 }
    await builder.findEach(async () => {
      count.value++
    }, { batchSize: 2 })

    expect(count.value).toBe(3)
  })
})

describe('findInBatches()', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
    setConnection(mockConnection)
    mockConnection.query.mockReset()
  })

  afterEach(() => {
    setConnection(null)
  })

  test('yields batches of records', async () => {
    const batches = []

    // First batch
    mockConnection.query.mockImplementationOnce(async () => [
      { id: 1 }, { id: 2 }
    ])
    // Second batch (empty)
    mockConnection.query.mockImplementationOnce(async () => [])

    await builder.findInBatches(async (batch) => {
      batches.push(batch.length)
    }, { batchSize: 2 })

    expect(batches).toEqual([2])
  })
})

// ============================================
// WHERE clause building tests
// ============================================
describe('WHERE clause building', () => {
  let builder

  beforeEach(() => {
    builder = new QueryBuilder(User)
  })

  test('handles BETWEEN operator', () => {
    const result = builder.where({ age: { between: [18, 65] } })
    expect(result.conditions[0]).toEqual({
      column: 'age',
      operator: 'BETWEEN',
      value: [18, 65]
    })
  })

  test('handles ILIKE operator (case-insensitive)', () => {
    const result = builder.where({ name: { ilike: '%john%' } })
    expect(result.conditions[0]).toEqual({
      column: 'name',
      operator: 'ILIKE',
      value: '%john%'
    })
  })

  test('handles IN operator explicitly', () => {
    const result = builder.where({ status: { in: ['a', 'b'] } })
    expect(result.conditions[0]).toEqual({
      column: 'status',
      operator: 'IN',
      value: ['a', 'b']
    })
  })

  test('handles NOT IN operator', () => {
    const result = builder.where({ status: { not_in: ['deleted', 'archived'] } })
    expect(result.conditions[0]).toEqual({
      column: 'status',
      operator: 'NOT IN',
      value: ['deleted', 'archived']
    })
  })
})

// ============================================
// PaginatedResult tests
// ============================================
describe('PaginatedResult', () => {
  const mockRecords = [
    { id: 1, name: 'Alice', toJSON: () => ({ id: 1, name: 'Alice' }) },
    { id: 2, name: 'Bob', toJSON: () => ({ id: 2, name: 'Bob' }) },
    { id: 3, name: 'Charlie', toJSON: () => ({ id: 3, name: 'Charlie' }) }
  ]

  describe('constructor and basic properties', () => {
    test('stores records and metadata', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 2,
        perPage: 10,
        totalCount: 50
      })

      expect(result.records).toBe(mockRecords)
      expect(result.currentPage).toBe(2)
      expect(result.perPage).toBe(10)
      expect(result.totalCount).toBe(50)
    })

    test('calculates totalPages correctly', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 57
      })

      expect(result.totalPages).toBe(6) // ceil(57/10)
    })

    test('totalPages is 0 for empty results', () => {
      const result = new PaginatedResult({
        records: [],
        currentPage: 1,
        perPage: 10,
        totalCount: 0
      })

      expect(result.totalPages).toBe(0)
    })
  })

  describe('navigation properties', () => {
    test('hasNextPage is true when not on last page', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 2,
        perPage: 10,
        totalCount: 50
      })

      expect(result.hasNextPage).toBe(true)
      expect(result.nextPage).toBe(3)
    })

    test('hasNextPage is false on last page', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 5,
        perPage: 10,
        totalCount: 50
      })

      expect(result.hasNextPage).toBe(false)
      expect(result.nextPage).toBeNull()
    })

    test('hasPreviousPage is false on first page', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      expect(result.hasPreviousPage).toBe(false)
      expect(result.previousPage).toBeNull()
    })

    test('hasPreviousPage is true on pages after first', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 3,
        perPage: 10,
        totalCount: 50
      })

      expect(result.hasPreviousPage).toBe(true)
      expect(result.previousPage).toBe(2)
    })

    test('firstPage is true only on page 1', () => {
      const first = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const notFirst = new PaginatedResult({
        records: mockRecords,
        currentPage: 2,
        perPage: 10,
        totalCount: 50
      })

      expect(first.firstPage).toBe(true)
      expect(notFirst.firstPage).toBe(false)
    })

    test('lastPage is true only on final page', () => {
      const last = new PaginatedResult({
        records: mockRecords,
        currentPage: 5,
        perPage: 10,
        totalCount: 50
      })

      const notLast = new PaginatedResult({
        records: mockRecords,
        currentPage: 4,
        perPage: 10,
        totalCount: 50
      })

      expect(last.lastPage).toBe(true)
      expect(notLast.lastPage).toBe(false)
    })

    test('offset calculation is correct', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 3,
        perPage: 10,
        totalCount: 50
      })

      expect(result.offset).toBe(20) // (3-1) * 10
    })
  })

  describe('array-like behavior', () => {
    test('length returns record count', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      expect(result.length).toBe(3)
    })

    test('empty is true when no records', () => {
      const empty = new PaginatedResult({
        records: [],
        currentPage: 1,
        perPage: 10,
        totalCount: 0
      })

      const notEmpty = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      expect(empty.empty).toBe(true)
      expect(notEmpty.empty).toBe(false)
    })

    test('is iterable with for...of', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const names = []
      for (const record of result) {
        names.push(record.name)
      }

      expect(names).toEqual(['Alice', 'Bob', 'Charlie'])
    })

    test('at() returns record by index', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      expect(result.at(0).name).toBe('Alice')
      expect(result.at(2).name).toBe('Charlie')
    })

    test('map() works like array', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const ids = result.map(r => r.id)
      expect(ids).toEqual([1, 2, 3])
    })

    test('filter() works like array', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const filtered = result.filter(r => r.id > 1)
      expect(filtered).toHaveLength(2)
    })

    test('forEach() iterates over records', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const names = []
      result.forEach(r => names.push(r.name))
      expect(names).toEqual(['Alice', 'Bob', 'Charlie'])
    })

    test('find() finds a record', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const bob = result.find(r => r.name === 'Bob')
      expect(bob.id).toBe(2)
    })

    test('some() checks if any match', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      expect(result.some(r => r.name === 'Bob')).toBe(true)
      expect(result.some(r => r.name === 'Dave')).toBe(false)
    })

    test('every() checks if all match', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      expect(result.every(r => r.id > 0)).toBe(true)
      expect(result.every(r => r.id > 1)).toBe(false)
    })

    test('reduce() reduces records', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 50
      })

      const sum = result.reduce((acc, r) => acc + r.id, 0)
      expect(sum).toBe(6) // 1 + 2 + 3
    })
  })

  describe('toJSON()', () => {
    test('serializes to JSON structure', () => {
      const result = new PaginatedResult({
        records: mockRecords,
        currentPage: 2,
        perPage: 10,
        totalCount: 50
      })

      const json = result.toJSON()

      expect(json.records).toHaveLength(3)
      expect(json.records[0]).toEqual({ id: 1, name: 'Alice' })
      expect(json.pagination).toEqual({
        currentPage: 2,
        perPage: 10,
        totalCount: 50,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
        nextPage: 3,
        previousPage: 1,
        firstPage: false,
        lastPage: false
      })
    })

    test('handles records without toJSON', () => {
      const simpleRecords = [
        { id: 1, name: 'Test' }
      ]

      const result = new PaginatedResult({
        records: simpleRecords,
        currentPage: 1,
        perPage: 10,
        totalCount: 1
      })

      const json = result.toJSON()
      expect(json.records[0]).toEqual({ id: 1, name: 'Test' })
    })
  })
})
