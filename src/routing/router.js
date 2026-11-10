/**
 * Router - Rails-like routing DSL
 */

import { singularize } from '../support/inflector.js'

export class Router {
  constructor() {
    this.routes = []
    this.namedRoutes = {}
    this.currentNamespace = [] // controller prefix: namespace() only
    this.currentPath = [] // path prefix, in nesting order: namespace() and scope()
    this.currentMiddleware = []

    // Configuration for request handling
    this.controllerLoader = null
    this.middlewareStack = null
    this.contextBuilder = null
    this.errorHandler = null
  }

  /**
   * Configure the router for request handling
   * @param {Object} options - Configuration options
   * @param {Function} options.controllerLoader - Function to load controller classes by name
   * @param {MiddlewareStack} options.middleware - Middleware stack to run
   * @param {Function} options.contextBuilder - Function to build controller context from request
   * @param {Function} options.errorHandler - Function to handle errors
   */
  configure(options = {}) {
    if (options.controllerLoader) {
      this.controllerLoader = options.controllerLoader
    }
    if (options.middleware) {
      this.middlewareStack = options.middleware
    }
    if (options.contextBuilder) {
      this.contextBuilder = options.contextBuilder
    }
    if (options.errorHandler) {
      this.errorHandler = options.errorHandler
    }
    return this
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
  middleware(middleware, callback) {
    // TODO: Implement middleware scoping
    callback()
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
      } else if (patternPart.toLowerCase() !== pathPart.toLowerCase()) {
        // Static segment mismatch (case-insensitive for flexibility)
        // Actually, let's be case-sensitive for paths
        if (patternPart !== pathPart) {
          return null
        }
      }
    }

    return params
  }

  /**
   * Convert a route pattern to a regex (alternative matching strategy)
   * @param {string} pattern - Route pattern
   * @returns {Object} - Regex and param names
   */
  patternToRegex(pattern) {
    const paramNames = []
    let regexStr = '^'

    const parts = pattern.split('/')
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      regexStr += '\\/'

      if (part.startsWith(':')) {
        // Named param - capture any non-slash characters
        paramNames.push(part.slice(1))
        regexStr += '([^\\/]+)'
      } else if (part === '*') {
        // Wildcard - capture anything
        paramNames.push('splat')
        regexStr += '(.+)'
      } else {
        // Static segment - escape special regex chars
        regexStr += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
    }

    regexStr += '$'

    return {
      regex: new RegExp(regexStr),
      paramNames
    }
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

  /**
   * Handle incoming request
   * @param {Request} request
   * @param {Object} options - Additional options for request handling
   * @param {Object} options.server - The Bun server instance (for WebSocket upgrade)
   * @returns {Promise<Response>}
   */
  async handle(request, options = {}) {
    const startTime = performance.now()
    const url = new URL(request.url)

    try {
      // 1. Match route
      const match = this.match(request.method, url.pathname)

      if (!match) {
        return this._notFoundResponse(url.pathname)
      }

      // 2. Build context for controller
      const context = await this._buildContext(request, match, options)

      // 3. Run middleware stack and execute action
      if (this.middlewareStack) {
        return await this.middlewareStack.run(context, async (ctx) => {
          return await this._executeAction(ctx, match)
        })
      }

      // No middleware configured - execute action directly
      return await this._executeAction(context, match)
    } catch (error) {
      return this._handleError(error, request, startTime)
    }
  }

  /**
   * Build controller context from request
   * @private
   */
  async _buildContext(request, match, options = {}) {
    // Use custom context builder if configured
    if (this.contextBuilder) {
      return await this.contextBuilder(request, match, options)
    }

    // Default context building
    const url = new URL(request.url)

    // Parse body for POST/PUT/PATCH requests
    let body = {}
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      body = await this._parseRequestBody(request)
    }

    // Merge route params, query params, and body
    const params = {
      ...match.params,
      ...Object.fromEntries(url.searchParams),
      ...body
    }

    // Return simple context object (can be enhanced by contextBuilder)
    return {
      request,
      params,
      session: {},
      currentUser: null,
      http: { request, server: options.server },
      cache: null,
      temp: new Map(),
      db: null,
      // Store match info for internal use
      _match: match
    }
  }

  /**
   * Parse request body based on content type
   * @private
   */
  async _parseRequestBody(request) {
    const contentType = request.headers.get('content-type') || ''

    try {
      if (contentType.includes('application/json')) {
        return await request.json()
      }

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData()
        return Object.fromEntries(formData)
      }

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData()
        const result = {}
        for (const [key, value] of formData.entries()) {
          // Handle file uploads - check if value is a Blob/File (duck typing)
          if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.name !== undefined) {
            result[key] = {
              name: value.name,
              type: value.type,
              size: value.size,
              file: value
            }
          } else {
            result[key] = value
          }
        }
        return result
      }
    } catch (error) {
      // Body parsing failed - return empty object
      console.warn(`Failed to parse request body: ${error.message}`)
    }

    return {}
  }

  /**
   * Execute controller action
   * @private
   */
  async _executeAction(context, match) {
    const { controller: controllerName, action: actionName } = match

    // 1. Load controller class
    const ControllerClass = await this._loadController(controllerName)

    if (!ControllerClass) {
      return this._notFoundResponse(`Controller not found: ${controllerName}`)
    }

    // 2. Instantiate controller with context
    const controller = new ControllerClass(context)

    // 3. Check if action exists
    const action = controller[actionName]
    if (!action || typeof action !== 'function') {
      return this._notFoundResponse(`Action not found: ${controllerName}#${actionName}`)
    }

    // 4. Run before filters
    const beforeResult = await this._runBeforeFilters(controller, ControllerClass, actionName)
    if (beforeResult instanceof Response) {
      return beforeResult // Filter returned a response (e.g., unauthorized)
    }

    // 5. Execute action
    const response = await action.call(controller)

    // 6. Run after filters
    await this._runAfterFilters(controller, ControllerClass, actionName)

    // 7. Return response (or create one if action returned data)
    return this._ensureResponse(response)
  }

  /**
   * Load controller class by name
   * @private
   */
  async _loadController(name) {
    if (this.controllerLoader) {
      return await this.controllerLoader(name)
    }

    // No loader configured - try dynamic import (for testing)
    // In production, Application provides the loader
    return null
  }

  /**
   * Run before action filters
   * @private
   */
  async _runBeforeFilters(controller, ControllerClass, actionName) {
    const beforeFilters = ControllerClass.beforeAction || []

    for (const filter of beforeFilters) {
      // Filter can be a string (method name) or object with options
      const filterName = typeof filter === 'string' ? filter : filter.name
      const filterOptions = typeof filter === 'object' ? filter : {}

      // Check :only and :except options
      if (filterOptions.only && !filterOptions.only.includes(actionName)) {
        continue
      }
      if (filterOptions.except && filterOptions.except.includes(actionName)) {
        continue
      }

      if (typeof controller[filterName] === 'function') {
        const result = await controller[filterName]()
        if (result instanceof Response) {
          return result
        }
      }
    }

    return null
  }

  /**
   * Run after action filters
   * @private
   */
  async _runAfterFilters(controller, ControllerClass, actionName) {
    const afterFilters = ControllerClass.afterAction || []

    for (const filter of afterFilters) {
      const filterName = typeof filter === 'string' ? filter : filter.name
      const filterOptions = typeof filter === 'object' ? filter : {}

      // Check :only and :except options
      if (filterOptions.only && !filterOptions.only.includes(actionName)) {
        continue
      }
      if (filterOptions.except && filterOptions.except.includes(actionName)) {
        continue
      }

      if (typeof controller[filterName] === 'function') {
        await controller[filterName]()
      }
    }
  }

  /**
   * Ensure action result is a Response object
   * @private
   */
  _ensureResponse(result) {
    if (result instanceof Response) {
      return result
    }

    // If action returned data, wrap in JSON response
    if (result !== undefined && result !== null) {
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // No response - return 204 No Content
    return new Response(null, { status: 204 })
  }

  /**
   * Create 404 Not Found response
   * @private
   */
  _notFoundResponse(message = 'Not Found') {
    return new Response(JSON.stringify({ error: message }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle request errors
   * @private
   */
  _handleError(error, request, _startTime) {
    // Use custom error handler if configured
    if (this.errorHandler) {
      return this.errorHandler(error, request)
    }

    // Default error handling
    console.error(`Router error: ${error.message}`, error.stack)

    const status = error.status || error.statusCode || 500
    const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
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
