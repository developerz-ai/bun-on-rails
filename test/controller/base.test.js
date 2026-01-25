/**
 * Controller Base Tests
 *
 * Unit and integration tests for Controller and broadcast functionality
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test'
import { Controller, ControllerContext } from '../../src/controller/base.js'
import { BroadcastManager } from '../../src/websocket/broadcast_manager.js'

describe('Controller', () => {
  describe('constructor', () => {
    test('initializes with context properties', () => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: { id: '123' },
        session: { userId: 1 },
        currentUser: { id: 1, name: 'John' },
        http: { request: null },
        cache: { get: () => {} },
        temp: new Map(),
        db: null,
        broadcastManager: null
      })

      const controller = new Controller(context)

      expect(controller.request).toBeDefined()
      expect(controller.params.id).toBe('123')
      expect(controller.session.userId).toBe(1)
      expect(controller.currentUser.name).toBe('John')
    })
  })

  describe('render()', () => {
    let controller

    beforeEach(() => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      controller = new Controller(context)
    })

    test('returns JSON response with 200 status by default', async () => {
      const response = controller.render({ message: 'Hello' })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const data = await response.json()
      expect(data.message).toBe('Hello')
    })

    test('returns response with custom status', async () => {
      const response = controller.render({ created: true }, { status: 201 })

      expect(response.status).toBe(201)
    })

    test('includes custom headers', async () => {
      const response = controller.render({ data: 'test' }, {
        headers: { 'X-Custom': 'value' }
      })

      expect(response.headers.get('X-Custom')).toBe('value')
    })
  })

  describe('redirect()', () => {
    let controller

    beforeEach(() => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      controller = new Controller(context)
    })

    test('returns 302 redirect by default', () => {
      const response = controller.redirect('/new-location')

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/new-location')
    })

    test('supports custom redirect status', () => {
      const response = controller.redirect('/permanent', { status: 301 })

      expect(response.status).toBe(301)
    })
  })

  describe('head()', () => {
    let controller

    beforeEach(() => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      controller = new Controller(context)
    })

    test('returns empty response with specified status', async () => {
      const response = controller.head(204)

      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    })
  })

  describe('error responses', () => {
    let controller

    beforeEach(() => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      controller = new Controller(context)
    })

    test('unauthorized returns 401', async () => {
      const response = controller.unauthorized()

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    test('unauthorized accepts custom message', async () => {
      const response = controller.unauthorized('Please log in')

      const data = await response.json()
      expect(data.error).toBe('Please log in')
    })

    test('forbidden returns 403', async () => {
      const response = controller.forbidden()

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
    })

    test('notFound returns 404', async () => {
      const response = controller.notFound()

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Not Found')
    })

    test('unprocessableEntity returns 422 with errors', async () => {
      const response = controller.unprocessableEntity({
        title: ['cannot be blank'],
        body: ['is too short']
      })

      expect(response.status).toBe(422)
      const data = await response.json()
      expect(data.errors.title).toContain('cannot be blank')
      expect(data.errors.body).toContain('is too short')
    })
  })

  describe('broadcast()', () => {
    test('returns 0 when no broadcast manager is available', async () => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null,
        broadcastManager: null
      })
      const controller = new Controller(context)

      const result = await controller.broadcast('posts:new', { id: 1 })

      expect(result).toBe(0)
    })

    test('calls broadcast manager when available', async () => {
      const mockBroadcast = mock(() => Promise.resolve(5))
      const mockBroadcastManager = {
        broadcast: mockBroadcast
      }

      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null,
        broadcastManager: mockBroadcastManager
      })
      const controller = new Controller(context)

      const result = await controller.broadcast('posts:new', { post: { id: 1 } })

      expect(mockBroadcast).toHaveBeenCalledWith('posts:new', { post: { id: 1 } })
      expect(result).toBe(5)
    })

    test('works with real broadcast manager (no connections)', async () => {
      const broadcastManager = new BroadcastManager()
      await broadcastManager.initialize()

      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null,
        broadcastManager
      })
      const controller = new Controller(context)

      const result = await controller.broadcast('posts:new', { post: { id: 1 } })

      // No connections, so 0 messages sent
      expect(result).toBe(0)

      await broadcastManager.shutdown()
    })
  })

  describe('static properties', () => {
    test('beforeAction defaults to empty array', () => {
      expect(Controller.beforeAction).toEqual([])
    })

    test('afterAction defaults to empty array', () => {
      expect(Controller.afterAction).toEqual([])
    })

    test('rateLimit defaults to empty object', () => {
      expect(Controller.rateLimit).toEqual({})
    })
  })
})

describe('ControllerContext', () => {
  test('stores all provided options', () => {
    const options = {
      request: new Request('http://localhost/test'),
      params: { id: '1' },
      session: { token: 'abc' },
      currentUser: { id: 1 },
      http: { server: {} },
      cache: { get: () => {} },
      temp: new Map([['key', 'value']]),
      db: { query: () => {} },
      broadcastManager: { broadcast: () => {} }
    }

    const context = new ControllerContext(options)

    expect(context.request).toBe(options.request)
    expect(context.params).toBe(options.params)
    expect(context.session).toBe(options.session)
    expect(context.currentUser).toBe(options.currentUser)
    expect(context.http).toBe(options.http)
    expect(context.cache).toBe(options.cache)
    expect(context.temp).toBe(options.temp)
    expect(context.db).toBe(options.db)
    expect(context.broadcastManager).toBe(options.broadcastManager)
  })
})
