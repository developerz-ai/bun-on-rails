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
 * @module @bun-on-rails/controller/base
 */

export class Controller {
  static beforeAction = []
  static afterAction = []
  static rateLimit = {}

  constructor(context) {
    this.context = context
    this.request = context.request
    this.params = context.params
    this.session = context.session
    this.currentUser = context.currentUser
    this.http = context.http
    this.cache = context.cache
    this.temp = context.temp
    this.db = context.db
    this.broadcastManager = context.broadcastManager
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

    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })
  }

  /**
   * Redirect to another URL
   * @param {string} url
   * @param {Object} options
   * @returns {Response}
   */
  redirect(url, options = {}) {
    const status = options.status || 302
    return new Response(null, {
      status,
      headers: { 'Location': url }
    })
  }

  /**
   * Render head-only response
   * @param {number} status
   * @returns {Response}
   */
  head(status) {
    return new Response(null, { status })
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
   * @param {string} name
   * @param {string} value
   */
  setHeader(_name, _value) {
    // TODO: Store for response
  }

  /**
   * Set response cookie
   * @param {string} name
   * @param {string} value
   * @param {Object} options
   */
  setCookie(_name, _value, _options = {}) {
    // TODO: Store for response
  }

  /**
   * Delete response cookie
   * @param {string} name
   */
  deleteCookie(_name) {
    // TODO: Set cookie with expiry
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
    this.params = options.params
    this.session = options.session
    this.currentUser = options.currentUser
    this.http = options.http
    this.cache = options.cache
    this.temp = options.temp
    this.db = options.db
    this.broadcastManager = options.broadcastManager
  }
}
