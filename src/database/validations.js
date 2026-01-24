/**
 * Validations - Model validation system
 */

export const Validators = {
  /**
   * Validate presence of a value
   */
  presence: (value, options = {}) => {
    if (value === null || value === undefined || value === '') {
      return options.message || 'is required'
    }
    return null
  },

  /**
   * Validate length constraints
   */
  length: (value, options = {}) => {
    if (value === null || value === undefined) return null

    const length = String(value).length

    if (options.min && length < options.min) {
      return options.message || `must be at least ${options.min} characters`
    }
    if (options.max && length > options.max) {
      return options.message || `must be at most ${options.max} characters`
    }
    if (options.is && length !== options.is) {
      return options.message || `must be exactly ${options.is} characters`
    }
    return null
  },

  /**
   * Validate numericality
   */
  numericality: (value, options = {}) => {
    if (value === null || value === undefined) return null

    const num = Number(value)
    if (isNaN(num)) {
      return options.message || 'must be a number'
    }
    if (options.greaterThan !== undefined && num <= options.greaterThan) {
      return options.message || `must be greater than ${options.greaterThan}`
    }
    if (options.lessThan !== undefined && num >= options.lessThan) {
      return options.message || `must be less than ${options.lessThan}`
    }
    if (options.integer && !Number.isInteger(num)) {
      return options.message || 'must be an integer'
    }
    return null
  },

  /**
   * Validate email format
   */
  email: (value, options = {}) => {
    if (value === null || value === undefined || value === '') return null

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return options.message || 'is not a valid email'
    }
    return null
  },

  /**
   * Validate format with regex
   */
  format: (value, options = {}) => {
    if (value === null || value === undefined) return null
    if (!options.with) return null

    if (!options.with.test(value)) {
      return options.message || 'is invalid'
    }
    return null
  },

  /**
   * Validate inclusion in a set
   */
  inclusion: (value, options = {}) => {
    if (value === null || value === undefined) return null
    if (!options.in) return null

    if (!options.in.includes(value)) {
      return options.message || `must be one of: ${options.in.join(', ')}`
    }
    return null
  },

  /**
   * Validate exclusion from a set
   */
  exclusion: (value, options = {}) => {
    if (value === null || value === undefined) return null
    if (!options.in) return null

    if (options.in.includes(value)) {
      return options.message || `cannot be one of: ${options.in.join(', ')}`
    }
    return null
  },

  /**
   * Validate uniqueness in database
   */
  uniqueness: async (value, options = {}) => {
    // TODO: Query database to check uniqueness
    // TODO: Exclude current record if updating
    return null
  },

  /**
   * Custom validation function
   */
  custom: async (value, options = {}) => {
    if (options.validate) {
      return await options.validate(value)
    }
    return null
  }
}

/**
 * Run all validations for a model instance
 * @param {Model} model
 * @returns {Object} errors object
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
        const opts = typeof options === 'boolean' ? {} : options
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
