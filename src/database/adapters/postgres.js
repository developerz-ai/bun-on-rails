/**
 * PostgreSQL Adapter - SQL generation and type handling
 *
 * Provides PostgreSQL-specific SQL generation for migrations,
 * queries, and type mapping. Compatible with YugabyteDB.
 *
 * @module @bun-on-rails/database/adapters/postgres
 */

/**
 * PostgreSQL column types mapping from framework types
 */
export const COLUMN_TYPES = {
  // Primary key types
  id: 'BIGSERIAL',
  uuid: 'UUID',

  // String types
  string: 'VARCHAR(255)',
  text: 'TEXT',
  citext: 'CITEXT', // Case-insensitive text (requires extension)

  // Numeric types
  integer: 'INTEGER',
  bigint: 'BIGINT',
  smallint: 'SMALLINT',
  decimal: 'DECIMAL',
  numeric: 'NUMERIC',
  float: 'FLOAT',
  double: 'DOUBLE PRECISION',
  real: 'REAL',
  money: 'MONEY',

  // Boolean
  boolean: 'BOOLEAN',

  // Date/Time types
  date: 'DATE',
  time: 'TIME',
  datetime: 'TIMESTAMP',
  timestamp: 'TIMESTAMP',
  timestamptz: 'TIMESTAMPTZ',
  interval: 'INTERVAL',

  // Binary
  binary: 'BYTEA',
  blob: 'BYTEA',

  // JSON types
  json: 'JSON',
  jsonb: 'JSONB',

  // Array types (PostgreSQL specific)
  'string[]': 'VARCHAR(255)[]',
  'text[]': 'TEXT[]',
  'integer[]': 'INTEGER[]',
  'bigint[]': 'BIGINT[]',

  // Network types
  inet: 'INET',
  cidr: 'CIDR',
  macaddr: 'MACADDR',

  // Geometric types
  point: 'POINT',
  line: 'LINE',
  box: 'BOX',
  circle: 'CIRCLE',
  polygon: 'POLYGON',

  // Full-text search
  tsvector: 'TSVECTOR',
  tsquery: 'TSQUERY',

  // Range types
  int4range: 'INT4RANGE',
  int8range: 'INT8RANGE',
  numrange: 'NUMRANGE',
  daterange: 'DATERANGE',
  tsrange: 'TSRANGE',
  tstzrange: 'TSTZRANGE',

  // Foreign key reference
  references: 'BIGINT'
}

/**
 * PostgreSQL type aliases for reverse mapping
 */
export const TYPE_ALIASES = {
  'character varying': 'string',
  'varchar': 'string',
  'text': 'text',
  'integer': 'integer',
  'bigint': 'bigint',
  'smallint': 'smallint',
  'numeric': 'decimal',
  'decimal': 'decimal',
  'real': 'float',
  'double precision': 'double',
  'boolean': 'boolean',
  'date': 'date',
  'time without time zone': 'time',
  'time with time zone': 'time',
  'timestamp without time zone': 'datetime',
  'timestamp with time zone': 'timestamptz',
  'bytea': 'binary',
  'json': 'json',
  'jsonb': 'jsonb',
  'uuid': 'uuid',
  'inet': 'inet',
  'cidr': 'cidr',
  'macaddr': 'macaddr'
}

/**
 * PostgreSQL reserved keywords that need quoting
 */
export const RESERVED_WORDS = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
  'authorization', 'binary', 'both', 'case', 'cast', 'check', 'collate', 'collation',
  'column', 'concurrently', 'constraint', 'create', 'cross', 'current_catalog',
  'current_date', 'current_role', 'current_schema', 'current_time', 'current_timestamp',
  'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
  'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant',
  'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is',
  'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
  'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only',
  'or', 'order', 'outer', 'overlaps', 'placing', 'primary', 'references', 'returning',
  'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'table', 'tablesample',
  'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic',
  'verbose', 'when', 'where', 'window', 'with'
])

/**
 * PostgreSQL Adapter class
 *
 * Handles PostgreSQL-specific SQL generation for:
 * - DDL statements (CREATE TABLE, ALTER TABLE, etc.)
 * - Type conversions
 * - Identifier quoting
 * - Parameter binding
 *
 * @example
 * const adapter = new PostgresAdapter()
 *
 * // Generate CREATE TABLE SQL
 * const sql = adapter.createTableSQL('users', [
 *   { name: 'id', type: 'id', primaryKey: true },
 *   { name: 'name', type: 'string', notNull: true },
 *   { name: 'email', type: 'string', unique: true }
 * ])
 */
export class PostgresAdapter {
  constructor(options = {}) {
    this.options = {
      identifierQuoteChar: '"',
      stringQuoteChar: "'",
      parameterStyle: '$', // $1, $2, etc.
      ...options
    }
  }

  // ============================================
  // Identifier Handling
  // ============================================

  /**
   * Quote an identifier (table name, column name, etc.)
   * @param {string} identifier
   * @returns {string}
   */
  quoteIdentifier(identifier) {
    const { identifierQuoteChar } = this.options
    // Always quote to be safe
    return `${identifierQuoteChar}${identifier.replace(/"/g, '""')}${identifierQuoteChar}`
  }

  /**
   * Quote a table name, handling schema if present
   * @param {string} tableName
   * @returns {string}
   */
  quoteTableName(tableName) {
    if (tableName.includes('.')) {
      const [schema, table] = tableName.split('.')
      return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`
    }
    return this.quoteIdentifier(tableName)
  }

  /**
   * Quote a value for SQL
   * @param {any} value
   * @returns {string}
   */
  quoteValue(value) {
    if (value === null || value === undefined) {
      return 'NULL'
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE'
    }
    if (typeof value === 'number') {
      return String(value)
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`
    }
    if (Array.isArray(value)) {
      return `ARRAY[${value.map(v => this.quoteValue(v)).join(', ')}]`
    }
    if (typeof value === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
    }
    // String - escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`
  }

  /**
   * Check if an identifier needs quoting
   * @param {string} identifier
   * @returns {boolean}
   */
  needsQuoting(identifier) {
    const lower = identifier.toLowerCase()
    return RESERVED_WORDS.has(lower) ||
           !/^[a-z_][a-z0-9_]*$/.test(identifier) ||
           identifier !== lower
  }

  // ============================================
  // Type Handling
  // ============================================

  /**
   * Get PostgreSQL type for a framework type
   * @param {string} type - Framework type (e.g., 'string', 'integer')
   * @param {Object} options - Type options
   * @returns {string}
   */
  columnType(type, options = {}) {
    // Handle explicit SQL type
    if (options.sqlType) {
      return options.sqlType
    }

    // Handle string with length
    if (type === 'string' && options.limit) {
      return `VARCHAR(${options.limit})`
    }

    // Handle decimal with precision/scale
    if ((type === 'decimal' || type === 'numeric') && (options.precision || options.scale)) {
      const precision = options.precision || 10
      const scale = options.scale || 0
      return `NUMERIC(${precision}, ${scale})`
    }

    // Handle array types
    if (options.array) {
      const baseType = COLUMN_TYPES[type] || type.toUpperCase()
      return `${baseType}[]`
    }

    // Look up in type map
    const pgType = COLUMN_TYPES[type]
    if (pgType) {
      return pgType
    }

    // Unknown type - use as-is (allows custom PostgreSQL types)
    return type.toUpperCase()
  }

  /**
   * Get framework type from PostgreSQL type
   * @param {string} pgType - PostgreSQL type
   * @returns {string}
   */
  frameworkType(pgType) {
    const lower = pgType.toLowerCase()

    // Check aliases
    if (TYPE_ALIASES[lower]) {
      return TYPE_ALIASES[lower]
    }

    // Handle varchar with length
    if (lower.startsWith('character varying') || lower.startsWith('varchar')) {
      return 'string'
    }

    // Handle numeric with precision
    if (lower.startsWith('numeric')) {
      return 'decimal'
    }

    // Handle array types
    if (lower.endsWith('[]')) {
      const baseType = lower.slice(0, -2)
      const frameworkBase = this.frameworkType(baseType)
      return `${frameworkBase}[]`
    }

    // Unknown - return as-is
    return lower
  }

  // ============================================
  // Value Conversion
  // ============================================

  /**
   * Convert a JavaScript value to PostgreSQL format
   * @param {any} value - JavaScript value
   * @param {string} type - Column type
   * @returns {any}
   */
  toDatabase(value, type) {
    if (value === null || value === undefined) {
      return null
    }

    switch (type) {
      case 'boolean':
        return Boolean(value)

      case 'integer':
      case 'smallint':
        return parseInt(value, 10)

      case 'bigint':
        // Return as string to preserve precision
        return String(value)

      case 'float':
      case 'double':
      case 'real':
      case 'decimal':
      case 'numeric':
        return parseFloat(value)

      case 'date':
        if (value instanceof Date) {
          return value.toISOString().split('T')[0]
        }
        return value

      case 'datetime':
      case 'timestamp':
      case 'timestamptz':
        if (value instanceof Date) {
          return value.toISOString()
        }
        return value

      case 'json':
      case 'jsonb':
        if (typeof value === 'string') {
          return value
        }
        return JSON.stringify(value)

      case 'binary':
      case 'bytea':
        if (Buffer.isBuffer(value)) {
          return value
        }
        return Buffer.from(value)

      default:
        return value
    }
  }

  /**
   * Convert a PostgreSQL value to JavaScript
   * @param {any} value - Database value
   * @param {string} type - Column type
   * @returns {any}
   */
  fromDatabase(value, type) {
    if (value === null || value === undefined) {
      return null
    }

    switch (type) {
      case 'boolean':
        return value === true || value === 't' || value === 'true' || value === 1

      case 'integer':
      case 'smallint':
        return parseInt(value, 10)

      case 'bigint':
        // Keep as string if very large, otherwise convert to number
        const num = Number(value)
        if (Number.isSafeInteger(num)) {
          return num
        }
        return BigInt(value)

      case 'float':
      case 'double':
      case 'real':
      case 'decimal':
      case 'numeric':
        return parseFloat(value)

      case 'date':
        if (value instanceof Date) {
          return value
        }
        return new Date(value + 'T00:00:00.000Z')

      case 'datetime':
      case 'timestamp':
      case 'timestamptz':
        if (value instanceof Date) {
          return value
        }
        return new Date(value)

      case 'json':
      case 'jsonb':
        if (typeof value === 'string') {
          return JSON.parse(value)
        }
        return value

      default:
        return value
    }
  }

  // ============================================
  // DDL Generation
  // ============================================

  /**
   * Generate CREATE TABLE SQL
   * @param {string} tableName
   * @param {Array<Object>} columns - Column definitions
   * @param {Object} options - Table options
   * @returns {string}
   */
  createTableSQL(tableName, columns, options = {}) {
    const quotedTable = this.quoteTableName(tableName)
    const columnDefs = columns.map(col => this.columnDefinitionSQL(col))
    const constraints = []

    // Collect constraints
    for (const col of columns) {
      if (col.foreignKey) {
        const fkConstraint = this.foreignKeyConstraintSQL(tableName, col)
        if (fkConstraint) {
          constraints.push(fkConstraint)
        }
      }
    }

    // Table options
    let sql = `CREATE TABLE ${quotedTable} (\n`
    sql += '  ' + [...columnDefs, ...constraints].join(',\n  ')
    sql += '\n)'

    // PostgreSQL-specific options
    if (options.inherits) {
      sql += ` INHERITS (${this.quoteTableName(options.inherits)})`
    }

    if (options.tablespace) {
      sql += ` TABLESPACE ${this.quoteIdentifier(options.tablespace)}`
    }

    // YugabyteDB-specific: tablegroup for colocated tables
    if (options.tablegroup) {
      sql += ` TABLEGROUP ${this.quoteIdentifier(options.tablegroup)}`
    }

    return sql
  }

  /**
   * Generate column definition SQL
   * @param {Object} column - Column definition
   * @returns {string}
   */
  columnDefinitionSQL(column) {
    const {
      name,
      type,
      primaryKey,
      notNull,
      unique,
      default: defaultValue,
      check,
      generated,
      collation,
      ...typeOptions
    } = column

    const parts = [this.quoteIdentifier(name)]

    // Handle special id type
    if (type === 'id' || primaryKey) {
      if (typeOptions.uuid) {
        parts.push('UUID DEFAULT gen_random_uuid() PRIMARY KEY')
        return parts.join(' ')
      }
      parts.push('BIGSERIAL PRIMARY KEY')
      return parts.join(' ')
    }

    // Column type
    parts.push(this.columnType(type, typeOptions))

    // Collation
    if (collation) {
      parts.push(`COLLATE "${collation}"`)
    }

    // Generated column (PostgreSQL 12+)
    if (generated) {
      parts.push(`GENERATED ALWAYS AS (${generated}) STORED`)
    }

    // NOT NULL
    if (notNull) {
      parts.push('NOT NULL')
    }

    // DEFAULT
    if (defaultValue !== undefined) {
      parts.push(`DEFAULT ${this.defaultValueSQL(defaultValue, type)}`)
    }

    // UNIQUE
    if (unique) {
      parts.push('UNIQUE')
    }

    // CHECK constraint
    if (check) {
      parts.push(`CHECK (${check})`)
    }

    return parts.join(' ')
  }

  /**
   * Generate default value SQL
   * @param {any} value
   * @param {string} type
   * @returns {string}
   */
  defaultValueSQL(value, _type) {
    // Handle SQL expressions
    if (typeof value === 'string') {
      const upper = value.toUpperCase()
      if (upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP' ||
          upper === 'CURRENT_DATE' || upper === 'CURRENT_TIME' ||
          upper.startsWith('GEN_RANDOM_UUID') || upper.startsWith('UUID_GENERATE')) {
        return value
      }
    }

    // Handle function expressions
    if (typeof value === 'object' && value !== null && value.raw) {
      return value.raw
    }

    return this.quoteValue(value)
  }

  /**
   * Generate foreign key constraint SQL
   * @param {string} tableName
   * @param {Object} column
   * @returns {string}
   */
  foreignKeyConstraintSQL(tableName, column) {
    const { name, foreignKey } = column
    const {
      table: refTable,
      column: refColumn = 'id',
      onDelete = 'NO ACTION',
      onUpdate = 'NO ACTION',
      deferrable = false,
      constraintName
    } = typeof foreignKey === 'string' ? { table: foreignKey } : foreignKey

    const fkName = constraintName || `fk_${tableName}_${name}`

    let sql = `CONSTRAINT ${this.quoteIdentifier(fkName)} `
    sql += `FOREIGN KEY (${this.quoteIdentifier(name)}) `
    sql += `REFERENCES ${this.quoteTableName(refTable)} (${this.quoteIdentifier(refColumn)})`

    if (onDelete !== 'NO ACTION') {
      sql += ` ON DELETE ${onDelete}`
    }
    if (onUpdate !== 'NO ACTION') {
      sql += ` ON UPDATE ${onUpdate}`
    }
    if (deferrable) {
      sql += ' DEFERRABLE INITIALLY DEFERRED'
    }

    return sql
  }

  /**
   * Generate ALTER TABLE ADD COLUMN SQL
   * @param {string} tableName
   * @param {Object} column
   * @returns {string}
   */
  addColumnSQL(tableName, column) {
    const quotedTable = this.quoteTableName(tableName)
    const colDef = this.columnDefinitionSQL(column)
    return `ALTER TABLE ${quotedTable} ADD COLUMN ${colDef}`
  }

  /**
   * Generate ALTER TABLE DROP COLUMN SQL
   * @param {string} tableName
   * @param {string} columnName
   * @param {Object} options
   * @returns {string}
   */
  dropColumnSQL(tableName, columnName, options = {}) {
    const quotedTable = this.quoteTableName(tableName)
    const quotedCol = this.quoteIdentifier(columnName)
    const cascade = options.cascade ? ' CASCADE' : ''
    return `ALTER TABLE ${quotedTable} DROP COLUMN ${quotedCol}${cascade}`
  }

  /**
   * Generate ALTER TABLE RENAME COLUMN SQL
   * @param {string} tableName
   * @param {string} oldName
   * @param {string} newName
   * @returns {string}
   */
  renameColumnSQL(tableName, oldName, newName) {
    const quotedTable = this.quoteTableName(tableName)
    return `ALTER TABLE ${quotedTable} RENAME COLUMN ${this.quoteIdentifier(oldName)} TO ${this.quoteIdentifier(newName)}`
  }

  /**
   * Generate ALTER TABLE ALTER COLUMN SQL for type change
   * @param {string} tableName
   * @param {string} columnName
   * @param {string} newType
   * @param {Object} options
   * @returns {string}
   */
  changeColumnTypeSQL(tableName, columnName, newType, options = {}) {
    const quotedTable = this.quoteTableName(tableName)
    const quotedCol = this.quoteIdentifier(columnName)
    const pgType = this.columnType(newType, options)

    let sql = `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} TYPE ${pgType}`

    // USING clause for type conversion
    if (options.using) {
      sql += ` USING ${options.using}`
    }

    return sql
  }

  /**
   * Generate ALTER TABLE ALTER COLUMN SET/DROP NOT NULL SQL
   * @param {string} tableName
   * @param {string} columnName
   * @param {boolean} notNull
   * @returns {string}
   */
  changeColumnNullSQL(tableName, columnName, notNull) {
    const quotedTable = this.quoteTableName(tableName)
    const quotedCol = this.quoteIdentifier(columnName)
    const action = notNull ? 'SET NOT NULL' : 'DROP NOT NULL'
    return `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} ${action}`
  }

  /**
   * Generate ALTER TABLE ALTER COLUMN SET/DROP DEFAULT SQL
   * @param {string} tableName
   * @param {string} columnName
   * @param {any} defaultValue - null to drop default
   * @param {string} type
   * @returns {string}
   */
  changeColumnDefaultSQL(tableName, columnName, defaultValue, type) {
    const quotedTable = this.quoteTableName(tableName)
    const quotedCol = this.quoteIdentifier(columnName)

    if (defaultValue === null || defaultValue === undefined) {
      return `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`
    }

    const defVal = this.defaultValueSQL(defaultValue, type)
    return `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${defVal}`
  }

  /**
   * Generate DROP TABLE SQL
   * @param {string} tableName
   * @param {Object} options
   * @returns {string}
   */
  dropTableSQL(tableName, options = {}) {
    const quotedTable = this.quoteTableName(tableName)
    const ifExists = options.ifExists !== false ? ' IF EXISTS' : ''
    const cascade = options.cascade ? ' CASCADE' : ''
    return `DROP TABLE${ifExists} ${quotedTable}${cascade}`
  }

  /**
   * Generate RENAME TABLE SQL
   * @param {string} oldName
   * @param {string} newName
   * @returns {string}
   */
  renameTableSQL(oldName, newName) {
    return `ALTER TABLE ${this.quoteTableName(oldName)} RENAME TO ${this.quoteIdentifier(newName)}`
  }

  // ============================================
  // Index Generation
  // ============================================

  /**
   * Generate CREATE INDEX SQL
   * @param {string} tableName
   * @param {string|string[]} columns
   * @param {Object} options
   * @returns {string}
   */
  createIndexSQL(tableName, columns, options = {}) {
    const cols = Array.isArray(columns) ? columns : [columns]
    const indexName = options.name || `index_${tableName}_on_${cols.join('_')}`

    const parts = ['CREATE']

    if (options.unique) {
      parts.push('UNIQUE')
    }

    parts.push('INDEX')

    if (options.concurrently) {
      parts.push('CONCURRENTLY')
    }

    if (options.ifNotExists) {
      parts.push('IF NOT EXISTS')
    }

    parts.push(this.quoteIdentifier(indexName))
    parts.push('ON')
    parts.push(this.quoteTableName(tableName))

    // Index method (btree, hash, gist, gin, brin)
    if (options.using) {
      parts.push(`USING ${options.using}`)
    }

    // Columns with optional operators
    const colDefs = cols.map(col => {
      if (typeof col === 'object') {
        let def = this.quoteIdentifier(col.name)
        if (col.opclass) def += ` ${col.opclass}`
        if (col.order) def += ` ${col.order.toUpperCase()}`
        if (col.nulls) def += ` NULLS ${col.nulls.toUpperCase()}`
        return def
      }
      return this.quoteIdentifier(col)
    })
    parts.push(`(${colDefs.join(', ')})`)

    // Include columns (PostgreSQL 11+)
    if (options.include) {
      const includeCols = Array.isArray(options.include) ? options.include : [options.include]
      parts.push(`INCLUDE (${includeCols.map(c => this.quoteIdentifier(c)).join(', ')})`)
    }

    // Partial index
    if (options.where) {
      parts.push(`WHERE ${options.where}`)
    }

    // Tablespace
    if (options.tablespace) {
      parts.push(`TABLESPACE ${this.quoteIdentifier(options.tablespace)}`)
    }

    return parts.join(' ')
  }

  /**
   * Generate DROP INDEX SQL
   * @param {string} indexName
   * @param {Object} options
   * @returns {string}
   */
  dropIndexSQL(indexName, options = {}) {
    const parts = ['DROP INDEX']

    if (options.concurrently) {
      parts.push('CONCURRENTLY')
    }

    if (options.ifExists !== false) {
      parts.push('IF EXISTS')
    }

    parts.push(this.quoteIdentifier(indexName))

    if (options.cascade) {
      parts.push('CASCADE')
    }

    return parts.join(' ')
  }

  // ============================================
  // Query Generation
  // ============================================

  /**
   * Generate SELECT SQL
   * @param {Object} options
   * @returns {Object} { sql, params }
   */
  selectSQL(options) {
    const {
      table,
      columns = ['*'],
      where = [],
      order = [],
      limit,
      offset,
      joins = [],
      groupBy = [],
      having = [],
      distinct = false,
      lock
    } = options

    const params = []
    let paramIndex = 1
    const parts = ['SELECT']

    if (distinct) {
      parts.push('DISTINCT')
    }

    // Columns
    const colStrs = columns.map(col => {
      if (typeof col === 'object') {
        return `${col.expression} AS ${this.quoteIdentifier(col.alias)}`
      }
      if (col === '*') return '*'
      return this.quoteIdentifier(col)
    })
    parts.push(colStrs.join(', '))

    // FROM
    parts.push('FROM')
    parts.push(this.quoteTableName(table))

    // JOINs
    for (const join of joins) {
      const joinType = (join.type || 'INNER').toUpperCase()
      parts.push(`${joinType} JOIN ${this.quoteTableName(join.table)}`)
      parts.push(`ON ${join.on}`)
    }

    // WHERE
    if (where.length > 0) {
      const { sql: whereSql, params: whereParams, nextIndex } = this.whereClauseSQL(where, paramIndex)
      parts.push('WHERE')
      parts.push(whereSql)
      params.push(...whereParams)
      paramIndex = nextIndex
    }

    // GROUP BY
    if (groupBy.length > 0) {
      parts.push('GROUP BY')
      parts.push(groupBy.map(col => this.quoteIdentifier(col)).join(', '))
    }

    // HAVING
    if (having.length > 0) {
      const { sql: havingSql, params: havingParams } = this.whereClauseSQL(having, paramIndex)
      parts.push('HAVING')
      parts.push(havingSql)
      params.push(...havingParams)
    }

    // ORDER BY
    if (order.length > 0) {
      parts.push('ORDER BY')
      const orderStrs = order.map(o => {
        if (typeof o === 'string') return this.quoteIdentifier(o)
        return `${this.quoteIdentifier(o.column)} ${o.direction?.toUpperCase() || 'ASC'}`
      })
      parts.push(orderStrs.join(', '))
    }

    // LIMIT
    if (limit !== undefined) {
      parts.push(`LIMIT ${limit}`)
    }

    // OFFSET
    if (offset !== undefined) {
      parts.push(`OFFSET ${offset}`)
    }

    // Row locking
    if (lock) {
      parts.push(`FOR ${lock.toUpperCase()}`)
    }

    return { sql: parts.join(' '), params }
  }

  /**
   * Generate INSERT SQL
   * @param {string} table
   * @param {Object|Object[]} data
   * @param {Object} options
   * @returns {Object} { sql, params }
   */
  insertSQL(table, data, options = {}) {
    const rows = Array.isArray(data) ? data : [data]
    if (rows.length === 0) {
      throw new Error('No data to insert')
    }

    const columns = Object.keys(rows[0])
    const params = []
    let paramIndex = 1

    const parts = ['INSERT INTO', this.quoteTableName(table)]

    // Columns
    parts.push(`(${columns.map(c => this.quoteIdentifier(c)).join(', ')})`)

    // Values
    const valueRows = rows.map(row => {
      const placeholders = columns.map(col => {
        params.push(row[col])
        return `$${paramIndex++}`
      })
      return `(${placeholders.join(', ')})`
    })
    parts.push('VALUES')
    parts.push(valueRows.join(', '))

    // ON CONFLICT (upsert)
    if (options.onConflict) {
      const { columns: conflictCols, update, doNothing } = options.onConflict

      parts.push(`ON CONFLICT (${conflictCols.map(c => this.quoteIdentifier(c)).join(', ')})`)

      if (doNothing) {
        parts.push('DO NOTHING')
      } else if (update) {
        const updateCols = Array.isArray(update) ? update : Object.keys(update)
        const setClauses = updateCols.map(col => {
          if (typeof update === 'object' && !Array.isArray(update) && update[col] !== undefined) {
            params.push(update[col])
            return `${this.quoteIdentifier(col)} = $${paramIndex++}`
          }
          return `${this.quoteIdentifier(col)} = EXCLUDED.${this.quoteIdentifier(col)}`
        })
        parts.push('DO UPDATE SET')
        parts.push(setClauses.join(', '))
      }
    }

    // RETURNING
    if (options.returning) {
      const retCols = options.returning === true
        ? '*'
        : (Array.isArray(options.returning) ? options.returning : [options.returning])
            .map(c => this.quoteIdentifier(c))
            .join(', ')
      parts.push('RETURNING')
      parts.push(retCols)
    }

    return { sql: parts.join(' '), params }
  }

  /**
   * Generate UPDATE SQL
   * @param {string} table
   * @param {Object} data
   * @param {Array} where
   * @param {Object} options
   * @returns {Object} { sql, params }
   */
  updateSQL(table, data, where = [], options = {}) {
    const params = []
    let paramIndex = 1

    const parts = ['UPDATE', this.quoteTableName(table), 'SET']

    // SET clauses
    const setClauses = Object.entries(data).map(([col, value]) => {
      params.push(value)
      return `${this.quoteIdentifier(col)} = $${paramIndex++}`
    })
    parts.push(setClauses.join(', '))

    // WHERE
    if (where.length > 0) {
      const { sql: whereSql, params: whereParams } = this.whereClauseSQL(where, paramIndex)
      parts.push('WHERE')
      parts.push(whereSql)
      params.push(...whereParams)
    }

    // RETURNING
    if (options.returning) {
      const retCols = options.returning === true
        ? '*'
        : (Array.isArray(options.returning) ? options.returning : [options.returning])
            .map(c => this.quoteIdentifier(c))
            .join(', ')
      parts.push('RETURNING')
      parts.push(retCols)
    }

    return { sql: parts.join(' '), params }
  }

  /**
   * Generate DELETE SQL
   * @param {string} table
   * @param {Array} where
   * @param {Object} options
   * @returns {Object} { sql, params }
   */
  deleteSQL(table, where = [], options = {}) {
    const params = []
    const paramIndex = 1

    const parts = ['DELETE FROM', this.quoteTableName(table)]

    // WHERE
    if (where.length > 0) {
      const { sql: whereSql, params: whereParams } = this.whereClauseSQL(where, paramIndex)
      parts.push('WHERE')
      parts.push(whereSql)
      params.push(...whereParams)
    }

    // RETURNING
    if (options.returning) {
      const retCols = options.returning === true
        ? '*'
        : (Array.isArray(options.returning) ? options.returning : [options.returning])
            .map(c => this.quoteIdentifier(c))
            .join(', ')
      parts.push('RETURNING')
      parts.push(retCols)
    }

    return { sql: parts.join(' '), params }
  }

  /**
   * Generate WHERE clause SQL from conditions
   * @param {Array} conditions
   * @param {number} startIndex
   * @returns {Object} { sql, params, nextIndex }
   */
  whereClauseSQL(conditions, startIndex = 1) {
    const params = []
    let paramIndex = startIndex
    const clauses = []

    for (const condition of conditions) {
      if (typeof condition === 'string') {
        // Raw SQL condition
        clauses.push(condition)
        continue
      }

      // Handle object with raw property
      if (condition.raw) {
        clauses.push(condition.raw)
        if (condition.values) {
          params.push(...condition.values)
        }
        continue
      }

      const { column, operator = '=', value, or = false } = condition

      // Handle different operators
      const op = operator.toUpperCase()
      let clause

      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        clause = `${this.quoteIdentifier(column)} ${op}`
      } else if (op === 'IN' || op === 'NOT IN') {
        if (!Array.isArray(value) || value.length === 0) {
          clause = op === 'IN' ? 'FALSE' : 'TRUE'
        } else {
          const placeholders = value.map(() => `$${paramIndex++}`)
          params.push(...value)
          clause = `${this.quoteIdentifier(column)} ${op} (${placeholders.join(', ')})`
        }
      } else if (op === 'BETWEEN') {
        params.push(value[0], value[1])
        clause = `${this.quoteIdentifier(column)} BETWEEN $${paramIndex} AND $${paramIndex + 1}`
        paramIndex += 2
      } else if (op === 'LIKE' || op === 'ILIKE') {
        params.push(value)
        clause = `${this.quoteIdentifier(column)} ${op} $${paramIndex++}`
      } else if (op === 'ANY' || op === 'ALL') {
        params.push(value)
        clause = `${this.quoteIdentifier(column)} = ${op}($${paramIndex++})`
      } else {
        // Standard comparison operator
        params.push(value)
        clause = `${this.quoteIdentifier(column)} ${op} $${paramIndex++}`
      }

      // Handle OR condition
      if (or && clauses.length > 0) {
        const lastClause = clauses.pop()
        clauses.push(`(${lastClause} OR ${clause})`)
      } else {
        clauses.push(clause)
      }
    }

    return {
      sql: clauses.join(' AND '),
      params,
      nextIndex: paramIndex
    }
  }

  // ============================================
  // Schema Introspection
  // ============================================

  /**
   * Generate SQL to get table columns
   * @param {string} tableName
   * @param {string} schema
   * @returns {Object} { sql, params }
   */
  columnsSQL(tableName, schema = 'public') {
    return {
      sql: `
        SELECT
          column_name,
          data_type,
          udt_name,
          column_default,
          is_nullable,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_identity,
          identity_generation
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `,
      params: [schema, tableName]
    }
  }

  /**
   * Generate SQL to get table indexes
   * @param {string} tableName
   * @param {string} schema
   * @returns {Object} { sql, params }
   */
  indexesSQL(tableName, schema = 'public') {
    return {
      sql: `
        SELECT
          i.relname AS index_name,
          am.amname AS index_type,
          idx.indisunique AS is_unique,
          idx.indisprimary AS is_primary,
          array_agg(a.attname ORDER BY array_position(idx.indkey, a.attnum)) AS columns,
          pg_get_expr(idx.indpred, idx.indrelid) AS where_clause
        FROM pg_index idx
        JOIN pg_class i ON i.oid = idx.indexrelid
        JOIN pg_class t ON t.oid = idx.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
        WHERE n.nspname = $1 AND t.relname = $2
        GROUP BY i.relname, am.amname, idx.indisunique, idx.indisprimary, idx.indpred, idx.indrelid
        ORDER BY i.relname
      `,
      params: [schema, tableName]
    }
  }

  /**
   * Generate SQL to get foreign keys
   * @param {string} tableName
   * @param {string} schema
   * @returns {Object} { sql, params }
   */
  foreignKeysSQL(tableName, schema = 'public') {
    return {
      sql: `
        SELECT
          conname AS constraint_name,
          a.attname AS column_name,
          cl.relname AS foreign_table,
          af.attname AS foreign_column,
          confdeltype AS on_delete,
          confupdtype AS on_update
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class cl ON cl.oid = c.confrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        JOIN pg_attribute af ON af.attrelid = cl.oid AND af.attnum = ANY(c.confkey)
        WHERE n.nspname = $1 AND t.relname = $2 AND c.contype = 'f'
        ORDER BY conname
      `,
      params: [schema, tableName]
    }
  }

  /**
   * Generate SQL to check table existence
   * @param {string} tableName
   * @param {string} schema
   * @returns {Object} { sql, params }
   */
  tableExistsSQL(tableName, schema = 'public') {
    return {
      sql: `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        ) AS exists
      `,
      params: [schema, tableName]
    }
  }

  /**
   * Generate SQL to list all tables
   * @param {string} schema
   * @returns {Object} { sql, params }
   */
  tablesSQL(schema = 'public') {
    return {
      sql: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
      params: [schema]
    }
  }
}

// Default adapter instance
let _defaultAdapter = null

/**
 * Get the default PostgreSQL adapter instance
 * @returns {PostgresAdapter}
 */
export function getAdapter() {
  if (!_defaultAdapter) {
    _defaultAdapter = new PostgresAdapter()
  }
  return _defaultAdapter
}

/**
 * Set the default PostgreSQL adapter instance
 * @param {PostgresAdapter} adapter
 */
export function setAdapter(adapter) {
  _defaultAdapter = adapter
}

export default PostgresAdapter
