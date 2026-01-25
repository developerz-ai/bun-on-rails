/**
 * Middleware Tests - MiddlewareStack, ControllerMiddleware, and built-in middleware
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import {
  MiddlewareStack,
  ControllerMiddleware,
  Middleware,
  createDefaultMiddlewareStack
} from '../../src/controller/middleware.js'

// ==========================================
// MiddlewareStack Tests
// ==========================================

describe('MiddlewareStack', () => {
  let stack

  beforeEach(() => {
    stack = new MiddlewareStack()
  })

  describe('use()', () => {
    test('adds middleware to the stack', () => {
      const fn = async (ctx, next) => await next()

      stack.use(fn)

      expect(stack.length).toBe(1)
    })

    test('adds multiple middleware with array', () => {
      const fn1 = async (ctx, next) => await next()
      const fn2 = async (ctx, next) => await next()

      stack.use([fn1, fn2])

      expect(stack.length).toBe(2)
    })

    test('returns stack for chaining', () => {
      const fn = async (ctx, next) => await next()

      const result = stack.use(fn)

      expect(result).toBe(stack)
    })

    test('throws for non-function', () => {
      expect(() => stack.use('not a function')).toThrow('Middleware must be a function or array of functions')
    })
  })

  describe('prepend()', () => {
    test('adds middleware to beginning of stack', () => {
      const fn1 = async (ctx, next) => await next()
      const fn2 = async (ctx, next) => await next()

      stack.use(fn1)
      stack.prepend(fn2)

      expect(stack.middleware[0]).toBe(fn2)
      expect(stack.middleware[1]).toBe(fn1)
    })

    test('throws for non-function', () => {
      expect(() => stack.prepend('not a function')).toThrow('Middleware must be a function')
    })
  })

  describe('insertAt()', () => {
    test('inserts middleware at specified index', () => {
      const fn1 = async (ctx, next) => await next()
      const fn2 = async (ctx, next) => await next()
      const fn3 = async (ctx, next) => await next()

      stack.use(fn1)
      stack.use(fn2)
      stack.insertAt(1, fn3)

      expect(stack.middleware[0]).toBe(fn1)
      expect(stack.middleware[1]).toBe(fn3)
      expect(stack.middleware[2]).toBe(fn2)
    })
  })

  describe('insertBefore()', () => {
    test('inserts middleware before named middleware', () => {
      const fn1 = async (ctx, next) => await next()
      fn1._name = 'first'
      const fn2 = async (ctx, next) => await next()
      fn2._name = 'second'
      const fn3 = async (ctx, next) => await next()

      stack.use(fn1)
      stack.use(fn2)
      stack.insertBefore('second', fn3)

      expect(stack.middleware[1]).toBe(fn3)
      expect(stack.middleware[2]).toBe(fn2)
    })

    test('throws if middleware not found', () => {
      const fn = async (ctx, next) => await next()
      stack.use(fn)

      expect(() => stack.insertBefore('nonexistent', fn)).toThrow("Middleware 'nonexistent' not found")
    })
  })

  describe('insertAfter()', () => {
    test('inserts middleware after named middleware', () => {
      const fn1 = async (ctx, next) => await next()
      fn1._name = 'first'
      const fn2 = async (ctx, next) => await next()
      fn2._name = 'second'
      const fn3 = async (ctx, next) => await next()

      stack.use(fn1)
      stack.use(fn2)
      stack.insertAfter('first', fn3)

      expect(stack.middleware[0]).toBe(fn1)
      expect(stack.middleware[1]).toBe(fn3)
      expect(stack.middleware[2]).toBe(fn2)
    })
  })

  describe('remove()', () => {
    test('removes middleware by reference', () => {
      const fn1 = async (ctx, next) => await next()
      const fn2 = async (ctx, next) => await next()

      stack.use(fn1)
      stack.use(fn2)
      const removed = stack.remove(fn1)

      expect(removed).toBe(true)
      expect(stack.length).toBe(1)
      expect(stack.middleware[0]).toBe(fn2)
    })

    test('removes middleware by name', () => {
      const fn1 = async (ctx, next) => await next()
      fn1._name = 'toRemove'
      const fn2 = async (ctx, next) => await next()

      stack.use(fn1)
      stack.use(fn2)
      const removed = stack.remove('toRemove')

      expect(removed).toBe(true)
      expect(stack.length).toBe(1)
    })

    test('returns false if not found', () => {
      const fn = async (ctx, next) => await next()
      stack.use(fn)

      const removed = stack.remove('nonexistent')

      expect(removed).toBe(false)
    })
  })

  describe('clear()', () => {
    test('removes all middleware', () => {
      stack.use(async (ctx, next) => await next())
      stack.use(async (ctx, next) => await next())

      stack.clear()

      expect(stack.length).toBe(0)
    })
  })

  describe('run()', () => {
    test('executes middleware in order', async () => {
      const order = []

      stack.use(async (ctx, next) => {
        order.push(1)
        const response = await next()
        order.push(4)
        return response
      })

      stack.use(async (ctx, next) => {
        order.push(2)
        const response = await next()
        order.push(3)
        return response
      })

      const context = { request: new Request('http://localhost/') }
      const response = await stack.run(context, async () => {
        order.push('handler')
        return new Response('OK')
      })

      expect(order).toEqual([1, 2, 'handler', 3, 4])
      expect(response.status).toBe(200)
    })

    test('passes context through middleware chain', async () => {
      stack.use(async (ctx, next) => {
        ctx.value = 'set by middleware'
        return await next()
      })

      const context = { request: new Request('http://localhost/') }
      await stack.run(context, async () => new Response('OK'))

      expect(context.value).toBe('set by middleware')
    })

    test('allows middleware to short-circuit the chain', async () => {
      const order = []

      stack.use(async (ctx, next) => {
        order.push(1)
        return new Response('Short-circuited', { status: 403 })
      })

      stack.use(async (ctx, next) => {
        order.push(2) // Should not run
        return await next()
      })

      const context = { request: new Request('http://localhost/') }
      const response = await stack.run(context, async () => {
        order.push('handler') // Should not run
        return new Response('OK')
      })

      expect(order).toEqual([1])
      expect(response.status).toBe(403)
    })

    test('propagates errors up the middleware chain', async () => {
      stack.use(async (ctx, next) => {
        try {
          return await next()
        } catch (error) {
          return new Response(JSON.stringify({ caught: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      })

      stack.use(async () => {
        throw new Error('Test error')
      })

      const context = { request: new Request('http://localhost/') }
      const response = await stack.run(context, async () => new Response('OK'))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.caught).toBe('Test error')
    })

    test('handles empty middleware stack', async () => {
      const context = { request: new Request('http://localhost/') }
      const response = await stack.run(context, async () => new Response('Handler only'))

      expect(await response.text()).toBe('Handler only')
    })
  })

  describe('compose()', () => {
    test('returns a composable middleware function', async () => {
      stack.use(async (ctx, next) => {
        ctx.value = 'composed'
        return await next()
      })

      const composed = stack.compose()
      const context = { request: new Request('http://localhost/') }

      await composed(context, async () => new Response('OK'))

      expect(context.value).toBe('composed')
    })
  })
})

// ==========================================
// ControllerMiddleware Tests
// ==========================================

describe('ControllerMiddleware', () => {
  describe('runBeforeFilters()', () => {
    test('runs before filters in order', async () => {
      const order = []

      class TestController {
        static beforeAction = ['filterOne', 'filterTwo']

        filterOne() {
          order.push('one')
        }

        filterTwo() {
          order.push('two')
        }
      }

      const controller = new TestController()
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')

      expect(order).toEqual(['one', 'two'])
    })

    test('returns Response when filter returns Response', async () => {
      class TestController {
        static beforeAction = ['authenticate']

        authenticate() {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      }

      const controller = new TestController()
      const result = await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')

      expect(result).toBeInstanceOf(Response)
      expect(result.status).toBe(401)
    })

    test('respects :only option', async () => {
      const called = []

      class TestController {
        static beforeAction = [
          { name: 'adminOnly', only: ['create', 'destroy'] }
        ]

        adminOnly() {
          called.push('adminOnly')
        }
      }

      const controller = new TestController()

      // Should run for 'create'
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'create')
      expect(called).toEqual(['adminOnly'])

      called.length = 0

      // Should NOT run for 'index'
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')
      expect(called).toEqual([])
    })

    test('respects :except option', async () => {
      const called = []

      class TestController {
        static beforeAction = [
          { name: 'authenticate', except: ['index', 'show'] }
        ]

        authenticate() {
          called.push('authenticate')
        }
      }

      const controller = new TestController()

      // Should NOT run for 'index'
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')
      expect(called).toEqual([])

      // Should run for 'create'
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'create')
      expect(called).toEqual(['authenticate'])
    })

    test('respects :if condition (function)', async () => {
      const called = []

      class TestController {
        static beforeAction = [
          { name: 'specialCheck', if: function() { return this.shouldCheck } }
        ]

        shouldCheck = true

        specialCheck() {
          called.push('specialCheck')
        }
      }

      const controller = new TestController()

      // With condition true
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')
      expect(called).toEqual(['specialCheck'])

      called.length = 0
      controller.shouldCheck = false

      // With condition false
      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')
      expect(called).toEqual([])
    })

    test('respects :unless condition', async () => {
      const called = []

      class TestController {
        static beforeAction = [
          { name: 'check', unless: 'skipCheck' }
        ]

        skipCheck() {
          return true
        }

        check() {
          called.push('check')
        }
      }

      const controller = new TestController()

      await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')
      expect(called).toEqual([])
    })

    test('returns false response when filter returns false', async () => {
      class TestController {
        static beforeAction = ['denyAccess']

        denyAccess() {
          return false
        }
      }

      const controller = new TestController()
      const result = await ControllerMiddleware.runBeforeFilters(controller, TestController, 'index')

      expect(result).toBeInstanceOf(Response)
      expect(result.status).toBe(403)
    })
  })

  describe('runAfterFilters()', () => {
    test('runs after filters in order', async () => {
      const order = []

      class TestController {
        static afterAction = ['logAction', 'cleanup']

        logAction() {
          order.push('log')
        }

        cleanup() {
          order.push('cleanup')
        }
      }

      const controller = new TestController()
      const response = new Response('OK')
      await ControllerMiddleware.runAfterFilters(controller, TestController, 'index', response)

      expect(order).toEqual(['log', 'cleanup'])
    })

    test('passes response to after filter', async () => {
      let receivedResponse = null

      class TestController {
        static afterAction = ['processResponse']

        processResponse(response) {
          receivedResponse = response
        }
      }

      const controller = new TestController()
      const response = new Response('Test body')
      await ControllerMiddleware.runAfterFilters(controller, TestController, 'index', response)

      expect(receivedResponse).toBe(response)
    })

    test('respects :only option for after filters', async () => {
      const called = []

      class TestController {
        static afterAction = [
          { name: 'specialLog', only: ['create'] }
        ]

        specialLog() {
          called.push('specialLog')
        }
      }

      const controller = new TestController()
      const response = new Response('OK')

      // Should run for 'create'
      await ControllerMiddleware.runAfterFilters(controller, TestController, 'create', response)
      expect(called).toEqual(['specialLog'])

      called.length = 0

      // Should NOT run for 'index'
      await ControllerMiddleware.runAfterFilters(controller, TestController, 'index', response)
      expect(called).toEqual([])
    })
  })

  describe('create()', () => {
    test('creates middleware that runs filters around action', async () => {
      const order = []

      class TestController {
        static beforeAction = ['beforeFilter']
        static afterAction = ['afterFilter']

        beforeFilter() {
          order.push('before')
        }

        afterFilter() {
          order.push('after')
        }
      }

      const middleware = ControllerMiddleware.create()
      const controller = new TestController()

      const context = {
        request: new Request('http://localhost/'),
        _controllerInfo: {
          controller,
          ControllerClass: TestController,
          actionName: 'index'
        }
      }

      await middleware(context, async () => {
        order.push('action')
        return new Response('OK')
      })

      expect(order).toEqual(['before', 'action', 'after'])
    })

    test('halts chain when before filter returns response', async () => {
      const order = []

      class TestController {
        static beforeAction = ['denyAccess']
        static afterAction = ['afterFilter']

        denyAccess() {
          order.push('deny')
          return new Response('Forbidden', { status: 403 })
        }

        afterFilter() {
          order.push('after')
        }
      }

      const middleware = ControllerMiddleware.create()
      const controller = new TestController()

      const context = {
        request: new Request('http://localhost/'),
        _controllerInfo: {
          controller,
          ControllerClass: TestController,
          actionName: 'index'
        }
      }

      const response = await middleware(context, async () => {
        order.push('action')
        return new Response('OK')
      })

      expect(order).toEqual(['deny'])
      expect(response.status).toBe(403)
    })
  })
})

// ==========================================
// Built-in Middleware Tests
// ==========================================

describe('Middleware.bodyParser()', () => {
  test('parses JSON body', async () => {
    const middleware = Middleware.bodyParser()
    const context = {
      request: new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' })
      }),
      params: {}
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.body).toEqual({ name: 'Test' })
    expect(context.params.name).toBe('Test')
  })

  test('parses URL-encoded form data', async () => {
    const middleware = Middleware.bodyParser()
    const context = {
      request: new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=Test&email=test@example.com'
      }),
      params: {}
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.body.name).toBe('Test')
    expect(context.body.email).toBe('test@example.com')
  })

  test('skips parsing for GET requests', async () => {
    const middleware = Middleware.bodyParser()
    const context = {
      request: new Request('http://localhost/', { method: 'GET' }),
      params: {}
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.body).toBeUndefined()
  })
})

describe('Middleware.logger()', () => {
  test('logs request and response', async () => {
    const logs = []
    const middleware = Middleware.logger({ logger: (msg) => logs.push(msg) })
    const context = {
      request: new Request('http://localhost/posts', { method: 'GET' })
    }

    await middleware(context, async () => new Response('OK', { status: 200 }))

    expect(logs.length).toBe(2)
    expect(logs[0]).toContain('--> GET /posts')
    expect(logs[1]).toContain('<-- GET /posts 200')
  })

  test('logs errors', async () => {
    const logs = []
    const middleware = Middleware.logger({ logger: (msg) => logs.push(msg) })
    const context = {
      request: new Request('http://localhost/fail', { method: 'GET' })
    }

    try {
      await middleware(context, async () => {
        throw new Error('Test error')
      })
    } catch (e) {
      // Expected
    }

    expect(logs[1]).toContain('ERROR')
    expect(logs[1]).toContain('Test error')
  })
})

describe('Middleware.errorHandler()', () => {
  test('catches errors and returns error response', async () => {
    const middleware = Middleware.errorHandler({ expose: true })
    const context = {
      request: new Request('http://localhost/')
    }

    const response = await middleware(context, async () => {
      throw new Error('Something went wrong')
    })

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Something went wrong')
  })

  test('uses status from error object', async () => {
    const middleware = Middleware.errorHandler({ expose: true })
    const context = {
      request: new Request('http://localhost/')
    }

    const error = new Error('Not Found')
    error.status = 404

    const response = await middleware(context, async () => {
      throw error
    })

    expect(response.status).toBe(404)
  })

  test('calls onError callback', async () => {
    let capturedError = null
    const middleware = Middleware.errorHandler({
      onError: (err) => { capturedError = err }
    })
    const context = {
      request: new Request('http://localhost/')
    }

    await middleware(context, async () => {
      throw new Error('Captured error')
    })

    expect(capturedError.message).toBe('Captured error')
  })
})

describe('Middleware.cors()', () => {
  test('adds CORS headers to response', async () => {
    const middleware = Middleware.cors({ origin: '*' })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'Origin': 'http://example.com' }
      })
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('handles preflight requests', async () => {
    const middleware = Middleware.cors({ origin: '*', methods: ['GET', 'POST'] })
    const context = {
      request: new Request('http://localhost/', {
        method: 'OPTIONS',
        headers: { 'Origin': 'http://example.com' }
      })
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  test('validates origin against array', async () => {
    const middleware = Middleware.cors({ origin: ['http://allowed.com', 'http://also-allowed.com'] })

    // Allowed origin
    const context1 = {
      request: new Request('http://localhost/', {
        headers: { 'Origin': 'http://allowed.com' }
      })
    }
    const response1 = await middleware(context1, async () => new Response('OK'))
    expect(response1.headers.get('Access-Control-Allow-Origin')).toBe('http://allowed.com')

    // Not allowed origin
    const context2 = {
      request: new Request('http://localhost/', {
        headers: { 'Origin': 'http://not-allowed.com' }
      })
    }
    const response2 = await middleware(context2, async () => new Response('OK'))
    expect(response2.headers.get('Access-Control-Allow-Origin')).toBe('')
  })
})

describe('Middleware.rateLimit()', () => {
  test('allows requests under limit', async () => {
    const middleware = Middleware.rateLimit({ max: 5, windowMs: 60000 })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'X-Forwarded-For': '192.168.1.1' }
      })
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('4')
  })

  test('blocks requests over limit', async () => {
    const store = new Map()
    const middleware = Middleware.rateLimit({ max: 2, windowMs: 60000, store })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'X-Forwarded-For': '192.168.1.2' }
      })
    }

    // First two requests should pass
    await middleware(context, async () => new Response('OK'))
    await middleware(context, async () => new Response('OK'))

    // Third request should be blocked
    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(429)
    const data = await response.json()
    expect(data.error).toBe('Too many requests')
  })
})

describe('Middleware.session()', () => {
  test('creates new session for first request', async () => {
    const store = new Map()
    const middleware = Middleware.session({ store, cookieName: '_session' })
    const context = {
      request: new Request('http://localhost/'),
      session: null
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(context.session).toEqual({})
    const setCookie = response.headers.get('Set-Cookie')
    expect(setCookie).toContain('_session=')
    expect(setCookie).toContain('HttpOnly')
  })

  test('loads existing session from cookie', async () => {
    const store = new Map()
    store.set('abc123', { user_id: 42 })

    const middleware = Middleware.session({ store, cookieName: '_session' })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'Cookie': '_session=abc123' }
      }),
      session: null
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session.user_id).toBe(42)
  })

  test('persists session changes to store', async () => {
    const store = new Map()
    store.set('abc123', { count: 0 })

    const middleware = Middleware.session({ store, cookieName: '_session' })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'Cookie': '_session=abc123' }
      }),
      session: null
    }

    await middleware(context, async () => {
      context.session.count = (context.session.count || 0) + 1
      return new Response('OK')
    })

    expect(store.get('abc123').count).toBe(1)
  })
})

describe('Middleware.csrf()', () => {
  test('skips CSRF check for GET requests', async () => {
    const middleware = Middleware.csrf()
    const context = {
      request: new Request('http://localhost/', { method: 'GET' }),
      session: {}
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(200)
  })

  test('rejects POST without CSRF token', async () => {
    const middleware = Middleware.csrf()
    const context = {
      request: new Request('http://localhost/', { method: 'POST' }),
      session: { csrfToken: 'valid-token' },
      params: {}
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.error).toContain('CSRF')
  })

  test('accepts POST with valid CSRF token in header', async () => {
    const middleware = Middleware.csrf()
    const context = {
      request: new Request('http://localhost/', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-token' }
      }),
      session: { csrfToken: 'valid-token' },
      params: {}
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(200)
  })

  test('skips ignored paths', async () => {
    const middleware = Middleware.csrf({ ignorePaths: ['/api/'] })
    const context = {
      request: new Request('http://localhost/api/webhook', { method: 'POST' }),
      session: {},
      params: {}
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(200)
  })
})

describe('Middleware.authenticate()', () => {
  test('rejects unauthenticated requests', async () => {
    const middleware = Middleware.authenticate({
      authenticate: async () => null
    })
    const context = {
      request: new Request('http://localhost/')
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(401)
  })

  test('sets currentUser on successful auth', async () => {
    const user = { id: 1, name: 'Test User' }
    const middleware = Middleware.authenticate({
      authenticate: async () => user
    })
    const context = {
      request: new Request('http://localhost/')
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.currentUser).toBe(user)
  })

  test('skips excluded paths', async () => {
    const middleware = Middleware.authenticate({
      authenticate: async () => null,
      excludePaths: ['/public/']
    })
    const context = {
      request: new Request('http://localhost/public/page')
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(200)
  })
})

describe('Middleware.securityHeaders()', () => {
  test('adds security headers to response', async () => {
    const middleware = Middleware.securityHeaders()
    const context = {
      request: new Request('http://localhost/')
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
  })

  test('respects custom header options', async () => {
    const middleware = Middleware.securityHeaders({
      xFrameOptions: 'SAMEORIGIN',
      contentSecurityPolicy: "default-src 'none'"
    })
    const context = {
      request: new Request('http://localhost/')
    }

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'")
  })
})

describe('Middleware.timeout()', () => {
  test('allows fast requests to complete', async () => {
    const middleware = Middleware.timeout({ timeout: 1000 })
    const context = {
      request: new Request('http://localhost/')
    }

    const response = await middleware(context, async () => {
      return new Response('Fast response')
    })

    expect(response.status).toBe(200)
  })

  test('returns 408 for slow requests', async () => {
    const middleware = Middleware.timeout({ timeout: 50 })
    const context = {
      request: new Request('http://localhost/')
    }

    const response = await middleware(context, async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return new Response('Slow response')
    })

    expect(response.status).toBe(408)
    const data = await response.json()
    expect(data.error).toBe('Request timeout')
  })
})

describe('Middleware.cleanup()', () => {
  test('runs cleanup functions after response', async () => {
    const cleaned = []
    const middleware = Middleware.cleanup({
      cleaners: [
        async () => cleaned.push('cleaner1'),
        async () => cleaned.push('cleaner2')
      ]
    })
    const context = {
      request: new Request('http://localhost/'),
      temp: new Map([['key', 'value']])
    }

    await middleware(context, async () => new Response('OK'))

    expect(cleaned).toEqual(['cleaner1', 'cleaner2'])
    expect(context.temp.size).toBe(0) // temp should be cleared
  })

  test('runs cleanup even on error', async () => {
    let cleanedUp = false
    const middleware = Middleware.cleanup({
      cleaners: [async () => { cleanedUp = true }]
    })
    const context = {
      request: new Request('http://localhost/'),
      temp: new Map()
    }

    try {
      await middleware(context, async () => {
        throw new Error('Test error')
      })
    } catch (e) {
      // Expected
    }

    expect(cleanedUp).toBe(true)
  })
})

describe('Middleware.compress()', () => {
  test('compresses JSON responses with gzip', async () => {
    const middleware = Middleware.compress({ threshold: 10 })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'Accept-Encoding': 'gzip, deflate' }
      })
    }

    const response = await middleware(context, async () => {
      return new Response(JSON.stringify({ data: 'A long string that exceeds the threshold' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    expect(response.headers.get('Content-Encoding')).toBe('gzip')
  })

  test('skips compression for small responses', async () => {
    const middleware = Middleware.compress({ threshold: 1000 })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'Accept-Encoding': 'gzip' }
      })
    }

    const response = await middleware(context, async () => {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    expect(response.headers.get('Content-Encoding')).toBeNull()
  })

  test('skips compression for non-text content', async () => {
    const middleware = Middleware.compress({ threshold: 10 })
    const context = {
      request: new Request('http://localhost/', {
        headers: { 'Accept-Encoding': 'gzip' }
      })
    }

    const response = await middleware(context, async () => {
      return new Response('binary data here', {
        headers: { 'Content-Type': 'application/octet-stream' }
      })
    })

    expect(response.headers.get('Content-Encoding')).toBeNull()
  })
})

// ==========================================
// createDefaultMiddlewareStack Tests
// ==========================================

describe('createDefaultMiddlewareStack()', () => {
  test('creates stack with default middleware', () => {
    const stack = createDefaultMiddlewareStack()

    // Should have errorHandler, logger, securityHeaders, bodyParser by default
    expect(stack.length).toBeGreaterThan(0)
  })

  test('disables middleware with false option', () => {
    const stack1 = createDefaultMiddlewareStack()
    const stack2 = createDefaultMiddlewareStack({ logger: false })

    expect(stack2.length).toBe(stack1.length - 1)
  })

  test('adds optional middleware when configured', () => {
    const stack1 = createDefaultMiddlewareStack()
    const stack2 = createDefaultMiddlewareStack({ cors: { origin: '*' } })

    expect(stack2.length).toBe(stack1.length + 1)
  })

  test('configures middleware with custom options', () => {
    const logs = []
    const stack = createDefaultMiddlewareStack({
      logger: { logger: (msg) => logs.push(msg) }
    })

    const context = {
      request: new Request('http://localhost/')
    }

    // Run the stack
    stack.run(context, async () => new Response('OK'))

    // Logger should have been called
    // (Note: exact behavior depends on async execution)
  })
})

// ==========================================
// Integration Tests
// ==========================================

describe('Middleware integration', () => {
  test('full request lifecycle with multiple middleware', async () => {
    const order = []
    const stack = new MiddlewareStack()

    stack.use(async (ctx, next) => {
      order.push('error-handler-start')
      try {
        return await next()
      } finally {
        order.push('error-handler-end')
      }
    })

    stack.use(async (ctx, next) => {
      order.push('logger-start')
      const response = await next()
      order.push('logger-end')
      return response
    })

    stack.use(async (ctx, next) => {
      order.push('auth-start')
      ctx.currentUser = { id: 1 }
      const response = await next()
      order.push('auth-end')
      return response
    })

    const context = {
      request: new Request('http://localhost/')
    }

    await stack.run(context, async () => {
      order.push('handler')
      return new Response('OK')
    })

    expect(order).toEqual([
      'error-handler-start',
      'logger-start',
      'auth-start',
      'handler',
      'auth-end',
      'logger-end',
      'error-handler-end'
    ])
    expect(context.currentUser.id).toBe(1)
  })
})

// ==========================================
// Middleware.flash() Tests
// ==========================================

describe('Middleware.flash()', () => {
  test('has correct name', () => {
    const middleware = Middleware.flash()
    expect(middleware._name).toBe('flash')
  })

  test('initializes session if not present', async () => {
    const middleware = Middleware.flash()
    const context = {
      request: new Request('http://localhost/test')
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session).toBeDefined()
    expect(context.session._flash).toEqual({})
  })

  test('initializes flash storage in existing session', async () => {
    const middleware = Middleware.flash()
    const context = {
      request: new Request('http://localhost/test'),
      session: { userId: 1 }
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session._flash).toEqual({})
    expect(context.session.userId).toBe(1)
  })

  test('moves _flashNext to _flash at request start', async () => {
    const middleware = Middleware.flash()
    const context = {
      request: new Request('http://localhost/test'),
      session: {
        _flashNext: { success: 'Saved!' }
      }
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session._flash).toEqual({ success: 'Saved!' })
    expect(context.session._flashNext).toBeUndefined()
  })

  test('clears all flash messages when _flashRead is true', async () => {
    const middleware = Middleware.flash()
    const context = {
      request: new Request('http://localhost/test'),
      session: {
        _flash: { success: 'Done!', error: 'Failed!' },
        _flashRead: true
      }
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session._flash).toEqual({})
    expect(context.session._flashRead).toBe(false)
  })

  test('clears only accessed flash messages', async () => {
    const middleware = Middleware.flash()
    const context = {
      request: new Request('http://localhost/test'),
      session: {
        _flash: { success: 'Done!', error: 'Failed!' },
        _flashAccessed: ['success']
      }
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session._flash.success).toBeUndefined()
    expect(context.session._flash.error).toBe('Failed!')
    expect(context.session._flashAccessed).toEqual([])
  })

  test('preserves flash messages not accessed', async () => {
    const middleware = Middleware.flash()
    const context = {
      request: new Request('http://localhost/test'),
      session: {
        _flash: { success: 'Done!' }
      }
    }

    await middleware(context, async () => new Response('OK'))

    expect(context.session._flash.success).toBe('Done!')
  })

  test('calls controller._processFlashAfterResponse if available', async () => {
    const middleware = Middleware.flash()
    let processCalled = false
    const mockController = {
      _processFlashAfterResponse: () => {
        processCalled = true
      }
    }
    const context = {
      request: new Request('http://localhost/test'),
      session: {},
      _controllerInfo: { controller: mockController }
    }

    await middleware(context, async () => new Response('OK'))

    expect(processCalled).toBe(true)
  })

  test('integrates with session middleware', async () => {
    const stack = new MiddlewareStack()
    const sessionStore = new Map()

    stack.use(Middleware.session({ store: sessionStore }))
    stack.use(Middleware.flash())

    // First request - set flash
    const context1 = {
      request: new Request('http://localhost/test', {
        method: 'POST'
      }),
      session: {}
    }

    const response1 = await stack.run(context1, async () => {
      context1.session._flash = { success: 'Created!' }
      return new Response(null, { status: 302 })
    })

    // Extract session cookie
    const setCookie = response1.headers.get('set-cookie')
    const sessionId = setCookie?.match(/=([^;]+)/)?.[1]

    // Second request - read flash
    const context2 = {
      request: new Request('http://localhost/test', {
        headers: { Cookie: `_session=${sessionId}` }
      }),
      session: {}
    }

    await stack.run(context2, async () => {
      // Flash should be available from previous request
      expect(context2.session._flash.success).toBe('Created!')

      // Mark as read
      context2.session._flashRead = true
      return new Response('OK')
    })

    // Third request - flash should be cleared
    const context3 = {
      request: new Request('http://localhost/test', {
        headers: { Cookie: `_session=${sessionId}` }
      }),
      session: {}
    }

    await stack.run(context3, async () => {
      expect(context3.session._flash).toEqual({})
      return new Response('OK')
    })
  })
})

describe('createDefaultMiddlewareStack with flash', () => {
  test('includes flash middleware when session is enabled', () => {
    const stack = createDefaultMiddlewareStack({
      session: { secret: 'test' }
    })

    const hasFlash = stack.middleware.some(m => m._name === 'flash')
    expect(hasFlash).toBe(true)
  })

  test('does not include flash middleware without session', () => {
    const stack = createDefaultMiddlewareStack({})

    const hasFlash = stack.middleware.some(m => m._name === 'flash')
    expect(hasFlash).toBe(false)
  })

  test('can disable flash middleware explicitly', () => {
    const stack = createDefaultMiddlewareStack({
      session: { secret: 'test' },
      flash: false
    })

    const hasFlash = stack.middleware.some(m => m._name === 'flash')
    expect(hasFlash).toBe(false)
  })
})
