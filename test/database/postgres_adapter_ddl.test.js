/**
 * PostgreSQL Adapter Tests - DDL Generation
 *
 * Tests for CREATE TABLE, ALTER TABLE, and index SQL generation
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { PostgresAdapter } from '../../src/database/adapters/postgres.js'

describe('PostgresAdapter - DDL', () => {
  let adapter

  beforeEach(() => {
    adapter = new PostgresAdapter()
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
})
