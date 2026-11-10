/**
 * Migration - Database schema changes
 *
 * Provides Rails-like migration DSL for creating and modifying database schema.
 * Works with PostgreSQL and YugabyteDB.
 *
 * @module bun-on-rails/database/migration
 */

import { resolve } from 'path'
import { PostgresAdapter } from './adapters/postgres.js'
import { pluralize, singularize } from '../support/inflector.js'

// Default adapter instance
const defaultAdapter = new PostgresAdapter()

/**
 * Migration - Base class for database migrations
 *
 * Subclass this and implement up() and down() methods to define
 * schema changes.
 *
 * @example
 * class CreateUsers extends Migration {
 *   async up() {
 *     await this.createTable('users', (t) => {
 *       t.id()
 *       t.string('name').notNull()
 *       t.string('email').notNull().unique()
 *       t.timestamps()
 *     })
 *   }
 *
 *   async down() {
 *     await this.dropTable('users')
 *   }
 * }
 */
export class Migration {
  constructor(db) {
    this.db = db
    this.adapter = defaultAdapter
  }

  /**
   * Run the migration up
   */
  async up() {
    throw new Error('Subclass must implement up()')
  }

  /**
   * Run the migration down (rollback)
   */
  async down() {
    throw new Error('Subclass must implement down()')
  }

  /**
   * Create a new table
   * @param {string} name - Table name
   * @param {Function} callback - Function receiving TableBuilder
   * @param {Object} options - Table options
   * @returns {Promise<void>}
   */
  async createTable(name, callback, options = {}) {
    const builder = new TableBuilder(name, this.adapter, options)
    callback(builder)
    const sql = builder.toSQL()
    await this.db.query(sql)

    // Create indexes
    for (const indexSql of builder.toIndexSQL()) {
      await this.db.query(indexSql)
    }
  }

  /**
   * Drop a table
   * @param {string} name - Table name
   * @param {Object} options - { ifExists, cascade }
   * @returns {Promise<void>}
   */
  async dropTable(name, options = {}) {
    const sql = this.adapter.dropTableSQL(name, options)
    await this.db.query(sql)
  }

  /**
   * Rename a table
   * @param {string} oldName - Current table name
   * @param {string} newName - New table name
   * @returns {Promise<void>}
   */
  async renameTable(oldName, newName) {
    const sql = this.adapter.renameTableSQL(oldName, newName)
    await this.db.query(sql)
  }

  /**
   * Add a column to an existing table
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @param {string} type - Column type
   * @param {Object} options - Column options
   * @returns {Promise<void>}
   */
  async addColumn(table, column, type, options = {}) {
    const sql = this.adapter.addColumnSQL(table, { name: column, type, ...options })
    await this.db.query(sql)
  }

  /**
   * Remove a column from a table
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @param {Object} options - { cascade }
   * @returns {Promise<void>}
   */
  async removeColumn(table, column, options = {}) {
    const sql = this.adapter.dropColumnSQL(table, column, options)
    await this.db.query(sql)
  }

  /**
   * Rename a column
   * @param {string} table - Table name
   * @param {string} oldName - Current column name
   * @param {string} newName - New column name
   * @returns {Promise<void>}
   */
  async renameColumn(table, oldName, newName) {
    const sql = this.adapter.renameColumnSQL(table, oldName, newName)
    await this.db.query(sql)
  }

  /**
   * Change a column's type
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @param {string} newType - New column type
   * @param {Object} options - { using }
   * @returns {Promise<void>}
   */
  async changeColumn(table, column, newType, options = {}) {
    const sql = this.adapter.changeColumnTypeSQL(table, column, newType, options)
    await this.db.query(sql)
  }

  /**
   * Change a column's null constraint
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @param {boolean} notNull - Whether column should be NOT NULL
   * @returns {Promise<void>}
   */
  async changeColumnNull(table, column, notNull) {
    const sql = this.adapter.changeColumnNullSQL(table, column, notNull)
    await this.db.query(sql)
  }

  /**
   * Change a column's default value
   * @param {string} table - Table name
   * @param {string} column - Column name
   * @param {any} defaultValue - New default value (null to remove)
   * @param {string} type - Column type (for proper quoting)
   * @returns {Promise<void>}
   */
  async changeColumnDefault(table, column, defaultValue, type = 'string') {
    const sql = this.adapter.changeColumnDefaultSQL(table, column, defaultValue, type)
    await this.db.query(sql)
  }

  /**
   * Add an index
   * @param {string} table - Table name
   * @param {string|string[]} columns - Column(s) to index
   * @param {Object} options - Index options
   * @returns {Promise<void>}
   */
  async addIndex(table, columns, options = {}) {
    const sql = this.adapter.createIndexSQL(table, columns, options)
    await this.db.query(sql)
  }

  /**
   * Remove an index
   * @param {string} table - Table name (not used but for Rails compatibility)
   * @param {Object} options - { name, column }
   * @returns {Promise<void>}
   */
  async removeIndex(table, options = {}) {
    const indexName = options.name ||
      (options.column ? `index_${table}_on_${Array.isArray(options.column) ? options.column.join('_') : options.column}` : null)

    if (!indexName) {
      throw new Error('removeIndex requires either a name or column option')
    }

    const sql = this.adapter.dropIndexSQL(indexName, options)
    await this.db.query(sql)
  }

  /**
   * Add a foreign key
   * @param {string} fromTable - Table with foreign key
   * @param {string} toTable - Referenced table
   * @param {Object} options - Foreign key options
   * @returns {Promise<void>}
   */
  async addForeignKey(fromTable, toTable, options = {}) {
    const column = options.column || `${singularize(toTable)}_id`
    const primaryKey = options.primaryKey || 'id'
    const constraintName = options.name || `fk_${fromTable}_${column}`
    const onDelete = options.onDelete || 'NO ACTION'
    const onUpdate = options.onUpdate || 'NO ACTION'

    const sql = `ALTER TABLE ${this.adapter.quoteTableName(fromTable)} ` +
      `ADD CONSTRAINT ${this.adapter.quoteIdentifier(constraintName)} ` +
      `FOREIGN KEY (${this.adapter.quoteIdentifier(column)}) ` +
      `REFERENCES ${this.adapter.quoteTableName(toTable)} (${this.adapter.quoteIdentifier(primaryKey)}) ` +
      `ON DELETE ${onDelete} ON UPDATE ${onUpdate}`

    await this.db.query(sql)
  }

  /**
   * Remove a foreign key
   * @param {string} fromTable - Table with foreign key
   * @param {Object} options - { name, toTable, column }
   * @returns {Promise<void>}
   */
  async removeForeignKey(fromTable, options = {}) {
    let constraintName = options.name
    if (!constraintName && options.toTable) {
      const column = options.column || `${singularize(options.toTable)}_id`
      constraintName = `fk_${fromTable}_${column}`
    }

    if (!constraintName) {
      throw new Error('removeForeignKey requires either a name or toTable option')
    }

    const sql = `ALTER TABLE ${this.adapter.quoteTableName(fromTable)} ` +
      `DROP CONSTRAINT ${this.adapter.quoteIdentifier(constraintName)}`

    await this.db.query(sql)
  }

  /**
   * Execute raw SQL
   * @param {string} sql - SQL statement
   * @param {any[]} params - Query parameters
   * @returns {Promise<any>}
   */
  async execute(sql, params = []) {
    return this.db.query(sql, params)
  }
}

/**
 * Migration Runner
 *
 * Manages running and rolling back migrations.
 *
 * @example
 * const runner = new MigrationRunner(connection, './db/migrations')
 * await runner.migrate() // Run all pending migrations
 * await runner.rollback() // Rollback last migration
 */
export class MigrationRunner {
  constructor(db, migrationsPath) {
    this.db = db
    // Resolved against the working directory: a relative path passed to
    // import() would otherwise resolve against this file, or as a package name.
    this.migrationsPath = resolve(migrationsPath)
    this.adapter = defaultAdapter
  }

  /**
   * Ensure schema_migrations table exists
   * @private
   */
  async ensureMigrationsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "version" VARCHAR(255) PRIMARY KEY,
        "executed_at" TIMESTAMP DEFAULT NOW()
      )
    `
    await this.db.query(sql)
  }

  /**
   * Get list of completed migration versions
   * @private
   * @returns {Promise<string[]>}
   */
  async getCompletedVersions() {
    await this.ensureMigrationsTable()
    const result = await this.db.query('SELECT version FROM schema_migrations ORDER BY version')
    return result.map(row => row.version)
  }

  /**
   * Get all migration files
   * @private
   * @returns {Promise<string[]>}
   */
  async getMigrationFiles() {
    const glob = new Bun.Glob('*.js')
    const files = []

    for await (const file of glob.scan(this.migrationsPath)) {
      files.push(file)
    }

    return files.sort()
  }

  /**
   * Run all pending migrations
   * @returns {Promise<string[]>} List of executed versions
   */
  async migrate() {
    await this.ensureMigrationsTable()

    const completedVersions = await this.getCompletedVersions()
    const files = await this.getMigrationFiles()
    const executed = []

    for (const file of files) {
      const version = file.split('_')[0]

      if (completedVersions.includes(version)) {
        continue
      }

      console.log(`Migrating: ${file}`)

      const migration = await import(`${this.migrationsPath}/${file}`)
      const MigrationClass = migration.default

      // Support both class-based and function-based migrations
      if (typeof MigrationClass === 'function' &&
          MigrationClass.prototype && MigrationClass.prototype.up) {
        // Class-based migration (export default class extends Migration)
        const instance = new MigrationClass(this.db)
        await instance.up()
      } else if (typeof migration.up === 'function') {
        // Function-based migration (export async function up(db))
        await migration.up(this.db)
      }

      // Record migration
      await this.db.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      )

      executed.push(version)
      console.log(`Completed: ${file}`)
    }

    return executed
  }

  /**
   * Rollback last migration
   * @param {number} steps - Number of migrations to rollback (default: 1)
   * @returns {Promise<string[]>} List of rolled back versions
   */
  async rollback(steps = 1) {
    await this.ensureMigrationsTable()

    const result = await this.db.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT $1',
      [steps]
    )

    const rolledBack = []

    for (const row of result) {
      const version = row.version
      const files = await this.getMigrationFiles()
      const file = files.find(f => f.startsWith(version))

      if (!file) {
        console.warn(`Migration file not found for version ${version}`)
        continue
      }

      console.log(`Rolling back: ${file}`)

      const migration = await import(`${this.migrationsPath}/${file}`)
      const MigrationClass = migration.default

      if (typeof MigrationClass === 'function' &&
          MigrationClass.prototype && MigrationClass.prototype.down) {
        // Class-based migration (export default class extends Migration)
        const instance = new MigrationClass(this.db)
        await instance.down()
      } else if (typeof migration.down === 'function') {
        // Function-based migration (export async function down(db))
        await migration.down(this.db)
      }

      // Remove from schema_migrations
      await this.db.query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version]
      )

      rolledBack.push(version)
      console.log(`Rolled back: ${file}`)
    }

    return rolledBack
  }

  /**
   * Get pending migrations
   * @returns {Promise<string[]>}
   */
  async getPending() {
    const completedVersions = await this.getCompletedVersions()
    const files = await this.getMigrationFiles()

    return files.filter(file => {
      const version = file.split('_')[0]
      return !completedVersions.includes(version)
    })
  }

  /**
   * Get migration status
   * @returns {Promise<Object[]>}
   */
  async status() {
    const completedVersions = await this.getCompletedVersions()
    const files = await this.getMigrationFiles()

    return files.map(file => {
      const version = file.split('_')[0]
      return {
        version,
        file,
        status: completedVersions.includes(version) ? 'up' : 'down'
      }
    })
  }
}

/**
 * Table Builder - DSL for creating tables
 *
 * Provides a fluent interface for defining table columns and indexes.
 *
 * @example
 * const builder = new TableBuilder('posts')
 * builder.id()
 * builder.string('title').notNull()
 * builder.text('body')
 * builder.references('user') // Creates user_id bigint
 * builder.timestamps()
 * builder.index(['user_id', 'created_at'])
 *
 * const sql = builder.toSQL()
 * // CREATE TABLE "posts" (
 * //   "id" BIGSERIAL PRIMARY KEY,
 * //   "title" VARCHAR(255) NOT NULL,
 * //   "body" TEXT,
 * //   "user_id" BIGINT REFERENCES "users" ("id"),
 * //   "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
 * //   "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
 * // )
 */
export class TableBuilder {
  /**
   * Create a new TableBuilder
   * @param {string} tableName - Name of the table
   * @param {PostgresAdapter} adapter - SQL adapter
   * @param {Object} options - Table options
   */
  constructor(tableName, adapter = null, options = {}) {
    this.tableName = tableName
    this.adapter = adapter || defaultAdapter
    this.options = options
    this.columns = []
    this.indexes = []
    this._hasId = false
  }

  /**
   * Add a primary key column
   * @param {Object} options - { uuid: true } for UUID primary key
   * @returns {TableBuilder} this for chaining
   */
  id(options = {}) {
    this._hasId = true
    this.columns.push({
      name: 'id',
      type: 'id',
      primaryKey: true,
      ...options
    })
    return this
  }

  /**
   * Add a string/varchar column
   * @param {string} name - Column name
   * @param {Object} options - Column options { limit: 255 }
   * @returns {ColumnBuilder} Column builder for chaining
   */
  string(name, options = {}) {
    const column = {
      name,
      type: 'string',
      limit: options.limit || 255
    }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a text column (unlimited length)
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  text(name) {
    const column = { name, type: 'text' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add an integer column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  integer(name) {
    const column = { name, type: 'integer' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a bigint column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  bigint(name) {
    const column = { name, type: 'bigint' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a smallint column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  smallint(name) {
    const column = { name, type: 'smallint' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a boolean column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  boolean(name) {
    const column = { name, type: 'boolean' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a date column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  date(name) {
    const column = { name, type: 'date' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a time column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  time(name) {
    const column = { name, type: 'time' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a datetime/timestamp column
   * @param {string} name - Column name
   * @param {Object} options - { timezone: true } for timestamptz
   * @returns {ColumnBuilder} Column builder for chaining
   */
  datetime(name, options = {}) {
    const column = {
      name,
      type: options.timezone ? 'timestamptz' : 'datetime'
    }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a timestamp column (alias for datetime)
   * @param {string} name - Column name
   * @param {Object} options - { timezone: true } for timestamptz
   * @returns {ColumnBuilder} Column builder for chaining
   */
  timestamp(name, options = {}) {
    return this.datetime(name, options)
  }

  /**
   * Add a decimal/numeric column
   * @param {string} name - Column name
   * @param {Object} options - { precision: 10, scale: 2 }
   * @returns {ColumnBuilder} Column builder for chaining
   */
  decimal(name, options = {}) {
    const column = {
      name,
      type: 'decimal',
      precision: options.precision,
      scale: options.scale
    }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a numeric column (alias for decimal)
   * @param {string} name - Column name
   * @param {Object} options - { precision: 10, scale: 2 }
   * @returns {ColumnBuilder} Column builder for chaining
   */
  numeric(name, options = {}) {
    return this.decimal(name, options)
  }

  /**
   * Add a float column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  float(name) {
    const column = { name, type: 'float' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a double precision column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  double(name) {
    const column = { name, type: 'double' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a JSON column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  json(name) {
    const column = { name, type: 'json' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a JSONB column (binary JSON, more efficient)
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  jsonb(name) {
    const column = { name, type: 'jsonb' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a UUID column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  uuid(name) {
    const column = { name, type: 'uuid' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a binary/bytea column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  binary(name) {
    const column = { name, type: 'binary' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add an inet (IP address) column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  inet(name) {
    const column = { name, type: 'inet' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a cidr (network address) column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  cidr(name) {
    const column = { name, type: 'cidr' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a macaddr column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  macaddr(name) {
    const column = { name, type: 'macaddr' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a tsvector (full-text search) column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  tsvector(name) {
    const column = { name, type: 'tsvector' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add an array column
   * @param {string} name - Column name
   * @param {string} elementType - Type of array elements (string, integer, etc.)
   * @returns {ColumnBuilder} Column builder for chaining
   */
  array(name, elementType) {
    const column = { name, type: elementType, array: true }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a point (geometric) column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  point(name) {
    const column = { name, type: 'point' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a polygon (geometric) column
   * @param {string} name - Column name
   * @returns {ColumnBuilder} Column builder for chaining
   */
  polygon(name) {
    const column = { name, type: 'polygon' }
    this.columns.push(column)
    return new ColumnBuilder(this, column)
  }

  /**
   * Add a foreign key reference column
   *
   * Creates a bigint column with foreign key constraint.
   * By convention, column name is {model}_id and references {models}(id).
   *
   * @param {string} name - Referenced model name (singular, e.g., 'user')
   * @param {Object} options - Reference options
   * @param {string} options.type - Column type (default: 'bigint')
   * @param {string} options.column - Custom column name (default: {name}_id)
   * @param {string} options.table - Custom referenced table (default: pluralize(name))
   * @param {string} options.foreignKey - Custom foreign key column (default: 'id')
   * @param {string} options.onDelete - ON DELETE action (CASCADE, SET NULL, etc.)
   * @param {string} options.onUpdate - ON UPDATE action
   * @param {boolean} options.index - Create index on the column (default: true)
   * @param {boolean} options.polymorphic - Create polymorphic reference
   * @returns {ColumnBuilder} Column builder for chaining
   *
   * @example
   * t.references('user')
   * // Creates: user_id BIGINT REFERENCES users(id)
   *
   * t.references('user', { onDelete: 'CASCADE' })
   * // Creates: user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
   *
   * t.references('author', { table: 'users' })
   * // Creates: author_id BIGINT REFERENCES users(id)
   */
  references(name, options = {}) {
    const columnName = options.column || `${name}_id`
    // pluralize(), the rule Model.getTableName() and the schema dumper share.
    const tableName = options.table || pluralize(name)
    const foreignKey = options.foreignKey || 'id'
    const columnType = options.type || 'bigint'

    const column = {
      name: columnName,
      type: columnType,
      foreignKey: {
        table: tableName,
        column: foreignKey,
        onDelete: options.onDelete,
        onUpdate: options.onUpdate
      }
    }

    this.columns.push(column)

    // Handle polymorphic associations
    if (options.polymorphic) {
      const typeColumn = {
        name: `${name}_type`,
        type: 'string',
        limit: 255
      }
      this.columns.push(typeColumn)

      // Remove foreign key for polymorphic (can't use FK with polymorphic)
      delete column.foreignKey

      // Add composite index for polymorphic
      this.indexes.push({
        columns: [`${name}_type`, columnName],
        name: `index_${this.tableName}_on_${name}`
      })
    } else if (options.index !== false) {
      // Add index by default for foreign keys
      this.indexes.push({
        columns: [columnName],
        name: `index_${this.tableName}_on_${columnName}`
      })
    }

    return new ColumnBuilder(this, column)
  }

  /**
   * Add a belongs_to reference (alias for references)
   * @param {string} name - Referenced model name
   * @param {Object} options - Reference options
   * @returns {ColumnBuilder} Column builder for chaining
   */
  belongsTo(name, options = {}) {
    return this.references(name, options)
  }

  /**
   * Add created_at and updated_at timestamp columns
   * @param {Object} options - Timestamp options
   * @returns {TableBuilder} this for chaining
   */
  timestamps(options = {}) {
    const type = options.timezone ? 'timestamptz' : 'datetime'

    this.columns.push({
      name: 'created_at',
      type,
      notNull: true,
      default: 'NOW()'
    })

    this.columns.push({
      name: 'updated_at',
      type,
      notNull: true,
      default: 'NOW()'
    })

    return this
  }

  /**
   * Add an index
   * @param {string|string[]} columns - Column(s) to index
   * @param {Object} options - Index options
   * @returns {TableBuilder} this for chaining
   */
  index(columns, options = {}) {
    const cols = Array.isArray(columns) ? columns : [columns]
    this.indexes.push({
      columns: cols,
      name: options.name || `index_${this.tableName}_on_${cols.join('_')}`,
      unique: options.unique || false,
      using: options.using,
      where: options.where
    })
    return this
  }

  /**
   * Add a check constraint
   * @param {string} expression - Check expression
   * @param {Object} options - Constraint options
   * @returns {TableBuilder} this for chaining
   */
  check(expression, options = {}) {
    // Store check constraint to add to SQL generation
    if (!this._checks) this._checks = []
    this._checks.push({
      expression,
      name: options.name
    })
    return this
  }

  /**
   * Generate CREATE TABLE SQL
   * @returns {string} SQL statement
   */
  toSQL() {
    return this.adapter.createTableSQL(this.tableName, this.columns, this.options)
  }

  /**
   * Generate CREATE INDEX SQL statements
   * @returns {string[]} Array of SQL statements
   */
  toIndexSQL() {
    return this.indexes.map(idx => {
      return this.adapter.createIndexSQL(this.tableName, idx.columns, {
        name: idx.name,
        unique: idx.unique,
        using: idx.using,
        where: idx.where
      })
    })
  }

  /**
   * Get column definitions (for introspection)
   * @returns {Object[]}
   */
  getColumns() {
    return this.columns
  }

  /**
   * Get index definitions (for introspection)
   * @returns {Object[]}
   */
  getIndexes() {
    return this.indexes
  }
}

/**
 * Column Builder - DSL for column options
 *
 * Provides a fluent interface for adding column constraints.
 *
 * @example
 * t.string('email').notNull().unique().default('')
 * t.integer('age').check('age >= 0')
 * t.decimal('price', { precision: 10, scale: 2 }).notNull().default(0)
 */
export class ColumnBuilder {
  /**
   * Create a new ColumnBuilder
   * @param {TableBuilder} tableBuilder - Parent table builder
   * @param {Object} column - Column definition object
   */
  constructor(tableBuilder, column) {
    this.tableBuilder = tableBuilder
    this.column = column
  }

  /**
   * Mark column as NOT NULL
   * @returns {ColumnBuilder} this for chaining
   */
  notNull() {
    this.column.notNull = true
    return this
  }

  /**
   * Mark column as UNIQUE
   * @returns {ColumnBuilder} this for chaining
   */
  unique() {
    this.column.unique = true
    return this
  }

  /**
   * Set default value
   * @param {any} value - Default value
   * @returns {ColumnBuilder} this for chaining
   */
  default(value) {
    this.column.default = value
    return this
  }

  /**
   * Add CHECK constraint
   * @param {string} expression - Check expression
   * @returns {ColumnBuilder} this for chaining
   */
  check(expression) {
    this.column.check = expression
    return this
  }

  /**
   * Set ON DELETE action for foreign key
   * @param {string} action - CASCADE, SET NULL, NO ACTION, RESTRICT
   * @returns {ColumnBuilder} this for chaining
   */
  onDelete(action) {
    if (this.column.foreignKey) {
      this.column.foreignKey.onDelete = action
    }
    return this
  }

  /**
   * Set ON UPDATE action for foreign key
   * @param {string} action - CASCADE, SET NULL, NO ACTION, RESTRICT
   * @returns {ColumnBuilder} this for chaining
   */
  onUpdate(action) {
    if (this.column.foreignKey) {
      this.column.foreignKey.onUpdate = action
    }
    return this
  }

  /**
   * Add an index on this column
   * @param {Object} options - Index options
   * @returns {ColumnBuilder} this for chaining
   */
  index(options = {}) {
    this.tableBuilder.index(this.column.name, options)
    return this
  }

  /**
   * Mark column as primary key
   * @returns {ColumnBuilder} this for chaining
   */
  primaryKey() {
    this.column.primaryKey = true
    return this
  }

  /**
   * Set column collation
   * @param {string} collation - Collation name
   * @returns {ColumnBuilder} this for chaining
   */
  collate(collation) {
    this.column.collation = collation
    return this
  }

  /**
   * Make column a generated column
   * @param {string} expression - Generation expression
   * @returns {ColumnBuilder} this for chaining
   */
  generated(expression) {
    this.column.generated = expression
    return this
  }

  /**
   * Mark column as nullable (removes NOT NULL if set)
   * @returns {ColumnBuilder} this for chaining
   */
  nullable() {
    this.column.notNull = false
    return this
  }

  /**
   * Set comment on column
   * @param {string} text - Comment text
   * @returns {ColumnBuilder} this for chaining
   */
  comment(text) {
    this.column.comment = text
    return this
  }

  // Allow chaining back to TableBuilder for continued building
  // These just delegate to the parent

  /**
   * Add a string column (delegate to table builder)
   */
  string(name, options) {
    return this.tableBuilder.string(name, options)
  }

  /**
   * Add a text column (delegate to table builder)
   */
  text(name) {
    return this.tableBuilder.text(name)
  }

  /**
   * Add an integer column (delegate to table builder)
   */
  integer(name) {
    return this.tableBuilder.integer(name)
  }

  /**
   * Add a bigint column (delegate to table builder)
   */
  bigint(name) {
    return this.tableBuilder.bigint(name)
  }

  /**
   * Add a boolean column (delegate to table builder)
   */
  boolean(name) {
    return this.tableBuilder.boolean(name)
  }

  /**
   * Add a datetime column (delegate to table builder)
   */
  datetime(name, options) {
    return this.tableBuilder.datetime(name, options)
  }

  /**
   * Add a json column (delegate to table builder)
   */
  json(name) {
    return this.tableBuilder.json(name)
  }

  /**
   * Add a jsonb column (delegate to table builder)
   */
  jsonb(name) {
    return this.tableBuilder.jsonb(name)
  }

  /**
   * Add a references column (delegate to table builder)
   */
  references(name, options) {
    return this.tableBuilder.references(name, options)
  }

  /**
   * Add timestamps (delegate to table builder)
   */
  timestamps(options) {
    return this.tableBuilder.timestamps(options)
  }
}

/**
 * Create a migration function for function-based migrations
 *
 * @example
 * // db/migrations/20250124_create_users.js
 * export async function up(db) {
 *   await db.createTable('users', (t) => {
 *     t.id()
 *     t.string('email').notNull().unique()
 *     t.timestamps()
 *   })
 * }
 *
 * export async function down(db) {
 *   await db.dropTable('users')
 * }
 */
export function createMigration(up, down) {
  return { up, down }
}

export default {
  Migration,
  MigrationRunner,
  TableBuilder,
  ColumnBuilder,
  createMigration
}
