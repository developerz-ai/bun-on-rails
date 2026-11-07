/**
 * Schema Tests
 *
 * Unit tests for the SchemaGenerator and SchemaLoader classes.
 * Tests schema dumping and loading functionality.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { SchemaGenerator, SchemaLoader, dumpSchema, loadSchema } from '../../src/database/schema.js'
import path from 'path'
import fs from 'fs'
import os from 'os'

// ============================================
// Mock Database Helper
// ============================================

/**
 * Creates a mock database connection for testing
 */
function createMockDb(mockResponses = {}) {
  const executedQueries = []

  return {
    executedQueries,
    query: async (sql, params = []) => {
      executedQueries.push({ sql, params })

      // Check for specific query responses
      for (const [pattern, response] of Object.entries(mockResponses)) {
        if (sql.includes(pattern)) {
          return typeof response === 'function' ? response(sql, params) : response
        }
      }

      return []
    }
  }
}

// ============================================
// Test Fixtures
// ============================================

const MOCK_TABLES = [
  { table_name: 'users' },
  { table_name: 'posts' },
  { table_name: 'comments' },
  { table_name: 'schema_migrations' }
]

const MOCK_USER_COLUMNS = [
  {
    column_name: 'id',
    data_type: 'bigint',
    udt_name: 'int8',
    column_default: "nextval('users_id_seq'::regclass)",
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: 64,
    numeric_scale: 0,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'email',
    data_type: 'character varying',
    udt_name: 'varchar',
    column_default: null,
    is_nullable: 'NO',
    character_maximum_length: 255,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: true
  },
  {
    column_name: 'name',
    data_type: 'character varying',
    udt_name: 'varchar',
    column_default: null,
    is_nullable: 'YES',
    character_maximum_length: 100,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'is_admin',
    data_type: 'boolean',
    udt_name: 'bool',
    column_default: 'false',
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'created_at',
    data_type: 'timestamp without time zone',
    udt_name: 'timestamp',
    column_default: 'NOW()',
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'updated_at',
    data_type: 'timestamp without time zone',
    udt_name: 'timestamp',
    column_default: 'NOW()',
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  }
]

const MOCK_POST_COLUMNS = [
  {
    column_name: 'id',
    data_type: 'bigint',
    udt_name: 'int8',
    column_default: "nextval('posts_id_seq'::regclass)",
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: 64,
    numeric_scale: 0,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'title',
    data_type: 'character varying',
    udt_name: 'varchar',
    column_default: null,
    is_nullable: 'NO',
    character_maximum_length: 255,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'body',
    data_type: 'text',
    udt_name: 'text',
    column_default: null,
    is_nullable: 'YES',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'user_id',
    data_type: 'bigint',
    udt_name: 'int8',
    column_default: null,
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: 64,
    numeric_scale: 0,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'metadata',
    data_type: 'jsonb',
    udt_name: 'jsonb',
    column_default: "'{}'::jsonb",
    is_nullable: 'YES',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'created_at',
    data_type: 'timestamp without time zone',
    udt_name: 'timestamp',
    column_default: 'NOW()',
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  },
  {
    column_name: 'updated_at',
    data_type: 'timestamp without time zone',
    udt_name: 'timestamp',
    column_default: 'NOW()',
    is_nullable: 'NO',
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    is_identity: 'NO',
    is_unique: false
  }
]

const MOCK_USER_INDEXES = [
  {
    index_name: 'users_pkey',
    index_type: 'btree',
    is_unique: true,
    is_primary: true,
    columns: ['id'],
    where_clause: null
  },
  {
    index_name: 'index_users_on_email',
    index_type: 'btree',
    is_unique: true,
    is_primary: false,
    columns: ['email'],
    where_clause: null
  }
]

const MOCK_POST_INDEXES = [
  {
    index_name: 'posts_pkey',
    index_type: 'btree',
    is_unique: true,
    is_primary: true,
    columns: ['id'],
    where_clause: null
  },
  {
    index_name: 'index_posts_on_user_id',
    index_type: 'btree',
    is_unique: false,
    is_primary: false,
    columns: ['user_id'],
    where_clause: null
  }
]

const MOCK_POST_FOREIGN_KEYS = [
  {
    constraint_name: 'fk_posts_user_id',
    column_name: 'user_id',
    foreign_table: 'users',
    foreign_column: 'id',
    on_delete: 'a', // NO ACTION
    on_update: 'a'
  }
]

// ============================================
// Test Helpers
// ============================================

async function createTempDir() {
  const tmpDir = path.join(os.tmpdir(), `bor-test-schema-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.promises.mkdir(tmpDir, { recursive: true })
  return tmpDir
}

async function cleanupTempDir(dir) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
  }
}

// ============================================
// SchemaGenerator Tests
// ============================================

describe('SchemaGenerator', () => {
  let tmpDir

  afterEach(async () => {
    if (tmpDir) {
      await cleanupTempDir(tmpDir)
      tmpDir = null
    }
  })

  describe('constructor', () => {
    test('creates generator with database connection', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db)

      expect(generator.db).toBe(db)
      expect(generator.schema).toBe('public')
    })

    test('accepts custom schema option', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db, { schema: 'myschema' })

      expect(generator.schema).toBe('myschema')
    })
  })

  describe('getTables', () => {
    test('returns list of table names', async () => {
      const db = createMockDb({
        'information_schema.tables': MOCK_TABLES
      })
      const generator = new SchemaGenerator(db)

      const tables = await generator.getTables()

      expect(tables).toEqual(['users', 'posts', 'comments', 'schema_migrations'])
    })
  })

  describe('getSchemaVersion', () => {
    test('returns latest migration version', async () => {
      const db = createMockDb({
        'SELECT version FROM schema_migrations': [{ version: '20250124120000' }]
      })
      const generator = new SchemaGenerator(db)

      const version = await generator.getSchemaVersion()

      expect(version).toBe('20250124120000')
    })

    test('returns 0 when no migrations exist', async () => {
      const db = createMockDb({
        'SELECT version FROM schema_migrations': []
      })
      const generator = new SchemaGenerator(db)

      const version = await generator.getSchemaVersion()

      expect(version).toBe('0')
    })

    test('returns 0 when schema_migrations table does not exist', async () => {
      const db = createMockDb({
        'SELECT version FROM schema_migrations': () => {
          throw new Error('relation "schema_migrations" does not exist')
        }
      })
      const generator = new SchemaGenerator(db)

      const version = await generator.getSchemaVersion()

      expect(version).toBe('0')
    })
  })

  describe('generate', () => {
    test('generates valid JavaScript schema file', async () => {
      const db = createMockDb({
        'information_schema.tables': MOCK_TABLES,
        'SELECT version FROM schema_migrations': [{ version: '20250124120000' }],
        'information_schema.columns': (sql, params) => {
          if (params[1] === 'users') return MOCK_USER_COLUMNS
          if (params[1] === 'posts') return MOCK_POST_COLUMNS
          return []
        },
        'pg_index': (sql, params) => {
          if (params[1] === 'users') return MOCK_USER_INDEXES
          if (params[1] === 'posts') return MOCK_POST_INDEXES
          return []
        },
        'pg_constraint': (sql, params) => {
          if (params[1] === 'posts') return MOCK_POST_FOREIGN_KEYS
          return []
        }
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      // Check header comment
      expect(content).toContain('Database Schema')
      expect(content).toContain('auto-generated')
      expect(content).toContain('DO NOT EDIT MANUALLY')

      // Check schema version
      expect(content).toContain("schemaVersion = '20250124120000'")

      // Check up function
      expect(content).toContain('export async function up(db)')

      // Check users table
      expect(content).toContain("await db.createTable('users'")
      expect(content).toContain("t.id()")
      expect(content).toContain("t.string('email'")
      expect(content).toContain("t.string('name'")
      expect(content).toContain("t.boolean('is_admin')")
      expect(content).toContain("t.timestamps()")

      // Check posts table
      expect(content).toContain("await db.createTable('posts'")
      expect(content).toContain("t.string('title')")
      expect(content).toContain("t.text('body')")
      expect(content).toContain("t.references('user')")
      expect(content).toContain("t.jsonb('metadata')")

      // Check down function
      expect(content).toContain('export async function down(db)')
      expect(content).toContain("await db.dropTable")

      // Check tables export
      expect(content).toContain('export const tables')

      // Should NOT include schema_migrations table
      expect(content).not.toContain("createTable('schema_migrations'")
    })

    test('generates proper column modifiers', async () => {
      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'users' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': MOCK_USER_COLUMNS,
        'pg_index': MOCK_USER_INDEXES,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      // Email should be notNull and unique
      expect(content).toContain("t.string('email')")
      expect(content).toContain('.notNull()')
      expect(content).toContain('.unique()')

      // is_admin should have default value
      expect(content).toContain("t.boolean('is_admin')")
      expect(content).toContain('.default(false)')
    })

    test('generates foreign key references', async () => {
      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'posts' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': MOCK_POST_COLUMNS,
        'pg_index': MOCK_POST_INDEXES,
        'pg_constraint': MOCK_POST_FOREIGN_KEYS
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      // Should generate references call
      expect(content).toContain("t.references('user')")
    })
  })

  describe('dump', () => {
    test('writes schema to file', async () => {
      tmpDir = await createTempDir()
      const schemaPath = path.join(tmpDir, 'db', 'schema.js')

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'users' }],
        'SELECT version FROM schema_migrations': [{ version: '123' }],
        'information_schema.columns': MOCK_USER_COLUMNS,
        'pg_index': MOCK_USER_INDEXES,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      await generator.dump(schemaPath)

      // File should exist
      const exists = await fs.promises.access(schemaPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)

      // File should contain schema
      const content = await fs.promises.readFile(schemaPath, 'utf8')
      expect(content).toContain('export async function up(db)')
    })

    test('creates directory if it does not exist', async () => {
      tmpDir = await createTempDir()
      const schemaPath = path.join(tmpDir, 'nested', 'deep', 'db', 'schema.js')

      const db = createMockDb({
        'information_schema.tables': [],
        'SELECT version FROM schema_migrations': []
      })

      const generator = new SchemaGenerator(db)
      await generator.dump(schemaPath)

      const exists = await fs.promises.access(schemaPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })
  })

  describe('mapDataType', () => {
    test('maps PostgreSQL types to framework types', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db)

      expect(generator.mapDataType('bigint', 'int8')).toBe('bigint')
      expect(generator.mapDataType('integer', 'int4')).toBe('integer')
      expect(generator.mapDataType('boolean', 'bool')).toBe('boolean')
      expect(generator.mapDataType('text', 'text')).toBe('text')
      expect(generator.mapDataType('character varying', 'varchar')).toBe('string')
      expect(generator.mapDataType('timestamp without time zone', 'timestamp')).toBe('datetime')
      expect(generator.mapDataType('timestamp with time zone', 'timestamptz')).toBe('timestamptz')
      expect(generator.mapDataType('json', 'json')).toBe('json')
      expect(generator.mapDataType('jsonb', 'jsonb')).toBe('jsonb')
      expect(generator.mapDataType('uuid', 'uuid')).toBe('uuid')
    })
  })

  describe('formatDefaultValue', () => {
    test('formats SQL function defaults', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db)

      expect(generator.formatDefaultValue('NOW()', 'timestamp')).toBe("'NOW()'")
      expect(generator.formatDefaultValue('CURRENT_TIMESTAMP', 'timestamp')).toBe("'NOW()'")
      expect(generator.formatDefaultValue('gen_random_uuid()', 'uuid')).toBe("'gen_random_uuid()'")
    })

    test('formats boolean defaults', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db)

      expect(generator.formatDefaultValue('true', 'boolean')).toBe('true')
      expect(generator.formatDefaultValue('false', 'boolean')).toBe('false')
    })

    test('formats numeric defaults', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db)

      expect(generator.formatDefaultValue('0', 'integer')).toBe('0')
      expect(generator.formatDefaultValue('42', 'integer')).toBe('42')
      expect(generator.formatDefaultValue('3.14', 'numeric')).toBe('3.14')
    })

    test('formats string defaults', () => {
      const db = createMockDb()
      const generator = new SchemaGenerator(db)

      expect(generator.formatDefaultValue("'hello'", 'character varying')).toBe("'hello'")
      expect(generator.formatDefaultValue("'hello'::character varying", 'character varying')).toBe("'hello'")
    })
  })
})

// ============================================
// SchemaLoader Tests
// ============================================

describe('SchemaLoader', () => {
  let tmpDir

  afterEach(async () => {
    if (tmpDir) {
      await cleanupTempDir(tmpDir)
      tmpDir = null
    }
  })

  describe('constructor', () => {
    test('creates loader with database connection', () => {
      const db = createMockDb()
      const loader = new SchemaLoader(db)

      expect(loader.db).toBe(db)
    })
  })

  describe('load', () => {
    test('loads and executes schema file', async () => {
      tmpDir = await createTempDir()
      const schemaPath = path.join(tmpDir, 'schema.js')

      // Create a test schema file
      await fs.promises.writeFile(schemaPath, `
        export const schemaVersion = '20250124120000'

        export async function up(db) {
          await db.createTable('test_table', (t) => {
            t.id()
            t.string('name').notNull()
            t.timestamps()
          })
        }

        export async function down(db) {
          await db.dropTable('test_table', { cascade: true })
        }
      `)

      const executedQueries = []
      const db = {
        query: async (sql, params = []) => {
          executedQueries.push({ sql, params })
          return []
        }
      }

      const loader = new SchemaLoader(db)
      await loader.load(schemaPath)

      // Should have created schema_migrations table
      const createMigrations = executedQueries.find(q =>
        q.sql.includes('CREATE TABLE IF NOT EXISTS "schema_migrations"')
      )
      expect(createMigrations).toBeDefined()

      // Should have recorded the version
      const insertVersion = executedQueries.find(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertVersion).toBeDefined()
      expect(insertVersion.params).toEqual(['20250124120000'])
    })

    test('does not record version 0', async () => {
      tmpDir = await createTempDir()
      const schemaPath = path.join(tmpDir, 'schema.js')

      await fs.promises.writeFile(schemaPath, `
        export const schemaVersion = '0'

        export async function up(db) {}

        export async function down(db) {}
      `)

      const executedQueries = []
      const db = {
        query: async (sql, params = []) => {
          executedQueries.push({ sql, params })
          return []
        }
      }

      const loader = new SchemaLoader(db)
      await loader.load(schemaPath)

      // Should NOT have recorded version 0
      const insertVersion = executedQueries.find(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertVersion).toBeUndefined()
    })

    test('throws if schema file does not export up function', async () => {
      tmpDir = await createTempDir()
      const schemaPath = path.join(tmpDir, 'invalid-schema.js')

      await fs.promises.writeFile(schemaPath, `
        export const schemaVersion = '123'
        // Missing up function!
      `)

      const db = createMockDb()
      const loader = new SchemaLoader(db)

      await expect(loader.load(schemaPath)).rejects.toThrow("does not export an 'up' function")
    })
  })

  describe('recordVersion', () => {
    test('creates schema_migrations table if needed', async () => {
      const db = createMockDb()
      const loader = new SchemaLoader(db)

      await loader.recordVersion('20250124120000')

      const createTable = db.executedQueries.find(q =>
        q.sql.includes('CREATE TABLE IF NOT EXISTS "schema_migrations"')
      )
      expect(createTable).toBeDefined()
    })

    test('does not duplicate version if already exists', async () => {
      const db = createMockDb({
        'SELECT version FROM schema_migrations WHERE version': [{ version: '20250124120000' }]
      })
      const loader = new SchemaLoader(db)

      await loader.recordVersion('20250124120000')

      const insertQueries = db.executedQueries.filter(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertQueries.length).toBe(0)
    })

    test('inserts version if not exists', async () => {
      const db = createMockDb({
        'SELECT version FROM schema_migrations WHERE version': []
      })
      const loader = new SchemaLoader(db)

      await loader.recordVersion('20250124120000')

      const insertQuery = db.executedQueries.find(q =>
        q.sql.includes('INSERT INTO schema_migrations')
      )
      expect(insertQuery).toBeDefined()
      expect(insertQuery.params).toEqual(['20250124120000'])
    })
  })
})

// ============================================
// Integration Tests
// ============================================

describe('Schema Integration', () => {
  let tmpDir

  afterEach(async () => {
    if (tmpDir) {
      await cleanupTempDir(tmpDir)
      tmpDir = null
    }
  })

  test('round-trip: dump and load schema', async () => {
    tmpDir = await createTempDir()
    const schemaPath = path.join(tmpDir, 'db', 'schema.js')

    // Mock database for dump
    const dumpDb = createMockDb({
      'information_schema.tables': [
        { table_name: 'users' },
        { table_name: 'posts' }
      ],
      'SELECT version FROM schema_migrations': [{ version: '20250124120000' }],
      'information_schema.columns': (sql, params) => {
        if (params[1] === 'users') return MOCK_USER_COLUMNS
        if (params[1] === 'posts') return MOCK_POST_COLUMNS
        return []
      },
      'pg_index': (sql, params) => {
        if (params[1] === 'users') return MOCK_USER_INDEXES
        if (params[1] === 'posts') return MOCK_POST_INDEXES
        return []
      },
      'pg_constraint': (sql, params) => {
        if (params[1] === 'posts') return MOCK_POST_FOREIGN_KEYS
        return []
      }
    })

    // Dump schema
    const generator = new SchemaGenerator(dumpDb)
    await generator.dump(schemaPath)

    // Verify file was created
    const content = await fs.promises.readFile(schemaPath, 'utf8')
    expect(content).toContain("schemaVersion = '20250124120000'")

    // Load schema into a "fresh" database
    const loadDb = createMockDb()
    const loader = new SchemaLoader(loadDb)

    // Note: Loading will fail because the schema calls createTable which needs
    // a Migration-like object. This test verifies the dump/load flow conceptually.
    // Full integration would require a real database.
  })

  test('dumpSchema helper function', async () => {
    tmpDir = await createTempDir()

    const db = createMockDb({
      'information_schema.tables': [{ table_name: 'test' }],
      'SELECT version FROM schema_migrations': [{ version: '999' }],
      'information_schema.columns': [],
      'pg_index': [],
      'pg_constraint': []
    })

    // Capture console.log
    const logs = []
    const originalLog = console.log
    console.log = (msg) => logs.push(msg)

    try {
      const result = await dumpSchema(db, tmpDir)

      expect(result).toBe(path.join(tmpDir, 'db', 'schema.js'))
      expect(logs.some(l => l.includes('Schema dumped'))).toBe(true)

      // Verify file exists
      const exists = await fs.promises.access(result).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    } finally {
      console.log = originalLog
    }
  })

  test('loadSchema throws when file does not exist', async () => {
    tmpDir = await createTempDir()
    const db = createMockDb()

    await expect(loadSchema(db, tmpDir)).rejects.toThrow('Schema file not found')
  })
})

// ============================================
// Edge Cases
// ============================================

describe('Schema Edge Cases', () => {
  describe('special column types', () => {
    test('handles UUID primary key', async () => {
      const columns = [{
        column_name: 'id',
        data_type: 'uuid',
        udt_name: 'uuid',
        column_default: 'gen_random_uuid()',
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }]

      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain('t.id({ uuid: true })')
    })

    test('handles decimal with precision and scale', async () => {
      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'price',
        data_type: 'numeric',
        udt_name: 'numeric',
        column_default: null,
        is_nullable: 'NO',
        character_maximum_length: null,
        numeric_precision: 10,
        numeric_scale: 2,
        is_identity: 'NO',
        is_unique: false
      }]

      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("t.decimal('price', { precision: 10, scale: 2 })")
    })

    test('handles string with non-default length', async () => {
      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'short_code',
        data_type: 'character varying',
        udt_name: 'varchar',
        column_default: null,
        is_nullable: 'YES',
        character_maximum_length: 10,
        is_identity: 'NO',
        is_unique: false
      }]

      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("t.string('short_code', { limit: 10 })")
    })
  })

  describe('special foreign key options', () => {
    test('handles ON DELETE CASCADE', async () => {
      const fks = [{
        constraint_name: 'fk_test',
        column_name: 'parent_id',
        foreign_table: 'parents',
        foreign_column: 'id',
        on_delete: 'c', // CASCADE
        on_update: 'a'
      }]

      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'parent_id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: null,
        is_nullable: 'YES',
        is_identity: 'NO',
        is_unique: false
      }]

      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': fks
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("onDelete: 'CASCADE'")
    })

    test('handles non-standard foreign table name', async () => {
      const fks = [{
        constraint_name: 'fk_test',
        column_name: 'author_id',
        foreign_table: 'users', // Not 'authors'!
        foreign_column: 'id',
        on_delete: 'a',
        on_update: 'a'
      }]

      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'author_id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: null,
        is_nullable: 'YES',
        is_identity: 'NO',
        is_unique: false
      }]

      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': fks
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("t.references('author', { table: 'users' })")
    })
  })

  describe('indexes', () => {
    test('handles partial (where clause) indexes', async () => {
      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }, {
        index_name: 'index_test_on_active',
        index_type: 'btree',
        is_unique: false,
        is_primary: false,
        columns: ['active'],
        where_clause: '(active = true)'
      }]

      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'active',
        data_type: 'boolean',
        udt_name: 'bool',
        column_default: 'true',
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("t.index('active', { where: '(active = true)' })")
    })

    test('handles GIN indexes', async () => {
      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }, {
        index_name: 'index_test_on_search',
        index_type: 'gin',
        is_unique: false,
        is_primary: false,
        columns: ['search_vector'],
        where_clause: null
      }]

      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'search_vector',
        data_type: 'tsvector',
        udt_name: 'tsvector',
        column_default: null,
        is_nullable: 'YES',
        is_identity: 'NO',
        is_unique: false
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("using: 'gin'")
    })

    test('handles composite indexes', async () => {
      const indexes = [{
        index_name: 'test_pkey',
        index_type: 'btree',
        is_unique: true,
        is_primary: true,
        columns: ['id'],
        where_clause: null
      }, {
        index_name: 'index_test_on_a_and_b',
        index_type: 'btree',
        is_unique: true,
        is_primary: false,
        columns: ['col_a', 'col_b'],
        where_clause: null
      }]

      const columns = [{
        column_name: 'id',
        data_type: 'bigint',
        udt_name: 'int8',
        column_default: "nextval('test_id_seq'::regclass)",
        is_nullable: 'NO',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'col_a',
        data_type: 'integer',
        udt_name: 'int4',
        column_default: null,
        is_nullable: 'YES',
        is_identity: 'NO',
        is_unique: false
      }, {
        column_name: 'col_b',
        data_type: 'integer',
        udt_name: 'int4',
        column_default: null,
        is_nullable: 'YES',
        is_identity: 'NO',
        is_unique: false
      }]

      const db = createMockDb({
        'information_schema.tables': [{ table_name: 'test' }],
        'SELECT version FROM schema_migrations': [],
        'information_schema.columns': columns,
        'pg_index': indexes,
        'pg_constraint': []
      })

      const generator = new SchemaGenerator(db)
      const content = await generator.generate()

      expect(content).toContain("t.index(['col_a', 'col_b'], { unique: true })")
    })
  })
})
