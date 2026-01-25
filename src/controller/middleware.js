/**
 * Middleware - Request/Response pipeline with beforeAction/afterAction support
 * @module @bun-on-rails/controller/middleware
 */

/**
 * Middleware runner - Executes middleware chain with Koa-style next() pattern
 */
export class MiddlewareStack {
  constructor() {
    /** @type {Array<MiddlewareFunction>} */
    this.middleware = []
  }

  /**
   * Add middleware to the stack
   * @param {MiddlewareFunction|MiddlewareFunction[]} fn - Middleware function or array
   * @returns {MiddlewareStack} - For chaining
   */
  use(fn) {
    if (Array.isArray(fn)) {
      for (const f of fn) {
        this.use(f)
      }
    } else if (typeof fn === 'function') {
      this.middleware.push(fn)
    } else {
      throw new TypeError('Middleware must be a function or array of functions')
    }
    return this
  }

  /**
   * Prepend middleware to the beginning of the stack
   * @param {MiddlewareFunction} fn - Middleware function
   * @returns {MiddlewareStack} - For chaining
   */
  prepend(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be a function')
    }
    this.middleware.unshift(fn)
    return this
  }

  /**
   * Insert middleware at a specific index
   * @param {number} index - Position to insert
   * @param {MiddlewareFunction} fn - Middleware function
   * @returns {MiddlewareStack} - For chaining
   */
  insertAt(index, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be a function')
    }
    this.middleware.splice(index, 0, fn)
    return this
  }

  /**
   * Insert middleware before another named middleware
   * @param {string} name - Name of middleware to insert before
   * @param {MiddlewareFunction} fn - Middleware function
   * @returns {MiddlewareStack} - For chaining
   */
  insertBefore(name, fn) {
    const index = this.middleware.findIndex(m => m.name === name || m._name === name)
    if (index === -1) {
      throw new Error(`Middleware '${name}' not found`)
    }
    return this.insertAt(index, fn)
  }

  /**
   * Insert middleware after another named middleware
   * @param {string} name - Name of middleware to insert after
   * @param {MiddlewareFunction} fn - Middleware function
   * @returns {MiddlewareStack} - For chaining
   */
  insertAfter(name, fn) {
    const index = this.middleware.findIndex(m => m.name === name || m._name === name)
    if (index === -1) {
      throw new Error(`Middleware '${name}' not found`)
    }
    return this.insertAt(index + 1, fn)
  }

  /**
   * Remove middleware by name or reference
   * @param {string|MiddlewareFunction} fnOrName - Middleware function or name
   * @returns {boolean} - True if removed
   */
  remove(fnOrName) {
    const index = typeof fnOrName === 'string'
      ? this.middleware.findIndex(m => m.name === fnOrName || m._name === fnOrName)
      : this.middleware.indexOf(fnOrName)

    if (index !== -1) {
      this.middleware.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Clear all middleware
   * @returns {MiddlewareStack} - For chaining
   */
  clear() {
    this.middleware = []
    return this
  }

  /**
   * Get the number of middleware in the stack
   * @returns {number}
   */
  get length() {
    return this.middleware.length
  }

  /**
   * Run all middleware in the stack
   * Uses Koa-style "onion" execution where each middleware
   * can run code before and after calling next()
   *
   * @param {ControllerContext} context - Request context
   * @param {Function} handler - Final handler to execute after all middleware
   * @returns {Promise<Response>}
   */
  async run(context, handler) {
    let index = 0
    let response = null

    const next = async () => {
      if (index < this.middleware.length) {
        const fn = this.middleware[index++]
        try {
          response = await fn(context, next)
          return response
        } catch (error) {
          // Re-throw to allow error middleware to catch
          throw error
        }
      }
      // All middleware executed, run the final handler
      response = await handler(context)
      return response
    }

    return await next()
  }

  /**
   * Compose middleware into a single function
   * @returns {MiddlewareFunction}
   */
  compose() {
    return async (context, next) => {
      return await this.run(context, next || (() => Promise.resolve()))
    }
  }
}

/**
 * ControllerMiddleware - Handles beforeAction/afterAction filter execution
 */
export class ControllerMiddleware {
  /**
   * Create middleware that runs controller filters
   * @param {Object} options - Configuration options
   * @returns {MiddlewareFunction}
   */
  static create(_options = {}) {
    const middleware = async (context, next) => {
      const { controller, ControllerClass, actionName } = context._controllerInfo || {}

      if (!controller || !ControllerClass) {
        return await next()
      }

      // Run before filters
      const beforeResult = await ControllerMiddleware.runBeforeFilters(
        controller,
        ControllerClass,
        actionName
      )

      // If a before filter returned a response, return it (e.g., unauthorized)
      if (beforeResult instanceof Response) {
        return beforeResult
      }

      // Execute the action via next()
      const response = await next()

      // Run after filters (response is already generated)
      await ControllerMiddleware.runAfterFilters(
        controller,
        ControllerClass,
        actionName,
        response
      )

      return response
    }

    middleware._name = 'controllerMiddleware'
    return middleware
  }

  /**
   * Run before action filters on a controller
   * @param {Object} controller - Controller instance
   * @param {Function} ControllerClass - Controller class
   * @param {string} actionName - Current action name
   * @returns {Promise<Response|null>} - Response to halt chain, or null to continue
   */
  static async runBeforeFilters(controller, ControllerClass, actionName) {
    const beforeFilters = ControllerClass.beforeAction || []

    for (const filter of beforeFilters) {
      const result = await ControllerMiddleware._executeFilter(
        controller,
        filter,
        actionName,
        'before'
      )

      // If filter returns a Response, halt the chain
      if (result instanceof Response) {
        return result
      }

      // If filter returns false, halt without response (let controller handle it)
      if (result === false) {
        return controller.forbidden ? controller.forbidden() : new Response('Forbidden', { status: 403 })
      }
    }

    return null
  }

  /**
   * Run after action filters on a controller
   * @param {Object} controller - Controller instance
   * @param {Function} ControllerClass - Controller class
   * @param {string} actionName - Current action name
   * @param {Response} response - The response from the action
   */
  static async runAfterFilters(controller, ControllerClass, actionName, response) {
    const afterFilters = ControllerClass.afterAction || []

    for (const filter of afterFilters) {
      await ControllerMiddleware._executeFilter(
        controller,
        filter,
        actionName,
        'after',
        response
      )
    }
  }

  /**
   * Execute a single filter
   * @param {Object} controller - Controller instance
   * @param {string|Object} filter - Filter name or config object
   * @param {string} actionName - Current action name
   * @param {string} phase - 'before' or 'after'
   * @param {Response} [response] - Response for after filters
   * @returns {Promise<*>}
   * @private
   */
  static async _executeFilter(controller, filter, actionName, phase, response = null) {
    // Parse filter configuration
    const filterConfig = typeof filter === 'string'
      ? { name: filter }
      : filter

    const { name, only, except, if: ifCondition, unless } = filterConfig

    // Check :only option - only run for specified actions
    if (only && !ControllerMiddleware._matchesActions(actionName, only)) {
      return null
    }

    // Check :except option - skip for specified actions
    if (except && ControllerMiddleware._matchesActions(actionName, except)) {
      return null
    }

    // Check :if condition
    if (ifCondition) {
      const shouldRun = typeof ifCondition === 'function'
        ? await ifCondition.call(controller)
        : typeof controller[ifCondition] === 'function'
          ? await controller[ifCondition]()
          : ifCondition

      if (!shouldRun) {
        return null
      }
    }

    // Check :unless condition
    if (unless) {
      const shouldSkip = typeof unless === 'function'
        ? await unless.call(controller)
        : typeof controller[unless] === 'function'
          ? await controller[unless]()
          : unless

      if (shouldSkip) {
        return null
      }
    }

    // Execute the filter method
    const method = controller[name]
    if (typeof method !== 'function') {
      console.warn(`Filter method '${name}' not found on controller`)
      return null
    }

    // Call the filter method
    if (phase === 'after' && response) {
      return await method.call(controller, response)
    }

    return await method.call(controller)
  }

  /**
   * Check if action matches the specified actions
   * @param {string} actionName - Current action
   * @param {string|string[]} actions - Action(s) to match
   * @returns {boolean}
   * @private
   */
  static _matchesActions(actionName, actions) {
    if (Array.isArray(actions)) {
      return actions.includes(actionName)
    }
    return actions === actionName
  }
}

/**
 * Built-in middleware functions
 */
export const Middleware = {
  /**
   * Parse request body (JSON, form data, multipart)
   * @returns {MiddlewareFunction}
   */
  bodyParser: () => {
    const middleware = async (context, next) => {
      const request = context.request
      const contentType = request.headers.get('content-type') || ''

      // Only parse for methods that typically have bodies
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        try {
          if (contentType.includes('application/json')) {
            const body = await request.clone().json()
            context.body = body
            context.params = { ...context.params, ...body }
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.clone().formData()
            const body = Object.fromEntries(formData)
            context.body = body
            context.params = { ...context.params, ...body }
          } else if (contentType.includes('multipart/form-data')) {
            const formData = await request.clone().formData()
            const body = {}
            for (const [key, value] of formData.entries()) {
              // Check if value is a File/Blob
              if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.name !== undefined) {
                body[key] = {
                  name: value.name,
                  type: value.type,
                  size: value.size,
                  file: value
                }
              } else {
                body[key] = value
              }
            }
            context.body = body
            context.params = { ...context.params, ...body }
          }
        } catch (error) {
          console.warn(`Failed to parse request body: ${error.message}`)
        }
      }

      return await next()
    }

    middleware._name = 'bodyParser'
    return middleware
  },

  /**
   * Load and save session from cookie/store
   * @param {Object} options - Session options
   * @param {string} options.secret - Secret for signing cookies
   * @param {string} options.cookieName - Cookie name (default: '_session')
   * @param {Object} options.store - Session store (default: in-memory)
   * @param {number} options.maxAge - Session max age in seconds
   * @returns {MiddlewareFunction}
   */
  session: (options = {}) => {
    const {
      secret: _secret = process.env.SESSION_SECRET || 'change-me-in-production',
      cookieName = '_session',
      store = new Map(),
      maxAge = 86400 // 24 hours
    } = options

    const middleware = async (context, next) => {
      const request = context.request
      const cookies = parseCookies(request.headers.get('cookie') || '')
      const sessionId = cookies[cookieName]

      // Load or create session
      let session = {}
      if (sessionId && store.has(sessionId)) {
        session = store.get(sessionId)
      }

      context.session = session

      // Execute the rest of the chain
      const response = await next()

      // Save session after response
      const newSessionId = sessionId || generateSessionId()
      store.set(newSessionId, context.session)

      // Set session cookie if needed
      if (!sessionId) {
        const setCookieHeader = `${cookieName}=${newSessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
        // Clone response with new header
        const headers = new Headers(response.headers)
        headers.append('Set-Cookie', setCookieHeader)
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      }

      return response
    }

    middleware._name = 'session'
    return middleware
  },

  /**
   * CSRF protection middleware
   * @param {Object} options - CSRF options
   * @param {string[]} options.ignoreMethods - Methods to ignore (default: GET, HEAD, OPTIONS)
   * @param {string[]} options.ignorePaths - Paths to ignore
   * @returns {MiddlewareFunction}
   */
  csrf: (options = {}) => {
    const {
      ignoreMethods = ['GET', 'HEAD', 'OPTIONS'],
      ignorePaths = []
    } = options

    const middleware = async (context, next) => {
      const request = context.request
      const url = new URL(request.url)

      // Skip for safe methods
      if (ignoreMethods.includes(request.method)) {
        return await next()
      }

      // Skip for ignored paths
      if (ignorePaths.some(path => url.pathname.startsWith(path))) {
        return await next()
      }

      // Get CSRF token from header or body
      const headerToken = request.headers.get('X-CSRF-Token') || request.headers.get('X-XSRF-Token')
      const bodyToken = context.params?._csrf || context.body?._csrf

      const token = headerToken || bodyToken
      const sessionToken = context.session?.csrfToken

      // Verify token
      if (!token || !sessionToken || token !== sessionToken) {
        return new Response(JSON.stringify({ error: 'CSRF token mismatch' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return await next()
    }

    middleware._name = 'csrf'
    return middleware
  },

  /**
   * CORS headers middleware
   * @param {Object} options - CORS options
   * @param {string|string[]} options.origin - Allowed origins
   * @param {string[]} options.methods - Allowed methods
   * @param {string[]} options.headers - Allowed headers
   * @param {boolean} options.credentials - Allow credentials
   * @param {number} options.maxAge - Preflight cache max age
   * @returns {MiddlewareFunction}
   */
  cors: (options = {}) => {
    const {
      origin = '*',
      methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers = ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      credentials = false,
      maxAge = 86400
    } = options

    const middleware = async (context, next) => {
      const request = context.request
      const requestOrigin = request.headers.get('origin')

      // Determine allowed origin
      let allowedOrigin = '*'
      if (typeof origin === 'function') {
        allowedOrigin = origin(requestOrigin) || ''
      } else if (Array.isArray(origin)) {
        allowedOrigin = origin.includes(requestOrigin) ? requestOrigin : ''
      } else if (origin !== '*') {
        allowedOrigin = origin === requestOrigin ? requestOrigin : ''
      }

      // Handle preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': methods.join(', '),
            'Access-Control-Allow-Headers': headers.join(', '),
            'Access-Control-Max-Age': String(maxAge),
            ...(credentials ? { 'Access-Control-Allow-Credentials': 'true' } : {})
          }
        })
      }

      const response = await next()

      // Add CORS headers to response
      const corsHeaders = new Headers(response.headers)
      corsHeaders.set('Access-Control-Allow-Origin', allowedOrigin)
      if (credentials) {
        corsHeaders.set('Access-Control-Allow-Credentials', 'true')
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: corsHeaders
      })
    }

    middleware._name = 'cors'
    return middleware
  },

  /**
   * Request logging middleware
   * @param {Object} options - Logger options
   * @param {Function} options.logger - Log function (default: console.log)
   * @param {boolean} options.includeBody - Log request body
   * @returns {MiddlewareFunction}
   */
  logger: (options = {}) => {
    const {
      logger = console.log,
      includeBody = false
    } = options

    const middleware = async (context, next) => {
      const request = context.request
      const startTime = performance.now()
      const url = new URL(request.url)

      logger(`--> ${request.method} ${url.pathname}`)

      if (includeBody && context.body) {
        logger(`    Body: ${JSON.stringify(context.body).slice(0, 200)}`)
      }

      try {
        const response = await next()
        const duration = (performance.now() - startTime).toFixed(2)

        logger(`<-- ${request.method} ${url.pathname} ${response.status} ${duration}ms`)

        return response
      } catch (error) {
        const duration = (performance.now() - startTime).toFixed(2)
        logger(`<-- ${request.method} ${url.pathname} ERROR ${duration}ms - ${error.message}`)
        throw error
      }
    }

    middleware._name = 'logger'
    return middleware
  },

  /**
   * Error handling middleware
   * @param {Object} options - Error handler options
   * @param {Function} options.onError - Error callback
   * @param {boolean} options.expose - Expose error details in non-production
   * @returns {MiddlewareFunction}
   */
  errorHandler: (options = {}) => {
    const {
      onError = null,
      expose = process.env.NODE_ENV !== 'production'
    } = options

    const middleware = async (context, next) => {
      try {
        return await next()
      } catch (error) {
        // Call error callback if provided
        if (onError) {
          onError(error, context)
        }

        // Determine status code
        const status = error.status || error.statusCode || 500

        // Build error response
        const body = {
          error: expose ? error.message : 'Internal Server Error'
        }

        if (expose && error.stack) {
          body.stack = error.stack.split('\n')
        }

        return new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    middleware._name = 'errorHandler'
    return middleware
  },

  /**
   * Rate limiting middleware
   * @param {Object} options - Rate limit options
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {number} options.max - Max requests per window
   * @param {Function} options.keyGenerator - Generate key from context
   * @param {Object} options.store - Store for tracking (default: in-memory Map)
   * @returns {MiddlewareFunction}
   */
  rateLimit: (options = {}) => {
    const {
      windowMs = 60000, // 1 minute
      max = 100,
      keyGenerator = (context) => {
        const request = context.request
        return request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown'
      },
      store = new Map()
    } = options

    const middleware = async (context, next) => {
      const key = keyGenerator(context)
      const now = Date.now()

      // Get or create rate limit entry
      let entry = store.get(key)
      if (!entry || now > entry.resetTime) {
        entry = {
          count: 0,
          resetTime: now + windowMs
        }
      }

      entry.count++
      store.set(key, entry)

      // Check if rate limit exceeded
      if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000))
          }
        })
      }

      const response = await next()

      // Add rate limit headers
      const headers = new Headers(response.headers)
      headers.set('X-RateLimit-Limit', String(max))
      headers.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)))
      headers.set('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)))

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }

    middleware._name = 'rateLimit'
    return middleware
  },

  /**
   * Authentication middleware
   * @param {Object} options - Auth options
   * @param {Function} options.authenticate - Function to authenticate request
   * @param {string[]} options.excludePaths - Paths to exclude from auth
   * @returns {MiddlewareFunction}
   */
  authenticate: (options = {}) => {
    const {
      authenticate = async () => null,
      excludePaths = []
    } = options

    const middleware = async (context, next) => {
      const request = context.request
      const url = new URL(request.url)

      // Skip excluded paths
      if (excludePaths.some(path => url.pathname.startsWith(path))) {
        return await next()
      }

      // Try to authenticate
      const user = await authenticate(context)

      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      context.currentUser = user
      return await next()
    }

    middleware._name = 'authenticate'
    return middleware
  },

  /**
   * Resource cleanup middleware (runs cleanup after response)
   * @param {Object} options - Cleanup options
   * @param {Function[]} options.cleaners - Cleanup functions to run
   * @returns {MiddlewareFunction}
   */
  cleanup: (options = {}) => {
    const { cleaners = [] } = options

    const middleware = async (context, next) => {
      try {
        return await next()
      } finally {
        // Run cleanup tasks
        for (const cleaner of cleaners) {
          try {
            await cleaner(context)
          } catch (error) {
            console.error('Cleanup error:', error.message)
          }
        }

        // Clear temp data
        if (context.temp) {
          context.temp.clear()
        }
      }
    }

    middleware._name = 'cleanup'
    return middleware
  },

  /**
   * Request timeout middleware
   * @param {Object} options - Timeout options
   * @param {number} options.timeout - Timeout in milliseconds
   * @returns {MiddlewareFunction}
   */
  timeout: (options = {}) => {
    const { timeout = 30000 } = options

    const middleware = async (context, next) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await Promise.race([
          next(),
          new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('Request timeout'))
            })
          })
        ])

        clearTimeout(timeoutId)
        return response
      } catch (error) {
        clearTimeout(timeoutId)

        if (error.message === 'Request timeout') {
          return new Response(JSON.stringify({ error: 'Request timeout' }), {
            status: 408,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        throw error
      }
    }

    middleware._name = 'timeout'
    return middleware
  },

  /**
   * Security headers middleware
   * @param {Object} options - Security header options
   * @returns {MiddlewareFunction}
   */
  securityHeaders: (options = {}) => {
    const {
      contentSecurityPolicy = "default-src 'self'",
      xFrameOptions = 'DENY',
      xContentTypeOptions = 'nosniff',
      referrerPolicy = 'strict-origin-when-cross-origin',
      permissionsPolicy = ''
    } = options

    const middleware = async (context, next) => {
      const response = await next()
      const headers = new Headers(response.headers)

      if (contentSecurityPolicy) {
        headers.set('Content-Security-Policy', contentSecurityPolicy)
      }
      if (xFrameOptions) {
        headers.set('X-Frame-Options', xFrameOptions)
      }
      if (xContentTypeOptions) {
        headers.set('X-Content-Type-Options', xContentTypeOptions)
      }
      if (referrerPolicy) {
        headers.set('Referrer-Policy', referrerPolicy)
      }
      if (permissionsPolicy) {
        headers.set('Permissions-Policy', permissionsPolicy)
      }

      // Always set these
      headers.set('X-XSS-Protection', '1; mode=block')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }

    middleware._name = 'securityHeaders'
    return middleware
  },

  /**
   * Compression middleware (gzip/deflate/brotli)
   * @param {Object} options - Compression options
   * @param {number} options.threshold - Minimum size to compress (bytes)
   * @returns {MiddlewareFunction}
   */
  compress: (options = {}) => {
    const { threshold = 1024 } = options

    const middleware = async (context, next) => {
      const response = await next()
      const request = context.request

      // Check if compression is supported
      const acceptEncoding = request.headers.get('accept-encoding') || ''
      const contentType = response.headers.get('content-type') || ''

      // Only compress text-based content
      const compressible = contentType.includes('text/') ||
                          contentType.includes('application/json') ||
                          contentType.includes('application/javascript') ||
                          contentType.includes('application/xml')

      if (!compressible) {
        return response
      }

      // Get response body
      const body = await response.text()

      // Check threshold
      if (body.length < threshold) {
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        })
      }

      // Compress based on accept-encoding
      const headers = new Headers(response.headers)

      if (acceptEncoding.includes('gzip')) {
        const compressed = Bun.gzipSync(Buffer.from(body))
        headers.set('Content-Encoding', 'gzip')
        headers.delete('Content-Length')

        return new Response(compressed, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      }

      if (acceptEncoding.includes('deflate')) {
        const compressed = Bun.deflateSync(Buffer.from(body))
        headers.set('Content-Encoding', 'deflate')
        headers.delete('Content-Length')

        return new Response(compressed, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      }

      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }

    middleware._name = 'compress'
    return middleware
  },

  /**
   * Flash messages middleware
   *
   * Handles flash message lifecycle - moves "next request" messages to current,
   * and clears accessed messages after response.
   *
   * Flash messages are stored in session with this structure:
   * - _flash: Current flash messages to display
   * - _flashNext: Messages queued for next request
   * - _flashRead: Flag indicating all messages were read
   * - _flashAccessed: Array of specific keys that were accessed
   *
   * @param {Object} options - Flash options
   * @returns {MiddlewareFunction}
   *
   * @example
   * // In middleware setup
   * app.use(Middleware.flash())
   *
   * // In controller
   * this.flash('success', 'Item saved!')
   * return this.redirect('/items')
   *
   * // In next request
   * const message = this.flash('success') // 'Item saved!'
   */
  flash: (_options = {}) => {
    const middleware = async (context, next) => {
      // Ensure session exists
      if (!context.session) {
        context.session = {}
      }

      // Move "next request" messages to current flash
      // This handles the transition between requests
      if (context.session._flashNext) {
        context.session._flash = context.session._flashNext
        delete context.session._flashNext
      }

      // Initialize flash storage if not present
      if (!context.session._flash) {
        context.session._flash = {}
      }

      // Track controller for flash processing
      const originalController = context._controllerInfo?.controller

      // Execute the rest of the chain
      const response = await next()

      // Process flash messages after response
      // If controller set new flash messages, move them to "next request"
      const controller = context._controllerInfo?.controller || originalController

      if (controller && typeof controller._processFlashAfterResponse === 'function') {
        controller._processFlashAfterResponse()
      } else if (context.session) {
        // Direct session processing if no controller (e.g., static routes)
        if (context.session._flashRead) {
          context.session._flash = {}
          context.session._flashRead = false
          context.session._flashAccessed = []
        } else if (context.session._flashAccessed?.length > 0) {
          for (const key of context.session._flashAccessed) {
            delete context.session._flash[key]
          }
          context.session._flashAccessed = []
        }
      }

      return response
    }

    middleware._name = 'flash'
    return middleware
  }
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Parse cookies from cookie header string
 * @param {string} cookieHeader - Cookie header value
 * @returns {Object} - Parsed cookies
 */
function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies

  for (const pair of cookieHeader.split(';')) {
    const [key, ...values] = pair.trim().split('=')
    if (key) {
      cookies[key.trim()] = values.join('=').trim()
    }
  }

  return cookies
}

/**
 * Generate a random session ID
 * @returns {string}
 */
function generateSessionId() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Create a default middleware stack for typical web applications
 * @param {Object} options - Configuration options
 * @returns {MiddlewareStack}
 */
export function createDefaultMiddlewareStack(options = {}) {
  const stack = new MiddlewareStack()

  // Error handling should be first (wraps everything)
  if (options.errorHandler !== false) {
    stack.use(Middleware.errorHandler(options.errorHandler || {}))
  }

  // Logging
  if (options.logger !== false) {
    stack.use(Middleware.logger(options.logger || {}))
  }

  // Security headers
  if (options.securityHeaders !== false) {
    stack.use(Middleware.securityHeaders(options.securityHeaders || {}))
  }

  // CORS
  if (options.cors) {
    stack.use(Middleware.cors(options.cors))
  }

  // Body parsing
  if (options.bodyParser !== false) {
    stack.use(Middleware.bodyParser())
  }

  // Session
  if (options.session) {
    stack.use(Middleware.session(options.session))
  }

  // Flash messages (requires session)
  if (options.flash !== false && options.session) {
    stack.use(Middleware.flash(options.flash || {}))
  }

  // CSRF
  if (options.csrf) {
    stack.use(Middleware.csrf(options.csrf))
  }

  // Rate limiting
  if (options.rateLimit) {
    stack.use(Middleware.rateLimit(options.rateLimit))
  }

  // Authentication
  if (options.authenticate) {
    stack.use(Middleware.authenticate(options.authenticate))
  }

  // Request timeout
  if (options.timeout) {
    stack.use(Middleware.timeout(options.timeout))
  }

  // Compression (should be near the end to compress final response)
  if (options.compress) {
    stack.use(Middleware.compress(options.compress))
  }

  // Cleanup should be last
  if (options.cleanup) {
    stack.use(Middleware.cleanup(options.cleanup))
  }

  return stack
}

/**
 * @typedef {Function} MiddlewareFunction
 * @param {Object} context - Request context
 * @param {Function} next - Next middleware function
 * @returns {Promise<Response>}
 */

/**
 * @typedef {Object} ControllerContext
 * @property {Request} request - The HTTP request
 * @property {Object} params - Request parameters
 * @property {Object} session - Session data
 * @property {Object|null} currentUser - Authenticated user
 * @property {Object} http - HTTP-related objects
 * @property {Object|null} cache - Cache instance
 * @property {Map} temp - Temporary storage for request
 * @property {Object|null} db - Database connection
 */
