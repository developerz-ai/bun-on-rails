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
   * @param {string} method
   * @param {string} path
   * @returns {Object|null}
   */
  match(_method, _path) {
    // TODO: Match path with params extraction
    // TODO: Return matched route with params
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
