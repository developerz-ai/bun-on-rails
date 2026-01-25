/**
 * Database Connection Tests
 *
 * Unit tests for Connection and ConnectionPool classes.
 * Tests use mocking to avoid requiring an actual database.
 */

import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import {
  Connection,
  ConnectionPool,
  ConnectionNotEstablishedError,
  DatabaseError,
  PoolExhaustedError,
  ADAPTERS,
  parseDatabaseUrl,
  buildConnectionString,
  getConnection,
  setConnection,
  disconnect
} from '../../src/database/connection.js'

describe('parseDatabaseUrl', () => {
  test('parses basic PostgreSQL URL', () => {
    const config = parseDatabaseUrl('postgres://user:pass@localhost:5432/mydb')

    expect(config.adapter).toBe('postgres')
    expect(config.host).toBe('localhost')
    expect(config.port).toBe(5432)
    expect(config.database).toBe('mydb')
    expect(config.username).toBe('user')
    expect(config.password).toBe('pass')
    expect(config.ssl).toBe(false)
  })

  test('parses URL with SSL parameter', () => {
    const config = parseDatabaseUrl('postgres://user:pass@localhost:5432/mydb?ssl=true')

    expect(config.ssl).toBe(true)
  })

  test('parses URL with sslmode=require', () => {
    const config = parseDatabaseUrl('postgres://user:pass@localhost:5432/mydb?sslmode=require')

    expect(config.ssl).toBe(true)
  })

  test('parses URL with encoded password', () => {
    const config = parseDatabaseUrl('postgres://user:p%40ss%23word@localhost:5432/mydb')

    expect(config.password).toBe('p@ss#word')
  })

  test('uses default port if not specified', () => {
    const config = parseDatabaseUrl('postgres://user:pass@localhost/mydb')

    expect(config.port).toBe(5432)
  })
})

describe('buildConnectionString', () => {
  test('builds basic connection string', () => {
    const url = buildConnectionString({
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      username: 'user',
      password: 'pass'
    })

    expect(url).toBe('postgres://user:pass@localhost:5432/mydb')
  })

  test('builds connection string with SSL', () => {
    const url = buildConnectionString({
      host: 'db.example.com',
      port: 5432,
      database: 'mydb',
      username: 'user',
      password: 'pass',
      ssl: true
    })

    expect(url).toBe('postgres://user:pass@db.example.com:5432/mydb?sslmode=require')
  })

  test('encodes special characters in password', () => {
    const url = buildConnectionString({
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      username: 'user',
      password: 'p@ss#word'
    })

    expect(url).toContain('p%40ss%23word')
  })

  test('builds connection string without password', () => {
    const url = buildConnectionString({
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      username: 'user'
    })

    expect(url).toBe('postgres://user@localhost:5432/mydb')
  })

  test('uses default values', () => {
    const url = buildConnectionString({
      database: 'mydb'
    })

    expect(url).toContain('localhost:5432/mydb')
  })
})

describe('Connection', () => {
  describe('constructor', () => {
    test('creates connection with default config', () => {
      const conn = new Connection()

      expect(conn.config.adapter).toBe('postgresql')
      expect(conn.config.host).toBe('localhost')
      expect(conn.config.port).toBe(5432)
      expect(conn.config.pool.min).toBe(2)
      expect(conn.config.pool.max).toBe(10)
      expect(conn.connected).toBe(false)
      expect(conn.client).toBeNull()
    })

    test('creates connection with custom config', () => {
      const conn = new Connection({
        adapter: 'yugabyte',
        host: 'yb.example.com',
        port: 5433,
        database: 'myapp',
        username: 'admin',
        password: 'secret',
        ssl: true,
        pool: { min: 5, max: 20 }
      })

      expect(conn.config.adapter).toBe('yugabyte')
      expect(conn.config.host).toBe('yb.example.com')
      expect(conn.config.port).toBe(5433)
      expect(conn.config.database).toBe('myapp')
      expect(conn.config.username).toBe('admin')
      expect(conn.config.password).toBe('secret')
      expect(conn.config.ssl).toBe(true)
      expect(conn.config.pool.min).toBe(5)
      expect(conn.config.pool.max).toBe(20)
    })

    test('creates connection from URL', () => {
      const conn = new Connection({
        url: 'postgres://user:pass@db.example.com:5432/myapp?ssl=true'
      })

      expect(conn.config.host).toBe('db.example.com')
      expect(conn.config.port).toBe(5432)
      expect(conn.config.database).toBe('myapp')
      expect(conn.config.username).toBe('user')
      expect(conn.config.password).toBe('pass')
      expect(conn.config.ssl).toBe(true)
    })

    test('creates connection from connectionString', () => {
      const conn = new Connection({
        connectionString: 'postgres://user:pass@localhost:5432/mydb'
      })

      expect(conn.config.host).toBe('localhost')
      expect(conn.config.database).toBe('mydb')
    })
  })

  describe('connect', () => {
    test('rejects unsupported adapter', async () => {
      const conn = new Connection({
        adapter: 'mysql',
        database: 'test'
      })

      expect(async () => {
        await conn.connect()
      }).toThrow(DatabaseError)

      expect(async () => {
        await conn.connect()
      }).toThrow(/Unsupported database adapter: mysql/)
    })

    test('accepts postgresql adapter', async () => {
      const conn = new Connection({
        adapter: 'postgresql',
        database: 'test',
        useBunSql: false
      })

      // This will fail because no actual database, but should not reject adapter
      try {
        await conn.connect()
      } catch (error) {
        expect(error.message).not.toContain('Unsupported database adapter')
      }
    })

    test('accepts postgres adapter', async () => {
      const conn = new Connection({
        adapter: 'postgres',
        database: 'test',
        useBunSql: false
      })

      try {
        await conn.connect()
      } catch (error) {
        expect(error.message).not.toContain('Unsupported database adapter')
      }
    })

    test('accepts yugabyte adapter', async () => {
      const conn = new Connection({
        adapter: 'yugabyte',
        database: 'test',
        useBunSql: false
      })

      try {
        await conn.connect()
      } catch (error) {
        expect(error.message).not.toContain('Unsupported database adapter')
      }
    })

    test('accepts yugabytedb adapter', async () => {
      const conn = new Connection({
        adapter: 'yugabytedb',
        database: 'test',
        useBunSql: false
      })

      try {
        await conn.connect()
      } catch (error) {
        expect(error.message).not.toContain('Unsupported database adapter')
      }
    })

    test('returns self on successful connect', async () => {
      // Create a mock connection that succeeds
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      // Mock the internal connect method
      conn._connectPostgresJs = async () => {
        conn._client = { end: async () => {} }
      }

      const result = await conn.connect()

      expect(result).toBe(conn)
      expect(conn.connected).toBe(true)
      expect(conn.adapterType).toBe('postgres')
    })

    test('returns existing connection if already connected', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      conn._connectPostgresJs = async () => {
        conn._client = { end: async () => {} }
      }

      await conn.connect()
      const result = await conn.connect()

      expect(result).toBe(conn)
    })
  })

  describe('disconnect', () => {
    test('does nothing if not connected', async () => {
      const conn = new Connection({ database: 'test' })

      await conn.disconnect() // Should not throw

      expect(conn.connected).toBe(false)
    })

    test('closes connection and resets state', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      let endCalled = false
      conn._connectPostgresJs = async () => {
        conn._client = {
          end: async () => { endCalled = true }
        }
      }

      await conn.connect()
      expect(conn.connected).toBe(true)

      await conn.disconnect()

      expect(endCalled).toBe(true)
      expect(conn.connected).toBe(false)
      expect(conn.client).toBeNull()
      expect(conn.adapterType).toBeNull()
    })
  })

  describe('query', () => {
    test('throws if not connected', async () => {
      const conn = new Connection({ database: 'test' })

      expect(async () => {
        await conn.query('SELECT 1')
      }).toThrow(ConnectionNotEstablishedError)
    })

    test('executes query with postgres.js', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      const mockResults = [{ id: 1 }, { id: 2 }]
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async (sql, params) => mockResults,
          end: async () => {}
        }
      }

      await conn.connect()
      const results = await conn.query('SELECT * FROM users')

      expect(results).toEqual(mockResults)
    })

    test('executes parameterized query', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      let capturedParams
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async (sql, params) => {
            capturedParams = params
            return [{ id: 1, name: 'John' }]
          },
          end: async () => {}
        }
      }

      await conn.connect()
      const results = await conn.query('SELECT * FROM users WHERE id = $1', [1])

      expect(capturedParams).toEqual([1])
      expect(results[0].name).toBe('John')
    })

    test('wraps query errors in DatabaseError', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async () => {
            const error = new Error('Syntax error')
            error.code = '42601'
            throw error
          },
          end: async () => {}
        }
      }

      await conn.connect()

      try {
        await conn.query('INVALID SQL')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError)
        expect(error.message).toContain('Query failed')
        expect(error.code).toBe('42601')
        expect(error.query).toBe('INVALID SQL')
      }
    })
  })

  describe('transaction', () => {
    test('throws if not connected', async () => {
      const conn = new Connection({ database: 'test' })

      expect(async () => {
        await conn.transaction(async () => {})
      }).toThrow(ConnectionNotEstablishedError)
    })

    test('executes callback within transaction', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      let transactionExecuted = false
      let queryExecuted = false

      conn._connectPostgresJs = async () => {
        conn._client = {
          begin: async (callback) => {
            transactionExecuted = true
            const txSql = {
              unsafe: async (sql, params) => {
                queryExecuted = true
                return []
              }
            }
            return await callback(txSql)
          },
          end: async () => {}
        }
      }

      await conn.connect()
      await conn.transaction(async (tx) => {
        await tx.query('INSERT INTO users (name) VALUES ($1)', ['John'])
      })

      expect(transactionExecuted).toBe(true)
      expect(queryExecuted).toBe(true)
    })

    test('returns result from callback', async () => {
      const conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      conn._connectPostgresJs = async () => {
        conn._client = {
          begin: async (callback) => {
            const txSql = { unsafe: async () => [{ id: 1 }] }
            return await callback(txSql)
          },
          end: async () => {}
        }
      }

      await conn.connect()
      const result = await conn.transaction(async (tx) => {
        const users = await tx.query('SELECT * FROM users')
        return users[0]
      })

      expect(result.id).toBe(1)
    })
  })

  describe('schema methods', () => {
    let conn

    beforeEach(async () => {
      conn = new Connection({
        database: 'test',
        useBunSql: false
      })

      let queries = []
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async (sql, params) => {
            queries.push({ sql, params })
            return []
          },
          end: async () => {}
        }
      }
      conn._queries = queries

      await conn.connect()
    })

    test('dropTable generates correct SQL', async () => {
      await conn.dropTable('users')

      expect(conn._queries.length).toBe(1)
      expect(conn._queries[0].sql).toContain('DROP TABLE')
      expect(conn._queries[0].sql).toContain('IF EXISTS')
      expect(conn._queries[0].sql).toContain('"users"')
    })

    test('dropTable with cascade', async () => {
      await conn.dropTable('users', { cascade: true })

      expect(conn._queries[0].sql).toContain('CASCADE')
    })

    test('addColumn generates correct SQL', async () => {
      await conn.addColumn('users', 'email', 'VARCHAR(255)', { notNull: true, unique: true })

      expect(conn._queries[0].sql).toContain('ALTER TABLE')
      expect(conn._queries[0].sql).toContain('"users"')
      expect(conn._queries[0].sql).toContain('"email"')
      expect(conn._queries[0].sql).toContain('VARCHAR(255)')
      expect(conn._queries[0].sql).toContain('NOT NULL')
      expect(conn._queries[0].sql).toContain('UNIQUE')
    })

    test('addColumn with default value', async () => {
      await conn.addColumn('users', 'active', 'BOOLEAN', { default: true })

      expect(conn._queries[0].sql).toContain('DEFAULT true')
    })

    test('removeColumn generates correct SQL', async () => {
      await conn.removeColumn('users', 'legacy_field')

      expect(conn._queries[0].sql).toContain('ALTER TABLE')
      expect(conn._queries[0].sql).toContain('DROP COLUMN')
      expect(conn._queries[0].sql).toContain('"legacy_field"')
    })

    test('addIndex generates correct SQL', async () => {
      await conn.addIndex('users', ['email'])

      expect(conn._queries[0].sql).toContain('CREATE')
      expect(conn._queries[0].sql).toContain('INDEX')
      expect(conn._queries[0].sql).toContain('"users"')
      expect(conn._queries[0].sql).toContain('"email"')
    })

    test('addIndex with unique option', async () => {
      await conn.addIndex('users', ['email'], { unique: true })

      expect(conn._queries[0].sql).toContain('UNIQUE INDEX')
    })

    test('addIndex with custom name', async () => {
      await conn.addIndex('users', ['email'], { name: 'custom_email_idx' })

      expect(conn._queries[0].sql).toContain('"custom_email_idx"')
    })

    test('addIndex with multiple columns', async () => {
      await conn.addIndex('users', ['first_name', 'last_name'])

      expect(conn._queries[0].sql).toContain('"first_name"')
      expect(conn._queries[0].sql).toContain('"last_name"')
    })

    test('removeIndex generates correct SQL', async () => {
      await conn.removeIndex('users', 'index_users_on_email')

      expect(conn._queries[0].sql).toContain('DROP INDEX')
      expect(conn._queries[0].sql).toContain('"index_users_on_email"')
    })

    test('removeIndex with column array', async () => {
      await conn.removeIndex('users', ['email'])

      expect(conn._queries[0].sql).toContain('"index_users_on_email"')
    })
  })

  describe('introspection methods', () => {
    let conn

    beforeEach(async () => {
      conn = new Connection({
        database: 'test',
        useBunSql: false
      })
    })

    test('tableExists returns true when table exists', async () => {
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async () => [{ exists: true }],
          end: async () => {}
        }
      }

      await conn.connect()
      const exists = await conn.tableExists('users')

      expect(exists).toBe(true)
    })

    test('tableExists returns false when table does not exist', async () => {
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async () => [{ exists: false }],
          end: async () => {}
        }
      }

      await conn.connect()
      const exists = await conn.tableExists('nonexistent')

      expect(exists).toBe(false)
    })

    test('tables returns list of table names', async () => {
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async () => [
            { table_name: 'users' },
            { table_name: 'posts' },
            { table_name: 'comments' }
          ],
          end: async () => {}
        }
      }

      await conn.connect()
      const tables = await conn.tables()

      expect(tables).toEqual(['users', 'posts', 'comments'])
    })

    test('columns returns column definitions', async () => {
      conn._connectPostgresJs = async () => {
        conn._client = {
          unsafe: async () => [
            {
              column_name: 'id',
              data_type: 'bigint',
              column_default: "nextval('users_id_seq')",
              is_nullable: 'NO',
              character_maximum_length: null
            },
            {
              column_name: 'email',
              data_type: 'character varying',
              column_default: null,
              is_nullable: 'NO',
              character_maximum_length: 255
            },
            {
              column_name: 'bio',
              data_type: 'text',
              column_default: null,
              is_nullable: 'YES',
              character_maximum_length: null
            }
          ],
          end: async () => {}
        }
      }

      await conn.connect()
      const columns = await conn.columns('users')

      expect(columns).toHaveLength(3)
      expect(columns[0]).toEqual({
        name: 'id',
        type: 'bigint',
        default: "nextval('users_id_seq')",
        nullable: false,
        maxLength: null
      })
      expect(columns[1].name).toBe('email')
      expect(columns[1].nullable).toBe(false)
      expect(columns[1].maxLength).toBe(255)
      expect(columns[2].name).toBe('bio')
      expect(columns[2].nullable).toBe(true)
    })
  })
})

describe('ConnectionPool', () => {
  // Store original methods
  let originalConnect
  let originalDisconnect
  let originalQuery

  beforeEach(() => {
    originalConnect = Connection.prototype.connect
    originalDisconnect = Connection.prototype.disconnect
    originalQuery = Connection.prototype.query
  })

  afterEach(() => {
    Connection.prototype.connect = originalConnect
    Connection.prototype.disconnect = originalDisconnect
    Connection.prototype.query = originalQuery
  })

  // Helper to mock Connection.prototype methods
  const mockConnection = (options = {}) => {
    Connection.prototype.connect = async function() {
      this._connected = true
      this._adapter = 'postgres'
      this._client = {
        unsafe: async (sql, params) => {
          if (options.onQuery) options.onQuery(sql, params)
          return []
        },
        end: async () => {}
      }
      return this
    }
    Connection.prototype.disconnect = async function() {
      this._connected = false
      this._client = null
      if (options.onDisconnect) options.onDisconnect()
    }
    Connection.prototype.query = async function(sql, params) {
      if (options.onQuery) options.onQuery(sql, params)
      return []
    }

    return () => {
      Connection.prototype.connect = originalConnect
      Connection.prototype.disconnect = originalDisconnect
      Connection.prototype.query = originalQuery
    }
  }

  describe('constructor', () => {
    test('creates pool with default config', () => {
      const pool = new ConnectionPool({
        database: 'test'
      })

      expect(pool.config.database).toBe('test')
      expect(pool.config.pool.min).toBe(2)
      expect(pool.config.pool.max).toBe(10)
      expect(pool.config.pool.idleTimeout).toBe(30)
      expect(pool.config.pool.acquireTimeout).toBe(10000)
      expect(pool.config.pool.validateOnAcquire).toBe(true)
      expect(pool.initialized).toBe(false)
      expect(pool.draining).toBe(false)
    })

    test('creates pool with custom config', () => {
      const pool = new ConnectionPool({
        database: 'test',
        pool: {
          min: 5,
          max: 20,
          idleTimeout: 60,
          acquireTimeout: 5000,
          validateOnAcquire: false
        }
      })

      expect(pool.config.pool.min).toBe(5)
      expect(pool.config.pool.max).toBe(20)
      expect(pool.config.pool.idleTimeout).toBe(60)
      expect(pool.config.pool.acquireTimeout).toBe(5000)
      expect(pool.config.pool.validateOnAcquire).toBe(false)
    })
  })

  describe('initialize', () => {
    test('creates minimum connections', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 3, max: 10 }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        expect(pool.initialized).toBe(true)
        expect(pool.size).toBe(3)
        expect(pool.available).toBe(3)
        expect(pool.stats.created).toBe(3)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('returns self on initialize', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const restore = mockConnection()

      try {
        const result = await pool.initialize()
        expect(result).toBe(pool)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('returns existing pool if already initialized', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        const sizeBefore = pool.size
        const result = await pool.initialize()

        expect(result).toBe(pool)
        expect(pool.size).toBe(sizeBefore)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('acquire/release', () => {
    test('throws if not initialized', async () => {
      const pool = new ConnectionPool({ database: 'test' })

      expect(async () => {
        await pool.acquire()
      }).toThrow(/not initialized/)
    })

    test('throws if draining', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        pool._draining = true

        expect(async () => {
          await pool.acquire()
        }).toThrow(/draining/)
      } finally {
        pool._draining = false
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('returns pooled connection on acquire', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      mockConnection()

      try {
        await pool.initialize()
        const conn = await pool.acquire()

        expect(conn.id).toBeDefined()
        expect(conn.inUse).toBe(true)
        expect(pool.stats.acquired).toBe(1)
        expect(pool.available).toBe(pool.size - 1)

        pool.release(conn) // Release before drain
      } finally {
        await pool.drain()
      }
    })

    test('tracks release stats', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        const conn = await pool.acquire()
        pool.release(conn)

        expect(pool.stats.released).toBe(1)
        expect(conn.inUse).toBe(false)
        expect(pool.available).toBe(pool.size)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('creates new connection if none available and under max', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 5, validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        expect(pool.size).toBe(1)

        // Acquire the only connection
        const conn1 = await pool.acquire()
        expect(pool.available).toBe(0)

        // Should create a new connection
        const conn2 = await pool.acquire()
        expect(pool.size).toBe(2)
        expect(pool.stats.created).toBe(2)

        pool.release(conn1)
        pool.release(conn2)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('waits for connection if at max capacity', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 1, validateOnAcquire: false, acquireTimeout: 500 }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        const conn1 = await pool.acquire()

        // Release after delay
        setTimeout(() => {
          pool.release(conn1)
        }, 100)

        const conn2 = await pool.acquire()
        expect(conn2).toBeDefined()
        expect(conn2.id).toBe(conn1.id) // Same connection reused

        pool.release(conn2)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('times out if pool exhausted', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 1, validateOnAcquire: false, acquireTimeout: 100 }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        const conn = await pool.acquire()
        // Don't release

        try {
          await pool.acquire()
          expect.fail('Should have thrown PoolExhaustedError')
        } catch (error) {
          expect(error).toBeInstanceOf(PoolExhaustedError)
          expect(pool.stats.timedOut).toBe(1)
        }

        pool.release(conn)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('ignores release of non-pool connections', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        pool.release(null)
        pool.release({})
        pool.release({ id: 'fake' })

        expect(pool.stats.released).toBe(0)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('withConnection', () => {
    test('executes callback with connection', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        let receivedConn
        await pool.withConnection(async (conn) => {
          receivedConn = conn
        })

        expect(receivedConn).toBeDefined()
        expect(receivedConn.id).toBeDefined()
        expect(pool.stats.acquired).toBe(1)
        expect(pool.stats.released).toBe(1)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })

    test('releases connection even on error', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        try {
          await pool.withConnection(async () => {
            throw new Error('Callback error')
          })
        } catch (error) {
          // Expected
        }

        expect(pool.stats.released).toBe(1)
        expect(pool.available).toBe(pool.size)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('query', () => {
    test('executes query using pool connection', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()

        const result = await pool.query('SELECT 1')
        expect(result).toEqual([])
        expect(pool.stats.acquired).toBe(1)
        expect(pool.stats.released).toBe(1)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('transaction', () => {
    test('executes transaction using pool connection', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { validateOnAcquire: false }
      })

      // Mock with transaction support
      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        this._adapter = 'postgres'
        this._client = {
          unsafe: async () => [],
          begin: async (callback) => {
            const txSql = { unsafe: async () => [] }
            return callback(txSql)
          },
          end: async () => {}
        }
        return this
      }

      try {
        await pool.initialize()

        let txExecuted = false
        await pool.transaction(async (tx) => {
          txExecuted = true
          await tx.query('INSERT INTO test VALUES (1)')
        })

        expect(txExecuted).toBe(true)
        expect(pool.stats.acquired).toBe(1)
        expect(pool.stats.released).toBe(1)
      } finally {
        await pool.drain()
        Connection.prototype.connect = originalConnect
      }
    })
  })

  describe('stats', () => {
    test('returns comprehensive statistics', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 3, max: 10, validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        const conn = await pool.acquire()

        const stats = pool.stats
        expect(stats.total).toBe(3)
        expect(stats.available).toBe(2)
        expect(stats.inUse).toBe(1)
        expect(stats.created).toBe(3)
        expect(stats.acquired).toBe(1)
        expect(stats.waiting).toBe(0)

        pool.release(conn)
      } finally {
        await pool.drain()
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('drain', () => {
    test('closes all connections and resets state', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 3, max: 10, validateOnAcquire: false }
      })

      let disconnectCount = 0
      const restore = mockConnection({
        onDisconnect: () => { disconnectCount++ }
      })

      try {
        await pool.initialize()
        expect(pool.size).toBe(3)

        await pool.drain()

        expect(disconnectCount).toBe(3)
        expect(pool.initialized).toBe(false)
        expect(pool.size).toBe(0)
        expect(pool.stats.acquired).toBe(0)
        expect(pool.stats.created).toBe(0)
      } finally {
        // afterEach restores Connection.prototype methods
      }
    })

    test('waits for in-use connections', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 5, validateOnAcquire: false }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        const conn = await pool.acquire()

        // Release after delay
        setTimeout(() => {
          pool.release(conn)
        }, 50)

        await pool.drain({ timeout: 5000 })
        expect(pool.initialized).toBe(false)
      } finally {
        // afterEach restores Connection.prototype methods
      }
    })

    test('rejects waiters on drain', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 1, validateOnAcquire: false, acquireTimeout: 5000 }
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        const conn = await pool.acquire()

        // Start waiting for connection
        const acquirePromise = pool.acquire().catch(e => e)

        // Drain should reject the waiter
        await pool.drain({ timeout: 100 })

        const error = await acquirePromise
        expect(error.message).toContain('draining')
      } finally {
        // afterEach restores Connection.prototype methods
      }
    })

    test('does nothing if not initialized', async () => {
      const pool = new ConnectionPool({ database: 'test' })

      await pool.drain() // Should not throw
      expect(pool.initialized).toBe(false)
    })
  })

  describe('close', () => {
    test('is alias for drain', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        await pool.close()

        expect(pool.initialized).toBe(false)
      } finally {
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('end', () => {
    test('is alias for drain', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const restore = mockConnection()

      try {
        await pool.initialize()
        await pool.end()

        expect(pool.initialized).toBe(false)
      } finally {
        // afterEach restores Connection.prototype methods
      }
    })
  })

  describe('connection validation', () => {
    test('validates connection on acquire when enabled', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 5, validateOnAcquire: true }
      })

      let queryCount = 0
      mockConnection({
        onQuery: () => { queryCount++ }
      })

      try {
        await pool.initialize()

        // Acquire triggers validation query
        queryCount = 0
        const conn = await pool.acquire()
        expect(queryCount).toBe(1)
        pool.release(conn)
      } finally {
        await pool.drain()
      }
    })

    test('destroys invalid connection and retries', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false,
        pool: { min: 1, max: 5, validateOnAcquire: true }
      })

      let shouldFail = true
      let connectCount = 0

      Connection.prototype.connect = async function() {
        connectCount++
        this._connected = true
        this._adapter = 'postgres'
        return this
      }
      Connection.prototype.disconnect = async function() {
        this._connected = false
      }
      Connection.prototype.query = async function() {
        if (shouldFail) {
          shouldFail = false
          throw new Error('Connection dead')
        }
        return []
      }

      try {
        await pool.initialize()
        expect(connectCount).toBe(1)

        // First acquire validates and finds bad connection, creates new one
        const conn = await pool.acquire()
        expect(connectCount).toBe(2)
        expect(pool.stats.errors).toBe(1)
        expect(pool.stats.destroyed).toBe(1)

        pool.release(conn)
      } finally {
        await pool.drain()
      }
    })
  })
})

describe('Global connection functions', () => {
  afterEach(async () => {
    await disconnect()
  })

  test('getConnection returns null initially', () => {
    const conn = getConnection()
    expect(conn).toBeNull()
  })

  test('getConnection creates connection with config', () => {
    const conn = getConnection({ database: 'test' })
    expect(conn).toBeInstanceOf(Connection)
    expect(conn.config.database).toBe('test')
  })

  test('getConnection returns same instance', () => {
    const conn1 = getConnection({ database: 'test' })
    const conn2 = getConnection()
    expect(conn1).toBe(conn2)
  })

  test('setConnection sets global connection', () => {
    const conn = new Connection({ database: 'custom' })
    setConnection(conn)

    const retrieved = getConnection()
    expect(retrieved).toBe(conn)
  })

  test('disconnect clears global connection', async () => {
    getConnection({ database: 'test' })
    await disconnect()

    const conn = getConnection()
    expect(conn).toBeNull()
  })
})

describe('ADAPTERS constants', () => {
  test('exports PostgreSQL adapter types', () => {
    expect(ADAPTERS.POSTGRESQL).toBe('postgresql')
    expect(ADAPTERS.POSTGRES).toBe('postgres')
    expect(ADAPTERS.YUGABYTE).toBe('yugabyte')
    expect(ADAPTERS.YUGABYTEDB).toBe('yugabytedb')
  })
})

describe('Error classes', () => {
  test('DatabaseError includes details', () => {
    const error = new DatabaseError('Test error', {
      code: '12345',
      query: 'SELECT * FROM users',
      params: [1, 2, 3]
    })

    expect(error.name).toBe('DatabaseError')
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('12345')
    expect(error.query).toBe('SELECT * FROM users')
    expect(error.params).toEqual([1, 2, 3])
  })

  test('ConnectionNotEstablishedError has correct message', () => {
    const error = new ConnectionNotEstablishedError()

    expect(error.name).toBe('ConnectionNotEstablishedError')
    expect(error.message).toContain('not established')
    expect(error).toBeInstanceOf(DatabaseError)
  })

  test('PoolExhaustedError includes timeout', () => {
    const error = new PoolExhaustedError(5000)

    expect(error.name).toBe('PoolExhaustedError')
    expect(error.message).toContain('5000ms')
    expect(error.message).toContain('exhausted')
    expect(error).toBeInstanceOf(DatabaseError)
  })
})
