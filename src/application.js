/**
 * BunOnRails Application
 * Main application class that bootstraps and runs the framework
 *
 * @module bun-on-rails/application
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { createConfig, getEnvironment, isDevelopment, isProduction } from './config/loader.js'
import { Router } from './routing/router.js'
import { Cache, MemoryStore } from './cache/cache.js'
import { MiddlewareStack, Middleware, ControllerMiddleware } from './controller/middleware.js'
import { ControllerContext } from './controller/base.js'
import { BroadcastManager } from './websocket/broadcast_manager.js'
import { Connection, getConnection, setConnection } from './database/connection.js'
import { selectDatabaseConfig } from './database/config.js'
import { NotImplementedError } from './support/not_implemented.js'

/**
 * Application - Main framework entry point
 *
 * The Application class is responsible for:
 * - Loading configuration
 * - Initializing all framework components (database, cache, jobs, websocket)
 * - Loading models, controllers, channels, and jobs
 * - Starting the HTTP server with Bun.serve
 * - Handling graceful shutdown
 *
 * @example
 * const app = new Application({ root: process.cwd() })
 * await app.initialize()
 * await app.start()
 */
export class Application {
  /**
   * Create a new Application instance
   * @param {Object} options - Application options
   * @param {string} [options.root] - Application root directory (defaults to cwd)
   * @param {Object} [options.config] - Configuration overrides
   */
  constructor(options = {}) {
    this.root = options.root || process.cwd()
    this.configOverrides = options.config || {}

    // Framework components
    this.config = null
    this.router = null
    this.database = null
    this.cache = null
    this.redis = null
    this.websocket = null
    this.broadcastManager = null
    this.server = null

    // Loaded components
    this.models = new Map()
    this.controllers = new Map()
    this.channels = new Map()
    this.jobClasses = new Map()
    this.mailers = new Map()

    // Middleware
    this.middleware = new MiddlewareStack()

    // State
    this.initialized = false
    this.running = false

    // Logging
    this.logger = this._createLogger()
  }

  /**
   * Initialize the application
   *
   * This sets up all framework components but does not start the server.
   * Call start() after initialize() to begin accepting requests.
   *
   * @returns {Promise<Application>} This application instance
   */
  async initialize() {
    if (this.initialized) {
      throw new Error('Application already initialized')
    }

    this.logger.info('Initializing BunOnRails application...')

    // 1. Load configuration, and refuse a backend the framework does not have
    await this._loadConfiguration()
    this._refuseUnbuiltBackends()

    // 2. Initialize Redis (if configured)
    await this._initializeRedis()

    // 3. Initialize cache
    await this._initializeCache()

    // 4. Initialize database connection
    await this._initializeDatabase()

    // 5. Set up middleware
    this._setupMiddleware()

    // 6. Load application components
    await this._loadModels()
    await this._loadControllers()
    await this._loadChannels()
    await this._loadJobs()
    await this._loadMailers()

    // 7. Load routes
    await this._loadRoutes()

    // 8. Run initializers
    await this._runInitializers()

    // 9. Initialize the broadcast manager
    await this._initializeWebSocket()

    // 11. Set up error reporting (Sentry)
    await this._initializeErrorReporting()

    this.initialized = true
    this.logger.info('Application initialized successfully')

    return this
  }

  /**
   * Start the HTTP server
   *
   * @param {Object} options - Server options
   * @param {number} [options.port] - Port to listen on (overrides config)
   * @param {string} [options.hostname] - Hostname to bind to (overrides config)
   * @returns {Promise<Application>} This application instance
   */
  async start(options = {}) {
    if (!this.initialized) {
      throw new Error('Application not initialized. Call initialize() first.')
    }

    if (this.running) {
      throw new Error('Application already running')
    }

    const port = options.port !== undefined ? options.port : this.config.get('server.port', 3000)
    const hostname = options.hostname !== undefined ? options.hostname : this.config.get('server.hostname', 'localhost')

    this.logger.info(`Starting server on ${hostname}:${port}...`)

    // Create the Bun server
    this.server = Bun.serve({
      port,
      hostname,
      development: isDevelopment(),

      // Main request handler
      fetch: async (request, server) => {
        return await this._handleRequest(request, server)
      },

      // WebSocket handler (if enabled)
      websocket: this._getWebSocketHandler(),

      // Error handler
      error: (error) => {
        return this._handleServerError(error)
      }
    })

    // Set up graceful shutdown handlers
    this._setupShutdownHandlers()

    this.running = true

    this.logger.info(`🚀 BunOnRails server running at http://${hostname}:${port}`)
    this.logger.info(`   Environment: ${getEnvironment()}`)

    if (isDevelopment()) {
      this.logger.info('   Press Ctrl+C to stop')
    }

    return this
  }

  /**
   * Graceful shutdown
   *
   * Closes all connections and stops the server cleanly.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      return
    }

    this.logger.info('Shutting down application...')

    // 1. Stop accepting new connections
    if (this.server) {
      this.server.stop()
      this.server = null
    }

    // 2. Close WebSocket connections
    await this._closeWebSockets()

    // 3. Close database connections
    await this._closeDatabase()

    // 4. Close Redis connections
    await this._closeRedis()

    this.running = false
    this.initialized = false

    this.logger.info('Application stopped')
  }

  // ==========================================
  // Private: Configuration
  // ==========================================

  /**
   * Refuse a config that names a backend the framework does not have, before
   * anything connects. Booting anyway hid it: cache.store 'redis' ran the
   * memory store, jobs.adapter 'bullmq' logged "Job queue initialized with
   * BullMQ" and queued nothing, websocket.enabled logged "WebSocket enabled"
   * with no upgrade path. Pinned by test/core/boot_backends.test.js.
   */
  _refuseUnbuiltBackends() {
    const store = this.config.get('cache.store', 'memory')
    if (store === 'redis') {
      throw new NotImplementedError("cache.store 'redis'", 'the Redis cache')
    }
    if (store !== 'memory') {
      throw new Error(`Unknown cache.store '${store}'. The built-in store is 'memory'.`)
    }

    const jobs = this.config.section('jobs')
    const adapter = jobs.adapter ?? 'memory'
    if (adapter === 'bullmq') {
      throw new NotImplementedError("jobs.adapter 'bullmq'", 'queued jobs')
    }
    if (adapter !== 'memory') {
      throw new Error(`Unknown jobs.adapter '${adapter}'. The built-in adapter is 'memory' (jobs run with performNow).`)
    }
    if (jobs.worker) {
      throw new NotImplementedError('jobs.worker', 'queued jobs')
    }

    if (this.config.section('websocket').enabled) {
      throw new NotImplementedError('websocket.enabled', 'WebSocket channels')
    }
  }

  async _loadConfiguration() {
    this.config = createConfig()
    this.config.setAppRoot(this.root)

    // Load config files from app
    try {
      await this.config.load({ root: this.root })
    } catch (error) {
      // Config directory might not exist yet
      this.logger.debug('No config directory found, using defaults')
    }

    // Apply overrides
    this.config.merge(this.configOverrides)

    this.logger.debug('Configuration loaded')
  }

  // ==========================================
  // Private: Redis
  // ==========================================

  async _initializeRedis() {
    const redisConfig = this.config.section('redis')

    // Skip if no Redis configured - requires explicit host or url
    if (!redisConfig.host && !redisConfig.url) {
      this.logger.debug('Redis not configured, skipping')
      return
    }

    // Skip if explicitly disabled
    if (redisConfig.enabled === false) {
      this.logger.debug('Redis disabled in config')
      return
    }

    try {
      const Redis = (await import('ioredis')).default

      const connectionConfig = redisConfig.url
        ? redisConfig.url
        : {
            host: redisConfig.host,
            port: redisConfig.port || 6379,
            db: redisConfig.db || 0,
            password: redisConfig.password || undefined,
            // Connection timeout
            connectTimeout: redisConfig.connectTimeout || 3000,
            // Don't retry forever
            retryStrategy: (times) => {
              if (times > 3) return null // Stop retrying after 3 attempts
              return Math.min(times * 100, 1000)
            },
            // Disable auto-reconnect for failed initial connection
            lazyConnect: true,
            // Connection settings for Dragonfly compatibility
            maxRetriesPerRequest: 1,
            enableReadyCheck: false
          }

      this.redis = new Redis(connectionConfig)

      // Handle error events during connection attempt
      this.redis.on('error', (error) => {
        // Log errors in development for debugging
        if (isDevelopment()) {
          this.logger.debug(`Redis error event: ${error.message}`)
        }
        // Error is also handled in the try/catch below
      })

      // Try to connect with timeout
      await this.redis.connect()
      await this.redis.ping()
      this.logger.info('Redis connected')
    } catch (error) {
      this.logger.warn(`Redis connection failed: ${error.message}`)
      if (this.redis) {
        try {
          this.redis.disconnect()
        } catch {
          // Ignore disconnect errors
        }
      }
      this.redis = null
    }
  }

  // ==========================================
  // Private: Cache
  // ==========================================

  async _initializeCache() {
    // cache.store is 'memory': _refuseUnbuiltBackends refused anything else
    this.cache = new Cache(new MemoryStore())
    this.logger.debug('Cache initialized with memory store')
  }

  // ==========================================
  // Private: Database
  // ==========================================

  async _initializeDatabase() {
    // config/database.js holds one config, or one per environment
    const dbConfig = selectDatabaseConfig(this.config.section('database'), getEnvironment())

    if (!dbConfig) {
      this.logger.debug('No database configured (config/database.js), skipping')
      return
    }

    // Connect now and fail boot if it does not work: a running app whose
    // every query fails is worse than one that will not start.
    const connection = new Connection(dbConfig)
    try {
      await connection.connect()
    } catch (error) {
      throw new Error(`Cannot connect to the database configured in config/database.js: ${error.message}`, { cause: error })
    }
    setConnection(connection)
    this.database = connection
    this.logger.info(`Connected to the database (${connection.adapterType} driver)`)
  }

  async _closeDatabase() {
    if (this.database) {
      await this.database.disconnect()
      if (getConnection() === this.database) {
        setConnection(null)
      }
      this.database = null
    }
  }

  // ==========================================
  // Private: Middleware
  // ==========================================

  _setupMiddleware() {
    // Core middleware in order - invoke factory functions to create middleware instances
    this.middleware.use(Middleware.errorHandler())
    this.middleware.use(Middleware.logger())
    this.middleware.use(Middleware.bodyParser())

    // Session middleware - only add if session store is configured
    const sessionConfig = this.config.section('session')
    if (sessionConfig.enabled !== false) {
      this.middleware.use(Middleware.session(sessionConfig))
    }

    // CSRF protection for mutations
    if (this.config.get('security.csrf', true)) {
      this.middleware.use(Middleware.csrf())
    }

    // CORS if configured
    const corsConfig = this.config.section('cors')
    if (corsConfig.enabled) {
      this.middleware.use(Middleware.cors(corsConfig))
    }

    this.logger.debug('Middleware configured')
  }

  // ==========================================
  // Private: Load Application Components
  // ==========================================

  async _loadModels() {
    const modelsDir = join(this.root, 'app', 'models')
    await this._loadComponents(modelsDir, this.models, 'model')
  }

  async _loadControllers() {
    const controllersDir = join(this.root, 'app', 'controllers')
    await this._loadComponents(controllersDir, this.controllers, 'controller')
  }

  async _loadChannels() {
    const channelsDir = join(this.root, 'app', 'channels')
    await this._loadComponents(channelsDir, this.channels, 'channel')
  }

  async _loadJobs() {
    const jobsDir = join(this.root, 'app', 'jobs')
    await this._loadComponents(jobsDir, this.jobClasses, 'job')
  }

  async _loadMailers() {
    const mailersDir = join(this.root, 'app', 'mailers')
    await this._loadComponents(mailersDir, this.mailers, 'mailer')
  }

  async _loadComponents(dir, map, type) {
    try {
      const { Glob } = await import('bun')
      const glob = new Glob('**/*.js')

      for await (const file of glob.scan({ cwd: dir, absolute: true })) {
        try {
          const module = await import(file)
          const Component = module.default || Object.values(module)[0]

          if (Component && typeof Component === 'function') {
            const name = this._getComponentName(file, dir)
            map.set(name, Component)
            this.logger.debug(`Loaded ${type}: ${name}`)
          }
        } catch (error) {
          this.logger.warn(`Failed to load ${type} from ${file}: ${error.message}`)
        }
      }
    } catch (error) {
      // Directory doesn't exist, skip silently
      this.logger.debug(`No ${type}s directory found`)
    }
  }

  _getComponentName(filePath, baseDir) {
    // Convert file path to component name
    // e.g., /app/controllers/users_controller.js -> users
    // e.g., /app/controllers/admin/users_controller.js -> admin/users
    const relativePath = filePath.replace(baseDir + '/', '').replace('.js', '')
    return relativePath.replace(/_controller$|_job$|_mailer$|_channel$/, '')
  }

  // ==========================================
  // Private: Routes
  // ==========================================

  async _loadRoutes() {
    this.router = new Router()

    const routesFile = join(this.root, 'config', 'routes.js')

    try {
      const routesModule = await import(routesFile)
      const routesConfig = routesModule.default || routesModule

      if (typeof routesConfig === 'function') {
        routesConfig(this.router)
      }

      this.logger.debug(`Loaded ${this.router.routes.length} routes`)
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') {
        throw error
      }
      this.logger.debug('No routes.js found')
    }
  }

  // ==========================================
  // Private: Initializers
  // ==========================================

  async _runInitializers() {
    const initializersDir = join(this.root, 'config', 'initializers')

    // A missing directory is the one case to tolerate. Any failure inside an
    // initializer fails boot: the database guide connects in one, and a
    // swallowed error left an app that booted and answered 500 to every query.
    if (!existsSync(initializersDir)) {
      this.logger.debug('No initializers directory found')
      return
    }

    const { Glob } = await import('bun')
    const files = []
    for await (const file of new Glob('*.js').scan({ cwd: initializersDir, absolute: true })) {
      files.push(file)
    }
    files.sort()

    for (const file of files) {
      const name = file.split('/').pop()
      try {
        const module = await import(file)
        const initializer = module.default || module

        if (typeof initializer === 'function') {
          await initializer(this)
          this.logger.debug(`Ran initializer: ${name}`)
        }
      } catch (error) {
        throw new Error(`Initializer config/initializers/${name} failed: ${error.message}`, { cause: error })
      }
    }
  }

  // ==========================================
  // Private: WebSocket
  // ==========================================

  async _initializeWebSocket() {
    // Always initialize broadcast manager (it works without WebSocket too)
    this.broadcastManager = new BroadcastManager()
    await this.broadcastManager.initialize({
      redis: this.redis,
      logger: this.logger
    })

    // websocket.enabled is refused by _refuseUnbuiltBackends until channels land
    this.logger.debug('Broadcast manager ready for HTTP-only use')
  }

  _getWebSocketHandler() {
    const wsConfig = this.config.section('websocket')

    if (!wsConfig.enabled) {
      return undefined
    }

    return {
      open: (ws) => {
        this._handleWebSocketOpen(ws)
      },
      message: (ws, message) => {
        this._handleWebSocketMessage(ws, message)
      },
      close: (ws) => {
        this._handleWebSocketClose(ws)
      }
    }
  }

  _handleWebSocketOpen(ws) {
    // Generate connection ID
    const connectionId = crypto.randomUUID()
    ws.data = { id: connectionId, subscriptions: new Map() }

    // Register with broadcast manager
    if (this.broadcastManager) {
      this.broadcastManager.addConnection(connectionId, ws)
    }

    this.logger.debug(`WebSocket connected: ${connectionId}`)
  }

  async _handleWebSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message)
      const { command, channel, ...payload } = data

      switch (command) {
        case 'subscribe':
          await this._subscribeToChannel(ws, channel, payload)
          break
        case 'unsubscribe':
          await this._unsubscribeFromChannel(ws, channel)
          break
        case 'message':
          await this._routeToChannel(ws, channel, payload)
          break
      }
    } catch (error) {
      this.logger.error(`WebSocket message error: ${error.message}`)
      ws.send(JSON.stringify({ error: 'Invalid message format' }))
    }
  }

  async _subscribeToChannel(ws, channelName, params) {
    const ChannelClass = this.channels.get(channelName)

    if (!ChannelClass) {
      ws.send(JSON.stringify({ error: `Unknown channel: ${channelName}` }))
      return
    }

    const channel = new ChannelClass(ws, params)
    await channel.subscribed()
    ws.data.subscriptions.set(channelName, channel)

    ws.send(JSON.stringify({ type: 'subscription_confirmed', channel: channelName }))
  }

  async _unsubscribeFromChannel(ws, channelName) {
    const channel = ws.data.subscriptions.get(channelName)

    if (channel) {
      await channel.unsubscribed()
      ws.data.subscriptions.delete(channelName)
    }
  }

  async _routeToChannel(ws, channelName, data) {
    const channel = ws.data.subscriptions.get(channelName)

    if (channel) {
      await channel.receive(data)
    }
  }

  _handleWebSocketClose(ws) {
    // Clean up subscriptions
    for (const [, channel] of ws.data.subscriptions) {
      channel.unsubscribed().catch(() => {})
    }
    ws.data.subscriptions.clear()

    // Remove from broadcast manager
    if (this.broadcastManager) {
      this.broadcastManager.removeConnection(ws.data.id)
    }

    this.logger.debug(`WebSocket disconnected: ${ws.data.id}`)
  }

  async _closeWebSockets() {
    // Shutdown broadcast manager
    if (this.broadcastManager) {
      await this.broadcastManager.shutdown()
      this.broadcastManager = null
    }

    // Bun handles WebSocket close automatically when server stops
    this.logger.debug('WebSocket connections closed')
  }

  // ==========================================
  // Private: Error Reporting
  // ==========================================

  async _initializeErrorReporting() {
    const sentryDsn = this.config.get('sentry.dsn')

    if (!sentryDsn) {
      return
    }

    try {
      const Sentry = await import('@sentry/bun')

      Sentry.init({
        dsn: sentryDsn,
        environment: getEnvironment(),
        release: this.config.get('app.version'),
        tracesSampleRate: isProduction() ? 0.1 : 1.0
      })

      this.sentry = Sentry
      this.logger.info('Sentry error reporting enabled')
    } catch (error) {
      this.logger.warn(`Sentry initialization failed: ${error.message}`)
    }
  }

  // ==========================================
  // Private: Redis cleanup
  // ==========================================

  async _closeRedis() {
    if (this.redis) {
      await this.redis.quit()
      this.redis = null
    }
  }

  // ==========================================
  // Private: Request Handling
  // ==========================================

  async _handleRequest(request, server) {
    const startTime = performance.now()
    const url = new URL(request.url)

    try {
      // Match route
      const match = this._matchRoute(request.method, url.pathname)

      if (!match) {
        return this._notFound()
      }

      // Build context
      const context = await this._buildContext(request, match, server)

      // Run through middleware and execute controller action
      const response = await this.middleware.run(context, async (ctx) => {
        return await this._executeAction(ctx, match)
      })

      // Log request
      const duration = (performance.now() - startTime).toFixed(2)
      this.logger.info(`${request.method} ${url.pathname} ${response.status} ${duration}ms`)

      return response
    } catch (error) {
      return this._handleRequestError(error, request)
    }
  }

  _matchRoute(method, path) {
    for (const route of this.router.routes) {
      if (route.method !== method) continue

      const match = this._matchPath(route.path, path)
      if (match) {
        return { route, params: match }
      }
    }
    return null
  }

  _matchPath(pattern, path) {
    // Convert route pattern to regex
    // e.g., /posts/:id -> /posts/([^/]+)
    const parts = pattern.split('/')
    const pathParts = path.split('/')

    if (parts.length !== pathParts.length) return null

    const params = {}

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const pathPart = pathParts[i]

      if (part.startsWith(':')) {
        params[part.slice(1)] = pathPart
      } else if (part !== pathPart) {
        return null
      }
    }

    return params
  }

  async _buildContext(request, match, server) {
    const url = new URL(request.url)

    // Parse body
    let body = {}
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        try {
          body = await request.json()
        } catch {
          body = {}
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData()
        body = Object.fromEntries(formData)
      }
    }

    // Merge params
    const params = {
      ...match.params,
      ...Object.fromEntries(url.searchParams),
      ...body
    }

    return new ControllerContext({
      request,
      params,
      session: {}, // Will be populated by session middleware
      currentUser: null, // Will be populated by auth middleware
      http: { request, server },
      cache: this.cache,
      temp: new Map(),
      db: this.database,
      broadcastManager: this.broadcastManager
    })
  }

  async _executeAction(context, match) {
    const { route } = match
    const ControllerClass = this.controllers.get(route.controller)

    if (!ControllerClass) {
      this.logger.error(`Controller not found: ${route.controller}`)
      return this._notFound()
    }

    const controller = new ControllerClass(context)
    const action = controller[route.action]

    if (!action || typeof action !== 'function') {
      this.logger.error(`Action not found: ${route.controller}#${route.action}`)
      return this._notFound()
    }

    // Filters run through ControllerMiddleware: list or object form, with
    // only / except / if / unless; a before filter's Response halts the action
    const halted = await ControllerMiddleware.runBeforeFilters(controller, ControllerClass, route.action)
    if (halted) {
      return halted
    }

    const response = await action.call(controller)

    await ControllerMiddleware.runAfterFilters(controller, ControllerClass, route.action, response)

    return response
  }

  _notFound() {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  _handleRequestError(error, request) {
    this.logger.error(`Request error: ${error.message}`)

    // Report to Sentry
    if (this.sentry) {
      this.sentry.captureException(error, {
        extra: {
          url: request.url,
          method: request.method
        }
      })
    }

    const status = error.status || 500
    const message = isProduction() ? 'Internal Server Error' : error.message

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  _handleServerError(error) {
    this.logger.error(`Server error: ${error.message}`)

    // Report to Sentry
    if (this.sentry) {
      this.sentry.captureException(error)
    }

    return new Response('Internal Server Error', { status: 500 })
  }

  // ==========================================
  // Private: Shutdown
  // ==========================================

  _setupShutdownHandlers() {
    const shutdown = async () => {
      this.logger.info('Received shutdown signal')
      await this.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  }

  // ==========================================
  // Private: Logger
  // ==========================================

  _createLogger() {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    const configLevel = this.configOverrides?.logging?.level || 'info'
    const currentLevel = levels[configLevel] || 1

    const log = (level, message) => {
      if (levels[level] >= currentLevel) {
        const timestamp = new Date().toISOString()
        const prefix = level.toUpperCase().padEnd(5)
        console.log(`[${timestamp}] ${prefix} ${message}`)
      }
    }

    return {
      debug: (msg) => log('debug', msg),
      info: (msg) => log('info', msg),
      warn: (msg) => log('warn', msg),
      error: (msg) => log('error', msg)
    }
  }
}

/**
 * Create and initialize an application
 *
 * @param {Object} options - Application options
 * @returns {Promise<Application>}
 *
 * @example
 * const app = await createApplication({ root: __dirname })
 * await app.start()
 */
export async function createApplication(options = {}) {
  const app = new Application(options)
  await app.initialize()
  return app
}

// Export for convenience
export default Application
