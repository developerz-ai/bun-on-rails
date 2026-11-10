/**
 * Router - Rails-like routing DSL
 */

import { singularize } from '../support/inflector.js'
import { NotImplementedError } from '../support/not_implemented.js'

export class Router {
  constructor() {
    this.routes = []
    this.namedRoutes = {}
    this.currentNamespace = [] // controller prefix: namespace() only
    this.currentPath = [] // path prefix, in nesting order: namespace() and scope()
    this.currentMiddleware = []
  }

  /**
   * Define root route
   * @param {string} target - controller#action
   */
  root(target) {
    this.get('/', target)
  }

  /**
   * GET route
   * @param {string} path
   * @param {string} target - controller#action
   * @param {Object} options
   */
  get(path, target, options = {}) {
    this.addRoute('GET', path, target, options)
  }

  /**
   * POST route
   * @param {string} path
   * @param {string} target
   * @param {Object} options
   */
  post(path, target, options = {}) {
    this.addRoute('POST', path, target, options)
  }

  /**
   * PUT route
   * @param {string} path
   * @param {string} target
   * @param {Object} options
   */
  put(path, target, options = {}) {
    this.addRoute('PUT', path, target, options)
  }

  /**
   * PATCH route
   * @param {string} path
   * @param {string} target
   * @param {Object} options
   */
  patch(path, target, options = {}) {
    this.addRoute('PATCH', path, target, options)
  }

  /**
   * DELETE route
   * @param {string} path
   * @param {string} target
   * @param {Object} options
   */
  delete(path, target, options = {}) {
    this.addRoute('DELETE', path, target, options)
  }

  /**
   * Define resourceful routes
   * @param {string} name
   * @param {Object|Function} optionsOrCallback
   * @param {Function} callback
   */
  resources(name, optionsOrCallback = {}, callback = null) {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
    const nestedCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback

    const only = options.only || ['index', 'show', 'new', 'create', 'edit', 'update', 'destroy']
    const except = options.except || []
    const controller = options.controller || name

    const actions = only.filter(a => !except.includes(a))

    // Generate resourceful routes
    if (actions.includes('index')) {
      this.get(`/${name}`, `${controller}#index`)
    }
    if (actions.includes('new')) {
      this.get(`/${name}/new`, `${controller}#new`)
    }
    if (actions.includes('create')) {
      this.post(`/${name}`, `${controller}#create`)
    }
    if (actions.includes('show')) {
      this.get(`/${name}/:id`, `${controller}#show`)
    }
    if (actions.includes('edit')) {
      this.get(`/${name}/:id/edit`, `${controller}#edit`)
    }
    if (actions.includes('update')) {
      this.patch(`/${name}/:id`, `${controller}#update`)
      this.put(`/${name}/:id`, `${controller}#update`)
    }
    if (actions.includes('destroy')) {
      this.delete(`/${name}/:id`, `${controller}#destroy`)
    }

    // Handle nested resources
    if (nestedCallback) {
      this.scope(`/${name}/:${singularize(name)}_id`, nestedCallback)
    }
  }

  /**
   * Define a single resource (no index, no ID in URL)
   * @param {string} name
   * @param {Object} options
   */
  resource(name, options = {}) {
    const controller = options.controller || name

    this.get(`/${name}`, `${controller}#show`)
    this.get(`/${name}/new`, `${controller}#new`)
    this.get(`/${name}/edit`, `${controller}#edit`)
    this.post(`/${name}`, `${controller}#create`)
    this.patch(`/${name}`, `${controller}#update`)
    this.put(`/${name}`, `${controller}#update`)
    this.delete(`/${name}`, `${controller}#destroy`)
  }

  /**
   * Create a namespace for routes
   * @param {string} name
   * @param {Function} callback
   */
  namespace(name, callback) {
    this.currentNamespace.push(name)
    this._withPath(`/${name}`, callback)
    this.currentNamespace.pop()
  }

  /**
   * Prefix the paths of the routes defined in callback, leaving their
   * controllers alone: scope('/api', ...) or scope(':locale', ...).
   * Pinned by test/routing/scope_and_nesting.test.js.
   * @param {string} path
   * @param {Function} callback
   */
  scope(path, callback) {
    if (typeof path !== 'string') {
      throw new TypeError(`scope(path, callback): path must be a string, got ${typeof path}`)
    }
    const trimmed = path.replace(/^\/+|\/+$/g, '')
    this._withPath(trimmed ? `/${trimmed}` : '', callback)
  }

  _withPath(prefix, callback) {
    this.currentPath.push(prefix)
    try {
      callback()
    } finally {
      this.currentPath.pop()
    }
  }

  /**
   * Add middleware to routes
   * @param {string[]} middleware
   * @param {Function} callback
   */
  middleware(_middleware, _callback) {
    // TODO: Implement middleware scoping
    // Running the callback without the middleware left routes meant to be
    // guarded (say, by authentication) open, with no error.
    throw new NotImplementedError('Router#middleware', 'route-scoped middleware')
  }

  /**
   * Add a route to the routes table
   */
  addRoute(method, path, target, options) {
    const fullPath = this.currentPath.join('') + path

    const [controller, action] = target.split('#')
    const controllerName = this.currentNamespace.length > 0
      ? this.currentNamespace.join('/') + '/' + controller
      : controller

    this.routes.push({
      method,
      path: fullPath,
      controller: controllerName,
      action,
      options,
      middleware: [...this.currentMiddleware]
    })

    // Store named route
    if (options.as) {
      this.namedRoutes[options.as] = { method, path: fullPath }
    }
  }

  /**
   * Match a request to a route
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - Request path to match
   * @returns {Object|null} - Matched route with params, or null if no match
   */
  match(method, path) {
    // Normalize the path (remove trailing slash, handle empty path)
    const normalizedPath = this.normalizePath(path)
    const upperMethod = method.toUpperCase()

    for (const route of this.routes) {
      // Check method match
      if (route.method !== upperMethod) {
        continue
      }

      // Try to match the path
      const params = this.matchPath(route.path, normalizedPath)
      if (params !== null) {
        return {
          route,
          params,
          controller: route.controller,
          action: route.action,
          middleware: route.middleware
        }
      }
    }

    return null
  }

  /**
   * Normalize a path for matching
   * @param {string} path - Path to normalize
   * @returns {string} - Normalized path
   */
  normalizePath(path) {
    // Handle empty or root path
    if (!path || path === '/') {
      return '/'
    }

    // Remove trailing slash (unless it's the root path)
    let normalized = path.endsWith('/') && path.length > 1
      ? path.slice(0, -1)
      : path

    // Ensure leading slash
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized
    }

    // Remove query string if present
    const queryIndex = normalized.indexOf('?')
    if (queryIndex !== -1) {
      normalized = normalized.slice(0, queryIndex)
    }

    return normalized
  }

  /**
   * Match a path against a route pattern and extract params
   * @param {string} pattern - Route pattern (e.g., '/posts/:id')
   * @param {string} path - Actual request path (e.g., '/posts/123')
   * @returns {Object|null} - Extracted params or null if no match
   */
  matchPath(pattern, path) {
    const patternParts = pattern.split('/').filter(Boolean)
    const pathParts = path.split('/').filter(Boolean)

    // Handle root path
    if (patternParts.length === 0 && pathParts.length === 0) {
      return {}
    }

    // Must have same number of segments
    if (patternParts.length !== pathParts.length) {
      return null
    }

    const params = {}

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      if (patternPart.startsWith(':')) {
        // Dynamic segment - extract param name and value
        const paramName = patternPart.slice(1)

        // Handle optional format constraints (e.g., :id would match numbers)
        // Decode URI component to handle URL-encoded values
        try {
          params[paramName] = decodeURIComponent(pathPart)
        } catch {
          // If decoding fails, use the raw value
          params[paramName] = pathPart
        }
      } else if (patternPart === '*') {
        // Wildcard - match anything (glob pattern)
        // Store as splat param
        params.splat = pathPart
      } else if (patternPart !== pathPart) {
        // Static segments are case-sensitive: /Posts is not /posts
        return null
      }
    }

    return params
  }

  /**
   * Generate URL from named route
   * @param {string} name - Named route identifier (from `as` option)
   * @param {Object} params - Parameters to interpolate into the path
   * @param {Object} options - Additional options
   * @param {boolean} options.absolute - If true, include host (requires host option or context)
   * @param {string} options.host - Host to use for absolute URLs
   * @param {string} options.protocol - Protocol for absolute URLs (default: 'https')
   * @param {Object} options.query - Query parameters to append
   * @returns {string} - Generated URL
   * @throws {Error} - If named route not found or required params missing
   */
  urlFor(name, params = {}, options = {}) {
    // Look up the named route
    const namedRoute = this.namedRoutes[name]

    if (!namedRoute) {
      throw new Error(`No route found with name: ${name}`)
    }

    const { path } = namedRoute
    let generatedPath = path

    // Extract param names from the path pattern
    const paramNames = this._extractParamNames(path)

    // Track which params we use for path interpolation
    const usedParams = new Set()

    // Replace each parameter placeholder with actual value
    for (const paramName of paramNames) {
      const value = params[paramName]

      if (value === undefined || value === null) {
        throw new Error(`Missing required parameter '${paramName}' for route '${name}'`)
      }

      // URL-encode the value for safety
      const encodedValue = encodeURIComponent(String(value))
      generatedPath = generatedPath.replace(`:${paramName}`, encodedValue)
      usedParams.add(paramName)
    }

    // Handle query parameters
    // Merge explicit query option with unused params (unused params become query)
    const queryParams = { ...options.query }

    // Add unused params as query parameters (Rails-like behavior)
    for (const [key, value] of Object.entries(params)) {
      if (!usedParams.has(key) && value !== undefined && value !== null) {
        queryParams[key] = value
      }
    }

    // Build query string if there are query params
    if (Object.keys(queryParams).length > 0) {
      const queryString = buildQueryString(queryParams)
      generatedPath = `${generatedPath}?${queryString}`
    }

    // Handle absolute URLs
    if (options.absolute || options.host) {
      const protocol = options.protocol || 'https'
      const host = options.host

      if (!host) {
        throw new Error('Host required for absolute URL generation')
      }

      return `${protocol}://${host}${generatedPath}`
    }

    return generatedPath
  }

  /**
   * Extract parameter names from a route path pattern
   * @param {string} path - Route path pattern (e.g., '/posts/:id/comments/:comment_id')
   * @returns {string[]} - Array of parameter names
   * @private
   */
  _extractParamNames(path) {
    const paramNames = []
    const segments = path.split('/')

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1))
      }
    }

    return paramNames
  }

}

/**
 * Build a query string from an object of parameters: arrays as `tags[]=a`,
 * nested objects as `filter[status]=active`. Router#urlFor and request(app)
 * (src/testing/request.js) both use it.
 * @param {Object} params - Query parameters
 * @returns {string} - Encoded query string (without leading ?)
 */
export function buildQueryString(params) {
  const pairs = []

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        pairs.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(item))}`)
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        pairs.push(`${encodeURIComponent(key)}[${encodeURIComponent(nestedKey)}]=${encodeURIComponent(String(nestedValue))}`)
      }
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }

  return pairs.join('&')
}
