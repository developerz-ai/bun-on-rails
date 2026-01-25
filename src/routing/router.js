/**
 * Router - Rails-like routing DSL
 */

export class Router {
  constructor() {
    this.routes = []
    this.namedRoutes = {}
    this.currentNamespace = []
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
    callback()
    this.currentNamespace.pop()
  }

  /**
   * Create a scope without controller namespace
   * @param {string} path
   * @param {Function} callback
   */
  scope(path, callback) {
    // TODO: Implement scope
    callback()
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
    const fullPath = this.currentNamespace.length > 0
      ? '/' + this.currentNamespace.join('/') + path
      : path

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
   * @param {string} name
   * @param {Object} params
   * @returns {string}
   */
  urlFor(_name, _params = {}) {
    // TODO: Generate URL from named route with params
  }

  /**
   * Handle incoming request
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async handle(_request) {
    // TODO: Match route
    // TODO: Load controller
    // TODO: Run middleware
    // TODO: Execute action
    // TODO: Return response
  }
}

function singularize(str) {
  if (str.endsWith('s')) return str.slice(0, -1)
  return str
}
