/**
 * PostgreSQL Adapter Tests - Query Generation
 *
 * Tests for SELECT, INSERT, UPDATE, DELETE, and schema introspection SQL
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { PostgresAdapter } from '../../src/database/adapters/postgres.js'

describe('PostgresAdapter - Queries', () => {
  let adapter

  beforeEach(() => {
    adapter = new PostgresAdapter()
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
})
