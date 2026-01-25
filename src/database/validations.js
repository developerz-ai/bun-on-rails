/**
 * Validations - Comprehensive model validation system
 *
 * Provides Rails-like validation system with built-in validators for common use cases.
 * All validators are designed to be composable and support custom error messages.
 *
 * @module @bun-on-rails/database/validations
 *
 * @example
 * class User extends Model {
 *   static validations = {
 *     email: { presence: true, email: true, uniqueness: true },
 *     name: { presence: true, length: { min: 2, max: 100 } },
 *     age: { numericality: { greaterThanOrEqualTo: 0, onlyInteger: true } },
 *     role: { inclusion: { in: ['admin', 'user', 'moderator'] } },
 *     username: { exclusion: { in: ['admin', 'root', 'system'] }, format: { with: /^[a-z0-9_]+$/ } }
 *   }
 * }
 */

/**
 * Built-in validators for model validation
 * Each validator returns an error message string if validation fails, or null if it passes
 */
export const Validators = {
  /**
   * Validate presence of a value
   * Fails if value is null, undefined, empty string, or (optionally) whitespace-only
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=false] - Allow empty strings
   * @param {boolean} [options.allowNull=false] - Allow null values
   * @returns {string|null} Error message or null
   *
   * @example
   * // Basic presence check
   * validations = { name: { presence: true } }
   *
   * // With custom message
   * validations = { name: { presence: { message: 'Name is required!' } } }
   */
  presence: (value, options = {}) => {
    const { message, allowBlank = false, allowNull = false } = normalizeOptions(options)

    if (value === null) {
      return allowNull ? null : (message || 'is required')
    }

    if (value === undefined) {
      return message || 'is required'
    }

    if (typeof value === 'string') {
      const isEmpty = allowBlank ? false : value.trim().length === 0
      if (isEmpty) {
        return message || 'is required'
      }
    }

    return null
  },

  /**
   * Validate length constraints for strings and arrays
   *
   * @param {string|Array} value - Value to validate
   * @param {Object} options - Validation options
   * @param {number} [options.min] - Minimum length
   * @param {number} [options.max] - Maximum length
   * @param {number} [options.is] - Exact length required
   * @param {Array<number>} [options.in] - Range [min, max]
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=false] - Skip validation for blank values
   * @param {string} [options.tokenizer] - How to tokenize value ('chars'|'words')
   * @returns {string|null} Error message or null
   *
   * @example
   * // Minimum and maximum length
   * validations = { name: { length: { min: 2, max: 100 } } }
   *
   * // Exact length
   * validations = { code: { length: { is: 6 } } }
   *
   * // Range
   * validations = { bio: { length: { in: [10, 500] } } }
   */
  length: (value, options = {}) => {
    const opts = normalizeOptions(options)

    // Skip validation if value is empty and allowBlank is true
    if (isBlank(value)) {
      return opts.allowBlank ? null : null  // Allow blank by default for length (let presence handle required)
    }

    // Determine what we're measuring
    let length
    if (opts.tokenizer === 'words') {
      length = String(value).trim().split(/\s+/).filter(Boolean).length
    } else {
      length = value.length !== undefined ? value.length : String(value).length
    }

    // Check exact length
    if (opts.is !== undefined && length !== opts.is) {
      return opts.message || `must be exactly ${opts.is} characters`
    }

    // Check range if provided
    if (opts.in && Array.isArray(opts.in)) {
      const [min, max] = opts.in
      if (length < min || length > max) {
        return opts.message || `must be between ${min} and ${max} characters`
      }
      return null
    }

    // Check minimum
    if (opts.min !== undefined && length < opts.min) {
      return opts.message || `must be at least ${opts.min} characters`
    }

    // Check maximum
    if (opts.max !== undefined && length > opts.max) {
      return opts.message || `must be at most ${opts.max} characters`
    }

    return null
  },

  /**
   * Validate value matches a regular expression pattern
   *
   * @param {string} value - Value to validate
   * @param {Object} options - Validation options
   * @param {RegExp} options.with - Pattern to match
   * @param {RegExp} [options.without] - Pattern that should NOT match
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @returns {string|null} Error message or null
   *
   * @example
   * // Match pattern
   * validations = { username: { format: { with: /^[a-z0-9_]+$/i } } }
   *
   * // Must not match pattern
   * validations = { name: { format: { without: /[0-9]/, message: 'cannot contain numbers' } } }
   */
  format: (value, options = {}) => {
    // Handle regex shorthand: format: /regex/ -> format: { with: /regex/ }
    let opts
    if (options instanceof RegExp) {
      opts = { with: options }
    } else {
      opts = normalizeOptions(options)
    }

    // Skip validation for blank values by default
    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'is invalid') : null
    }

    const stringValue = String(value)

    // Check 'with' pattern (must match)
    if (opts.with && !opts.with.test(stringValue)) {
      return opts.message || 'is invalid'
    }

    // Check 'without' pattern (must NOT match)
    if (opts.without && opts.without.test(stringValue)) {
      return opts.message || 'is invalid'
    }

    return null
  },

  /**
   * Validate numeric constraints
   *
   * @param {number|string} value - Value to validate
   * @param {Object} options - Validation options
   * @param {boolean} [options.onlyInteger] - Must be an integer
   * @param {boolean} [options.integer] - Alias for onlyInteger
   * @param {number} [options.greaterThan] - Must be > this value
   * @param {number} [options.greaterThanOrEqualTo] - Must be >= this value
   * @param {number} [options.equalTo] - Must be exactly this value
   * @param {number} [options.lessThan] - Must be < this value
   * @param {number} [options.lessThanOrEqualTo] - Must be <= this value
   * @param {number} [options.otherThan] - Must be != this value
   * @param {boolean} [options.odd] - Must be odd
   * @param {boolean} [options.even] - Must be even
   * @param {boolean} [options.positive] - Must be > 0
   * @param {boolean} [options.negative] - Must be < 0
   * @param {Array<number>} [options.in] - Must be within range [min, max]
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @returns {string|null} Error message or null
   *
   * @example
   * // Basic numeric validation
   * validations = { age: { numericality: true } }
   *
   * // With constraints
   * validations = { quantity: { numericality: { greaterThan: 0, onlyInteger: true } } }
   *
   * // Range validation
   * validations = { rating: { numericality: { in: [1, 5] } } }
   */
  numericality: (value, options = {}) => {
    const opts = normalizeOptions(options)

    // Skip validation for blank values
    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'must be a number') : null
    }

    // Parse number
    const num = Number(value)

    // Check if it's a valid number
    if (isNaN(num)) {
      return opts.message || 'must be a number'
    }

    // Check integer constraint
    if ((opts.onlyInteger || opts.integer) && !Number.isInteger(num)) {
      return opts.message || 'must be an integer'
    }

    // Check greater than
    if (opts.greaterThan !== undefined && num <= opts.greaterThan) {
      return opts.message || `must be greater than ${opts.greaterThan}`
    }

    // Check greater than or equal to
    if (opts.greaterThanOrEqualTo !== undefined && num < opts.greaterThanOrEqualTo) {
      return opts.message || `must be greater than or equal to ${opts.greaterThanOrEqualTo}`
    }

    // Check equal to
    if (opts.equalTo !== undefined && num !== opts.equalTo) {
      return opts.message || `must be equal to ${opts.equalTo}`
    }

    // Check less than
    if (opts.lessThan !== undefined && num >= opts.lessThan) {
      return opts.message || `must be less than ${opts.lessThan}`
    }

    // Check less than or equal to
    if (opts.lessThanOrEqualTo !== undefined && num > opts.lessThanOrEqualTo) {
      return opts.message || `must be less than or equal to ${opts.lessThanOrEqualTo}`
    }

    // Check other than
    if (opts.otherThan !== undefined && num === opts.otherThan) {
      return opts.message || `must be other than ${opts.otherThan}`
    }

    // Check in range
    if (opts.in && Array.isArray(opts.in)) {
      const [min, max] = opts.in
      if (num < min || num > max) {
        return opts.message || `must be between ${min} and ${max}`
      }
    }

    // Check odd
    if (opts.odd && num % 2 === 0) {
      return opts.message || 'must be odd'
    }

    // Check even
    if (opts.even && num % 2 !== 0) {
      return opts.message || 'must be even'
    }

    // Check positive
    if (opts.positive && num <= 0) {
      return opts.message || 'must be positive'
    }

    // Check negative
    if (opts.negative && num >= 0) {
      return opts.message || 'must be negative'
    }

    return null
  },

  /**
   * Validate email format
   * Uses a comprehensive regex that handles most valid email formats
   *
   * @param {string} value - Value to validate
   * @param {Object} options - Validation options
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @param {boolean} [options.strict=false] - Use stricter validation
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { email: { email: true } }
   *
   * // With custom message
   * validations = { email: { email: { message: 'Please enter a valid email address' } } }
   */
  email: (value, options = {}) => {
    const opts = normalizeOptions(options)

    // Skip validation for blank values
    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'is not a valid email') : null
    }

    const stringValue = String(value).toLowerCase()

    // Standard email regex that covers most cases
    // Validates: local-part@domain.tld
    // Local part can contain: letters, numbers, dots, underscores, plus signs, hyphens
    // Domain can contain: letters, numbers, hyphens, and must have a TLD
    const emailRegex = opts.strict
      ? /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(stringValue)) {
      return opts.message || 'is not a valid email'
    }

    return null
  },

  /**
   * Validate value is included in a set of allowed values
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {Array} options.in - Array of allowed values
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { role: { inclusion: { in: ['admin', 'user', 'moderator'] } } }
   *
   * // Short form (array directly)
   * validations = { role: { inclusion: ['admin', 'user', 'moderator'] } }
   */
  inclusion: (value, options = {}) => {
    const opts = normalizeOptions(options)

    // Support array shorthand
    const allowedValues = Array.isArray(options) ? options : opts.in

    // Skip validation for blank values
    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || `must be one of: ${allowedValues?.join(', ')}`) : null
    }

    if (!allowedValues || !Array.isArray(allowedValues)) {
      return null // No list provided, skip validation
    }

    if (!allowedValues.includes(value)) {
      return opts.message || `must be one of: ${allowedValues.join(', ')}`
    }

    return null
  },

  /**
   * Validate value is NOT in a set of disallowed values
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {Array} options.in - Array of disallowed values
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { username: { exclusion: { in: ['admin', 'root', 'system'] } } }
   *
   * // Short form (array directly)
   * validations = { username: { exclusion: ['admin', 'root', 'system'] } }
   */
  exclusion: (value, options = {}) => {
    const opts = normalizeOptions(options)

    // Support array shorthand
    const disallowedValues = Array.isArray(options) ? options : opts.in

    // Skip validation for blank values
    if (isBlank(value)) {
      return null
    }

    if (!disallowedValues || !Array.isArray(disallowedValues)) {
      return null // No list provided, skip validation
    }

    if (disallowedValues.includes(value)) {
      return opts.message || `cannot be one of: ${disallowedValues.join(', ')}`
    }

    return null
  },

  /**
   * Validate uniqueness in database
   * This is an async validator that queries the database
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {string} [options.scope] - Additional field(s) to scope uniqueness check
   * @param {boolean} [options.caseSensitive=true] - Case-sensitive comparison
   * @param {string} [options.message] - Custom error message
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @param {Object} options._model - Model instance (passed internally)
   * @param {string} options._field - Field name (passed internally)
   * @returns {Promise<string|null>} Error message or null
   *
   * @example
   * validations = { email: { uniqueness: true } }
   *
   * // With scope (e.g., unique email per organization)
   * validations = { email: { uniqueness: { scope: 'organization_id' } } }
   *
   * // Case insensitive
   * validations = { username: { uniqueness: { caseSensitive: false } } }
   */
  uniqueness: async (value, options = {}) => {
    const opts = normalizeOptions(options)

    // Skip validation for blank values
    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'has already been taken') : null
    }

    // Get model and field from options (passed by runValidations)
    const { _model, _field } = opts

    if (!_model || !_field) {
      // Can't validate without model context
      console.warn('Uniqueness validation requires model context')
      return null
    }

    const ModelClass = _model.constructor
    const tableName = ModelClass.getTableName()
    const primaryKey = ModelClass.primaryKey

    try {
      // Build query conditions
      let query = ModelClass.where({ [_field]: value })

      // Add scope conditions
      if (opts.scope) {
        const scopes = Array.isArray(opts.scope) ? opts.scope : [opts.scope]
        for (const scopeField of scopes) {
          const scopeValue = _model.attributes[scopeField]
          if (scopeValue !== undefined) {
            query = query.where({ [scopeField]: scopeValue })
          }
        }
      }

      // Exclude current record if updating
      if (_model.persisted && _model.id) {
        query = query.where(`${primaryKey} != ?`, _model.id)
      }

      // Check if any records exist
      const exists = await query.exists()

      if (exists) {
        return opts.message || 'has already been taken'
      }
    } catch (error) {
      // Log error but don't fail validation
      console.error('Uniqueness validation error:', error.message)
    }

    return null
  },

  /**
   * Validate using a custom function
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {Function} options.validate - Custom validation function
   * @returns {Promise<string|null>} Error message or null
   *
   * @example
   * validations = {
   *   password: {
   *     custom: {
   *       validate: (value, model) => {
   *         if (value && value.length < 8) return 'must be at least 8 characters'
   *         if (!/[A-Z]/.test(value)) return 'must contain an uppercase letter'
   *         if (!/[0-9]/.test(value)) return 'must contain a number'
   *       }
   *     }
   *   }
   * }
   */
  custom: async (value, options = {}) => {
    const opts = normalizeOptions(options)

    if (opts.validate && typeof opts.validate === 'function') {
      return await opts.validate(value, opts._model)
    }

    return null
  },

  /**
   * Validate confirmation field matches
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {string} [options.field] - Field to confirm against (defaults to fieldName_confirmation)
   * @param {string} [options.message] - Custom error message
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { password: { confirmation: true } }
   * // This expects a password_confirmation field to match
   */
  confirmation: (value, options = {}) => {
    const opts = normalizeOptions(options)

    if (!opts._model || !opts._field) {
      return null
    }

    const confirmationField = opts.field || `${opts._field}_confirmation`
    const confirmationValue = opts._model.attributes[confirmationField]

    // Skip if confirmation field is not present
    if (confirmationValue === undefined) {
      return null
    }

    if (value !== confirmationValue) {
      return opts.message || "doesn't match confirmation"
    }

    return null
  },

  /**
   * Validate acceptance of terms/conditions
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {Array} [options.accept] - Values considered accepted (default: [true, 'true', '1', 1])
   * @param {string} [options.message] - Custom error message
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { terms: { acceptance: true } }
   */
  acceptance: (value, options = {}) => {
    const opts = normalizeOptions(options)
    const acceptedValues = opts.accept || [true, 'true', '1', 1, 'yes']

    if (!acceptedValues.includes(value)) {
      return opts.message || 'must be accepted'
    }

    return null
  },

  /**
   * Validate URL format
   *
   * @param {string} value - Value to validate
   * @param {Object} options - Validation options
   * @param {Array} [options.protocols] - Allowed protocols (default: ['http', 'https'])
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @param {string} [options.message] - Custom error message
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { website: { url: true } }
   * validations = { website: { url: { protocols: ['https'] } } }
   */
  url: (value, options = {}) => {
    const opts = normalizeOptions(options)

    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'is not a valid URL') : null
    }

    const protocols = opts.protocols || ['http', 'https']

    try {
      const url = new URL(String(value))
      const protocol = url.protocol.replace(':', '')

      if (!protocols.includes(protocol)) {
        return opts.message || `must use one of these protocols: ${protocols.join(', ')}`
      }
    } catch {
      return opts.message || 'is not a valid URL'
    }

    return null
  },

  /**
   * Validate date/datetime
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {Date|string} [options.before] - Must be before this date
   * @param {Date|string} [options.after] - Must be after this date
   * @param {Date|string} [options.beforeOrEqualTo] - Must be on or before this date
   * @param {Date|string} [options.afterOrEqualTo] - Must be on or after this date
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @param {string} [options.message] - Custom error message
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { startDate: { date: { after: new Date() } } }
   * validations = { birthDate: { date: { before: new Date() } } }
   */
  date: (value, options = {}) => {
    const opts = normalizeOptions(options)

    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'is not a valid date') : null
    }

    const date = new Date(value)

    if (isNaN(date.getTime())) {
      return opts.message || 'is not a valid date'
    }

    if (opts.before && date >= new Date(opts.before)) {
      return opts.message || `must be before ${new Date(opts.before).toISOString()}`
    }

    if (opts.after && date <= new Date(opts.after)) {
      return opts.message || `must be after ${new Date(opts.after).toISOString()}`
    }

    if (opts.beforeOrEqualTo && date > new Date(opts.beforeOrEqualTo)) {
      return opts.message || `must be on or before ${new Date(opts.beforeOrEqualTo).toISOString()}`
    }

    if (opts.afterOrEqualTo && date < new Date(opts.afterOrEqualTo)) {
      return opts.message || `must be on or after ${new Date(opts.afterOrEqualTo).toISOString()}`
    }

    return null
  },

  /**
   * Validate array type and contents
   *
   * @param {any} value - Value to validate
   * @param {Object} options - Validation options
   * @param {number} [options.minLength] - Minimum array length
   * @param {number} [options.maxLength] - Maximum array length
   * @param {string} [options.type] - Type of elements (e.g., 'string', 'number')
   * @param {boolean} [options.allowBlank=true] - Skip validation for blank values
   * @param {string} [options.message] - Custom error message
   * @returns {string|null} Error message or null
   *
   * @example
   * validations = { tags: { array: { minLength: 1, type: 'string' } } }
   */
  array: (value, options = {}) => {
    const opts = normalizeOptions(options)

    if (isBlank(value)) {
      return opts.allowBlank === false ? (opts.message || 'must be an array') : null
    }

    if (!Array.isArray(value)) {
      return opts.message || 'must be an array'
    }

    if (opts.minLength !== undefined && value.length < opts.minLength) {
      return opts.message || `must have at least ${opts.minLength} items`
    }

    if (opts.maxLength !== undefined && value.length > opts.maxLength) {
      return opts.message || `must have at most ${opts.maxLength} items`
    }

    if (opts.type) {
      for (const item of value) {
        // eslint-disable-next-line valid-typeof
        if (typeof item !== opts.type) {
          return opts.message || `all items must be of type ${opts.type}`
        }
      }
    }

    return null
  }
}

/**
 * Helper to normalize options (handle boolean shorthand)
 * @private
 */
function normalizeOptions(options) {
  if (typeof options === 'boolean') {
    return {}
  }
  if (Array.isArray(options)) {
    return { in: options }
  }
  return options || {}
}

/**
 * Helper to check if value is blank
 * @private
 */
function isBlank(value) {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return true
  }
  return false
}

/**
 * Run all validations for a model instance
 *
 * @param {Model} model - Model instance to validate
 * @returns {Promise<Object>} Object with field names as keys and error arrays as values
 *
 * @example
 * const errors = await runValidations(user)
 * if (Object.keys(errors).length > 0) {
 *   console.log('Validation failed:', errors)
 * }
 */
export async function runValidations(model) {
  const errors = {}
  const validations = model.constructor.validations || {}

  for (const [field, rules] of Object.entries(validations)) {
    const value = model.attributes[field]
    const fieldErrors = []

    for (const [rule, options] of Object.entries(rules)) {
      const validator = Validators[rule]

      if (validator) {
        // Normalize options and add model context
        const opts = normalizeOptions(options)
        opts._model = model
        opts._field = field

        // Run validator (may be async)
        const error = await validator(value, opts)

        if (error) {
          fieldErrors.push(error)
        }
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors
    }
  }

  return errors
}

/**
 * Create a custom validator
 *
 * @param {string} name - Validator name
 * @param {Function} validatorFn - Validation function (value, options) => error|null
 *
 * @example
 * addValidator('strongPassword', (value, options) => {
 *   if (!value || value.length < 8) return 'must be at least 8 characters'
 *   if (!/[A-Z]/.test(value)) return 'must contain uppercase letter'
 *   if (!/[a-z]/.test(value)) return 'must contain lowercase letter'
 *   if (!/[0-9]/.test(value)) return 'must contain a number'
 *   return null
 * })
 *
 * // Use in model
 * validations = { password: { strongPassword: true } }
 */
export function addValidator(name, validatorFn) {
  if (typeof validatorFn !== 'function') {
    throw new Error('Validator must be a function')
  }
  Validators[name] = validatorFn
}

/**
 * Remove a custom validator
 *
 * @param {string} name - Validator name to remove
 */
export function removeValidator(name) {
  if (Validators[name]) {
    delete Validators[name]
  }
}

/**
 * Get list of available validator names
 *
 * @returns {string[]} Array of validator names
 */
export function getValidatorNames() {
  return Object.keys(Validators)
}

export default {
  Validators,
  runValidations,
  addValidator,
  removeValidator,
  getValidatorNames
}
