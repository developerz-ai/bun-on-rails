/**
 * MigrationRunner Tests
 *
 * Unit tests for the MigrationRunner class - running pending migrations
 * and tracking them in the schema_migrations table.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { MigrationRunner, Migration, TableBuilder } from '../../src/database/migration.js'
import { PostgresAdapter } from '../../src/database/adapters/postgres.js'
import path from 'path'
import fs from 'fs'
import os from 'os'

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

      // Handle schema_migrations queries
      if (sql.includes('CREATE TABLE IF NOT EXISTS "schema_migrations"')) {
        return []
      }

      if (sql.includes('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT')) {
        // For rollback query
        if (options.onQuery) {
          return options.onQuery(sql, params)
        }
        return mockData.completedVersionsDesc || []
      }

      if (sql.includes('SELECT version FROM schema_migrations')) {
        return mockData.completedVersions || []
      }

      if (sql.includes('INSERT INTO schema_migrations')) {
        return []
      }

      if (sql.includes('DELETE FROM schema_migrations')) {
        return []
      }

      // Default - return mock data or empty array
      if (options.onQuery) {
        return options.onQuery(sql, params)
      }

      return []
    }
  }
}

// ============================================
// Migration Test Fixtures
// ============================================

// Create a temporary directory with test migrations
async function createTestMigrations(migrations) {
  const tmpDir = path.join(os.tmpdir(), `bor-test-migrations-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.promises.mkdir(tmpDir, { recursive: true })

  for (const migration of migrations) {
    const filePath = path.join(tmpDir, migration.filename)
    await fs.promises.writeFile(filePath, migration.content)
  }

  return tmpDir
}

// Clean up test migrations directory
async function cleanupTestMigrations(dir) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
  }
}

// ============================================
// MigrationRunner Tests
// ============================================

describe('MigrationRunner', () => {
  let mockDb
  let tmpDir

  afterEach(async () => {
    if (tmpDir) {
      await cleanupTestMigrations(tmpDir)
      tmpDir = null
    }
  })

  // ============================================
  // Constructor Tests
  // ============================================

  describe('constructor', () => {
    test('creates runner with database and migrations path', () => {
      const db = createMockDb()
      const runner = new MigrationRunner(db, '/path/to/migrations')

      expect(runner.db).toBe(db)
      expect(runner.migrationsPath).toBe('/path/to/migrations')
      expect(runner.adapter).toBeInstanceOf(PostgresAdapter)
    })
  })

  // ============================================
  // ensureMigrationsTable Tests
  // ============================================

  describe('ensureMigrationsTable', () => {
    test('creates schema_migrations table if not exists', async () => {
      const db = createMockDb()
      const runner = new MigrationRunner(db, '/tmp/migrations')

      await runner.ensureMigrationsTable()

      expect(db.executedQueries.length).toBe(1)
      expect(db.executedQueries[0].sql).toContain('CREATE TABLE IF NOT EXISTS "schema_migrations"')
      expect(db.executedQueries[0].sql).toContain('"version" VARCHAR(255) PRIMARY KEY')
      expect(db.executedQueries[0].sql).toContain('"executed_at" TIMESTAMP DEFAULT NOW()')
    })
  })

  // ============================================
  // getCompletedVersions Tests
  // ============================================

  describe('getCompletedVersions', () => {
    test('returns empty array when no migrations have run', async () => {
      const db = createMockDb({ mockData: { completedVersions: [] } })
      const runner = new MigrationRunner(db, '/tmp/migrations')

      const versions = await runner.getCompletedVersions()

      expect(versions).toEqual([])
    })

    test('returns list of completed migration versions', async () => {
      const db = createMockDb({
        mockData: {
          completedVersions: [
            { version: '20250101120000' },
            { version: '20250102120000' },
            { version: '20250103120000' }
          ]
        }
      })
      const runner = new MigrationRunner(db, '/tmp/migrations')

      const versions = await runner.getCompletedVersions()

      expect(versions).toEqual(['20250101120000', '20250102120000', '20250103120000'])
    })

    test('ensures migrations table exists before querying', async () => {
      const db = createMockDb()
      const runner = new MigrationRunner(db, '/tmp/migrations')

      await runner.getCompletedVersions()

      // First query should be CREATE TABLE, second should be SELECT
      expect(db.executedQueries[0].sql).toContain('CREATE TABLE IF NOT EXISTS')
      expect(db.executedQueries[1].sql).toContain('SELECT version FROM schema_migrations')
    })
  })

  // ============================================
  // getMigrationFiles Tests
  // ============================================

  describe('getMigrationFiles', () => {
    test('returns empty array when no migration files exist', async () => {
      tmpDir = await createTestMigrations([])
      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const files = await runner.getMigrationFiles()

      expect(files).toEqual([])
    })

    test('returns migration files sorted by name', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250103_third.js', content: 'export async function up() {}' },
        { filename: '20250101_first.js', content: 'export async function up() {}' },
        { filename: '20250102_second.js', content: 'export async function up() {}' }
      ])
      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const files = await runner.getMigrationFiles()

      expect(files).toEqual([
        '20250101_first.js',
        '20250102_second.js',
        '20250103_third.js'
      ])
    })

    test('only returns .js files', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_migration.js', content: 'export async function up() {}' },
        { filename: 'readme.md', content: '# Migrations' },
        { filename: '.gitkeep', content: '' }
      ])
      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const files = await runner.getMigrationFiles()

      expect(files).toEqual(['20250101_migration.js'])
    })
  })

  // ============================================
  // migrate Tests
  // ============================================

  describe('migrate', () => {
    test('returns empty array when no migrations to run', async () => {
      tmpDir = await createTestMigrations([])
      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const executed = await runner.migrate()

      expect(executed).toEqual([])
    })

    test('runs all pending migrations in order and records versions', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_create_users.js',
          content: `
            export async function up(db) {
              // Simple migration that uses db.query
              await db.query('SELECT 1 as migration_1')
            }
            export async function down(db) {}
          `
        },
        {
          filename: '20250102_create_posts.js',
          content: `
            export async function up(db) {
              await db.query('SELECT 2 as migration_2')
            }
            export async function down(db) {}
          `
        }
      ])

      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const executed = await runner.migrate()

      // Should return versions of executed migrations
      expect(executed).toEqual(['20250101', '20250102'])

      // Should have recorded migrations in schema_migrations
      const insertQueries = db.executedQueries.filter(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertQueries.length).toBe(2)
      expect(insertQueries[0].params).toEqual(['20250101'])
      expect(insertQueries[1].params).toEqual(['20250102'])

      // Should have called the migration queries
      const migrationQueries = db.executedQueries.filter(q =>
        q.sql.includes('SELECT 1') || q.sql.includes('SELECT 2')
      )
      expect(migrationQueries.length).toBe(2)
    })

    test('skips already completed migrations', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_create_users.js',
          content: `
            export async function up(db) {
              await db.query('SELECT first')
            }
          `
        },
        {
          filename: '20250102_create_posts.js',
          content: `
            export async function up(db) {
              await db.query('SELECT second')
            }
          `
        }
      ])

      const db = createMockDb({
        mockData: {
          completedVersions: [{ version: '20250101' }]
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const executed = await runner.migrate()

      // Only the second migration should have run
      expect(executed).toEqual(['20250102'])

      // Should only record the second migration
      const insertQueries = db.executedQueries.filter(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertQueries.length).toBe(1)
      expect(insertQueries[0].params).toEqual(['20250102'])

      // Should only have run the second migration query
      const selectSecond = db.executedQueries.filter(q =>
        q.sql.includes('SELECT second')
      )
      expect(selectSecond.length).toBe(1)

      // Should NOT have run the first migration
      const selectFirst = db.executedQueries.filter(q =>
        q.sql.includes('SELECT first')
      )
      expect(selectFirst.length).toBe(0)
    })

    test('supports function-based migrations (up/down exports)', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_add_categories.js',
          content: `
            export async function up(db) {
              await db.query('CREATE TABLE categories')
            }

            export async function down(db) {
              await db.query('DROP TABLE categories')
            }
          `
        }
      ])

      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const executed = await runner.migrate()

      expect(executed).toEqual(['20250101'])

      const createQueries = db.executedQueries.filter(q =>
        q.sql.includes('CREATE TABLE categories')
      )
      expect(createQueries.length).toBe(1)
    })

    test('records migration in schema_migrations table', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250115120000_create_orders.js',
          content: `
            export async function up(db) {}
          `
        }
      ])

      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      await runner.migrate()

      const insertQueries = db.executedQueries.filter(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertQueries.length).toBe(1)
      expect(insertQueries[0].params).toEqual(['20250115120000'])
    })

    test('handles migration with version as prefix before underscore', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '202501241200_migration_name.js',
          content: `export async function up(db) {}`
        }
      ])

      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const executed = await runner.migrate()

      // Version is extracted from first part before underscore
      expect(executed).toEqual(['202501241200'])
    })

    test('logs migration progress', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_test.js',
          content: `export async function up(db) {}`
        }
      ])

      const logMessages = []
      const originalLog = console.log
      console.log = (msg) => logMessages.push(msg)

      try {
        const db = createMockDb()
        const runner = new MigrationRunner(db, tmpDir)
        await runner.migrate()

        expect(logMessages.some(m => m.includes('Migrating: 20250101_test.js'))).toBe(true)
        expect(logMessages.some(m => m.includes('Completed: 20250101_test.js'))).toBe(true)
      } finally {
        console.log = originalLog
      }
    })

    test('returns all executed versions when multiple migrations run', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_a.js', content: `export async function up(db) {}` },
        { filename: '20250102_b.js', content: `export async function up(db) {}` },
        { filename: '20250103_c.js', content: `export async function up(db) {}` }
      ])

      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const executed = await runner.migrate()

      expect(executed).toEqual(['20250101', '20250102', '20250103'])
    })
  })

  // ============================================
  // rollback Tests
  // ============================================

  describe('rollback', () => {
    test('rolls back the last migration', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_create_items.js',
          content: `
            export async function up(db) {}
            export async function down(db) {
              await db.query('DROP TABLE items')
            }
          `
        }
      ])

      const db = createMockDb({
        mockData: {
          completedVersions: [{ version: '20250101' }],
          completedVersionsDesc: [{ version: '20250101' }]
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const rolledBack = await runner.rollback()

      expect(rolledBack).toEqual(['20250101'])

      // Should have executed DROP TABLE
      const dropQueries = db.executedQueries.filter(q =>
        q.sql.includes('DROP TABLE items')
      )
      expect(dropQueries.length).toBe(1)

      // Should have deleted from schema_migrations
      const deleteQueries = db.executedQueries.filter(q =>
        q.sql.includes('DELETE FROM schema_migrations')
      )
      expect(deleteQueries.length).toBe(1)
      expect(deleteQueries[0].params).toEqual(['20250101'])
    })

    test('rolls back multiple migrations when steps > 1', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_first.js',
          content: `
            export async function up(db) {}
            export async function down(db) {
              await db.query('DOWN FIRST')
            }
          `
        },
        {
          filename: '20250102_second.js',
          content: `
            export async function up(db) {}
            export async function down(db) {
              await db.query('DOWN SECOND')
            }
          `
        }
      ])

      const db = createMockDb({
        mockData: {
          completedVersionsDesc: [{ version: '20250102' }, { version: '20250101' }]
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const rolledBack = await runner.rollback(2)

      expect(rolledBack).toEqual(['20250102', '20250101'])

      // Check both down migrations ran
      const downQueries = db.executedQueries.filter(q =>
        q.sql.includes('DOWN FIRST') || q.sql.includes('DOWN SECOND')
      )
      expect(downQueries.length).toBe(2)
    })

    test('warns when migration file not found', async () => {
      tmpDir = await createTestMigrations([])

      const warnMessages = []
      const originalWarn = console.warn
      console.warn = (msg) => warnMessages.push(msg)

      try {
        const db = createMockDb({
          mockData: {
            completedVersionsDesc: [{ version: '20250101' }]
          }
        })
        const runner = new MigrationRunner(db, tmpDir)

        const rolledBack = await runner.rollback()

        expect(rolledBack).toEqual([])
        expect(warnMessages.some(m => m.includes('not found for version 20250101'))).toBe(true)
      } finally {
        console.warn = originalWarn
      }
    })

    test('returns empty array when no migrations to rollback', async () => {
      tmpDir = await createTestMigrations([])

      const db = createMockDb({
        mockData: {
          completedVersionsDesc: []
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const rolledBack = await runner.rollback()

      expect(rolledBack).toEqual([])
    })

    test('logs rollback progress', async () => {
      tmpDir = await createTestMigrations([
        {
          filename: '20250101_test.js',
          content: `
            export async function up(db) {}
            export async function down(db) {}
          `
        }
      ])

      const logMessages = []
      const originalLog = console.log
      console.log = (msg) => logMessages.push(msg)

      try {
        const db = createMockDb({
          mockData: {
            completedVersionsDesc: [{ version: '20250101' }]
          }
        })
        const runner = new MigrationRunner(db, tmpDir)
        await runner.rollback()

        expect(logMessages.some(m => m.includes('Rolling back: 20250101_test.js'))).toBe(true)
        expect(logMessages.some(m => m.includes('Rolled back: 20250101_test.js'))).toBe(true)
      } finally {
        console.log = originalLog
      }
    })
  })

  // ============================================
  // getPending Tests
  // ============================================

  describe('getPending', () => {
    test('returns all migrations when none completed', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_first.js', content: 'export async function up() {}' },
        { filename: '20250102_second.js', content: 'export async function up() {}' }
      ])

      const db = createMockDb({ mockData: { completedVersions: [] } })
      const runner = new MigrationRunner(db, tmpDir)

      const pending = await runner.getPending()

      expect(pending).toEqual(['20250101_first.js', '20250102_second.js'])
    })

    test('returns only pending migrations', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_first.js', content: 'export async function up() {}' },
        { filename: '20250102_second.js', content: 'export async function up() {}' },
        { filename: '20250103_third.js', content: 'export async function up() {}' }
      ])

      const db = createMockDb({
        mockData: {
          completedVersions: [{ version: '20250101' }, { version: '20250102' }]
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const pending = await runner.getPending()

      expect(pending).toEqual(['20250103_third.js'])
    })

    test('returns empty array when all migrations completed', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_only.js', content: 'export async function up() {}' }
      ])

      const db = createMockDb({
        mockData: {
          completedVersions: [{ version: '20250101' }]
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const pending = await runner.getPending()

      expect(pending).toEqual([])
    })
  })

  // ============================================
  // status Tests
  // ============================================

  describe('status', () => {
    test('returns status for all migrations', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_first.js', content: 'export async function up() {}' },
        { filename: '20250102_second.js', content: 'export async function up() {}' },
        { filename: '20250103_third.js', content: 'export async function up() {}' }
      ])

      const db = createMockDb({
        mockData: {
          completedVersions: [{ version: '20250101' }, { version: '20250102' }]
        }
      })
      const runner = new MigrationRunner(db, tmpDir)

      const status = await runner.status()

      expect(status).toEqual([
        { version: '20250101', file: '20250101_first.js', status: 'up' },
        { version: '20250102', file: '20250102_second.js', status: 'up' },
        { version: '20250103', file: '20250103_third.js', status: 'down' }
      ])
    })

    test('returns empty array when no migrations exist', async () => {
      tmpDir = await createTestMigrations([])

      const db = createMockDb()
      const runner = new MigrationRunner(db, tmpDir)

      const status = await runner.status()

      expect(status).toEqual([])
    })

    test('marks all as down when no migrations completed', async () => {
      tmpDir = await createTestMigrations([
        { filename: '20250101_test.js', content: 'export async function up() {}' }
      ])

      const db = createMockDb({ mockData: { completedVersions: [] } })
      const runner = new MigrationRunner(db, tmpDir)

      const status = await runner.status()

      expect(status[0].status).toBe('down')
    })
  })
})

// ============================================
// Migration Class Tests
// ============================================

describe('Migration base class', () => {
  test('createTable uses TableBuilder and executes SQL', async () => {
    const executedQueries = []
    const mockDb = {
      query: async (sql) => {
        executedQueries.push(sql)
        return []
      }
    }

    const migration = new Migration(mockDb)

    await migration.createTable('users', (t) => {
      t.id()
      t.string('name').notNull()
      t.string('email').unique()
      t.timestamps()
    })

    // Should have executed CREATE TABLE
    expect(executedQueries.length).toBeGreaterThanOrEqual(1)
    const createSql = executedQueries[0]
    expect(createSql).toContain('CREATE TABLE "users"')
    expect(createSql).toContain('"id" BIGSERIAL PRIMARY KEY')
    expect(createSql).toContain('"name" VARCHAR(255) NOT NULL')
    expect(createSql).toContain('"email" VARCHAR(255)')
    expect(createSql).toContain('UNIQUE')
  })

  test('dropTable generates correct SQL', async () => {
    const executedQueries = []
    const mockDb = {
      query: async (sql) => {
        executedQueries.push(sql)
        return []
      }
    }

    const migration = new Migration(mockDb)
    await migration.dropTable('users')

    expect(executedQueries[0]).toContain('DROP TABLE')
    expect(executedQueries[0]).toContain('"users"')
  })

  test('addColumn generates ALTER TABLE SQL', async () => {
    const executedQueries = []
    const mockDb = {
      query: async (sql) => {
        executedQueries.push(sql)
        return []
      }
    }

    const migration = new Migration(mockDb)
    await migration.addColumn('users', 'age', 'integer', { notNull: true })

    expect(executedQueries[0]).toContain('ALTER TABLE')
    expect(executedQueries[0]).toContain('ADD COLUMN')
    expect(executedQueries[0]).toContain('"age"')
    expect(executedQueries[0]).toContain('INTEGER')
  })

  test('removeColumn generates ALTER TABLE DROP COLUMN SQL', async () => {
    const executedQueries = []
    const mockDb = {
      query: async (sql) => {
        executedQueries.push(sql)
        return []
      }
    }

    const migration = new Migration(mockDb)
    await migration.removeColumn('users', 'legacy_field')

    expect(executedQueries[0]).toContain('ALTER TABLE')
    expect(executedQueries[0]).toContain('DROP COLUMN')
    expect(executedQueries[0]).toContain('"legacy_field"')
  })

  test('addIndex generates CREATE INDEX SQL', async () => {
    const executedQueries = []
    const mockDb = {
      query: async (sql) => {
        executedQueries.push(sql)
        return []
      }
    }

    const migration = new Migration(mockDb)
    await migration.addIndex('users', ['email'], { unique: true })

    expect(executedQueries[0]).toContain('CREATE')
    expect(executedQueries[0]).toContain('UNIQUE')
    expect(executedQueries[0]).toContain('INDEX')
    expect(executedQueries[0]).toContain('"email"')
  })

  test('execute runs raw SQL', async () => {
    const executedQueries = []
    const mockDb = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params })
        return [{ result: 'success' }]
      }
    }

    const migration = new Migration(mockDb)
    const result = await migration.execute('UPDATE users SET active = $1', [true])

    expect(executedQueries[0].sql).toBe('UPDATE users SET active = $1')
    expect(executedQueries[0].params).toEqual([true])
    expect(result).toEqual([{ result: 'success' }])
  })
})
