/**
 * PostgreSQL Adapter Tests
 *
 * Tests for SQL generation and type handling
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import {
  PostgresAdapter,
  COLUMN_TYPES,
  TYPE_ALIASES,
  RESERVED_WORDS,
  getAdapter,
  setAdapter
} from '../../src/database/adapters/postgres.js'

describe('PostgresAdapter', () => {
  let adapter

  beforeEach(() => {
    adapter = new PostgresAdapter()
  })

  // ============================================
  // Identifier Handling Tests
  // ============================================

  describe('quoteIdentifier', () => {
    test('quotes simple identifier', () => {
      expect(adapter.quoteIdentifier('users')).toBe('"users"')
    })

    test('escapes embedded quotes', () => {
      expect(adapter.quoteIdentifier('table"name')).toBe('"table""name"')
    })

    test('handles reserved words', () => {
      expect(adapter.quoteIdentifier('select')).toBe('"select"')
      expect(adapter.quoteIdentifier('user')).toBe('"user"')
    })
  })

  describe('quoteTableName', () => {
    test('quotes simple table name', () => {
      expect(adapter.quoteTableName('users')).toBe('"users"')
    })

    test('quotes schema-qualified table name', () => {
      expect(adapter.quoteTableName('public.users')).toBe('"public"."users"')
    })
  })

  describe('quoteValue', () => {
    test('handles null', () => {
      expect(adapter.quoteValue(null)).toBe('NULL')
      expect(adapter.quoteValue(undefined)).toBe('NULL')
    })

    test('handles booleans', () => {
      expect(adapter.quoteValue(true)).toBe('TRUE')
      expect(adapter.quoteValue(false)).toBe('FALSE')
    })

    test('handles numbers', () => {
      expect(adapter.quoteValue(42)).toBe('42')
      expect(adapter.quoteValue(3.14)).toBe('3.14')
    })

    test('handles strings with escaping', () => {
      expect(adapter.quoteValue('hello')).toBe("'hello'")
      expect(adapter.quoteValue("it's")).toBe("'it''s'")
    })

    test('handles dates', () => {
      const date = new Date('2025-01-24T12:00:00Z')
      expect(adapter.quoteValue(date)).toBe("'2025-01-24T12:00:00.000Z'")
    })

    test('handles arrays', () => {
      expect(adapter.quoteValue([1, 2, 3])).toBe('ARRAY[1, 2, 3]')
      expect(adapter.quoteValue(['a', 'b'])).toBe("ARRAY['a', 'b']")
    })

    test('handles objects as jsonb', () => {
      const result = adapter.quoteValue({ foo: 'bar' })
      expect(result).toContain('::jsonb')
      expect(result).toContain('foo')
    })
  })

  describe('needsQuoting', () => {
    test('returns true for reserved words', () => {
      expect(adapter.needsQuoting('select')).toBe(true)
      expect(adapter.needsQuoting('user')).toBe(true)
    })

    test('returns true for mixed case', () => {
      expect(adapter.needsQuoting('UserName')).toBe(true)
    })

    test('returns false for valid lowercase identifiers', () => {
      expect(adapter.needsQuoting('users')).toBe(false)
      expect(adapter.needsQuoting('user_id')).toBe(false)
    })
  })

  // ============================================
  // Type Handling Tests
  // ============================================

  describe('columnType', () => {
    test('maps framework types to PostgreSQL', () => {
      expect(adapter.columnType('string')).toBe('VARCHAR(255)')
      expect(adapter.columnType('text')).toBe('TEXT')
      expect(adapter.columnType('integer')).toBe('INTEGER')
      expect(adapter.columnType('bigint')).toBe('BIGINT')
      expect(adapter.columnType('boolean')).toBe('BOOLEAN')
      expect(adapter.columnType('datetime')).toBe('TIMESTAMP')
      expect(adapter.columnType('json')).toBe('JSON')
      expect(adapter.columnType('jsonb')).toBe('JSONB')
    })

    test('handles string with limit', () => {
      expect(adapter.columnType('string', { limit: 100 })).toBe('VARCHAR(100)')
    })

    test('handles decimal with precision/scale', () => {
      expect(adapter.columnType('decimal', { precision: 10, scale: 2 })).toBe('NUMERIC(10, 2)')
    })

    test('handles array types', () => {
      expect(adapter.columnType('integer', { array: true })).toBe('INTEGER[]')
      expect(adapter.columnType('string', { array: true })).toBe('VARCHAR(255)[]')
    })

    test('allows explicit sqlType', () => {
      expect(adapter.columnType('string', { sqlType: 'CITEXT' })).toBe('CITEXT')
    })

    test('passes through unknown types', () => {
      expect(adapter.columnType('custom_type')).toBe('CUSTOM_TYPE')
    })
  })

  describe('frameworkType', () => {
    test('maps PostgreSQL types to framework', () => {
      expect(adapter.frameworkType('character varying')).toBe('string')
      expect(adapter.frameworkType('text')).toBe('text')
      expect(adapter.frameworkType('integer')).toBe('integer')
      expect(adapter.frameworkType('bigint')).toBe('bigint')
      expect(adapter.frameworkType('boolean')).toBe('boolean')
      expect(adapter.frameworkType('timestamp without time zone')).toBe('datetime')
      expect(adapter.frameworkType('jsonb')).toBe('jsonb')
    })

    test('handles array types', () => {
      expect(adapter.frameworkType('integer[]')).toBe('integer[]')
      expect(adapter.frameworkType('text[]')).toBe('text[]')
    })
  })

  // ============================================
  // Value Conversion Tests
  // ============================================

  describe('toDatabase', () => {
    test('converts boolean', () => {
      expect(adapter.toDatabase(true, 'boolean')).toBe(true)
      expect(adapter.toDatabase(false, 'boolean')).toBe(false)
      expect(adapter.toDatabase(1, 'boolean')).toBe(true)
    })

    test('converts integer', () => {
      expect(adapter.toDatabase('42', 'integer')).toBe(42)
      expect(adapter.toDatabase(42.9, 'integer')).toBe(42)
    })

    test('converts bigint to string', () => {
      expect(adapter.toDatabase(BigInt(123), 'bigint')).toBe('123')
    })

    test('converts float', () => {
      expect(adapter.toDatabase('3.14', 'float')).toBe(3.14)
    })

    test('converts date', () => {
      const date = new Date('2025-01-24T12:00:00Z')
      expect(adapter.toDatabase(date, 'date')).toBe('2025-01-24')
    })

    test('converts datetime', () => {
      const date = new Date('2025-01-24T12:00:00Z')
      expect(adapter.toDatabase(date, 'datetime')).toBe('2025-01-24T12:00:00.000Z')
    })

    test('converts json', () => {
      expect(adapter.toDatabase({ foo: 'bar' }, 'json')).toBe('{"foo":"bar"}')
      expect(adapter.toDatabase('{"foo":"bar"}', 'json')).toBe('{"foo":"bar"}')
    })

    test('handles null', () => {
      expect(adapter.toDatabase(null, 'string')).toBe(null)
      expect(adapter.toDatabase(undefined, 'integer')).toBe(null)
    })
  })

  describe('fromDatabase', () => {
    test('converts boolean', () => {
      expect(adapter.fromDatabase(true, 'boolean')).toBe(true)
      expect(adapter.fromDatabase('t', 'boolean')).toBe(true)
      expect(adapter.fromDatabase('true', 'boolean')).toBe(true)
      expect(adapter.fromDatabase(false, 'boolean')).toBe(false)
    })

    test('converts integer', () => {
      expect(adapter.fromDatabase('42', 'integer')).toBe(42)
    })

    test('converts safe bigint to number', () => {
      expect(adapter.fromDatabase('123', 'bigint')).toBe(123)
    })

    test('converts unsafe bigint to BigInt', () => {
      const huge = '9007199254740992' // Number.MAX_SAFE_INTEGER + 1
      expect(adapter.fromDatabase(huge, 'bigint')).toBe(BigInt(huge))
    })

    test('converts date string', () => {
      const result = adapter.fromDatabase('2025-01-24', 'date')
      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toContain('2025-01-24')
    })

    test('converts json string', () => {
      const result = adapter.fromDatabase('{"foo":"bar"}', 'json')
      expect(result).toEqual({ foo: 'bar' })
    })

    test('handles null', () => {
      expect(adapter.fromDatabase(null, 'string')).toBe(null)
    })
  })

  // ============================================
  // DDL Generation Tests
  // ============================================

  describe('createTableSQL', () => {
    test('generates basic CREATE TABLE', () => {
      const sql = adapter.createTableSQL('users', [
        { name: 'id', type: 'id' },
        { name: 'name', type: 'string', notNull: true },
        { name: 'email', type: 'string', unique: true }
      ])

      expect(sql).toContain('CREATE TABLE "users"')
      expect(sql).toContain('"id" BIGSERIAL PRIMARY KEY')
      expect(sql).toContain('"name" VARCHAR(255) NOT NULL')
      expect(sql).toContain('"email" VARCHAR(255) UNIQUE')
    })

    test('handles UUID primary key', () => {
      const sql = adapter.createTableSQL('users', [
        { name: 'id', type: 'id', uuid: true }
      ])

      expect(sql).toContain('UUID DEFAULT gen_random_uuid() PRIMARY KEY')
    })

    test('handles default values', () => {
      const sql = adapter.createTableSQL('posts', [
        { name: 'id', type: 'id' },
        { name: 'is_published', type: 'boolean', default: false },
        { name: 'created_at', type: 'timestamp', default: 'NOW()' }
      ])

      expect(sql).toContain('DEFAULT FALSE')
      expect(sql).toContain('DEFAULT NOW()')
    })

    test('handles foreign keys', () => {
      const sql = adapter.createTableSQL('posts', [
        { name: 'id', type: 'id' },
        { name: 'user_id', type: 'bigint', foreignKey: { table: 'users', onDelete: 'CASCADE' } }
      ])

      expect(sql).toContain('FOREIGN KEY ("user_id") REFERENCES "users" ("id")')
      expect(sql).toContain('ON DELETE CASCADE')
    })

    test('handles check constraints', () => {
      const sql = adapter.createTableSQL('products', [
        { name: 'id', type: 'id' },
        { name: 'price', type: 'decimal', check: 'price >= 0' }
      ])

      expect(sql).toContain('CHECK (price >= 0)')
    })
  })

  describe('columnDefinitionSQL', () => {
    test('generates basic column', () => {
      expect(adapter.columnDefinitionSQL({ name: 'title', type: 'string' }))
        .toBe('"title" VARCHAR(255)')
    })

    test('generates column with all options', () => {
      const result = adapter.columnDefinitionSQL({
        name: 'email',
        type: 'string',
        notNull: true,
        unique: true,
        default: ''
      })

      expect(result).toContain('"email"')
      expect(result).toContain('VARCHAR(255)')
      expect(result).toContain('NOT NULL')
      expect(result).toContain('UNIQUE')
      expect(result).toContain("DEFAULT ''")
    })
  })

  describe('addColumnSQL', () => {
    test('generates ALTER TABLE ADD COLUMN', () => {
      const sql = adapter.addColumnSQL('users', { name: 'age', type: 'integer' })
      expect(sql).toBe('ALTER TABLE "users" ADD COLUMN "age" INTEGER')
    })
  })

  describe('dropColumnSQL', () => {
    test('generates ALTER TABLE DROP COLUMN', () => {
      const sql = adapter.dropColumnSQL('users', 'age')
      expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "age"')
    })

    test('supports CASCADE', () => {
      const sql = adapter.dropColumnSQL('users', 'age', { cascade: true })
      expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "age" CASCADE')
    })
  })

  describe('renameColumnSQL', () => {
    test('generates ALTER TABLE RENAME COLUMN', () => {
      const sql = adapter.renameColumnSQL('users', 'name', 'full_name')
      expect(sql).toBe('ALTER TABLE "users" RENAME COLUMN "name" TO "full_name"')
    })
  })

  describe('changeColumnTypeSQL', () => {
    test('generates ALTER COLUMN TYPE', () => {
      const sql = adapter.changeColumnTypeSQL('users', 'age', 'bigint')
      expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "age" TYPE BIGINT')
    })

    test('supports USING clause', () => {
      const sql = adapter.changeColumnTypeSQL('users', 'age', 'text', { using: 'age::text' })
      expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "age" TYPE TEXT USING age::text')
    })
  })

  describe('dropTableSQL', () => {
    test('generates DROP TABLE', () => {
      expect(adapter.dropTableSQL('users')).toBe('DROP TABLE IF EXISTS "users"')
    })

    test('supports CASCADE', () => {
      expect(adapter.dropTableSQL('users', { cascade: true }))
        .toBe('DROP TABLE IF EXISTS "users" CASCADE')
    })

    test('supports without IF EXISTS', () => {
      expect(adapter.dropTableSQL('users', { ifExists: false }))
        .toBe('DROP TABLE "users"')
    })
  })

  describe('renameTableSQL', () => {
    test('generates ALTER TABLE RENAME', () => {
      expect(adapter.renameTableSQL('old_table', 'new_table'))
        .toBe('ALTER TABLE "old_table" RENAME TO "new_table"')
    })
  })

  // ============================================
  // Index Generation Tests
  // ============================================

  describe('createIndexSQL', () => {
    test('generates basic CREATE INDEX', () => {
      const sql = adapter.createIndexSQL('users', 'email')
      expect(sql).toBe('CREATE INDEX "index_users_on_email" ON "users" ("email")')
    })

    test('generates UNIQUE index', () => {
      const sql = adapter.createIndexSQL('users', 'email', { unique: true })
      expect(sql).toContain('CREATE UNIQUE INDEX')
    })

    test('generates composite index', () => {
      const sql = adapter.createIndexSQL('posts', ['user_id', 'created_at'])
      expect(sql).toBe('CREATE INDEX "index_posts_on_user_id_created_at" ON "posts" ("user_id", "created_at")')
    })

    test('generates partial index', () => {
      const sql = adapter.createIndexSQL('posts', 'published_at', { where: 'is_published = true' })
      expect(sql).toContain('WHERE is_published = true')
    })

    test('supports custom index type', () => {
      const sql = adapter.createIndexSQL('posts', 'body', { using: 'gin' })
      expect(sql).toContain('USING gin')
    })

    test('supports CONCURRENTLY', () => {
      const sql = adapter.createIndexSQL('users', 'email', { concurrently: true })
      expect(sql).toContain('CONCURRENTLY')
    })
  })

  describe('dropIndexSQL', () => {
    test('generates DROP INDEX', () => {
      expect(adapter.dropIndexSQL('index_users_on_email'))
        .toBe('DROP INDEX IF EXISTS "index_users_on_email"')
    })

    test('supports CASCADE', () => {
      expect(adapter.dropIndexSQL('index_users_on_email', { cascade: true }))
        .toContain('CASCADE')
    })
  })

  // ============================================
  // Query Generation Tests
  // ============================================

  describe('selectSQL', () => {
    test('generates basic SELECT', () => {
      const { sql, params } = adapter.selectSQL({ table: 'users' })
      expect(sql).toBe('SELECT * FROM "users"')
      expect(params).toEqual([])
    })

    test('generates SELECT with columns', () => {
      const { sql } = adapter.selectSQL({
        table: 'users',
        columns: ['id', 'name', 'email']
      })
      expect(sql).toBe('SELECT "id", "name", "email" FROM "users"')
    })

    test('generates SELECT with WHERE', () => {
      const { sql, params } = adapter.selectSQL({
        table: 'users',
        where: [{ column: 'id', value: 1 }]
      })
      expect(sql).toBe('SELECT * FROM "users" WHERE "id" = $1')
      expect(params).toEqual([1])
    })

    test('generates SELECT with ORDER BY', () => {
      const { sql } = adapter.selectSQL({
        table: 'users',
        order: [{ column: 'created_at', direction: 'desc' }]
      })
      expect(sql).toContain('ORDER BY "created_at" DESC')
    })

    test('generates SELECT with LIMIT and OFFSET', () => {
      const { sql } = adapter.selectSQL({
        table: 'users',
        limit: 10,
        offset: 20
      })
      expect(sql).toContain('LIMIT 10')
      expect(sql).toContain('OFFSET 20')
    })

    test('generates SELECT with JOIN', () => {
      const { sql } = adapter.selectSQL({
        table: 'posts',
        joins: [{ table: 'users', on: '"posts"."user_id" = "users"."id"' }]
      })
      expect(sql).toContain('INNER JOIN "users" ON "posts"."user_id" = "users"."id"')
    })

    test('generates SELECT DISTINCT', () => {
      const { sql } = adapter.selectSQL({
        table: 'users',
        distinct: true
      })
      expect(sql).toContain('SELECT DISTINCT')
    })
  })

  describe('insertSQL', () => {
    test('generates basic INSERT', () => {
      const { sql, params } = adapter.insertSQL('users', { name: 'John', email: 'john@example.com' })
      expect(sql).toBe('INSERT INTO "users" ("name", "email") VALUES ($1, $2)')
      expect(params).toEqual(['John', 'john@example.com'])
    })

    test('generates INSERT with RETURNING', () => {
      const { sql } = adapter.insertSQL('users', { name: 'John' }, { returning: true })
      expect(sql).toContain('RETURNING *')
    })

    test('generates INSERT with specific RETURNING columns', () => {
      const { sql } = adapter.insertSQL('users', { name: 'John' }, { returning: ['id', 'created_at'] })
      expect(sql).toContain('RETURNING "id", "created_at"')
    })

    test('generates bulk INSERT', () => {
      const { sql, params } = adapter.insertSQL('users', [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' }
      ])
      expect(sql).toContain('VALUES ($1, $2), ($3, $4)')
      expect(params).toEqual(['John', 'john@example.com', 'Jane', 'jane@example.com'])
    })

    test('generates INSERT with ON CONFLICT', () => {
      const { sql } = adapter.insertSQL('users', { name: 'John', email: 'john@example.com' }, {
        onConflict: {
          columns: ['email'],
          update: ['name']
        }
      })
      expect(sql).toContain('ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"')
    })

    test('generates INSERT with ON CONFLICT DO NOTHING', () => {
      const { sql } = adapter.insertSQL('users', { name: 'John' }, {
        onConflict: {
          columns: ['email'],
          doNothing: true
        }
      })
      expect(sql).toContain('ON CONFLICT ("email") DO NOTHING')
    })
  })

  describe('updateSQL', () => {
    test('generates basic UPDATE', () => {
      const { sql, params } = adapter.updateSQL('users', { name: 'Jane' }, [{ column: 'id', value: 1 }])
      expect(sql).toBe('UPDATE "users" SET "name" = $1 WHERE "id" = $2')
      expect(params).toEqual(['Jane', 1])
    })

    test('generates UPDATE with RETURNING', () => {
      const { sql } = adapter.updateSQL('users', { name: 'Jane' }, [], { returning: true })
      expect(sql).toContain('RETURNING *')
    })

    test('generates UPDATE without WHERE', () => {
      const { sql, params } = adapter.updateSQL('users', { is_active: true })
      expect(sql).toBe('UPDATE "users" SET "is_active" = $1')
      expect(params).toEqual([true])
    })
  })

  describe('deleteSQL', () => {
    test('generates basic DELETE', () => {
      const { sql, params } = adapter.deleteSQL('users', [{ column: 'id', value: 1 }])
      expect(sql).toBe('DELETE FROM "users" WHERE "id" = $1')
      expect(params).toEqual([1])
    })

    test('generates DELETE with RETURNING', () => {
      const { sql } = adapter.deleteSQL('users', [], { returning: true })
      expect(sql).toContain('RETURNING *')
    })
  })

  describe('whereClauseSQL', () => {
    test('handles basic equality', () => {
      const { sql, params } = adapter.whereClauseSQL([{ column: 'id', value: 1 }])
      expect(sql).toBe('"id" = $1')
      expect(params).toEqual([1])
    })

    test('handles multiple conditions', () => {
      const { sql, params } = adapter.whereClauseSQL([
        { column: 'status', value: 'active' },
        { column: 'role', value: 'admin' }
      ])
      expect(sql).toBe('"status" = $1 AND "role" = $2')
      expect(params).toEqual(['active', 'admin'])
    })

    test('handles IS NULL', () => {
      const { sql, params } = adapter.whereClauseSQL([{ column: 'deleted_at', operator: 'IS NULL' }])
      expect(sql).toBe('"deleted_at" IS NULL')
      expect(params).toEqual([])
    })

    test('handles IN operator', () => {
      const { sql, params } = adapter.whereClauseSQL([{ column: 'id', operator: 'IN', value: [1, 2, 3] }])
      expect(sql).toBe('"id" IN ($1, $2, $3)')
      expect(params).toEqual([1, 2, 3])
    })

    test('handles empty IN as FALSE', () => {
      const { sql } = adapter.whereClauseSQL([{ column: 'id', operator: 'IN', value: [] }])
      expect(sql).toBe('FALSE')
    })

    test('handles LIKE operator', () => {
      const { sql, params } = adapter.whereClauseSQL([{ column: 'name', operator: 'LIKE', value: '%john%' }])
      expect(sql).toBe('"name" LIKE $1')
      expect(params).toEqual(['%john%'])
    })

    test('handles BETWEEN operator', () => {
      const { sql, params } = adapter.whereClauseSQL([{ column: 'age', operator: 'BETWEEN', value: [18, 65] }])
      expect(sql).toBe('"age" BETWEEN $1 AND $2')
      expect(params).toEqual([18, 65])
    })

    test('handles comparison operators', () => {
      const { sql, params } = adapter.whereClauseSQL([
        { column: 'price', operator: '>', value: 100 }
      ])
      expect(sql).toBe('"price" > $1')
      expect(params).toEqual([100])
    })
  })

  // ============================================
  // Schema Introspection Tests
  // ============================================

  describe('columnsSQL', () => {
    test('generates columns query', () => {
      const { sql, params } = adapter.columnsSQL('users')
      expect(sql).toContain('information_schema.columns')
      expect(params).toEqual(['public', 'users'])
    })
  })

  describe('indexesSQL', () => {
    test('generates indexes query', () => {
      const { sql, params } = adapter.indexesSQL('users')
      expect(sql).toContain('pg_index')
      expect(params).toEqual(['public', 'users'])
    })
  })

  describe('foreignKeysSQL', () => {
    test('generates foreign keys query', () => {
      const { sql, params } = adapter.foreignKeysSQL('posts')
      expect(sql).toContain('pg_constraint')
      expect(params).toEqual(['public', 'posts'])
    })
  })

  describe('tableExistsSQL', () => {
    test('generates table exists query', () => {
      const { sql, params } = adapter.tableExistsSQL('users')
      expect(sql).toContain('information_schema.tables')
      expect(params).toEqual(['public', 'users'])
    })
  })

  describe('tablesSQL', () => {
    test('generates tables list query', () => {
      const { sql, params } = adapter.tablesSQL()
      expect(sql).toContain('information_schema.tables')
      expect(params).toEqual(['public'])
    })
  })

  // ============================================
  // Module Exports Tests
  // ============================================

  describe('exports', () => {
    test('COLUMN_TYPES includes expected types', () => {
      expect(COLUMN_TYPES.string).toBe('VARCHAR(255)')
      expect(COLUMN_TYPES.integer).toBe('INTEGER')
      expect(COLUMN_TYPES.boolean).toBe('BOOLEAN')
      expect(COLUMN_TYPES.jsonb).toBe('JSONB')
    })

    test('TYPE_ALIASES includes expected mappings', () => {
      expect(TYPE_ALIASES['character varying']).toBe('string')
      expect(TYPE_ALIASES['boolean']).toBe('boolean')
    })

    test('RESERVED_WORDS includes common reserved words', () => {
      expect(RESERVED_WORDS.has('select')).toBe(true)
      expect(RESERVED_WORDS.has('user')).toBe(true)
      expect(RESERVED_WORDS.has('table')).toBe(true)
    })

    test('getAdapter returns singleton', () => {
      const adapter1 = getAdapter()
      const adapter2 = getAdapter()
      expect(adapter1).toBe(adapter2)
    })

    test('setAdapter changes default adapter', () => {
      const customAdapter = new PostgresAdapter({ identifierQuoteChar: '`' })
      setAdapter(customAdapter)
      expect(getAdapter()).toBe(customAdapter)

      // Reset
      setAdapter(new PostgresAdapter())
    })
  })
})
