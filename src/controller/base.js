/**
 * Controller - Base class for all controllers
 *
 * Controllers handle HTTP requests and provide methods for rendering responses,
 * managing sessions, and broadcasting to WebSocket channels.
 *
 * @example
 * export default class PostsController extends Controller {
 *   static beforeAction = ['authenticate']
 *
 *   async index() {
 *     const posts = await Post.findAll({ include: 'user' })
 *     return this.render({ posts })
 *   }
 *
 *   async create() {
 *     const post = await Post.create(this.params.post)
 *     if (post.errors) return this.unprocessableEntity(post.errors)
 *
 *     // Broadcast to WebSocket subscribers
 *     this.broadcast('posts:new', { post })
 *
 *     return this.render({ post }, { status: 201 })
 *   }
 * }
 *
 * @module bun-on-rails/controller/base
 */

import { RequestParams } from './request_parser.js'

export class Controller {
  static beforeAction = []
  static afterAction = []
  static rateLimit = {}

  constructor(context) {
    this.context = context
    this.request = context.request
    this.params = context.params || {}
    this.session = context.session
    this.currentUser = context.currentUser
    this.http = context.http
    this.cache = context.cache
    this.temp = context.temp
    this.db = context.db
    this.broadcastManager = context.broadcastManager

    // Parsed request components from request parser middleware
    this.query = context.query || {}
    this.body = context.body || {}
    this.files = context.files || {}

    // Storage for response cookies and headers
    this._responseCookies = []
    this._responseHeaders = new Map()

    // Lazy-loaded RequestParams wrapper
    this._requestParams = null
  }

  /**
   * The session's CSRF token. Hand it to the client, which sends it back in an
   * X-CSRF-Token header (or a `_csrf` param) on every POST, PUT, PATCH and
   * DELETE while CSRF protection is on.
   * @returns {string|undefined}
   */
  get csrfToken() {
    return this.session?.csrfToken
  }

  /**
   * Render a response
   * @param {Object} data
   * @param {Object} options
   * @returns {Response}
   */
  render(data, options = {}) {
    const status = options.status || 200
    const headers = options.headers || {}

    const response = new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })

    return this._applyResponseModifications(response)
  }

  /**
   * Redirect to another URL
   * @param {string} url
   * @param {Object} options
   * @returns {Response}
   */
  redirect(url, options = {}) {
    const status = options.status || 302
    const response = new Response(null, {
      status,
      headers: { 'Location': url }
    })

    return this._applyResponseModifications(response)
  }

  /**
   * Render head-only response
   * @param {number} status
   * @returns {Response}
   */
  head(status) {
    const response = new Response(null, { status })
    return this._applyResponseModifications(response)
  }

  /**
   * Return 401 Unauthorized
   * @param {string} message
   * @returns {Response}
   */
  unauthorized(message = 'Unauthorized') {
    return this.render({ error: message }, { status: 401 })
  }

  /**
   * Return 403 Forbidden
   * @param {string} message
   * @returns {Response}
   */
  forbidden(message = 'Forbidden') {
    return this.render({ error: message }, { status: 403 })
  }

  /**
   * Return 404 Not Found
   * @param {string} message
   * @returns {Response}
   */
  notFound(message = 'Not Found') {
    return this.render({ error: message }, { status: 404 })
  }

  /**
   * Return 422 Unprocessable Entity
   * @param {Object} errors
   * @returns {Response}
   */
  unprocessableEntity(errors) {
    return this.render({ errors }, { status: 422 })
  }

  // ==========================================
  // Request Parameter Access
  // ==========================================

  /**
   * Get a RequestParams wrapper for strong parameters support
   *
   * Provides Rails-like permit/require functionality for parameter whitelisting.
   *
   * @returns {RequestParams} RequestParams instance wrapping this.params
   *
   * @example
   * // Require and permit specific parameters
   * async create() {
   *   const postParams = this.requestParams.require('post')
   *   const permitted = new RequestParams(postParams).permit('title', 'body')
   *   const post = await Post.create(permitted.toObject())
   * }
   */
  get requestParams() {
    if (!this._requestParams) {
      this._requestParams = new RequestParams(this.params)
    }
    return this._requestParams
  }

  /**
   * Get a specific parameter value
   *
   * Convenience method for accessing params with a default value.
   * Supports dot notation for nested access.
   *
   * @param {string} key - Parameter key (supports dot notation: 'user.name')
   * @param {*} [defaultValue] - Default value if parameter is not found
   * @returns {*} Parameter value or default
   *
   * @example
   * const page = this.param('page', 1)
   * const userName = this.param('user.name')
   */
  param(key, defaultValue = undefined) {
    return this.requestParams.get(key, defaultValue)
  }

  /**
   * Require a parameter (throws if missing)
   *
   * @param {string} key - Required parameter key
   * @returns {*} Parameter value
   * @throws {Error} If parameter is missing (400 status)
   *
   * @example
   * async show() {
   *   const id = this.requireParam('id')
   *   const post = await Post.find(id)
   * }
   */
  requireParam(key) {
    return this.requestParams.require(key)
  }

  /**
   * Permit only specified parameters (strong parameters)
   *
   * Returns a new object containing only the permitted parameters.
   * Useful for mass-assignment protection.
   *
   * @param {...string|Object} keys - Keys to permit
   * @returns {Object} Object with only permitted keys
   *
   * @example
   * async create() {
   *   const permitted = this.permitParams('title', 'body', { tags: [] })
   *   const post = await Post.create(permitted)
   * }
   *
   * @example
   * // Nested parameters
   * const userParams = this.permitParams({ user: ['name', 'email', 'password'] })
   */
  permitParams(...keys) {
    return this.requestParams.permit(...keys).toObject()
  }

  /**
   * Check if a file was uploaded with the given key
   *
   * @param {string} key - File parameter key
   * @returns {boolean} True if file exists
   *
   * @example
   * if (this.hasFile('avatar')) {
   *   await this.processUpload('avatar')
   * }
   */
  hasFile(key) {
    return key in this.files
  }

  /**
   * Get an uploaded file by key
   *
   * @param {string} key - File parameter key
   * @returns {Object|Object[]|undefined} Parsed file object(s) or undefined
   *
   * @example
   * const avatar = this.getFile('avatar')
   * if (avatar) {
   *   const buffer = await avatar.buffer()
   *   await avatar.saveTo('/uploads/' + avatar.name)
   * }
   */
  getFile(key) {
    return this.files[key]
  }

  /**
   * Get all uploaded files
   *
   * @returns {Object} Object mapping keys to file objects
   */
  getAllFiles() {
    return { ...this.files }
  }

  /**
   * Get query parameters only (without body or route params)
   *
   * @returns {Object} Query parameters
   */
  getQuery() {
    return { ...this.query }
  }

  /**
   * Get body parameters only (without query or route params)
   *
   * @returns {Object} Body parameters
   */
  getBody() {
    return { ...this.body }
  }

  // ==========================================
  // WebSocket Broadcasting
  // ==========================================

  /**
   * Broadcast data to WebSocket subscribers
   *
   * Sends data to all WebSocket clients subscribed to the specified channel.
   * Uses Redis pub/sub when available for multi-server deployments.
   *
   * @param {string} channel - Channel/stream name to broadcast to
   * @param {Object} data - Data to broadcast (will be JSON serialized)
   * @returns {Promise<number>} Number of local connections that received the message
   *
   * @example
   * // Broadcast a new post to all subscribers
   * async create() {
   *   const post = await Post.create(this.params.post)
   *   await this.broadcast('posts:new', { post })
   *   return this.render({ post }, { status: 201 })
   * }
   *
   * @example
   * // Broadcast to a specific room/channel
   * async update() {
   *   const post = await Post.find(this.params.id)
   *   await post.update(this.params.post)
   *   await this.broadcast(`posts:${post.id}`, { action: 'updated', post })
   *   return this.render({ post })
   * }
   */
  async broadcast(channel, data) {
    if (!this.broadcastManager) {
      // No broadcast manager available - silently ignore
      // This allows controllers to broadcast without requiring WebSocket setup
      return 0
    }

    return await this.broadcastManager.broadcast(channel, data)
  }

  /**
   * Set or get flash messages for the next request
   *
   * Flash messages are stored in the session and automatically cleared after being read.
   * They are commonly used for success/error messages that should persist across redirects.
   *
   * @param {string} [type] - Flash message type (e.g., 'success', 'error', 'notice', 'alert')
   * @param {string} [message] - The message to flash
   * @returns {Object|string|undefined} When called with no args, returns all flash messages.
   *          When called with only type, returns that type's message.
   *          When called with type and message, sets the flash and returns undefined.
   *
   * @example
   * // Set a flash message
   * this.flash('success', 'Post created successfully!')
   *
   * @example
   * // Set multiple flash messages
   * this.flash('notice', 'Welcome back!')
   * this.flash('alert', 'Your session will expire soon')
   *
   * @example
   * // Read all flash messages (in next request)
   * const messages = this.flash() // { notice: 'Welcome back!', alert: '...' }
   *
   * @example
   * // Read specific flash message (in next request)
   * const notice = this.flash('notice') // 'Welcome back!'
   */
  flash(type, message) {
    // Initialize flash storage in session if not present
    if (!this.session) {
      this.session = {}
    }

    // _flash stores messages to be shown on the NEXT request
    // _flashRead tracks which messages have been read (for auto-clear)
    if (!this.session._flash) {
      this.session._flash = {}
    }

    // Getter mode: no arguments - return all flash messages and mark for clearing
    if (type === undefined) {
      const messages = { ...this.session._flash }
      // Mark all as read by moving to a "read" state
      // The messages will be cleared on the next request
      this.session._flashRead = true
      return messages
    }

    // Getter mode: only type provided - return specific flash message
    if (message === undefined) {
      const msg = this.session._flash[type]
      // Mark as partially read - we'll track which keys were accessed
      if (!this.session._flashAccessed) {
        this.session._flashAccessed = []
      }
      if (!this.session._flashAccessed.includes(type)) {
        this.session._flashAccessed.push(type)
      }
      return msg
    }

    // Setter mode: both type and message provided
    this.session._flash[type] = message
  }

  /**
   * Access the current flash messages without clearing them
   * Useful for checking if flash messages exist before rendering
   *
   * @returns {Object} Current flash messages
   */
  get flashMessages() {
    if (!this.session || !this.session._flash) {
      return {}
    }
    return { ...this.session._flash }
  }

  /**
   * Clear all flash messages manually
   * Called automatically by the flash middleware, but can be called manually if needed
   */
  clearFlash() {
    if (this.session) {
      this.session._flash = {}
      this.session._flashRead = false
      this.session._flashAccessed = []
    }
  }

  /**
   * Check if there are any flash messages
   * @returns {boolean}
   */
  hasFlash() {
    if (!this.session || !this.session._flash) {
      return false
    }
    return Object.keys(this.session._flash).length > 0
  }

  /**
   * Internal: Process flash messages after response
   * Clears messages that have been read
   * @private
   */
  _processFlashAfterResponse() {
    if (!this.session) return

    // If all flash messages were read (via flash() with no args)
    if (this.session._flashRead) {
      this.session._flash = {}
      this.session._flashRead = false
      this.session._flashAccessed = []
      return
    }

    // If specific messages were accessed, remove only those
    if (this.session._flashAccessed && this.session._flashAccessed.length > 0) {
      for (const key of this.session._flashAccessed) {
        delete this.session._flash[key]
      }
      this.session._flashAccessed = []
    }
  }

  /**
   * Set response header
   *
   * Sets a header that will be included in the response.
   * Multiple values for the same header are supported.
   *
   * @param {string} name - Header name
   * @param {string} value - Header value
   *
   * @example
   * this.setHeader('X-Custom-Header', 'my-value')
   * this.setHeader('Cache-Control', 'no-cache')
   */
  setHeader(name, value) {
    this._responseHeaders.set(name, value)
  }

  /**
   * Get a cookie value from the request
   *
   * Parses the Cookie header from the incoming request and returns
   * the value of the specified cookie. Returns undefined if the
   * cookie doesn't exist.
   *
   * @param {string} name - The name of the cookie to retrieve
   * @returns {string|undefined} The cookie value, or undefined if not found
   *
   * @example
   * // Get a user preference cookie
   * const theme = this.getCookie('theme') // 'dark'
   *
   * @example
   * // Check if user has accepted cookies
   * const consent = this.getCookie('cookie_consent')
   * if (!consent) {
   *   // Show cookie banner
   * }
   */
  getCookie(name) {
    const cookieHeader = this.request?.headers?.get('Cookie')
    if (!cookieHeader) {
      return undefined
    }

    // Parse cookies from header
    // Format: "name1=value1; name2=value2; name3=value3"
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, ...valueParts] = cookie.trim().split('=')
      if (key) {
        // Rejoin in case value contains '='
        acc[key.trim()] = valueParts.join('=')
      }
      return acc
    }, {})

    return cookies[name]
  }

  /**
   * Set a cookie to be sent with the response
   *
   * Creates a Set-Cookie header with the specified name, value, and options.
   * The cookie will be included in the response when render(), redirect(),
   * or head() is called.
   *
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value (will be URI encoded)
   * @param {Object} [options={}] - Cookie options
   * @param {string} [options.path='/'] - Cookie path
   * @param {string} [options.domain] - Cookie domain
   * @param {Date|string} [options.expires] - Expiration date
   * @param {number} [options.maxAge] - Max age in seconds
   * @param {boolean} [options.httpOnly=true] - HttpOnly flag (default true for security)
   * @param {boolean} [options.secure] - Secure flag (auto-enabled in production)
   * @param {string} [options.sameSite='Lax'] - SameSite attribute ('Strict', 'Lax', or 'None')
   *
   * @example
   * // Set a simple cookie
   * this.setCookie('user_id', '12345')
   *
   * @example
   * // Set a cookie with options
   * this.setCookie('remember_me', 'token123', {
   *   maxAge: 30 * 24 * 60 * 60, // 30 days
   *   httpOnly: true,
   *   secure: true,
   *   sameSite: 'Strict'
   * })
   *
   * @example
   * // Set a cookie with expiration date
   * const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
   * this.setCookie('promo_seen', 'true', { expires: nextWeek })
   */
  setCookie(name, value, options = {}) {
    const {
      path = '/',
      domain,
      expires,
      maxAge,
      httpOnly = true,
      secure,
      sameSite = 'Lax'
    } = options

    // Build the cookie string
    let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

    if (path) {
      cookieStr += `; Path=${path}`
    }

    if (domain) {
      cookieStr += `; Domain=${domain}`
    }

    if (expires) {
      const expiresDate = expires instanceof Date ? expires : new Date(expires)
      cookieStr += `; Expires=${expiresDate.toUTCString()}`
    }

    if (maxAge !== undefined) {
      cookieStr += `; Max-Age=${maxAge}`
    }

    if (httpOnly) {
      cookieStr += '; HttpOnly'
    }

    // Auto-enable Secure in production or when explicitly set
    const isProduction = process.env.NODE_ENV === 'production'
    if (secure || (secure !== false && isProduction)) {
      cookieStr += '; Secure'
    }

    if (sameSite) {
      cookieStr += `; SameSite=${sameSite}`
    }

    this._responseCookies.push(cookieStr)
  }

  /**
   * Delete a cookie by setting it to expire immediately
   *
   * Removes a cookie by setting its value to empty and its expiration
   * date to the past. The path and domain must match the original cookie
   * for the deletion to work properly.
   *
   * @param {string} name - Cookie name to delete
   * @param {Object} [options={}] - Cookie options (path and domain should match original)
   * @param {string} [options.path='/'] - Cookie path
   * @param {string} [options.domain] - Cookie domain
   *
   * @example
   * // Delete a cookie
   * this.deleteCookie('session_id')
   *
   * @example
   * // Delete a cookie with specific path/domain
   * this.deleteCookie('user_prefs', { path: '/app', domain: '.example.com' })
   */
  deleteCookie(name, options = {}) {
    // Set cookie to expire in the past to delete it
    this.setCookie(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
      httpOnly: options.httpOnly !== undefined ? options.httpOnly : true
    })
  }

  /**
   * Apply stored headers and cookies to a response
   * @private
   * @param {Response} response - The response to modify
   * @returns {Response} New response with headers and cookies applied
   */
  _applyResponseModifications(response) {
    // If no modifications needed, return original response
    if (this._responseHeaders.size === 0 && this._responseCookies.length === 0) {
      return response
    }

    // Clone headers from original response
    const headers = new Headers(response.headers)

    // Apply custom headers
    for (const [name, value] of this._responseHeaders) {
      headers.set(name, value)
    }

    // Apply cookies (Set-Cookie headers)
    for (const cookie of this._responseCookies) {
      headers.append('Set-Cookie', cookie)
    }

    // Create new response with modified headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }
}

/**
 * Controller Context - Injected dependencies
 *
 * The context provides access to all request-scoped and application-scoped
 * services that controllers need.
 *
 * @example
 * const context = new ControllerContext({
 *   request: new Request('http://localhost/posts'),
 *   params: { id: '123' },
 *   query: { page: '1' },
 *   body: { title: 'Hello' },
 *   files: {},
 *   session: { userId: 1 },
 *   currentUser: { id: 1, name: 'John' },
 *   cache: cacheInstance,
 *   db: databaseConnection,
 *   broadcastManager: broadcastManagerInstance
 * })
 */
export class ControllerContext {
  constructor(options) {
    this.request = options.request
    this.params = options.params || {}
    this.query = options.query || {}
    this.body = options.body || {}
    this.files = options.files || {}
    this.session = options.session
    this.currentUser = options.currentUser
    this.http = options.http
    this.cache = options.cache
    this.temp = options.temp
    this.db = options.db
    this.broadcastManager = options.broadcastManager
  }
}

// Re-export RequestParams for convenience
export { RequestParams } from './request_parser.js'
