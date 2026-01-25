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

  describe('flash()', () => {
    let controller
    let session

    beforeEach(() => {
      session = {}
      const context = new ControllerContext({
        request: new Request('http://localhost/test'),
        params: {},
        session,
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      controller = new Controller(context)
    })

    describe('setter mode', () => {
      test('sets a flash message with type and message', () => {
        controller.flash('success', 'Item created!')

        expect(session._flash).toBeDefined()
        expect(session._flash.success).toBe('Item created!')
      })

      test('sets multiple flash messages of different types', () => {
        controller.flash('success', 'Item saved!')
        controller.flash('notice', 'Please review your changes')
        controller.flash('alert', 'Your session expires soon')

        expect(session._flash.success).toBe('Item saved!')
        expect(session._flash.notice).toBe('Please review your changes')
        expect(session._flash.alert).toBe('Your session expires soon')
      })

      test('overwrites existing flash message of same type', () => {
        controller.flash('error', 'First error')
        controller.flash('error', 'Second error')

        expect(session._flash.error).toBe('Second error')
      })

      test('initializes session if undefined', () => {
        const context = new ControllerContext({
          request: new Request('http://localhost/test'),
          params: {},
          session: null,
          currentUser: null,
          http: {},
          cache: null,
          temp: new Map(),
          db: null
        })
        const ctrl = new Controller(context)
        ctrl.session = null

        ctrl.flash('test', 'message')

        expect(ctrl.session).toBeDefined()
        expect(ctrl.session._flash.test).toBe('message')
      })
    })

    describe('getter mode - all messages', () => {
      test('returns all flash messages when called with no args', () => {
        session._flash = { success: 'Done!', notice: 'Check this out' }

        const messages = controller.flash()

        expect(messages).toEqual({ success: 'Done!', notice: 'Check this out' })
      })

      test('returns empty object when no flash messages', () => {
        const messages = controller.flash()

        expect(messages).toEqual({})
      })

      test('marks all messages as read', () => {
        session._flash = { success: 'Done!' }

        controller.flash()

        expect(session._flashRead).toBe(true)
      })
    })

    describe('getter mode - specific type', () => {
      test('returns specific flash message by type', () => {
        session._flash = { success: 'Item created!', notice: 'Welcome' }

        const message = controller.flash('success')

        expect(message).toBe('Item created!')
      })

      test('returns undefined for non-existent type', () => {
        session._flash = { success: 'Done!' }

        const message = controller.flash('error')

        expect(message).toBeUndefined()
      })

      test('tracks accessed keys', () => {
        session._flash = { success: 'Done!', notice: 'Info' }

        controller.flash('success')

        expect(session._flashAccessed).toContain('success')
        expect(session._flashAccessed).not.toContain('notice')
      })

      test('does not duplicate accessed keys', () => {
        session._flash = { success: 'Done!' }

        controller.flash('success')
        controller.flash('success')

        expect(session._flashAccessed.filter(k => k === 'success').length).toBe(1)
      })
    })

    describe('flashMessages getter', () => {
      test('returns current flash messages without marking as read', () => {
        session._flash = { success: 'Done!' }

        const messages = controller.flashMessages

        expect(messages).toEqual({ success: 'Done!' })
        expect(session._flashRead).toBeFalsy()
        expect(session._flashAccessed).toBeFalsy()
      })

      test('returns empty object when no messages', () => {
        expect(controller.flashMessages).toEqual({})
      })

      test('returns a copy, not the original', () => {
        session._flash = { success: 'Done!' }

        const messages = controller.flashMessages
        messages.success = 'Modified!'

        expect(session._flash.success).toBe('Done!')
      })
    })

    describe('hasFlash()', () => {
      test('returns true when flash messages exist', () => {
        session._flash = { success: 'Done!' }

        expect(controller.hasFlash()).toBe(true)
      })

      test('returns false when no flash messages', () => {
        session._flash = {}

        expect(controller.hasFlash()).toBe(false)
      })

      test('returns false when flash is undefined', () => {
        expect(controller.hasFlash()).toBe(false)
      })
    })

    describe('clearFlash()', () => {
      test('clears all flash messages', () => {
        session._flash = { success: 'Done!', error: 'Failed!' }
        session._flashRead = true
        session._flashAccessed = ['success']

        controller.clearFlash()

        expect(session._flash).toEqual({})
        expect(session._flashRead).toBe(false)
        expect(session._flashAccessed).toEqual([])
      })
    })

    describe('_processFlashAfterResponse()', () => {
      test('clears all messages when _flashRead is true', () => {
        session._flash = { success: 'Done!', error: 'Failed!' }
        session._flashRead = true

        controller._processFlashAfterResponse()

        expect(session._flash).toEqual({})
        expect(session._flashRead).toBe(false)
      })

      test('clears only accessed messages', () => {
        session._flash = { success: 'Done!', error: 'Failed!' }
        session._flashAccessed = ['success']

        controller._processFlashAfterResponse()

        expect(session._flash.success).toBeUndefined()
        expect(session._flash.error).toBe('Failed!')
        expect(session._flashAccessed).toEqual([])
      })

      test('does nothing when no messages accessed', () => {
        session._flash = { success: 'Done!' }

        controller._processFlashAfterResponse()

        expect(session._flash.success).toBe('Done!')
      })

      test('handles missing session gracefully', () => {
        controller.session = null

        // Should not throw
        expect(() => controller._processFlashAfterResponse()).not.toThrow()
      })
    })
  })

  describe('getCookie()', () => {
    let controller

    beforeEach(() => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test', {
          headers: { 'Cookie': 'session_id=abc123; theme=dark; user_id=42' }
        }),
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

    test('returns cookie value by name', () => {
      expect(controller.getCookie('session_id')).toBe('abc123')
      expect(controller.getCookie('theme')).toBe('dark')
      expect(controller.getCookie('user_id')).toBe('42')
    })

    test('returns undefined for non-existent cookie', () => {
      expect(controller.getCookie('nonexistent')).toBeUndefined()
    })

    test('returns undefined when no Cookie header', () => {
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
      const ctrl = new Controller(context)

      expect(ctrl.getCookie('any')).toBeUndefined()
    })

    test('handles cookies with = in value', () => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test', {
          headers: { 'Cookie': 'data=a=b=c' }
        }),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      const ctrl = new Controller(context)

      expect(ctrl.getCookie('data')).toBe('a=b=c')
    })

    test('handles cookies with spaces', () => {
      const context = new ControllerContext({
        request: new Request('http://localhost/test', {
          headers: { 'Cookie': '  first=one  ;  second=two  ' }
        }),
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      const ctrl = new Controller(context)

      expect(ctrl.getCookie('first')).toBe('one')
      expect(ctrl.getCookie('second')).toBe('two')
    })

    test('handles null request', () => {
      const context = new ControllerContext({
        request: null,
        params: {},
        session: {},
        currentUser: null,
        http: {},
        cache: null,
        temp: new Map(),
        db: null
      })
      const ctrl = new Controller(context)

      expect(ctrl.getCookie('any')).toBeUndefined()
    })
  })

  describe('setCookie()', () => {
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

    test('sets a simple cookie', () => {
      controller.setCookie('user_id', '12345')

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('user_id=12345')
      expect(setCookie).toContain('Path=/')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')
    })

    test('encodes cookie name and value', () => {
      controller.setCookie('special name', 'value with spaces')

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('special%20name=value%20with%20spaces')
    })

    test('sets cookie with custom path', () => {
      controller.setCookie('app_token', 'xyz', { path: '/api' })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Path=/api')
    })

    test('sets cookie with domain', () => {
      controller.setCookie('shared', 'value', { domain: '.example.com' })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Domain=.example.com')
    })

    test('sets cookie with expires date', () => {
      const expires = new Date('2025-12-31T23:59:59Z')
      controller.setCookie('expires_cookie', 'value', { expires })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Expires=')
      expect(setCookie).toContain('Dec')
    })

    test('sets cookie with expires as string', () => {
      controller.setCookie('expires_cookie', 'value', { expires: '2025-12-31T23:59:59Z' })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Expires=')
    })

    test('sets cookie with maxAge', () => {
      controller.setCookie('session', 'token', { maxAge: 3600 })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Max-Age=3600')
    })

    test('disables HttpOnly when explicitly set to false', () => {
      controller.setCookie('client_cookie', 'value', { httpOnly: false })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).not.toContain('HttpOnly')
    })

    test('sets Secure flag when explicitly set', () => {
      controller.setCookie('secure_cookie', 'value', { secure: true })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Secure')
    })

    test('sets SameSite=Strict', () => {
      controller.setCookie('strict_cookie', 'value', { sameSite: 'Strict' })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('SameSite=Strict')
    })

    test('sets SameSite=None', () => {
      controller.setCookie('none_cookie', 'value', { sameSite: 'None', secure: true })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('SameSite=None')
      expect(setCookie).toContain('Secure')
    })

    test('sets multiple cookies', () => {
      controller.setCookie('cookie1', 'value1')
      controller.setCookie('cookie2', 'value2')

      const response = controller.render({ ok: true })
      const cookies = response.headers.getSetCookie()

      expect(cookies.length).toBe(2)
      expect(cookies[0]).toContain('cookie1=value1')
      expect(cookies[1]).toContain('cookie2=value2')
    })

    test('includes cookies in redirect response', () => {
      controller.setCookie('redirect_cookie', 'value')

      const response = controller.redirect('/new-location')
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('redirect_cookie=value')
    })

    test('includes cookies in head response', () => {
      controller.setCookie('head_cookie', 'value')

      const response = controller.head(204)
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('head_cookie=value')
    })
  })

  describe('deleteCookie()', () => {
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

    test('deletes a cookie by setting empty value and past expiration', () => {
      controller.deleteCookie('session_id')

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('session_id=')
      expect(setCookie).toContain('Expires=Thu, 01 Jan 1970')
      expect(setCookie).toContain('Max-Age=0')
    })

    test('deletes cookie with custom path', () => {
      controller.deleteCookie('app_token', { path: '/api' })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Path=/api')
      expect(setCookie).toContain('Max-Age=0')
    })

    test('deletes cookie with custom domain', () => {
      controller.deleteCookie('shared', { domain: '.example.com' })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).toContain('Domain=.example.com')
      expect(setCookie).toContain('Max-Age=0')
    })

    test('preserves httpOnly setting when deleting', () => {
      controller.deleteCookie('client_cookie', { httpOnly: false })

      const response = controller.render({ ok: true })
      const setCookie = response.headers.get('Set-Cookie')

      expect(setCookie).not.toContain('HttpOnly')
    })
  })

  describe('setHeader()', () => {
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

    test('sets a custom header', () => {
      controller.setHeader('X-Custom-Header', 'custom-value')

      const response = controller.render({ ok: true })

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value')
    })

    test('sets multiple headers', () => {
      controller.setHeader('X-Header-1', 'value1')
      controller.setHeader('X-Header-2', 'value2')

      const response = controller.render({ ok: true })

      expect(response.headers.get('X-Header-1')).toBe('value1')
      expect(response.headers.get('X-Header-2')).toBe('value2')
    })

    test('overwrites existing header', () => {
      controller.setHeader('X-Custom', 'first')
      controller.setHeader('X-Custom', 'second')

      const response = controller.render({ ok: true })

      expect(response.headers.get('X-Custom')).toBe('second')
    })

    test('includes headers in redirect response', () => {
      controller.setHeader('X-Redirect-Header', 'value')

      const response = controller.redirect('/new-location')

      expect(response.headers.get('X-Redirect-Header')).toBe('value')
    })

    test('includes headers in head response', () => {
      controller.setHeader('X-Head-Header', 'value')

      const response = controller.head(204)

      expect(response.headers.get('X-Head-Header')).toBe('value')
    })
  })

  describe('_applyResponseModifications()', () => {
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

    test('returns original response when no modifications', () => {
      const original = new Response('OK')
      const modified = controller._applyResponseModifications(original)

      // Should return same response since no modifications
      expect(modified.status).toBe(original.status)
    })

    test('applies both headers and cookies', () => {
      controller.setHeader('X-Custom', 'value')
      controller.setCookie('session', 'token')

      const response = controller.render({ ok: true })

      expect(response.headers.get('X-Custom')).toBe('value')
      expect(response.headers.get('Set-Cookie')).toContain('session=token')
    })

    test('preserves original response headers', () => {
      const original = new Response('OK', {
        headers: { 'X-Original': 'preserved' }
      })
      controller.setHeader('X-New', 'added')

      const modified = controller._applyResponseModifications(original)

      expect(modified.headers.get('X-Original')).toBe('preserved')
      expect(modified.headers.get('X-New')).toBe('added')
    })

    test('preserves original response status', () => {
      const original = new Response('Created', { status: 201 })
      controller.setCookie('test', 'value')

      const modified = controller._applyResponseModifications(original)

      expect(modified.status).toBe(201)
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
