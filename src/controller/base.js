/**
 * Controller - Base class for all controllers
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
   * Broadcast to WebSocket channel
   * @param {string} channel
   * @param {Object} data
   */
  broadcast(channel, data) {
    // TODO: Send to WebSocket server
  }

  /**
   * Set flash message for next request
   * @param {string} type
   * @param {string} message
   */
  flash(type, message) {
    // TODO: Store in session
  }

  /**
   * Set response header
   * @param {string} name
   * @param {string} value
   */
  setHeader(name, value) {
    // TODO: Store for response
  }

  /**
   * Set response cookie
   * @param {string} name
   * @param {string} value
   * @param {Object} options
   */
  setCookie(name, value, options = {}) {
    // TODO: Store for response
  }

  /**
   * Delete response cookie
   * @param {string} name
   */
  deleteCookie(name) {
    // TODO: Set cookie with expiry
  }
}

/**
 * Controller Context - Injected dependencies
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
  }
}
