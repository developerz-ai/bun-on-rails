/**
 * Application Tests
 *
 * Unit and integration tests for the Application bootstrap
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { Application, createApplication } from '../src/application.js'
import { Controller } from '../src/controller/base.js'
import { join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

// Test fixtures directory
const fixturesDir = join(import.meta.dir, 'fixtures', 'test-app')

describe('Application', () => {
  describe('constructor', () => {
    test('creates application with default options', () => {
      const app = new Application()

      expect(app.root).toBe(process.cwd())
      expect(app.initialized).toBe(false)
      expect(app.running).toBe(false)
      expect(app.config).toBeNull()
      expect(app.router).toBeNull()
    })

    test('creates application with custom root', () => {
      const app = new Application({ root: '/custom/path' })

      expect(app.root).toBe('/custom/path')
    })

    test('creates application with config overrides', () => {
      const app = new Application({
        config: { server: { port: 4000 } }
      })

      expect(app.configOverrides.server.port).toBe(4000)
    })

    test('initializes component maps', () => {
      const app = new Application()

      expect(app.models).toBeInstanceOf(Map)
      expect(app.controllers).toBeInstanceOf(Map)
      expect(app.channels).toBeInstanceOf(Map)
      expect(app.jobClasses).toBeInstanceOf(Map)
      expect(app.mailers).toBeInstanceOf(Map)
    })

    test('creates logger', () => {
      const app = new Application()

      expect(app.logger).toBeDefined()
      expect(typeof app.logger.info).toBe('function')
      expect(typeof app.logger.error).toBe('function')
      expect(typeof app.logger.warn).toBe('function')
      expect(typeof app.logger.debug).toBe('function')
    })
  })

  describe('initialize()', () => {
    let app

    beforeEach(() => {
      app = new Application({
        config: { logging: { level: 'error' } } // Suppress logs in tests
      })
    })

    test('sets initialized flag to true', async () => {
      await app.initialize()

      expect(app.initialized).toBe(true)
    })

    test('throws if already initialized', async () => {
      await app.initialize()

      expect(async () => {
        await app.initialize()
      }).toThrow('Application already initialized')
    })

    test('loads configuration', async () => {
      await app.initialize()

      expect(app.config).toBeDefined()
      expect(app.config.get).toBeDefined()
    })

    test('initializes cache with memory store by default', async () => {
      await app.initialize()

      expect(app.cache).toBeDefined()
      expect(typeof app.cache.get).toBe('function')
      expect(typeof app.cache.set).toBe('function')
    })

    test('creates router', async () => {
      await app.initialize()

      expect(app.router).toBeDefined()
      expect(app.router.routes).toBeDefined()
    })

    test('returns application instance', async () => {
      const result = await app.initialize()

      expect(result).toBe(app)
    })
  })

  describe('start()', () => {
    let app

    beforeEach(async () => {
      app = new Application({
        config: {
          logging: { level: 'error' },
          server: { port: 0, hostname: 'localhost' } // Port 0 = random available port
        }
      })
    })

    afterEach(async () => {
      if (app.running) {
        await app.stop()
      }
    })

    test('throws if not initialized', async () => {
      expect(async () => {
        await app.start()
      }).toThrow('Application not initialized')
    })

    test('starts Bun.serve', async () => {
      await app.initialize()
      await app.start({ port: 0 })

      expect(app.running).toBe(true)
      expect(app.server).toBeDefined()
    })

    test('throws if already running', async () => {
      await app.initialize()
      await app.start({ port: 0 })

      expect(async () => {
        await app.start()
      }).toThrow('Application already running')
    })

    test('uses config port by default', async () => {
      app = new Application({
        config: {
          logging: { level: 'error' },
          server: { port: 0 }
        }
      })

      await app.initialize()
      await app.start()

      expect(app.server).toBeDefined()
    })

    test('returns application instance', async () => {
      await app.initialize()
      const result = await app.start({ port: 0 })

      expect(result).toBe(app)
    })
  })

  describe('stop()', () => {
    let app

    beforeEach(async () => {
      app = new Application({
        config: { logging: { level: 'error' } }
      })
    })

    test('does nothing if not running', async () => {
      await app.stop() // Should not throw
    })

    test('stops server', async () => {
      await app.initialize()
      await app.start({ port: 0 })
      await app.stop()

      expect(app.running).toBe(false)
      expect(app.server).toBeNull()
    })

    test('resets initialized flag', async () => {
      await app.initialize()
      await app.start({ port: 0 })
      await app.stop()

      expect(app.initialized).toBe(false)
    })
  })

  describe('request handling', () => {
    let app
    let baseUrl

    beforeEach(async () => {
      // Create a test app with a controller
      app = new Application({
        config: { logging: { level: 'error' } }
      })

      await app.initialize()

      // Manually register a controller for testing
      class TestController extends Controller {
        async index() {
          return this.render({ message: 'Hello from test!' })
        }

        async show() {
          return this.render({ id: this.params.id })
        }

        async create() {
          return this.render({ received: this.params }, { status: 201 })
        }
      }

      app.controllers.set('test', TestController)

      // Add routes
      app.router.get('/test', 'test#index')
      app.router.get('/test/:id', 'test#show')
      app.router.post('/test', 'test#create')

      await app.start({ port: 0 })
      baseUrl = `http://localhost:${app.server.port}`
    })

    afterEach(async () => {
      await app.stop()
    })

    test('handles GET request', async () => {
      const response = await fetch(`${baseUrl}/test`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Hello from test!')
    })

    test('handles route params', async () => {
      const response = await fetch(`${baseUrl}/test/123`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe('123')
    })

    test('handles POST with JSON body', async () => {
      const response = await fetch(`${baseUrl}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', value: 42 })
      })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.received.name).toBe('Test')
      expect(data.received.value).toBe(42)
    })

    test('returns 404 for unknown routes', async () => {
      const response = await fetch(`${baseUrl}/unknown`)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Not Found')
    })
  })

  describe('route matching', () => {
    let app

    beforeEach(async () => {
      app = new Application({
        config: { logging: { level: 'error' } }
      })
      await app.initialize()
    })

    test('matches exact paths', () => {
      app.router.get('/users', 'users#index')

      const match = app._matchRoute('GET', '/users')

      expect(match).not.toBeNull()
      expect(match.route.controller).toBe('users')
      expect(match.route.action).toBe('index')
    })

    test('matches paths with params', () => {
      app.router.get('/users/:id', 'users#show')

      const match = app._matchRoute('GET', '/users/123')

      expect(match).not.toBeNull()
      expect(match.params.id).toBe('123')
    })

    test('matches paths with multiple params', () => {
      app.router.get('/users/:userId/posts/:postId', 'posts#show')

      const match = app._matchRoute('GET', '/users/5/posts/10')

      expect(match).not.toBeNull()
      expect(match.params.userId).toBe('5')
      expect(match.params.postId).toBe('10')
    })

    test('returns null for non-matching paths', () => {
      app.router.get('/users', 'users#index')

      const match = app._matchRoute('GET', '/posts')

      expect(match).toBeNull()
    })

    test('returns null for non-matching methods', () => {
      app.router.get('/users', 'users#index')

      const match = app._matchRoute('POST', '/users')

      expect(match).toBeNull()
    })
  })

  describe('cache integration', () => {
    let app

    beforeEach(async () => {
      app = new Application({
        config: { logging: { level: 'error' } }
      })
      await app.initialize()
    })

    test('cache can set and get values', async () => {
      await app.cache.set('test-key', { data: 'value' })
      const result = await app.cache.get('test-key')

      expect(result.data).toBe('value')
    })

    test('cache fetch returns cached value', async () => {
      let called = 0

      const result1 = await app.cache.fetch('counter', async () => {
        called++
        return 'computed'
      })

      const result2 = await app.cache.fetch('counter', async () => {
        called++
        return 'computed again'
      })

      expect(called).toBe(1)
      expect(result1).toBe('computed')
      expect(result2).toBe('computed')
    })
  })

  describe('middleware', () => {
    let app

    beforeEach(async () => {
      app = new Application({
        config: { logging: { level: 'error' } }
      })
      await app.initialize()
    })

    test('middleware stack is initialized', () => {
      expect(app.middleware).toBeDefined()
      expect(typeof app.middleware.use).toBe('function')
      expect(typeof app.middleware.run).toBe('function')
    })
  })

  describe('_matchPath', () => {
    let app

    beforeEach(() => {
      app = new Application()
    })

    test('matches simple paths', () => {
      const result = app._matchPath('/users', '/users')
      expect(result).toEqual({})
    })

    test('extracts single param', () => {
      const result = app._matchPath('/users/:id', '/users/42')
      expect(result).toEqual({ id: '42' })
    })

    test('extracts multiple params', () => {
      const result = app._matchPath('/users/:userId/posts/:postId', '/users/1/posts/2')
      expect(result).toEqual({ userId: '1', postId: '2' })
    })

    test('returns null for different path lengths', () => {
      const result = app._matchPath('/users/:id', '/users/1/extra')
      expect(result).toBeNull()
    })

    test('returns null for non-matching segments', () => {
      const result = app._matchPath('/users/:id', '/posts/1')
      expect(result).toBeNull()
    })
  })

  describe('before/after action filters', () => {
    test('before filter can block request and allows with valid params', async () => {
      const app = new Application({
        config: { logging: { level: 'error' } }
      })

      await app.initialize()

      // Controller with filters
      class FilterController extends Controller {
        static beforeAction = ['authenticate']

        async authenticate() {
          if (this.params.token === 'valid') {
            return // Continue
          }
          return this.unauthorized('Invalid token')
        }

        async index() {
          return this.render({ success: true })
        }
      }

      app.controllers.set('filter', FilterController)
      app.router.get('/filter', 'filter#index')

      await app.start({ port: 0 })
      const baseUrl = `http://localhost:${app.server.port}`

      try {
        // Test blocked request
        const response1 = await fetch(`${baseUrl}/filter`)
        const data1 = await response1.json()
        expect(response1.status).toBe(401)
        expect(data1.error).toBe('Invalid token')

        // Test allowed request
        const response2 = await fetch(`${baseUrl}/filter?token=valid`)
        const data2 = await response2.json()
        expect(response2.status).toBe(200)
        expect(data2.success).toBe(true)
      } finally {
        await app.stop()
      }
    })
  })
})

describe('createApplication', () => {
  test('creates and initializes application', async () => {
    const app = await createApplication({
      config: { logging: { level: 'error' } }
    })

    expect(app).toBeInstanceOf(Application)
    expect(app.initialized).toBe(true)
  })
})
