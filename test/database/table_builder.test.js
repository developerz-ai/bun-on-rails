/**
 * TableBuilder Tests - Migration DSL
 *
 * Tests for the TableBuilder class and ColumnBuilder DSL
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { TableBuilder, ColumnBuilder } from '../../src/database/migration.js'
import { PostgresAdapter } from '../../src/database/adapters/postgres.js'

describe('TableBuilder', () => {
  let adapter

  beforeEach(() => {
    adapter = new PostgresAdapter()
  })

  // ============================================
  // Basic Table Creation
  // ============================================

  describe('basic table creation', () => {
    test('creates a table with id column', () => {
      const builder = new TableBuilder('users', adapter)
      builder.id()

      const sql = builder.toSQL()
      expect(sql).toContain('CREATE TABLE "users"')
      expect(sql).toContain('"id" BIGSERIAL PRIMARY KEY')
    })

    test('creates a table with UUID primary key', () => {
      const builder = new TableBuilder('users', adapter)
      builder.id({ uuid: true })

      const sql = builder.toSQL()
      expect(sql).toContain('UUID DEFAULT gen_random_uuid() PRIMARY KEY')
    })

    test('creates a table with multiple columns', () => {
      const builder = new TableBuilder('users', adapter)
      builder.id()
      builder.string('name')
      builder.string('email')

      const sql = builder.toSQL()
      expect(sql).toContain('"name" VARCHAR(255)')
      expect(sql).toContain('"email" VARCHAR(255)')
    })
  })

  // ============================================
  // Column Types
  // ============================================

  describe('column types', () => {
    describe('string', () => {
      test('creates VARCHAR(255) column by default', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.string('title')

        const sql = builder.toSQL()
        expect(sql).toContain('"title" VARCHAR(255)')
      })

      test('accepts custom length', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.string('title', { limit: 100 })

        // Check column definition
        expect(builder.getColumns()[0].limit).toBe(100)
      })
    })

    describe('text', () => {
      test('creates TEXT column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.text('body')

        const sql = builder.toSQL()
        expect(sql).toContain('"body" TEXT')
      })
    })

    describe('integer', () => {
      test('creates INTEGER column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.integer('view_count')

        const sql = builder.toSQL()
        expect(sql).toContain('"view_count" INTEGER')
      })
    })

    describe('bigint', () => {
      test('creates BIGINT column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.bigint('big_number')

        const sql = builder.toSQL()
        expect(sql).toContain('"big_number" BIGINT')
      })
    })

    describe('smallint', () => {
      test('creates SMALLINT column', () => {
        const builder = new TableBuilder('products', adapter)
        builder.smallint('quantity')

        const sql = builder.toSQL()
        expect(sql).toContain('"quantity" SMALLINT')
      })
    })

    describe('boolean', () => {
      test('creates BOOLEAN column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.boolean('is_published')

        const sql = builder.toSQL()
        expect(sql).toContain('"is_published" BOOLEAN')
      })
    })

    describe('date', () => {
      test('creates DATE column', () => {
        const builder = new TableBuilder('events', adapter)
        builder.date('event_date')

        const sql = builder.toSQL()
        expect(sql).toContain('"event_date" DATE')
      })
    })

    describe('time', () => {
      test('creates TIME column', () => {
        const builder = new TableBuilder('schedules', adapter)
        builder.time('start_time')

        const sql = builder.toSQL()
        expect(sql).toContain('"start_time" TIME')
      })
    })

    describe('datetime', () => {
      test('creates TIMESTAMP column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.datetime('published_at')

        const sql = builder.toSQL()
        expect(sql).toContain('"published_at" TIMESTAMP')
      })

      test('creates TIMESTAMPTZ column with timezone option', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.datetime('published_at', { timezone: true })

        const sql = builder.toSQL()
        expect(sql).toContain('"published_at" TIMESTAMPTZ')
      })
    })

    describe('timestamp (alias)', () => {
      test('creates TIMESTAMP column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.timestamp('logged_at')

        const sql = builder.toSQL()
        expect(sql).toContain('"logged_at" TIMESTAMP')
      })
    })

    describe('decimal', () => {
      test('creates DECIMAL column', () => {
        const builder = new TableBuilder('products', adapter)
        builder.decimal('price')

        const sql = builder.toSQL()
        expect(sql).toContain('"price" DECIMAL')
      })

      test('accepts precision and scale options', () => {
        const builder = new TableBuilder('products', adapter)
        builder.decimal('price', { precision: 10, scale: 2 })

        const columns = builder.getColumns()
        expect(columns[0].precision).toBe(10)
        expect(columns[0].scale).toBe(2)
      })
    })

    describe('numeric (alias)', () => {
      test('creates DECIMAL column', () => {
        const builder = new TableBuilder('products', adapter)
        builder.numeric('amount')

        expect(builder.getColumns()[0].type).toBe('decimal')
      })
    })

    describe('float', () => {
      test('creates FLOAT column', () => {
        const builder = new TableBuilder('measurements', adapter)
        builder.float('temperature')

        const sql = builder.toSQL()
        expect(sql).toContain('"temperature" FLOAT')
      })
    })

    describe('double', () => {
      test('creates DOUBLE PRECISION column', () => {
        const builder = new TableBuilder('measurements', adapter)
        builder.double('precision_value')

        const sql = builder.toSQL()
        expect(sql).toContain('"precision_value" DOUBLE PRECISION')
      })
    })

    describe('json', () => {
      test('creates JSON column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.json('metadata')

        const sql = builder.toSQL()
        expect(sql).toContain('"metadata" JSON')
      })
    })

    describe('jsonb', () => {
      test('creates JSONB column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.jsonb('settings')

        const sql = builder.toSQL()
        expect(sql).toContain('"settings" JSONB')
      })
    })

    describe('uuid', () => {
      test('creates UUID column', () => {
        const builder = new TableBuilder('tokens', adapter)
        builder.uuid('token')

        const sql = builder.toSQL()
        expect(sql).toContain('"token" UUID')
      })
    })

    describe('binary', () => {
      test('creates BYTEA column', () => {
        const builder = new TableBuilder('files', adapter)
        builder.binary('data')

        const sql = builder.toSQL()
        expect(sql).toContain('"data" BYTEA')
      })
    })

    describe('inet', () => {
      test('creates INET column', () => {
        const builder = new TableBuilder('requests', adapter)
        builder.inet('ip_address')

        const sql = builder.toSQL()
        expect(sql).toContain('"ip_address" INET')
      })
    })

    describe('cidr', () => {
      test('creates CIDR column', () => {
        const builder = new TableBuilder('networks', adapter)
        builder.cidr('network')

        const sql = builder.toSQL()
        expect(sql).toContain('"network" CIDR')
      })
    })

    describe('macaddr', () => {
      test('creates MACADDR column', () => {
        const builder = new TableBuilder('devices', adapter)
        builder.macaddr('mac')

        const sql = builder.toSQL()
        expect(sql).toContain('"mac" MACADDR')
      })
    })

    describe('tsvector', () => {
      test('creates TSVECTOR column', () => {
        const builder = new TableBuilder('documents', adapter)
        builder.tsvector('search_vector')

        const sql = builder.toSQL()
        expect(sql).toContain('"search_vector" TSVECTOR')
      })
    })

    describe('array', () => {
      test('creates array column', () => {
        const builder = new TableBuilder('posts', adapter)
        builder.array('tags', 'string')

        const columns = builder.getColumns()
        expect(columns[0].type).toBe('string')
        expect(columns[0].array).toBe(true)
      })
    })

    describe('point', () => {
      test('creates POINT column', () => {
        const builder = new TableBuilder('locations', adapter)
        builder.point('coordinates')

        const sql = builder.toSQL()
        expect(sql).toContain('"coordinates" POINT')
      })
    })

    describe('polygon', () => {
      test('creates POLYGON column', () => {
        const builder = new TableBuilder('zones', adapter)
        builder.polygon('boundary')

        const sql = builder.toSQL()
        expect(sql).toContain('"boundary" POLYGON')
      })
    })
  })

  // ============================================
  // References
  // ============================================

  describe('references', () => {
    test('creates foreign key column', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user')

      const sql = builder.toSQL()
      expect(sql).toContain('"user_id" BIGINT')
      expect(sql).toContain('FOREIGN KEY ("user_id") REFERENCES "users" ("id")')
    })

    test('creates index by default', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user')

      const indexes = builder.getIndexes()
      expect(indexes).toHaveLength(1)
      expect(indexes[0].columns).toEqual(['user_id'])
      expect(indexes[0].name).toBe('index_posts_on_user_id')
    })

    test('skips index when option is false', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user', { index: false })

      const indexes = builder.getIndexes()
      expect(indexes).toHaveLength(0)
    })

    test('accepts custom table name', () => {
      const builder = new TableBuilder('comments', adapter)
      builder.references('author', { table: 'users' })

      const sql = builder.toSQL()
      expect(sql).toContain('"author_id" BIGINT')
      expect(sql).toContain('REFERENCES "users"')
    })

    test('accepts custom column name', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user', { column: 'author_user_id' })

      const sql = builder.toSQL()
      expect(sql).toContain('"author_user_id" BIGINT')
    })

    test('accepts onDelete option', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user', { onDelete: 'CASCADE' })

      const sql = builder.toSQL()
      expect(sql).toContain('ON DELETE CASCADE')
    })

    test('accepts onUpdate option', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user', { onUpdate: 'SET NULL' })

      const sql = builder.toSQL()
      expect(sql).toContain('ON UPDATE SET NULL')
    })

    test('creates polymorphic association', () => {
      const builder = new TableBuilder('comments', adapter)
      builder.references('commentable', { polymorphic: true })

      const columns = builder.getColumns()
      expect(columns).toHaveLength(2)
      expect(columns[0].name).toBe('commentable_id')
      expect(columns[1].name).toBe('commentable_type')

      // Should have composite index
      const indexes = builder.getIndexes()
      expect(indexes[0].columns).toEqual(['commentable_type', 'commentable_id'])
    })
  })

  describe('belongsTo (alias)', () => {
    test('creates foreign key column', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.belongsTo('user')

      const sql = builder.toSQL()
      expect(sql).toContain('"user_id" BIGINT')
    })
  })

  // ============================================
  // Timestamps
  // ============================================

  describe('timestamps', () => {
    test('creates created_at and updated_at columns', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.timestamps()

      const sql = builder.toSQL()
      expect(sql).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT NOW()')
      expect(sql).toContain('"updated_at" TIMESTAMP NOT NULL DEFAULT NOW()')
    })

    test('uses TIMESTAMPTZ with timezone option', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.timestamps({ timezone: true })

      const sql = builder.toSQL()
      expect(sql).toContain('"created_at" TIMESTAMPTZ')
      expect(sql).toContain('"updated_at" TIMESTAMPTZ')
    })
  })

  // ============================================
  // Indexes
  // ============================================

  describe('index', () => {
    test('creates single column index', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('email')
      builder.index('email')

      const indexSql = builder.toIndexSQL()
      expect(indexSql).toHaveLength(1)
      expect(indexSql[0]).toContain('CREATE INDEX')
      expect(indexSql[0]).toContain('"index_users_on_email"')
      expect(indexSql[0]).toContain('("email")')
    })

    test('creates composite index', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.index(['user_id', 'created_at'])

      const indexSql = builder.toIndexSQL()
      expect(indexSql[0]).toContain('"index_posts_on_user_id_created_at"')
      expect(indexSql[0]).toContain('("user_id", "created_at")')
    })

    test('creates unique index', () => {
      const builder = new TableBuilder('users', adapter)
      builder.index('email', { unique: true })

      const indexSql = builder.toIndexSQL()
      expect(indexSql[0]).toContain('CREATE UNIQUE INDEX')
    })

    test('accepts custom index name', () => {
      const builder = new TableBuilder('users', adapter)
      builder.index('email', { name: 'custom_email_index' })

      const indexSql = builder.toIndexSQL()
      expect(indexSql[0]).toContain('"custom_email_index"')
    })

    test('accepts using option for index type', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.index('body', { using: 'gin' })

      const indexSql = builder.toIndexSQL()
      expect(indexSql[0]).toContain('USING gin')
    })

    test('accepts where option for partial index', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.index('published_at', { where: 'is_published = true' })

      const indexSql = builder.toIndexSQL()
      expect(indexSql[0]).toContain('WHERE is_published = true')
    })
  })

  // ============================================
  // Column Chaining
  // ============================================

  describe('column chaining', () => {
    test('returns ColumnBuilder for chaining', () => {
      const builder = new TableBuilder('users', adapter)
      const colBuilder = builder.string('name')

      expect(colBuilder).toBeInstanceOf(ColumnBuilder)
    })

    test('can chain column with table builder methods', () => {
      const builder = new TableBuilder('users', adapter)
      builder
        .string('name').notNull()
        .string('email').unique()
        .boolean('active').default(true)

      const columns = builder.getColumns()
      expect(columns).toHaveLength(3)
      expect(columns[0].notNull).toBe(true)
      expect(columns[1].unique).toBe(true)
      expect(columns[2].default).toBe(true)
    })
  })

  // ============================================
  // Complete Table Example
  // ============================================

  describe('complete table creation', () => {
    test('creates a full table with all features', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.id()
      builder.string('title').notNull()
      builder.text('body')
      builder.boolean('is_published').default(false)
      builder.integer('view_count').default(0)
      builder.json('metadata')
      builder.references('user', { onDelete: 'CASCADE' })
      builder.timestamps()
      builder.index(['user_id', 'created_at'])

      const sql = builder.toSQL()

      // Check all columns
      expect(sql).toContain('"id" BIGSERIAL PRIMARY KEY')
      expect(sql).toContain('"title" VARCHAR(255) NOT NULL')
      expect(sql).toContain('"body" TEXT')
      expect(sql).toContain('"is_published" BOOLEAN')
      expect(sql).toContain('"view_count" INTEGER')
      expect(sql).toContain('"metadata" JSON')
      expect(sql).toContain('"user_id" BIGINT')
      expect(sql).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT NOW()')
      expect(sql).toContain('"updated_at" TIMESTAMP NOT NULL DEFAULT NOW()')

      // Check indexes
      const indexSql = builder.toIndexSQL()
      expect(indexSql.length).toBeGreaterThanOrEqual(2) // user_id index + composite index
    })
  })
})

// ============================================
// ColumnBuilder Tests
// ============================================

describe('ColumnBuilder', () => {
  let adapter

  beforeEach(() => {
    adapter = new PostgresAdapter()
  })

  describe('notNull', () => {
    test('marks column as NOT NULL', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('name').notNull()

      const sql = builder.toSQL()
      expect(sql).toContain('"name" VARCHAR(255) NOT NULL')
    })
  })

  describe('unique', () => {
    test('marks column as UNIQUE', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('email').unique()

      const sql = builder.toSQL()
      expect(sql).toContain('"email" VARCHAR(255) UNIQUE')
    })
  })

  describe('default', () => {
    test('sets default string value', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('status').default('active')

      const sql = builder.toSQL()
      expect(sql).toContain("DEFAULT 'active'")
    })

    test('sets default boolean value', () => {
      const builder = new TableBuilder('users', adapter)
      builder.boolean('is_admin').default(false)

      const sql = builder.toSQL()
      expect(sql).toContain('DEFAULT FALSE')
    })

    test('sets default numeric value', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.integer('view_count').default(0)

      const sql = builder.toSQL()
      expect(sql).toContain('DEFAULT 0')
    })

    test('sets default SQL expression', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.datetime('published_at').default('NOW()')

      const sql = builder.toSQL()
      expect(sql).toContain('DEFAULT NOW()')
    })
  })

  describe('check', () => {
    test('adds CHECK constraint', () => {
      const builder = new TableBuilder('products', adapter)
      builder.integer('price').check('price >= 0')

      const sql = builder.toSQL()
      expect(sql).toContain('CHECK (price >= 0)')
    })
  })

  describe('onDelete', () => {
    test('sets ON DELETE action for foreign key', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user').onDelete('CASCADE')

      const sql = builder.toSQL()
      expect(sql).toContain('ON DELETE CASCADE')
    })
  })

  describe('onUpdate', () => {
    test('sets ON UPDATE action for foreign key', () => {
      const builder = new TableBuilder('posts', adapter)
      builder.references('user').onUpdate('SET NULL')

      const sql = builder.toSQL()
      expect(sql).toContain('ON UPDATE SET NULL')
    })
  })

  describe('index', () => {
    test('adds index via ColumnBuilder', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('email').index()

      const indexes = builder.getIndexes()
      expect(indexes).toHaveLength(1)
      expect(indexes[0].columns).toEqual(['email'])
    })

    test('adds unique index via ColumnBuilder', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('email').index({ unique: true })

      const indexes = builder.getIndexes()
      expect(indexes[0].unique).toBe(true)
    })
  })

  describe('primaryKey', () => {
    test('marks column as primary key', () => {
      const builder = new TableBuilder('tokens', adapter)
      builder.uuid('id').primaryKey()

      const columns = builder.getColumns()
      expect(columns[0].primaryKey).toBe(true)
    })
  })

  describe('collate', () => {
    test('sets column collation', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('name').collate('en_US')

      const columns = builder.getColumns()
      expect(columns[0].collation).toBe('en_US')
    })
  })

  describe('generated', () => {
    test('marks column as generated', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('full_name').generated("first_name || ' ' || last_name")

      const columns = builder.getColumns()
      expect(columns[0].generated).toBe("first_name || ' ' || last_name")
    })
  })

  describe('nullable', () => {
    test('marks column as nullable', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('middle_name').notNull().nullable()

      const columns = builder.getColumns()
      expect(columns[0].notNull).toBe(false)
    })
  })

  describe('comment', () => {
    test('sets column comment', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('email').comment('User email address')

      const columns = builder.getColumns()
      expect(columns[0].comment).toBe('User email address')
    })
  })

  describe('chaining modifiers', () => {
    test('chains multiple modifiers', () => {
      const builder = new TableBuilder('users', adapter)
      builder.string('email').notNull().unique().default('')

      const columns = builder.getColumns()
      expect(columns[0].notNull).toBe(true)
      expect(columns[0].unique).toBe(true)
      expect(columns[0].default).toBe('')
    })
  })

  describe('chaining back to TableBuilder', () => {
    test('allows adding more columns after modifiers', () => {
      const builder = new TableBuilder('users', adapter)
      builder
        .string('first_name').notNull()
        .string('last_name').notNull()
        .string('email').notNull().unique()

      const columns = builder.getColumns()
      expect(columns).toHaveLength(3)
      expect(columns[0].name).toBe('first_name')
      expect(columns[1].name).toBe('last_name')
      expect(columns[2].name).toBe('email')
    })

    test('delegates column methods to table builder', () => {
      const builder = new TableBuilder('users', adapter)
      const cb = builder.string('name')

      // These should work through delegation
      expect(cb.text('bio')).toBeInstanceOf(ColumnBuilder)
      expect(cb.integer('age')).toBeInstanceOf(ColumnBuilder)
      expect(cb.boolean('active')).toBeInstanceOf(ColumnBuilder)
      expect(cb.datetime('created_at')).toBeInstanceOf(ColumnBuilder)
      expect(cb.json('metadata')).toBeInstanceOf(ColumnBuilder)
      expect(cb.jsonb('settings')).toBeInstanceOf(ColumnBuilder)
      expect(cb.references('user')).toBeInstanceOf(ColumnBuilder)

      // Check all columns were added
      const columns = builder.getColumns()
      expect(columns.length).toBeGreaterThanOrEqual(8)
    })

    test('timestamps returns TableBuilder for chaining', () => {
      const builder = new TableBuilder('users', adapter)
      const result = builder.string('name').timestamps()

      // timestamps() returns the TableBuilder
      expect(result).toBe(builder)
    })
  })
})

// ============================================
// Introspection Tests
// ============================================

describe('TableBuilder introspection', () => {
  let adapter

  beforeEach(() => {
    adapter = new PostgresAdapter()
  })

  describe('getColumns', () => {
    test('returns all column definitions', () => {
      const builder = new TableBuilder('users', adapter)
      builder.id()
      builder.string('name')
      builder.string('email').unique()

      const columns = builder.getColumns()
      expect(columns).toHaveLength(3)
      expect(columns[0].name).toBe('id')
      expect(columns[1].name).toBe('name')
      expect(columns[2].name).toBe('email')
    })
  })

  describe('getIndexes', () => {
    test('returns all index definitions', () => {
      const builder = new TableBuilder('users', adapter)
      builder.index('email')
      builder.index(['first_name', 'last_name'], { unique: true })

      const indexes = builder.getIndexes()
      expect(indexes).toHaveLength(2)
      expect(indexes[0].columns).toEqual(['email'])
      expect(indexes[1].columns).toEqual(['first_name', 'last_name'])
      expect(indexes[1].unique).toBe(true)
    })
  })
})
