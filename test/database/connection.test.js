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
  describe('constructor', () => {
    test('creates pool with config', () => {
      const pool = new ConnectionPool({
        database: 'test',
        pool: { max: 20 }
      })

      expect(pool.config.database).toBe('test')
      expect(pool.initialized).toBe(false)
    })
  })

  describe('initialize', () => {
    test('initializes connection', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      // Mock the connection
      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        this._adapter = 'postgres'
        return this
      }

      try {
        await pool.initialize()

        expect(pool.initialized).toBe(true)
      } finally {
        Connection.prototype.connect = originalConnect
      }
    })

    test('returns self on initialize', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }

      try {
        const result = await pool.initialize()
        expect(result).toBe(pool)
      } finally {
        Connection.prototype.connect = originalConnect
      }
    })

    test('returns existing pool if already initialized', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }

      try {
        await pool.initialize()
        const result = await pool.initialize()

        expect(result).toBe(pool)
      } finally {
        Connection.prototype.connect = originalConnect
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

    test('returns connection on acquire', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }

      try {
        await pool.initialize()
        const conn = await pool.acquire()

        expect(conn).toBeInstanceOf(Connection)
        expect(pool.stats.acquired).toBe(1)
      } finally {
        Connection.prototype.connect = originalConnect
      }
    })

    test('tracks release stats', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }

      try {
        await pool.initialize()
        const conn = await pool.acquire()
        pool.release(conn)

        expect(pool.stats.released).toBe(1)
      } finally {
        Connection.prototype.connect = originalConnect
      }
    })
  })

  describe('withConnection', () => {
    test('executes callback with connection', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }

      try {
        await pool.initialize()

        let receivedConn
        await pool.withConnection(async (conn) => {
          receivedConn = conn
        })

        expect(receivedConn).toBeInstanceOf(Connection)
        expect(pool.stats.acquired).toBe(1)
        expect(pool.stats.released).toBe(1)
      } finally {
        Connection.prototype.connect = originalConnect
      }
    })

    test('releases connection even on error', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }

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
      } finally {
        Connection.prototype.connect = originalConnect
      }
    })
  })

  describe('drain', () => {
    test('closes connection and resets state', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      let disconnectCalled = false
      const originalConnect = Connection.prototype.connect
      const originalDisconnect = Connection.prototype.disconnect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }
      Connection.prototype.disconnect = async function() {
        disconnectCalled = true
        this._connected = false
      }

      try {
        await pool.initialize()
        await pool.drain()

        expect(disconnectCalled).toBe(true)
        expect(pool.initialized).toBe(false)
        expect(pool.stats.acquired).toBe(0)
      } finally {
        Connection.prototype.connect = originalConnect
        Connection.prototype.disconnect = originalDisconnect
      }
    })

    test('does nothing if not initialized', async () => {
      const pool = new ConnectionPool({ database: 'test' })

      await pool.drain() // Should not throw
    })
  })

  describe('close', () => {
    test('is alias for drain', async () => {
      const pool = new ConnectionPool({
        database: 'test',
        useBunSql: false
      })

      const originalConnect = Connection.prototype.connect
      const originalDisconnect = Connection.prototype.disconnect
      Connection.prototype.connect = async function() {
        this._connected = true
        return this
      }
      Connection.prototype.disconnect = async function() {
        this._connected = false
      }

      try {
        await pool.initialize()
        await pool.close()

        expect(pool.initialized).toBe(false)
      } finally {
        Connection.prototype.connect = originalConnect
        Connection.prototype.disconnect = originalDisconnect
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
})
