/**
 * Request Parser - Comprehensive request parameter parsing
 *
 * Handles parsing of:
 * - Query parameters (including nested params like Rails: user[name])
 * - JSON request bodies
 * - URL-encoded form data
 * - Multipart form data with file uploads
 *
 * @module bun-on-rails/controller/request_parser
 */

/**
 * @typedef {Object} ParsedFile
 * @property {string} name - Original filename
 * @property {string} type - MIME type
 * @property {number} size - File size in bytes
 * @property {Blob} file - The file blob for reading content
 */

/**
 * @typedef {Object} ParseOptions
 * @property {number} [maxBodySize] - Maximum body size in bytes (default: 10MB)
 * @property {number} [maxFileSize] - Maximum file size in bytes (default: 50MB)
 * @property {number} [maxFiles] - Maximum number of files (default: 10)
 * @property {string[]} [allowedMimeTypes] - Allowed MIME types for uploads
 */

/**
 * @typedef {Object} ParsedRequest
 * @property {Object} query - Parsed query parameters
 * @property {Object} body - Parsed body (JSON or form data)
 * @property {Object.<string, ParsedFile|ParsedFile[]>} files - Uploaded files
 * @property {Object} params - Merged parameters (query + body + route params)
 * @property {string} contentType - Request content type
 * @property {boolean} hasFiles - Whether the request contains file uploads
 */

const DEFAULT_OPTIONS = {
  maxBodySize: 10 * 1024 * 1024,    // 10MB
  maxFileSize: 50 * 1024 * 1024,    // 50MB
  maxFiles: 10,
  allowedMimeTypes: null            // null = allow all
}

/**
 * Parse all request parameters from an HTTP request
 *
 * @param {Request} request - The HTTP request to parse
 * @param {Object} [routeParams={}] - Route parameters from path matching
 * @param {ParseOptions} [options={}] - Parsing options
 * @returns {Promise<ParsedRequest>} Parsed request data
 *
 * @example
 * const parsed = await parseRequest(request, { id: '123' })
 * console.log(parsed.query)     // { page: '1', sort: 'name' }
 * console.log(parsed.body)      // { title: 'Hello' }
 * console.log(parsed.files)     // { avatar: { name: 'photo.jpg', ... } }
 * console.log(parsed.params)    // { id: '123', page: '1', title: 'Hello', ... }
 */
export async function parseRequest(request, routeParams = {}, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const url = new URL(request.url)
  const contentType = request.headers.get('content-type') || ''

  // Parse query parameters
  const query = parseQueryString(url.searchParams)

  // Parse body based on content type and method
  let body = {}
  let files = {}
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

  if (hasBody && request.body) {
    const bodyResult = await parseBody(request, contentType, opts)
    body = bodyResult.body
    files = bodyResult.files
  }

  // Merge all parameters: route params < query params < body params
  // (later sources override earlier ones, but nested objects are deep merged)
  const params = deepMerge(
    {},
    routeParams,
    query,
    body
  )

  return {
    query,
    body,
    files,
    params,
    contentType,
    hasFiles: Object.keys(files).length > 0
  }
}

/**
 * Parse query string parameters with nested parameter support
 *
 * Supports Rails-style nested params:
 * - user[name]=John -> { user: { name: 'John' } }
 * - tags[]=a&tags[]=b -> { tags: ['a', 'b'] }
 * - user[address][city]=NYC -> { user: { address: { city: 'NYC' } } }
 *
 * @param {URLSearchParams} searchParams - URL search parameters
 * @returns {Object} Parsed parameters
 *
 * @example
 * const url = new URL('http://example.com?name=John&filter[status]=active')
 * const params = parseQueryString(url.searchParams)
 * // { name: 'John', filter: { status: 'active' } }
 */
export function parseQueryString(searchParams) {
  const result = {}

  for (const [key, value] of searchParams.entries()) {
    setNestedValue(result, key, value)
  }

  return result
}

/**
 * Parse request body based on content type
 *
 * @param {Request} request - The request to parse
 * @param {string} contentType - Content-Type header value
 * @param {ParseOptions} options - Parsing options
 * @param {boolean} [options.throwOnError=false] - If true, throws errors instead of returning empty
 * @returns {Promise<{body: Object, files: Object}>} Parsed body and files
 */
export async function parseBody(request, contentType, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    if (contentType.includes('application/json')) {
      return await parseJsonBody(request, opts)
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      return await parseFormUrlEncoded(request, opts)
    }

    if (contentType.includes('multipart/form-data')) {
      return await parseMultipartFormData(request, opts)
    }

    // Text content types
    if (contentType.includes('text/')) {
      const text = await request.text()
      return { body: { _raw: text }, files: {} }
    }

    // Unknown content type - try to read as text
    return { body: {}, files: {} }
  } catch (error) {
    console.warn(`Failed to parse request body: ${error.message}`)
    // Re-throw if throwOnError is set
    if (opts.throwOnError) {
      throw error
    }
    return { body: {}, files: {} }
  }
}

/**
 * Parse JSON request body
 *
 * @param {Request} request - The request to parse
 * @param {ParseOptions} options - Parsing options
 * @returns {Promise<{body: Object, files: Object}>}
 */
async function parseJsonBody(request, options) {
  // Clone to allow re-reading if needed
  const cloned = request.clone()

  // Check body size if Content-Length is provided
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
  if (contentLength > options.maxBodySize) {
    throw new Error(`Request body too large: ${contentLength} bytes exceeds ${options.maxBodySize} bytes limit`)
  }

  const json = await cloned.json()

  // Validate the parsed JSON is an object or array
  if (json === null || (typeof json !== 'object' && !Array.isArray(json))) {
    return { body: { _value: json }, files: {} }
  }

  return { body: json, files: {} }
}

/**
 * Parse URL-encoded form data
 *
 * @param {Request} request - The request to parse
 * @param {ParseOptions} options - Parsing options
 * @returns {Promise<{body: Object, files: Object}>}
 */
async function parseFormUrlEncoded(request, options) {
  const cloned = request.clone()

  // Check body size
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
  if (contentLength > options.maxBodySize) {
    throw new Error(`Request body too large: ${contentLength} bytes exceeds ${options.maxBodySize} bytes limit`)
  }

  const formData = await cloned.formData()
  const body = {}

  for (const [key, value] of formData.entries()) {
    // Form data entries are always strings for url-encoded forms
    setNestedValue(body, key, value)
  }

  return { body, files: {} }
}

/**
 * Parse multipart form data with file uploads
 *
 * @param {Request} request - The request to parse
 * @param {ParseOptions} options - Parsing options
 * @returns {Promise<{body: Object, files: Object}>}
 */
async function parseMultipartFormData(request, options) {
  const cloned = request.clone()
  const formData = await cloned.formData()

  const body = {}
  const files = {}
  let fileCount = 0

  for (const [key, value] of formData.entries()) {
    // Check if value is a File (Blob with name property)
    if (isFile(value)) {
      fileCount++

      // Validate file count
      if (fileCount > options.maxFiles) {
        throw new Error(`Too many files: ${fileCount} exceeds ${options.maxFiles} limit`)
      }

      // Validate file size
      if (value.size > options.maxFileSize) {
        throw new Error(`File too large: ${value.name} is ${value.size} bytes, exceeds ${options.maxFileSize} bytes limit`)
      }

      // Validate MIME type if restrictions are set
      if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(value.type)) {
        throw new Error(`File type not allowed: ${value.type}. Allowed types: ${options.allowedMimeTypes.join(', ')}`)
      }

      const parsedFile = {
        name: value.name,
        type: value.type || 'application/octet-stream',
        size: value.size,
        file: value,
        // Helper method to get file content as buffer
        async buffer() {
          return await value.arrayBuffer().then(ab => Buffer.from(ab))
        },
        // Helper method to get file content as text
        async text() {
          return await value.text()
        },
        // Helper method to save file to disk
        async saveTo(path) {
          const buffer = await this.buffer()
          await Bun.write(path, buffer)
          return path
        }
      }

      // Handle array notation for multiple files: files[] or files[0]
      if (key.endsWith('[]') || key.match(/\[\d+\]$/)) {
        const baseKey = key.replace(/\[\d*\]$/, '')
        if (!files[baseKey]) {
          files[baseKey] = []
        }
        files[baseKey].push(parsedFile)
      } else if (files[key]) {
        // Multiple files with same key - convert to array
        if (!Array.isArray(files[key])) {
          files[key] = [files[key]]
        }
        files[key].push(parsedFile)
      } else {
        files[key] = parsedFile
      }
    } else {
      // Regular form field
      setNestedValue(body, key, value)
    }
  }

  return { body, files }
}

/**
 * Check if a value is a File/Blob with a name
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isFile(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.arrayBuffer === 'function' &&
    typeof value.size === 'number' &&
    value.name !== undefined
  )
}

/**
 * Set a value at a nested path in an object
 *
 * Supports bracket notation:
 * - user[name] -> { user: { name: value } }
 * - tags[] -> { tags: [value] }
 * - items[0] -> { items: [value] }
 *
 * @param {Object} obj - Object to modify
 * @param {string} key - Key path (may include brackets)
 * @param {*} value - Value to set
 */
function setNestedValue(obj, key, value) {
  // Simple key without brackets
  if (!key.includes('[')) {
    // Handle multiple values for same key
    if (obj[key] !== undefined) {
      if (!Array.isArray(obj[key])) {
        obj[key] = [obj[key]]
      }
      obj[key].push(value)
    } else {
      obj[key] = value
    }
    return
  }

  // Parse the key path: user[name][first] -> ['user', 'name', 'first']
  const path = parseKeyPath(key)

  if (path.length === 0) {
    return
  }

  let current = obj

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    const nextSegment = path[i + 1]

    if (segment.isArray) {
      // Create array if needed
      if (!Array.isArray(current[segment.key])) {
        current[segment.key] = []
      }

      const arr = current[segment.key]
      const index = segment.index

      if (index === null) {
        // Dynamic index - push to array
        if (nextSegment) {
          // More segments coming - create object
          const newObj = {}
          arr.push(newObj)
          current = newObj
        }
      } else {
        // Explicit index
        if (!arr[index]) {
          arr[index] = nextSegment && !nextSegment.isArray ? {} : (nextSegment ? [] : null)
        }
        current = arr[index]
      }
    } else {
      // Object key
      if (current[segment.key] === undefined) {
        // Determine if next segment needs array or object
        current[segment.key] = nextSegment.isArray ? [] : {}
      }
      current = current[segment.key]
    }
  }

  // Set the final value
  const lastSegment = path[path.length - 1]

  if (lastSegment.isArray) {
    if (!Array.isArray(current[lastSegment.key])) {
      current[lastSegment.key] = []
    }

    if (lastSegment.index === null) {
      current[lastSegment.key].push(value)
    } else {
      current[lastSegment.key][lastSegment.index] = value
    }
  } else {
    // Handle multiple values
    if (current[lastSegment.key] !== undefined) {
      if (!Array.isArray(current[lastSegment.key])) {
        current[lastSegment.key] = [current[lastSegment.key]]
      }
      current[lastSegment.key].push(value)
    } else {
      current[lastSegment.key] = value
    }
  }
}

/**
 * Parse a bracket-notation key into path segments
 *
 * @param {string} key - Key to parse (e.g., 'user[address][city]')
 * @returns {Array<{key: string, isArray: boolean, index: number|null}>}
 */
function parseKeyPath(key) {
  const segments = []

  // Match the base key and all bracket segments
  const regex = /([^\[\]]+)|\[(\d*)\]/g
  let match
  let isFirstSegment = true

  while ((match = regex.exec(key)) !== null) {
    if (match[1] !== undefined) {
      // Regular key segment
      segments.push({
        key: match[1],
        isArray: false,
        index: null
      })
      isFirstSegment = false
    } else if (match[2] !== undefined) {
      // Bracket segment: [] or [0]
      if (isFirstSegment) {
        // Can't start with a bracket
        continue
      }

      const lastSegment = segments[segments.length - 1]
      if (lastSegment && !lastSegment.isArray) {
        // Convert last segment to array notation
        lastSegment.isArray = true
        lastSegment.index = match[2] === '' ? null : parseInt(match[2], 10)
      } else {
        // Nested array or object
        segments.push({
          key: match[2] || '',
          isArray: true,
          index: match[2] === '' ? null : parseInt(match[2], 10)
        })
      }
    }
  }

  return segments
}

/**
 * Deep merge objects
 *
 * @param {Object} target - Target object
 * @param {...Object} sources - Source objects to merge
 * @returns {Object} Merged object
 */
function deepMerge(target, ...sources) {
  if (!sources.length) return target

  const source = sources.shift()

  if (isPlainObject(target) && isPlainObject(source)) {
    for (const key in source) {
      if (isPlainObject(source[key])) {
        if (!target[key]) {
          target[key] = {}
        }
        deepMerge(target[key], source[key])
      } else if (Array.isArray(source[key])) {
        target[key] = [...source[key]]
      } else {
        target[key] = source[key]
      }
    }
  }

  return deepMerge(target, ...sources)
}

/**
 * Check if value is a plain object
 *
 * @param {*} obj - Value to check
 * @returns {boolean}
 */
function isPlainObject(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj)
}

/**
 * Create a middleware for request parsing
 *
 * @param {ParseOptions} [options={}] - Parsing options
 * @param {boolean} [options.throwOnError=false] - Throw errors on parse failures (for error responses)
 * @returns {Function} Middleware function
 *
 * @example
 * import { requestParserMiddleware } from 'bun-on-rails'
 *
 * app.use(requestParserMiddleware({
 *   maxBodySize: 5 * 1024 * 1024, // 5MB
 *   maxFileSize: 20 * 1024 * 1024, // 20MB
 *   allowedMimeTypes: ['image/jpeg', 'image/png']
 * }))
 */
export function requestParserMiddleware(options = {}) {
  const middleware = async (context, next) => {
    const routeParams = context._match?.params || context.params || {}

    try {
      // Pass throwOnError to get exceptions for validation errors
      const parseOptions = { ...options, throwOnError: options.throwOnError }
      const parsed = await parseRequest(context.request, routeParams, parseOptions)

      // Attach parsed data to context
      context.query = parsed.query
      context.body = parsed.body
      context.files = parsed.files
      context.params = parsed.params
      context.contentType = parsed.contentType
      context.hasFiles = parsed.hasFiles
    } catch (error) {
      // Handle parsing errors
      if (error.message.includes('too large') || error.message.includes('Too many files')) {
        return new Response(JSON.stringify({
          error: 'Payload Too Large',
          message: error.message
        }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (error.message.includes('not allowed')) {
        return new Response(JSON.stringify({
          error: 'Unsupported Media Type',
          message: error.message
        }), {
          status: 415,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Log other errors but continue
      console.warn(`Request parsing error: ${error.message}`)
      context.query = {}
      context.body = {}
      context.files = {}
      context.params = routeParams
    }

    return await next()
  }

  middleware._name = 'requestParser'
  return middleware
}

/**
 * RequestParams - Helper class for accessing request parameters
 *
 * Provides Rails-like parameter access with permit/require functionality
 * for strong parameters pattern.
 */
export class RequestParams {
  /**
   * @param {Object} params - Raw parameters object
   */
  constructor(params = {}) {
    this._params = params
    this._permitted = null
  }

  /**
   * Get a parameter value
   *
   * @param {string} key - Parameter key (supports dot notation)
   * @param {*} [defaultValue] - Default value if not found
   * @returns {*}
   *
   * @example
   * params.get('user.name')       // nested access
   * params.get('page', 1)         // with default
   */
  get(key, defaultValue = undefined) {
    const value = this._getNestedValue(this._params, key)
    return value !== undefined ? value : defaultValue
  }

  /**
   * Check if a parameter exists
   *
   * @param {string} key - Parameter key
   * @returns {boolean}
   */
  has(key) {
    return this._getNestedValue(this._params, key) !== undefined
  }

  /**
   * Require a parameter (throws if missing)
   *
   * @param {string} key - Required parameter key
   * @returns {*} Parameter value
   * @throws {Error} If parameter is missing
   *
   * @example
   * const user = params.require('user')
   * // Throws: Missing required parameter: user
   */
  require(key) {
    const value = this.get(key)
    if (value === undefined || value === null || value === '') {
      const error = new Error(`Missing required parameter: ${key}`)
      error.status = 400
      throw error
    }
    return value
  }

  /**
   * Permit only specified parameters (strong parameters pattern)
   *
   * Creates a new RequestParams with only the permitted keys.
   * Supports nested parameter specification.
   *
   * @param {...string|Object} keys - Keys to permit
   * @returns {RequestParams} New RequestParams with only permitted keys
   *
   * @example
   * // Simple keys
   * params.permit('title', 'body')
   *
   * // Nested object
   * params.permit('title', { user: ['name', 'email'] })
   *
   * // Array of nested
   * params.permit('title', { tags: [] })
   */
  permit(...keys) {
    const result = {}

    for (const key of keys) {
      if (typeof key === 'string') {
        // Simple key
        if (this._params[key] !== undefined) {
          result[key] = this._sanitizeValue(this._params[key])
        }
      } else if (typeof key === 'object' && key !== null) {
        // Nested permissions
        for (const [nestedKey, nestedPermissions] of Object.entries(key)) {
          const nestedValue = this._params[nestedKey]

          if (nestedValue !== undefined) {
            if (Array.isArray(nestedPermissions) && nestedPermissions.length === 0) {
              // Empty array means permit array of scalars
              if (Array.isArray(nestedValue)) {
                result[nestedKey] = nestedValue.map(v => this._sanitizeValue(v))
              }
            } else if (Array.isArray(nestedPermissions)) {
              // Permit specific keys from nested object
              if (typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
                result[nestedKey] = {}
                for (const permittedKey of nestedPermissions) {
                  if (typeof permittedKey === 'string' && nestedValue[permittedKey] !== undefined) {
                    result[nestedKey][permittedKey] = this._sanitizeValue(nestedValue[permittedKey])
                  }
                }
              }
            }
          }
        }
      }
    }

    const permitted = new RequestParams(result)
    permitted._permitted = keys
    return permitted
  }

  /**
   * Get all parameters as a plain object
   *
   * @returns {Object}
   */
  toObject() {
    return { ...this._params }
  }

  /**
   * Get all keys
   *
   * @returns {string[]}
   */
  keys() {
    return Object.keys(this._params)
  }

  /**
   * Check if empty
   *
   * @returns {boolean}
   */
  isEmpty() {
    return Object.keys(this._params).length === 0
  }

  /**
   * Get nested value using dot notation
   * @private
   */
  _getNestedValue(obj, path) {
    if (typeof path !== 'string') return undefined

    const parts = path.split('.')
    let current = obj

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined
      }
      current = current[part]
    }

    return current
  }

  /**
   * Sanitize a value (prevent prototype pollution, etc.)
   * @private
   */
  _sanitizeValue(value) {
    if (value === null || value === undefined) {
      return value
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }

    if (Array.isArray(value)) {
      return value.map(v => this._sanitizeValue(v))
    }

    if (typeof value === 'object') {
      const result = {}
      for (const [k, v] of Object.entries(value)) {
        // Prevent prototype pollution
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          continue
        }
        result[k] = this._sanitizeValue(v)
      }
      return result
    }

    return undefined
  }

  // Allow destructuring
  [Symbol.iterator]() {
    return Object.entries(this._params)[Symbol.iterator]()
  }
}

export default {
  parseRequest,
  parseQueryString,
  parseBody,
  requestParserMiddleware,
  RequestParams
}
