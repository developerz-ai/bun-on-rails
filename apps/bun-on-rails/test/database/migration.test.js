/**
 * Migration Tests
 *
 * Unit and integration tests for the Migration class - testing all migration
 * methods including table operations, column modifications, indexes, and
 * foreign keys.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { Migration, MigrationRunner, TableBuilder } from '../../src/database/migration.js'
import { PostgresAdapter } from '../../src/database/adapters/postgres.js'

// ============================================
// Mock Database Helper
// ============================================

/**
 * Creates a mock database connection for testing
 */
function createMockDb(options = {}) {
  const executedQueries = []
  const mockData = options.mockData || {}

  return {
    executedQueries,
    query: async (sql, params = []) => {
      executedQueries.push({ sql, params })

      if (options.onQuery) {
        return options.onQuery(sql, params)
      }

      return mockData[sql] || []
    }
  }
}

// ============================================
// Migration Class Tests
// ============================================

describe('Migration', () => {
  let migration
  let mockDb

  beforeEach(() => {
    mockDb = createMockDb()
    migration = new Migration(mockDb)
  })

  // ============================================
  // Constructor Tests
  // ============================================

  describe('constructor', () => {
    test('creates migration with database connection', () => {
      expect(migration.db).toBe(mockDb)
      expect(migration.adapter).toBeInstanceOf(PostgresAdapter)
    })
  })

  // ============================================
  // Abstract Methods Tests
  // ============================================

  describe('abstract methods', () => {
    test('up() throws error if not implemented', async () => {
      await expect(migration.up()).rejects.toThrow('Subclass must implement up()')
    })

    test('down() throws error if not implemented', async () => {
      await expect(migration.down()).rejects.toThrow('Subclass must implement down()')
    })
  })

  // ============================================
  // createTable Tests
  // ============================================

  describe('createTable', () => {
    test('creates table with columns', async () => {
      await migration.createTable('users', (t) => {
        t.id()
        t.string('name').notNull()
        t.string('email').unique()
      })

      expect(mockDb.executedQueries.length).toBeGreaterThanOrEqual(1)
      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('CREATE TABLE "users"')
      expect(createSql).toContain('"id" BIGSERIAL PRIMARY KEY')
      expect(createSql).toContain('"name" VARCHAR(255) NOT NULL')
      expect(createSql).toContain('"email" VARCHAR(255)')
      expect(createSql).toContain('UNIQUE')
    })

    test('creates table with timestamps', async () => {
      await migration.createTable('posts', (t) => {
        t.id()
        t.string('title')
        t.timestamps()
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT NOW()')
      expect(createSql).toContain('"updated_at" TIMESTAMP NOT NULL DEFAULT NOW()')
    })

    test('creates table with foreign key reference', async () => {
      await migration.createTable('posts', (t) => {
        t.id()
        t.references('user')
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('"user_id" BIGINT')
      expect(createSql).toContain('FOREIGN KEY ("user_id") REFERENCES "users" ("id")')
    })

    test('creates table with indexes', async () => {
      await migration.createTable('posts', (t) => {
        t.id()
        t.string('title')
        t.string('slug').unique()
        t.references('user')
        t.index(['user_id', 'created_at'])
      })

      // Should have CREATE TABLE + indexes
      expect(mockDb.executedQueries.length).toBeGreaterThanOrEqual(2)

      // Check for index creation
      const indexQueries = mockDb.executedQueries.filter(q =>
        q.sql.includes('CREATE INDEX') || q.sql.includes('CREATE UNIQUE INDEX')
      )
      expect(indexQueries.length).toBeGreaterThan(0)
    })

    test('creates table with multiple column types', async () => {
      await migration.createTable('products', (t) => {
        t.id()
        t.string('name').notNull()
        t.text('description')
        t.integer('quantity').default(0)
        t.decimal('price', { precision: 10, scale: 2 })
        t.boolean('is_active').default(true)
        t.json('metadata')
        t.timestamps()
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('"name" VARCHAR(255) NOT NULL')
      expect(createSql).toContain('"description" TEXT')
      expect(createSql).toContain('"quantity" INTEGER')
      expect(createSql).toContain('"price" NUMERIC(10, 2)')
      expect(createSql).toContain('"is_active" BOOLEAN')
      expect(createSql).toContain('"metadata" JSON')
    })

    test('creates table with custom options', async () => {
      // Note: The adapter doesn't currently support ifNotExists on createTable
      // This test verifies that options are passed through
      await migration.createTable('logs', (t) => {
        t.id()
        t.text('message')
      }, { ifNotExists: true })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('CREATE TABLE "logs"')
    })

    test('creates table with foreign key with onDelete CASCADE', async () => {
      await migration.createTable('comments', (t) => {
        t.id()
        t.references('post', { onDelete: 'CASCADE' })
        t.text('body')
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('ON DELETE CASCADE')
    })

    test('creates table with polymorphic association', async () => {
      await migration.createTable('comments', (t) => {
        t.id()
        t.references('commentable', { polymorphic: true })
        t.text('body')
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('"commentable_id" BIGINT')
      expect(createSql).toContain('"commentable_type" VARCHAR(255)')
    })
  })

  // ============================================
  // dropTable Tests
  // ============================================

  describe('dropTable', () => {
    test('drops table', async () => {
      await migration.dropTable('users')

      expect(mockDb.executedQueries.length).toBe(1)
      // Note: By default, the adapter adds IF EXISTS
      expect(mockDb.executedQueries[0].sql).toContain('DROP TABLE IF EXISTS "users"')
    })

    test('drops table without IF EXISTS option', async () => {
      await migration.dropTable('users', { ifExists: false })

      expect(mockDb.executedQueries[0].sql).toContain('DROP TABLE "users"')
      expect(mockDb.executedQueries[0].sql).not.toContain('IF EXISTS')
    })

    test('drops table with CASCADE option', async () => {
      await migration.dropTable('users', { cascade: true })

      expect(mockDb.executedQueries[0].sql).toContain('DROP TABLE IF EXISTS "users" CASCADE')
    })

    test('drops table with both ifExists and cascade', async () => {
      await migration.dropTable('users', { ifExists: true, cascade: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP TABLE IF EXISTS "users"')
      expect(sql).toContain('CASCADE')
    })
  })

  // ============================================
  // renameTable Tests
  // ============================================

  describe('renameTable', () => {
    test('renames table', async () => {
      await migration.renameTable('users', 'people')

      expect(mockDb.executedQueries.length).toBe(1)
      expect(mockDb.executedQueries[0].sql).toContain('ALTER TABLE "users" RENAME TO "people"')
    })

    test('renames table with schema', async () => {
      await migration.renameTable('public.users', 'people')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"public"."users"')
      expect(sql).toContain('RENAME TO "people"')
    })
  })

  // ============================================
  // addColumn Tests
  // ============================================

  describe('addColumn', () => {
    test('adds string column', async () => {
      await migration.addColumn('users', 'nickname', 'string')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "users"')
      expect(sql).toContain('ADD COLUMN "nickname"')
      expect(sql).toContain('VARCHAR(255)')
    })

    test('adds column with NOT NULL constraint', async () => {
      await migration.addColumn('users', 'age', 'integer', { notNull: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"age"')
      expect(sql).toContain('INTEGER')
      expect(sql).toContain('NOT NULL')
    })

    test('adds column with default value', async () => {
      await migration.addColumn('users', 'is_active', 'boolean', { default: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"is_active"')
      expect(sql).toContain('BOOLEAN')
      expect(sql).toContain('DEFAULT')
    })

    test('adds column with UNIQUE constraint', async () => {
      await migration.addColumn('users', 'username', 'string', { unique: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"username"')
      expect(sql).toContain('UNIQUE')
    })

    test('adds text column', async () => {
      await migration.addColumn('posts', 'content', 'text')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"content"')
      expect(sql).toContain('TEXT')
    })

    test('adds json column', async () => {
      await migration.addColumn('users', 'settings', 'json')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"settings"')
      expect(sql).toContain('JSON')
    })
  })

  // ============================================
  // removeColumn Tests
  // ============================================

  describe('removeColumn', () => {
    test('removes column', async () => {
      await migration.removeColumn('users', 'legacy_field')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "users"')
      expect(sql).toContain('DROP COLUMN "legacy_field"')
    })

    test('removes column with CASCADE option', async () => {
      await migration.removeColumn('users', 'email', { cascade: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP COLUMN "email"')
      expect(sql).toContain('CASCADE')
    })

    test('removes column from table', async () => {
      await migration.removeColumn('users', 'old_field')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP COLUMN "old_field"')
      expect(sql).not.toContain('CASCADE')
    })
  })

  // ============================================
  // renameColumn Tests
  // ============================================

  describe('renameColumn', () => {
    test('renames column', async () => {
      await migration.renameColumn('users', 'name', 'full_name')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "users"')
      expect(sql).toContain('RENAME COLUMN "name" TO "full_name"')
    })

    test('renames column with special characters', async () => {
      await migration.renameColumn('users', 'first-name', 'first_name')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"first-name"')
      expect(sql).toContain('"first_name"')
    })
  })

  // ============================================
  // changeColumn Tests
  // ============================================

  describe('changeColumn', () => {
    test('changes column type', async () => {
      await migration.changeColumn('users', 'age', 'bigint')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "users"')
      expect(sql).toContain('ALTER COLUMN "age"')
      expect(sql).toContain('TYPE BIGINT')
    })

    test('changes column type with USING clause', async () => {
      await migration.changeColumn('users', 'data', 'jsonb', { using: 'data::jsonb' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER COLUMN "data"')
      expect(sql).toContain('TYPE JSONB')
      expect(sql).toContain('USING data::jsonb')
    })

    test('changes string to text', async () => {
      await migration.changeColumn('posts', 'title', 'text')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"title"')
      expect(sql).toContain('TYPE TEXT')
    })
  })

  // ============================================
  // changeColumnNull Tests
  // ============================================

  describe('changeColumnNull', () => {
    test('adds NOT NULL constraint', async () => {
      await migration.changeColumnNull('users', 'email', true)

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "users"')
      expect(sql).toContain('ALTER COLUMN "email"')
      expect(sql).toContain('SET NOT NULL')
    })

    test('removes NOT NULL constraint', async () => {
      await migration.changeColumnNull('users', 'nickname', false)

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER COLUMN "nickname"')
      expect(sql).toContain('DROP NOT NULL')
    })
  })

  // ============================================
  // changeColumnDefault Tests
  // ============================================

  describe('changeColumnDefault', () => {
    test('sets default value for string column', async () => {
      await migration.changeColumnDefault('users', 'status', 'active', 'string')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "users"')
      expect(sql).toContain('ALTER COLUMN "status"')
      expect(sql).toContain('SET DEFAULT')
    })

    test('sets default value for boolean column', async () => {
      await migration.changeColumnDefault('users', 'is_admin', false, 'boolean')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"is_admin"')
      expect(sql).toContain('SET DEFAULT')
    })

    test('sets default value for integer column', async () => {
      await migration.changeColumnDefault('posts', 'view_count', 0, 'integer')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"view_count"')
      expect(sql).toContain('SET DEFAULT')
    })

    test('removes default value', async () => {
      await migration.changeColumnDefault('users', 'nickname', null, 'string')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER COLUMN "nickname"')
      expect(sql).toContain('DROP DEFAULT')
    })

    test('sets default to SQL expression', async () => {
      await migration.changeColumnDefault('posts', 'published_at', 'NOW()', 'datetime')

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"published_at"')
      expect(sql).toContain('SET DEFAULT')
    })
  })

  // ============================================
  // addIndex Tests
  // ============================================

  describe('addIndex', () => {
    test('adds single column index', async () => {
      await migration.addIndex('users', 'email')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('CREATE INDEX')
      expect(sql).toContain('"index_users_on_email"')
      expect(sql).toContain('ON "users"')
      expect(sql).toContain('("email")')
    })

    test('adds composite index', async () => {
      await migration.addIndex('posts', ['user_id', 'created_at'])

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('CREATE INDEX')
      expect(sql).toContain('"index_posts_on_user_id_created_at"')
      expect(sql).toContain('("user_id", "created_at")')
    })

    test('adds unique index', async () => {
      await migration.addIndex('users', 'email', { unique: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('CREATE UNIQUE INDEX')
    })

    test('adds index with custom name', async () => {
      await migration.addIndex('users', 'email', { name: 'idx_user_email' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"idx_user_email"')
    })

    test('adds index with USING clause', async () => {
      await migration.addIndex('posts', 'body', { using: 'gin' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('USING gin')
    })

    test('adds partial index with WHERE clause', async () => {
      await migration.addIndex('posts', 'published_at', { where: 'is_published = true' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('WHERE is_published = true')
    })

    test('adds index concurrently', async () => {
      await migration.addIndex('users', 'email', { concurrently: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('CREATE INDEX CONCURRENTLY')
    })
  })

  // ============================================
  // removeIndex Tests
  // ============================================

  describe('removeIndex', () => {
    test('removes index by name', async () => {
      await migration.removeIndex('users', { name: 'index_users_on_email' })

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP INDEX')
      expect(sql).toContain('"index_users_on_email"')
    })

    test('removes index by column name', async () => {
      await migration.removeIndex('users', { column: 'email' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP INDEX')
      expect(sql).toContain('"index_users_on_email"')
    })

    test('removes index by composite columns', async () => {
      await migration.removeIndex('posts', { column: ['user_id', 'created_at'] })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('"index_posts_on_user_id_created_at"')
    })

    test('removes index concurrently', async () => {
      await migration.removeIndex('users', { name: 'index_users_on_email', concurrently: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP INDEX CONCURRENTLY')
    })

    test('removes index with IF EXISTS option', async () => {
      await migration.removeIndex('users', { name: 'index_users_on_email', ifExists: true })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP INDEX IF EXISTS')
    })

    test('throws error when neither name nor column provided', async () => {
      await expect(
        migration.removeIndex('users', {})
      ).rejects.toThrow('removeIndex requires either a name or column option')
    })
  })

  // ============================================
  // addForeignKey Tests
  // ============================================

  describe('addForeignKey', () => {
    test('adds foreign key with default options', async () => {
      await migration.addForeignKey('posts', 'users')

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "posts"')
      expect(sql).toContain('ADD CONSTRAINT "fk_posts_user_id"')
      expect(sql).toContain('FOREIGN KEY ("user_id")')
      expect(sql).toContain('REFERENCES "users" ("id")')
    })

    test('adds foreign key with custom column name', async () => {
      await migration.addForeignKey('posts', 'users', { column: 'author_id' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('FOREIGN KEY ("author_id")')
    })

    test('adds foreign key with custom constraint name', async () => {
      await migration.addForeignKey('posts', 'users', { name: 'fk_posts_author' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ADD CONSTRAINT "fk_posts_author"')
    })

    test('adds foreign key with ON DELETE CASCADE', async () => {
      await migration.addForeignKey('posts', 'users', { onDelete: 'CASCADE' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ON DELETE CASCADE')
    })

    test('adds foreign key with ON DELETE SET NULL', async () => {
      await migration.addForeignKey('posts', 'users', { onDelete: 'SET NULL' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ON DELETE SET NULL')
    })

    test('adds foreign key with ON UPDATE CASCADE', async () => {
      await migration.addForeignKey('posts', 'users', { onUpdate: 'CASCADE' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ON UPDATE CASCADE')
    })

    test('adds foreign key with custom primary key', async () => {
      await migration.addForeignKey('posts', 'users', { primaryKey: 'uuid' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('REFERENCES "users" ("uuid")')
    })

    test('adds foreign key with both ON DELETE and ON UPDATE', async () => {
      await migration.addForeignKey('posts', 'users', {
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT'
      })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ON DELETE CASCADE')
      expect(sql).toContain('ON UPDATE RESTRICT')
    })
  })

  // ============================================
  // removeForeignKey Tests
  // ============================================

  describe('removeForeignKey', () => {
    test('removes foreign key by name', async () => {
      await migration.removeForeignKey('posts', { name: 'fk_posts_user_id' })

      expect(mockDb.executedQueries.length).toBe(1)
      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('ALTER TABLE "posts"')
      expect(sql).toContain('DROP CONSTRAINT "fk_posts_user_id"')
    })

    test('removes foreign key by toTable option', async () => {
      await migration.removeForeignKey('posts', { toTable: 'users' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP CONSTRAINT "fk_posts_user_id"')
    })

    test('removes foreign key with custom column', async () => {
      await migration.removeForeignKey('posts', { toTable: 'users', column: 'author_id' })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('DROP CONSTRAINT "fk_posts_author_id"')
    })

    test('throws error when neither name nor toTable provided', async () => {
      await expect(
        migration.removeForeignKey('posts', {})
      ).rejects.toThrow('removeForeignKey requires either a name or toTable option')
    })
  })

  // ============================================
  // execute Tests
  // ============================================

  describe('execute', () => {
    test('executes raw SQL', async () => {
      const result = await migration.execute('SELECT * FROM users WHERE id = $1', [123])

      expect(mockDb.executedQueries.length).toBe(1)
      expect(mockDb.executedQueries[0].sql).toBe('SELECT * FROM users WHERE id = $1')
      expect(mockDb.executedQueries[0].params).toEqual([123])
    })

    test('executes SQL without parameters', async () => {
      await migration.execute('TRUNCATE TABLE sessions')

      expect(mockDb.executedQueries[0].sql).toBe('TRUNCATE TABLE sessions')
      expect(mockDb.executedQueries[0].params).toEqual([])
    })

    test('executes complex SQL with multiple parameters', async () => {
      await migration.execute(
        'UPDATE users SET email = $1, updated_at = $2 WHERE id = $3',
        ['new@example.com', new Date(), 456]
      )

      expect(mockDb.executedQueries[0].params).toEqual(['new@example.com', expect.any(Date), 456])
    })

    test('returns result from database', async () => {
      const mockResult = [{ id: 1, name: 'Test' }]
      const db = createMockDb({
        onQuery: () => mockResult
      })
      const mig = new Migration(db)

      const result = await mig.execute('SELECT * FROM users')

      expect(result).toBe(mockResult)
    })
  })
})

// ============================================
// Integration Tests
// ============================================

describe('Migration - Integration Scenarios', () => {
  let migration
  let mockDb

  beforeEach(() => {
    mockDb = createMockDb()
    migration = new Migration(mockDb)
  })

  describe('creating a full application schema', () => {
    test('creates users table with authentication fields', async () => {
      await migration.createTable('users', (t) => {
        t.id()
        t.string('email').notNull().unique()
        t.string('password_hash').notNull()
        t.string('name')
        t.boolean('is_admin').default(false)
        t.boolean('is_active').default(true)
        t.datetime('last_login_at')
        t.timestamps()
        t.index('email', { unique: true })
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('CREATE TABLE "users"')
      expect(createSql).toContain('"email" VARCHAR(255) NOT NULL')
      expect(createSql).toContain('"password_hash" VARCHAR(255) NOT NULL')
      expect(createSql).toContain('"is_admin" BOOLEAN')
      expect(createSql).toContain('"last_login_at" TIMESTAMP')
      expect(createSql).toContain('"created_at" TIMESTAMP')
    })

    test('creates posts table with foreign keys', async () => {
      await migration.createTable('posts', (t) => {
        t.id()
        t.string('title').notNull()
        t.string('slug').notNull().unique()
        t.text('body')
        t.boolean('is_published').default(false)
        t.datetime('published_at')
        t.integer('view_count').default(0)
        t.json('metadata')
        t.references('user', { onDelete: 'CASCADE' })
        t.timestamps()
        t.index(['user_id', 'created_at'])
        t.index('slug', { unique: true })
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('"title" VARCHAR(255) NOT NULL')
      expect(createSql).toContain('"slug" VARCHAR(255) NOT NULL')
      expect(createSql).toContain('"body" TEXT')
      expect(createSql).toContain('"user_id" BIGINT')
      expect(createSql).toContain('ON DELETE CASCADE')
    })

    test('creates polymorphic comments table', async () => {
      await migration.createTable('comments', (t) => {
        t.id()
        t.references('commentable', { polymorphic: true })
        t.references('user', { onDelete: 'CASCADE' })
        t.text('body').notNull()
        t.timestamps()
      })

      const createSql = mockDb.executedQueries[0].sql
      expect(createSql).toContain('"commentable_id" BIGINT')
      expect(createSql).toContain('"commentable_type" VARCHAR(255)')
      expect(createSql).toContain('"user_id" BIGINT')
    })
  })

  describe('migrating existing schema', () => {
    test('adds new column to existing table', async () => {
      await migration.addColumn('users', 'phone', 'string')

      expect(mockDb.executedQueries[0].sql).toContain('ADD COLUMN "phone"')
    })

    test('removes deprecated column', async () => {
      await migration.removeColumn('users', 'legacy_field', { cascade: true })

      expect(mockDb.executedQueries[0].sql).toContain('DROP COLUMN "legacy_field" CASCADE')
    })

    test('renames column for clarity', async () => {
      await migration.renameColumn('users', 'name', 'full_name')

      expect(mockDb.executedQueries[0].sql).toContain('RENAME COLUMN "name" TO "full_name"')
    })

    test('changes column type with data migration', async () => {
      await migration.changeColumn('users', 'age', 'smallint', {
        using: 'age::smallint'
      })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('TYPE SMALLINT')
      expect(sql).toContain('USING age::smallint')
    })

    test('adds index for performance optimization', async () => {
      await migration.addIndex('posts', ['user_id', 'created_at'], {
        name: 'idx_posts_user_created'
      })

      expect(mockDb.executedQueries[0].sql).toContain('CREATE INDEX "idx_posts_user_created"')
    })

    test('adds foreign key to existing table', async () => {
      await migration.addForeignKey('posts', 'categories', {
        column: 'category_id',
        onDelete: 'SET NULL'
      })

      const sql = mockDb.executedQueries[0].sql
      expect(sql).toContain('FOREIGN KEY ("category_id")')
      expect(sql).toContain('REFERENCES "categories"')
      expect(sql).toContain('ON DELETE SET NULL')
    })
  })

  describe('complex migration scenarios', () => {
    test('migrates from string to UUID primary key', async () => {
      // Step 1: Add new UUID column
      await migration.addColumn('users', 'uuid', 'uuid', {
        default: 'gen_random_uuid()'
      })

      // Step 2: Populate UUIDs (would happen in separate step)
      await migration.execute('UPDATE users SET uuid = gen_random_uuid() WHERE uuid IS NULL')

      // Step 3: Make UUID NOT NULL
      await migration.changeColumnNull('users', 'uuid', true)

      expect(mockDb.executedQueries.length).toBe(3)
    })

    test('splits table into multiple tables', async () => {
      // Create profiles table
      await migration.createTable('profiles', (t) => {
        t.id()
        t.references('user', { onDelete: 'CASCADE' })
        t.text('bio')
        t.string('avatar_url')
        t.timestamps()
      })

      // Copy data would happen with execute
      await migration.execute(`
        INSERT INTO profiles (user_id, bio, avatar_url, created_at, updated_at)
        SELECT id, bio, avatar_url, created_at, updated_at FROM users
      `)

      // Remove old columns
      await migration.removeColumn('users', 'bio')
      await migration.removeColumn('users', 'avatar_url')

      expect(mockDb.executedQueries.length).toBeGreaterThanOrEqual(4)
    })

    test('adds full-text search support', async () => {
      await migration.addColumn('posts', 'search_vector', 'tsvector')

      await migration.addIndex('posts', 'search_vector', { using: 'gin' })

      await migration.execute(`
        UPDATE posts
        SET search_vector = to_tsvector('english', title || ' ' || body)
      `)

      expect(mockDb.executedQueries.length).toBe(3)
    })
  })

  describe('rollback scenarios', () => {
    test('down migration drops table created in up', async () => {
      // Simulate down() method
      await migration.dropTable('temporary_imports', { ifExists: true })

      expect(mockDb.executedQueries[0].sql).toContain('DROP TABLE IF EXISTS "temporary_imports"')
    })

    test('down migration removes column added in up', async () => {
      await migration.removeColumn('users', 'temp_field')

      expect(mockDb.executedQueries[0].sql).toContain('DROP COLUMN "temp_field"')
    })

    test('down migration removes index added in up', async () => {
      await migration.removeIndex('posts', { name: 'idx_posts_title', ifExists: true })

      expect(mockDb.executedQueries[0].sql).toContain('DROP INDEX IF EXISTS "idx_posts_title"')
    })
  })
})

// ============================================
// Subclass Migration Tests
// ============================================

describe('Migration subclass implementation', () => {
  test('class-based migration with up and down methods', async () => {
    class CreateUsersTable extends Migration {
      async up() {
        await this.createTable('users', (t) => {
          t.id()
          t.string('email').notNull().unique()
          t.timestamps()
        })
      }

      async down() {
        await this.dropTable('users')
      }
    }

    const mockDb = createMockDb()
    const migration = new CreateUsersTable(mockDb)

    await migration.up()
    expect(mockDb.executedQueries[0].sql).toContain('CREATE TABLE "users"')

    // Clear executed queries by resetting the array
    mockDb.executedQueries.length = 0
    await migration.down()
    expect(mockDb.executedQueries[0].sql).toContain('DROP TABLE')
  })

  test('migration with complex up logic', async () => {
    class AddUserRoles extends Migration {
      async up() {
        await this.addColumn('users', 'role', 'string', { default: 'user' })
        await this.addIndex('users', 'role')
        await this.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")
      }

      async down() {
        await this.removeIndex('users', { column: 'role' })
        await this.removeColumn('users', 'role')
      }
    }

    const mockDb = createMockDb()
    const migration = new AddUserRoles(mockDb)

    await migration.up()
    expect(mockDb.executedQueries.length).toBe(3)
    expect(mockDb.executedQueries[0].sql).toContain('ADD COLUMN "role"')
    expect(mockDb.executedQueries[1].sql).toContain('CREATE INDEX')
    expect(mockDb.executedQueries[2].sql).toContain('UPDATE users')
  })
})
