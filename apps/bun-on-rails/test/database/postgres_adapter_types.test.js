/**
 * PostgreSQL Adapter Tests - Types and Value Handling
 *
 * Tests for identifier quoting, type mapping, and value conversion
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

describe('PostgresAdapter - Types', () => {
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
