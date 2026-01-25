/**
 * Validations Unit Tests
 *
 * Comprehensive tests for all validators in the validation system.
 * Tests cover both sync and async validators, edge cases, and custom messages.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  Validators,
  runValidations,
  addValidator,
  removeValidator,
  getValidatorNames
} from '../../src/database/validations.js'
import { Model } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'

// Mock connection for uniqueness tests
class MockConnection {
  constructor() {
    this.connected = true
    this.queries = []
    this.mockResults = []
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params })
    return this.mockResults.shift() || []
  }

  setMockResults(results) {
    this.mockResults = [...results]
  }

  getLastQuery() {
    return this.queries[this.queries.length - 1]
  }

  clearQueries() {
    this.queries = []
  }
}

describe('Validators - presence', () => {
  const { presence } = Validators

  it('fails for undefined value', () => {
    expect(presence(undefined)).toBe('is required')
  })

  it('fails for null value', () => {
    expect(presence(null)).toBe('is required')
  })

  it('fails for empty string', () => {
    expect(presence('')).toBe('is required')
  })

  it('fails for whitespace-only string', () => {
    expect(presence('   ')).toBe('is required')
  })

  it('passes for non-empty string', () => {
    expect(presence('hello')).toBeNull()
  })

  it('passes for number 0', () => {
    expect(presence(0)).toBeNull()
  })

  it('passes for boolean false', () => {
    expect(presence(false)).toBeNull()
  })

  it('passes for empty array', () => {
    expect(presence([])).toBeNull()
  })

  it('uses custom message', () => {
    expect(presence(null, { message: 'Custom error' })).toBe('Custom error')
  })

  it('allows null when allowNull is true', () => {
    expect(presence(null, { allowNull: true })).toBeNull()
  })

  it('allows empty string when allowBlank is true', () => {
    expect(presence('', { allowBlank: true })).toBeNull()
  })
})

describe('Validators - length', () => {
  const { length } = Validators

  it('returns null for null/undefined values', () => {
    expect(length(null, { min: 5 })).toBeNull()
    expect(length(undefined, { min: 5 })).toBeNull()
  })

  it('validates minimum length', () => {
    expect(length('ab', { min: 3 })).toBe('must be at least 3 characters')
    expect(length('abc', { min: 3 })).toBeNull()
    expect(length('abcd', { min: 3 })).toBeNull()
  })

  it('validates maximum length', () => {
    expect(length('abcd', { max: 3 })).toBe('must be at most 3 characters')
    expect(length('abc', { max: 3 })).toBeNull()
    expect(length('ab', { max: 3 })).toBeNull()
  })

  it('validates exact length', () => {
    expect(length('ab', { is: 3 })).toBe('must be exactly 3 characters')
    expect(length('abc', { is: 3 })).toBeNull()
    expect(length('abcd', { is: 3 })).toBe('must be exactly 3 characters')
  })

  it('validates range', () => {
    expect(length('a', { in: [2, 5] })).toBe('must be between 2 and 5 characters')
    expect(length('ab', { in: [2, 5] })).toBeNull()
    expect(length('abc', { in: [2, 5] })).toBeNull()
    expect(length('abcdef', { in: [2, 5] })).toBe('must be between 2 and 5 characters')
  })

  it('validates array length', () => {
    expect(length([1, 2], { min: 3 })).toBe('must be at least 3 characters')
    expect(length([1, 2, 3], { min: 3 })).toBeNull()
  })

  it('uses custom message', () => {
    expect(length('ab', { min: 3, message: 'Too short!' })).toBe('Too short!')
  })

  it('counts words when tokenizer is "words"', () => {
    expect(length('hello world', { tokenizer: 'words', min: 3 })).toBe('must be at least 3 characters')
    expect(length('one two three', { tokenizer: 'words', min: 3 })).toBeNull()
  })
})

describe('Validators - format', () => {
  const { format } = Validators

  it('returns null for blank values by default', () => {
    expect(format(null, { with: /^[a-z]+$/ })).toBeNull()
    expect(format('', { with: /^[a-z]+$/ })).toBeNull()
  })

  it('validates pattern with "with" option', () => {
    expect(format('hello', { with: /^[a-z]+$/ })).toBeNull()
    expect(format('Hello123', { with: /^[a-z]+$/ })).toBe('is invalid')
  })

  it('validates pattern with "without" option', () => {
    expect(format('hello', { without: /[0-9]/ })).toBeNull()
    expect(format('hello123', { without: /[0-9]/ })).toBe('is invalid')
  })

  it('uses custom message', () => {
    expect(format('123', { with: /^[a-z]+$/, message: 'Letters only!' })).toBe('Letters only!')
  })

  it('fails blank values when allowBlank is false', () => {
    expect(format('', { with: /^[a-z]+$/, allowBlank: false })).toBe('is invalid')
  })
})

describe('Validators - numericality', () => {
  const { numericality } = Validators

  it('returns null for blank values', () => {
    expect(numericality(null)).toBeNull()
    expect(numericality('')).toBeNull()
  })

  it('fails for non-numeric values', () => {
    expect(numericality('abc')).toBe('must be a number')
    expect(numericality('12abc')).toBe('must be a number')
  })

  it('passes for numeric values', () => {
    expect(numericality(42)).toBeNull()
    expect(numericality('42')).toBeNull()
    expect(numericality(3.14)).toBeNull()
    expect(numericality(-10)).toBeNull()
  })

  it('validates integer constraint', () => {
    expect(numericality(3.14, { integer: true })).toBe('must be an integer')
    expect(numericality(42, { integer: true })).toBeNull()
    expect(numericality(3.14, { onlyInteger: true })).toBe('must be an integer')
    expect(numericality(42, { onlyInteger: true })).toBeNull()
  })

  it('validates greaterThan constraint', () => {
    expect(numericality(5, { greaterThan: 5 })).toBe('must be greater than 5')
    expect(numericality(6, { greaterThan: 5 })).toBeNull()
  })

  it('validates greaterThanOrEqualTo constraint', () => {
    expect(numericality(4, { greaterThanOrEqualTo: 5 })).toBe('must be greater than or equal to 5')
    expect(numericality(5, { greaterThanOrEqualTo: 5 })).toBeNull()
  })

  it('validates lessThan constraint', () => {
    expect(numericality(5, { lessThan: 5 })).toBe('must be less than 5')
    expect(numericality(4, { lessThan: 5 })).toBeNull()
  })

  it('validates lessThanOrEqualTo constraint', () => {
    expect(numericality(6, { lessThanOrEqualTo: 5 })).toBe('must be less than or equal to 5')
    expect(numericality(5, { lessThanOrEqualTo: 5 })).toBeNull()
  })

  it('validates equalTo constraint', () => {
    expect(numericality(4, { equalTo: 5 })).toBe('must be equal to 5')
    expect(numericality(5, { equalTo: 5 })).toBeNull()
  })

  it('validates otherThan constraint', () => {
    expect(numericality(5, { otherThan: 5 })).toBe('must be other than 5')
    expect(numericality(4, { otherThan: 5 })).toBeNull()
  })

  it('validates range with "in" constraint', () => {
    expect(numericality(0, { in: [1, 10] })).toBe('must be between 1 and 10')
    expect(numericality(5, { in: [1, 10] })).toBeNull()
    expect(numericality(11, { in: [1, 10] })).toBe('must be between 1 and 10')
  })

  it('validates odd constraint', () => {
    expect(numericality(4, { odd: true })).toBe('must be odd')
    expect(numericality(5, { odd: true })).toBeNull()
  })

  it('validates even constraint', () => {
    expect(numericality(5, { even: true })).toBe('must be even')
    expect(numericality(4, { even: true })).toBeNull()
  })

  it('validates positive constraint', () => {
    expect(numericality(0, { positive: true })).toBe('must be positive')
    expect(numericality(-1, { positive: true })).toBe('must be positive')
    expect(numericality(1, { positive: true })).toBeNull()
  })

  it('validates negative constraint', () => {
    expect(numericality(0, { negative: true })).toBe('must be negative')
    expect(numericality(1, { negative: true })).toBe('must be negative')
    expect(numericality(-1, { negative: true })).toBeNull()
  })

  it('uses custom message', () => {
    expect(numericality('abc', { message: 'Enter a valid number' })).toBe('Enter a valid number')
  })
})

describe('Validators - email', () => {
  const { email } = Validators

  it('returns null for blank values', () => {
    expect(email(null)).toBeNull()
    expect(email('')).toBeNull()
  })

  it('validates basic email format', () => {
    expect(email('test@example.com')).toBeNull()
    expect(email('user.name@domain.org')).toBeNull()
    expect(email('user+tag@example.co.uk')).toBeNull()
  })

  it('fails for invalid email format', () => {
    expect(email('not-an-email')).toBe('is not a valid email')
    expect(email('missing@domain')).toBe('is not a valid email')
    expect(email('@missing-local.com')).toBe('is not a valid email')
    expect(email('spaces in@email.com')).toBe('is not a valid email')
  })

  it('uses custom message', () => {
    expect(email('invalid', { message: 'Please enter valid email' })).toBe('Please enter valid email')
  })

  it('validates strict mode', () => {
    // Strict mode uses more comprehensive regex
    expect(email('test@example.com', { strict: true })).toBeNull()
    expect(email('test.user@sub.domain.com', { strict: true })).toBeNull()
  })

  it('fails blank values when allowBlank is false', () => {
    expect(email('', { allowBlank: false })).toBe('is not a valid email')
  })
})

describe('Validators - inclusion', () => {
  const { inclusion } = Validators

  it('returns null for blank values', () => {
    expect(inclusion(null, { in: ['a', 'b', 'c'] })).toBeNull()
    expect(inclusion('', { in: ['a', 'b', 'c'] })).toBeNull()
  })

  it('passes when value is in list', () => {
    expect(inclusion('a', { in: ['a', 'b', 'c'] })).toBeNull()
    expect(inclusion(2, { in: [1, 2, 3] })).toBeNull()
  })

  it('fails when value is not in list', () => {
    expect(inclusion('d', { in: ['a', 'b', 'c'] })).toBe('must be one of: a, b, c')
    expect(inclusion(4, { in: [1, 2, 3] })).toBe('must be one of: 1, 2, 3')
  })

  it('supports array shorthand', () => {
    expect(inclusion('d', ['a', 'b', 'c'])).toBe('must be one of: a, b, c')
    expect(inclusion('a', ['a', 'b', 'c'])).toBeNull()
  })

  it('uses custom message', () => {
    expect(inclusion('x', { in: ['a', 'b'], message: 'Invalid choice' })).toBe('Invalid choice')
  })

  it('returns null if no list provided', () => {
    expect(inclusion('anything', {})).toBeNull()
  })
})

describe('Validators - exclusion', () => {
  const { exclusion } = Validators

  it('returns null for blank values', () => {
    expect(exclusion(null, { in: ['admin', 'root'] })).toBeNull()
    expect(exclusion('', { in: ['admin', 'root'] })).toBeNull()
  })

  it('passes when value is not in list', () => {
    expect(exclusion('user', { in: ['admin', 'root'] })).toBeNull()
  })

  it('fails when value is in list', () => {
    expect(exclusion('admin', { in: ['admin', 'root'] })).toBe('cannot be one of: admin, root')
    expect(exclusion('root', { in: ['admin', 'root'] })).toBe('cannot be one of: admin, root')
  })

  it('supports array shorthand', () => {
    expect(exclusion('admin', ['admin', 'root'])).toBe('cannot be one of: admin, root')
    expect(exclusion('user', ['admin', 'root'])).toBeNull()
  })

  it('uses custom message', () => {
    expect(exclusion('admin', { in: ['admin'], message: 'Reserved username' })).toBe('Reserved username')
  })

  it('returns null if no list provided', () => {
    expect(exclusion('anything', {})).toBeNull()
  })
})

describe('Validators - uniqueness', () => {
  const { uniqueness } = Validators
  let mockConnection

  // Test model for uniqueness validation
  class TestUser extends Model {
    static tableName = 'users'
    static primaryKey = 'id'
  }

  TestUser.register()

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('returns null for blank values', async () => {
    const result = await uniqueness(null, { _model: new TestUser(), _field: 'email' })
    expect(result).toBeNull()
  })

  it('returns null without model context', async () => {
    const result = await uniqueness('test@example.com', {})
    expect(result).toBeNull()
  })

  it('passes when no duplicate exists', async () => {
    mockConnection.setMockResults([
      [{ count: '0' }]  // No existing records
    ])

    const user = new TestUser({ email: 'test@example.com' })
    const result = await uniqueness('test@example.com', { _model: user, _field: 'email' })

    expect(result).toBeNull()
  })

  it('fails when duplicate exists', async () => {
    mockConnection.setMockResults([
      [{ count: '1' }]  // One existing record
    ])

    const user = new TestUser({ email: 'test@example.com' })
    const result = await uniqueness('test@example.com', { _model: user, _field: 'email' })

    expect(result).toBe('has already been taken')
  })

  it('uses custom message', async () => {
    mockConnection.setMockResults([
      [{ count: '1' }]
    ])

    const user = new TestUser({ email: 'test@example.com' })
    const result = await uniqueness('test@example.com', {
      _model: user,
      _field: 'email',
      message: 'Email is already registered'
    })

    expect(result).toBe('Email is already registered')
  })

  it('scopes uniqueness check with additional field', async () => {
    mockConnection.setMockResults([
      [{ count: '0' }]
    ])

    const user = new TestUser({ email: 'test@example.com', organization_id: 1 })
    await uniqueness('test@example.com', {
      _model: user,
      _field: 'email',
      scope: 'organization_id'
    })

    // Verify scope was included in query
    const lastQuery = mockConnection.getLastQuery()
    expect(lastQuery.sql).toContain('organization_id')
  })

  it('excludes current record when updating', async () => {
    mockConnection.setMockResults([
      [{ count: '0' }]
    ])

    const user = new TestUser({ id: 1, email: 'test@example.com' })
    user.persisted = true

    await uniqueness('test@example.com', { _model: user, _field: 'email' })

    // Verify id exclusion in query
    const lastQuery = mockConnection.getLastQuery()
    expect(lastQuery.sql).toContain('id')
    expect(lastQuery.sql).toContain('!=')
  })
})

describe('Validators - custom', () => {
  const { custom } = Validators

  it('runs custom validation function', async () => {
    const validate = (value) => {
      if (value !== 'expected') return 'must be "expected"'
      return null
    }

    expect(await custom('wrong', { validate })).toBe('must be "expected"')
    expect(await custom('expected', { validate })).toBeNull()
  })

  it('passes model to validation function', async () => {
    let receivedModel = null
    const validate = (value, model) => {
      receivedModel = model
      return null
    }

    const mockModel = { name: 'test' }
    await custom('value', { validate, _model: mockModel })

    expect(receivedModel).toBe(mockModel)
  })

  it('handles async validation functions', async () => {
    const validate = async (value) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (value < 0) return 'must be positive'
      return null
    }

    expect(await custom(-1, { validate })).toBe('must be positive')
    expect(await custom(1, { validate })).toBeNull()
  })
})

describe('Validators - confirmation', () => {
  const { confirmation } = Validators

  it('passes when confirmation matches', () => {
    const model = {
      attributes: {
        password: 'secret123',
        password_confirmation: 'secret123'
      }
    }

    const result = confirmation('secret123', { _model: model, _field: 'password' })
    expect(result).toBeNull()
  })

  it('fails when confirmation does not match', () => {
    const model = {
      attributes: {
        password: 'secret123',
        password_confirmation: 'different'
      }
    }

    const result = confirmation('secret123', { _model: model, _field: 'password' })
    expect(result).toBe("doesn't match confirmation")
  })

  it('skips validation when confirmation field is not present', () => {
    const model = {
      attributes: {
        password: 'secret123'
      }
    }

    const result = confirmation('secret123', { _model: model, _field: 'password' })
    expect(result).toBeNull()
  })

  it('uses custom confirmation field name', () => {
    const model = {
      attributes: {
        email: 'test@example.com',
        email_confirm: 'different@example.com'
      }
    }

    const result = confirmation('test@example.com', {
      _model: model,
      _field: 'email',
      field: 'email_confirm'
    })
    expect(result).toBe("doesn't match confirmation")
  })

  it('uses custom message', () => {
    const model = {
      attributes: {
        password: 'secret123',
        password_confirmation: 'different'
      }
    }

    const result = confirmation('secret123', {
      _model: model,
      _field: 'password',
      message: 'Passwords must match'
    })
    expect(result).toBe('Passwords must match')
  })
})

describe('Validators - acceptance', () => {
  const { acceptance } = Validators

  it('passes for true value', () => {
    expect(acceptance(true)).toBeNull()
    expect(acceptance('true')).toBeNull()
    expect(acceptance('1')).toBeNull()
    expect(acceptance(1)).toBeNull()
    expect(acceptance('yes')).toBeNull()
  })

  it('fails for false/undefined values', () => {
    expect(acceptance(false)).toBe('must be accepted')
    expect(acceptance(undefined)).toBe('must be accepted')
    expect(acceptance(null)).toBe('must be accepted')
    expect(acceptance('no')).toBe('must be accepted')
  })

  it('uses custom accepted values', () => {
    expect(acceptance('agree', { accept: ['agree', 'confirm'] })).toBeNull()
    expect(acceptance('yes', { accept: ['agree', 'confirm'] })).toBe('must be accepted')
  })

  it('uses custom message', () => {
    expect(acceptance(false, { message: 'You must agree to the terms' })).toBe('You must agree to the terms')
  })
})

describe('Validators - url', () => {
  const { url } = Validators

  it('returns null for blank values', () => {
    expect(url(null)).toBeNull()
    expect(url('')).toBeNull()
  })

  it('validates valid URLs', () => {
    expect(url('https://example.com')).toBeNull()
    expect(url('http://example.com/path')).toBeNull()
    expect(url('https://sub.domain.com:8080/path?query=1')).toBeNull()
  })

  it('fails for invalid URLs', () => {
    expect(url('not-a-url')).toBe('is not a valid URL')
    expect(url('ftp://example.com')).toBe('must use one of these protocols: http, https')
  })

  it('validates custom protocols', () => {
    expect(url('ftp://example.com', { protocols: ['ftp'] })).toBeNull()
    expect(url('https://example.com', { protocols: ['ftp'] })).toBe('must use one of these protocols: ftp')
  })

  it('uses custom message', () => {
    expect(url('invalid', { message: 'Enter a valid website URL' })).toBe('Enter a valid website URL')
  })
})

describe('Validators - date', () => {
  const { date } = Validators

  it('returns null for blank values', () => {
    expect(date(null)).toBeNull()
    expect(date('')).toBeNull()
  })

  it('validates valid dates', () => {
    expect(date('2024-01-15')).toBeNull()
    expect(date(new Date())).toBeNull()
    expect(date('2024-01-15T10:30:00Z')).toBeNull()
  })

  it('fails for invalid dates', () => {
    expect(date('not-a-date')).toBe('is not a valid date')
    expect(date('2024-13-45')).toBe('is not a valid date')
  })

  it('validates before constraint', () => {
    const beforeDate = new Date('2024-06-01')
    expect(date('2024-05-01', { before: beforeDate })).toBeNull()
    expect(date('2024-07-01', { before: beforeDate })).toContain('must be before')
  })

  it('validates after constraint', () => {
    const afterDate = new Date('2024-01-01')
    expect(date('2024-02-01', { after: afterDate })).toBeNull()
    expect(date('2023-12-01', { after: afterDate })).toContain('must be after')
  })

  it('validates beforeOrEqualTo constraint', () => {
    const targetDate = new Date('2024-06-01')
    expect(date('2024-06-01', { beforeOrEqualTo: targetDate })).toBeNull()
    expect(date('2024-05-01', { beforeOrEqualTo: targetDate })).toBeNull()
    expect(date('2024-07-01', { beforeOrEqualTo: targetDate })).toContain('must be on or before')
  })

  it('validates afterOrEqualTo constraint', () => {
    const targetDate = new Date('2024-01-01')
    expect(date('2024-01-01', { afterOrEqualTo: targetDate })).toBeNull()
    expect(date('2024-02-01', { afterOrEqualTo: targetDate })).toBeNull()
    expect(date('2023-12-01', { afterOrEqualTo: targetDate })).toContain('must be on or after')
  })

  it('uses custom message', () => {
    expect(date('invalid', { message: 'Enter a valid date' })).toBe('Enter a valid date')
  })
})

describe('Validators - array', () => {
  const { array } = Validators

  it('returns null for blank values', () => {
    expect(array(null)).toBeNull()
    expect(array(undefined)).toBeNull()
  })

  it('fails for non-array values', () => {
    expect(array('string')).toBe('must be an array')
    expect(array(123)).toBe('must be an array')
    expect(array({ key: 'value' })).toBe('must be an array')
  })

  it('passes for valid arrays', () => {
    expect(array([])).toBeNull()
    expect(array([1, 2, 3])).toBeNull()
    expect(array(['a', 'b'])).toBeNull()
  })

  it('validates minLength constraint', () => {
    expect(array([], { minLength: 1 })).toBe('must have at least 1 items')
    expect(array([1], { minLength: 1 })).toBeNull()
    expect(array([1, 2, 3], { minLength: 2 })).toBeNull()
  })

  it('validates maxLength constraint', () => {
    expect(array([1, 2, 3, 4], { maxLength: 3 })).toBe('must have at most 3 items')
    expect(array([1, 2, 3], { maxLength: 3 })).toBeNull()
  })

  it('validates element type constraint', () => {
    expect(array([1, 'two', 3], { type: 'number' })).toBe('all items must be of type number')
    expect(array([1, 2, 3], { type: 'number' })).toBeNull()
    expect(array(['a', 'b', 'c'], { type: 'string' })).toBeNull()
  })

  it('uses custom message', () => {
    expect(array('not-array', { message: 'Must provide a list' })).toBe('Must provide a list')
  })
})

describe('runValidations', () => {
  // Test model
  class ValidatedModel extends Model {
    static validations = {
      name: { presence: true, length: { min: 2, max: 50 } },
      email: { presence: true, email: true },
      age: { numericality: { greaterThanOrEqualTo: 0, onlyInteger: true } }
    }
  }

  it('returns empty object for valid model', async () => {
    const model = new ValidatedModel({
      name: 'John Doe',
      email: 'john@example.com',
      age: 25
    })

    const errors = await runValidations(model)
    expect(errors).toEqual({})
  })

  it('returns errors for invalid model', async () => {
    const model = new ValidatedModel({
      name: 'J',
      email: 'invalid-email',
      age: -5
    })

    const errors = await runValidations(model)

    expect(errors.name).toBeDefined()
    expect(errors.name.length).toBeGreaterThan(0)
    expect(errors.email).toBeDefined()
    expect(errors.age).toBeDefined()
  })

  it('collects multiple errors for single field', async () => {
    class MultiErrorModel extends Model {
      static validations = {
        password: {
          presence: true,
          length: { min: 8 }
        }
      }
    }

    const model = new MultiErrorModel({ password: '' })
    const errors = await runValidations(model)

    expect(errors.password).toBeDefined()
    expect(errors.password.length).toBeGreaterThanOrEqual(1)
  })

  it('handles models without validations', async () => {
    class NoValidationModel extends Model {}

    const model = new NoValidationModel({ anything: 'goes' })
    const errors = await runValidations(model)

    expect(errors).toEqual({})
  })
})

describe('addValidator / removeValidator', () => {
  afterEach(() => {
    // Clean up custom validators
    removeValidator('testValidator')
  })

  it('adds custom validator', () => {
    const customFn = (value) => value === 'test' ? null : 'must be test'

    addValidator('testValidator', customFn)

    expect(Validators.testValidator).toBe(customFn)
    expect(Validators.testValidator('test')).toBeNull()
    expect(Validators.testValidator('other')).toBe('must be test')
  })

  it('throws error for non-function validator', () => {
    expect(() => addValidator('invalid', 'not a function')).toThrow('Validator must be a function')
  })

  it('removes custom validator', () => {
    addValidator('testValidator', () => null)
    expect(Validators.testValidator).toBeDefined()

    removeValidator('testValidator')
    expect(Validators.testValidator).toBeUndefined()
  })

  it('removing non-existent validator does nothing', () => {
    expect(() => removeValidator('nonexistent')).not.toThrow()
  })
})

describe('getValidatorNames', () => {
  it('returns array of validator names', () => {
    const names = getValidatorNames()

    expect(Array.isArray(names)).toBe(true)
    expect(names).toContain('presence')
    expect(names).toContain('length')
    expect(names).toContain('format')
    expect(names).toContain('numericality')
    expect(names).toContain('email')
    expect(names).toContain('inclusion')
    expect(names).toContain('exclusion')
    expect(names).toContain('uniqueness')
    expect(names).toContain('custom')
  })
})

describe('Integration - Model with validations', () => {
  let mockConnection

  class User extends Model {
    static tableName = 'users'
    static validations = {
      name: { presence: true, length: { min: 2, max: 100 } },
      email: { presence: true, email: true },
      age: { numericality: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 150, onlyInteger: true } },
      role: { inclusion: { in: ['admin', 'user', 'moderator'] } },
      username: { exclusion: { in: ['admin', 'root', 'system'] } },
      website: { url: true },
      bio: { length: { max: 500 } },
      tags: { array: { type: 'string' } }
    }
  }

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('validates complete valid user', async () => {
    const user = new User({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      role: 'user',
      username: 'johndoe',
      website: 'https://example.com',
      bio: 'Hello, I am John!',
      tags: ['developer', 'music']
    })

    const errors = await runValidations(user)
    expect(errors).toEqual({})
  })

  it('validates with multiple errors', async () => {
    const user = new User({
      name: 'J',  // too short
      email: 'invalid',  // invalid email
      age: 200,  // too old
      role: 'superadmin',  // not in list
      username: 'admin',  // reserved
      website: 'not-a-url',  // invalid URL
      bio: 'x'.repeat(600),  // too long
      tags: ['valid', 123]  // invalid type
    })

    const errors = await runValidations(user)

    expect(errors.name).toBeDefined()
    expect(errors.email).toBeDefined()
    expect(errors.age).toBeDefined()
    expect(errors.role).toBeDefined()
    expect(errors.username).toBeDefined()
    expect(errors.website).toBeDefined()
    expect(errors.bio).toBeDefined()
    expect(errors.tags).toBeDefined()
  })
})
