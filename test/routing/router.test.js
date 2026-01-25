/**
 * Router Tests - Route Matching and Parameter Extraction
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { Router } from '../../src/routing/router.js'

describe('Router.match()', () => {
  let router

  beforeEach(() => {
    router = new Router()
  })

  describe('basic route matching', () => {
    test('matches simple GET route', () => {
      router.get('/posts', 'posts#index')

      const result = router.match('GET', '/posts')

      expect(result).not.toBeNull()
      expect(result.controller).toBe('posts')
      expect(result.action).toBe('index')
      expect(result.params).toEqual({})
    })

    test('matches POST route', () => {
      router.post('/posts', 'posts#create')

      const result = router.match('POST', '/posts')

      expect(result).not.toBeNull()
      expect(result.controller).toBe('posts')
      expect(result.action).toBe('create')
    })

    test('matches PUT route', () => {
      router.put('/posts/1', 'posts#update')

      const result = router.match('PUT', '/posts/1')

      expect(result).not.toBeNull()
      expect(result.action).toBe('update')
    })

    test('matches PATCH route', () => {
      router.patch('/posts/1', 'posts#update')

      const result = router.match('PATCH', '/posts/1')

      expect(result).not.toBeNull()
    })

    test('matches DELETE route', () => {
      router.delete('/posts/1', 'posts#destroy')

      const result = router.match('DELETE', '/posts/1')

      expect(result).not.toBeNull()
      expect(result.action).toBe('destroy')
    })

    test('matches root route', () => {
      router.root('home#index')

      const result = router.match('GET', '/')

      expect(result).not.toBeNull()
      expect(result.controller).toBe('home')
      expect(result.action).toBe('index')
    })

    test('returns null for unmatched path', () => {
      router.get('/posts', 'posts#index')

      const result = router.match('GET', '/users')

      expect(result).toBeNull()
    })

    test('returns null for unmatched method', () => {
      router.get('/posts', 'posts#index')

      const result = router.match('POST', '/posts')

      expect(result).toBeNull()
    })
  })

  describe('path parameter extraction', () => {
    test('extracts single parameter from path', () => {
      router.get('/posts/:id', 'posts#show')

      const result = router.match('GET', '/posts/123')

      expect(result).not.toBeNull()
      expect(result.params.id).toBe('123')
    })

    test('extracts multiple parameters from path', () => {
      router.get('/users/:user_id/posts/:id', 'posts#show')

      const result = router.match('GET', '/users/42/posts/99')

      expect(result).not.toBeNull()
      expect(result.params.user_id).toBe('42')
      expect(result.params.id).toBe('99')
    })

    test('extracts parameters with special characters', () => {
      router.get('/posts/:slug', 'posts#show')

      const result = router.match('GET', '/posts/my-awesome-post')

      expect(result).not.toBeNull()
      expect(result.params.slug).toBe('my-awesome-post')
    })

    test('extracts URL-encoded parameters', () => {
      router.get('/search/:query', 'search#show')

      const result = router.match('GET', '/search/hello%20world')

      expect(result).not.toBeNull()
      expect(result.params.query).toBe('hello world')
    })

    test('handles parameters with underscores', () => {
      router.get('/users/:user_id', 'users#show')

      const result = router.match('GET', '/users/abc_123')

      expect(result).not.toBeNull()
      expect(result.params.user_id).toBe('abc_123')
    })
  })

  describe('resourceful routes matching', () => {
    beforeEach(() => {
      router.resources('posts')
    })

    test('matches index route', () => {
      const result = router.match('GET', '/posts')

      expect(result).not.toBeNull()
      expect(result.action).toBe('index')
    })

    test('matches show route with id', () => {
      const result = router.match('GET', '/posts/123')

      expect(result).not.toBeNull()
      expect(result.action).toBe('show')
      expect(result.params.id).toBe('123')
    })

    test('matches new route', () => {
      const result = router.match('GET', '/posts/new')

      expect(result).not.toBeNull()
      expect(result.action).toBe('new')
    })

    test('matches edit route', () => {
      const result = router.match('GET', '/posts/123/edit')

      expect(result).not.toBeNull()
      expect(result.action).toBe('edit')
      expect(result.params.id).toBe('123')
    })

    test('matches create route', () => {
      const result = router.match('POST', '/posts')

      expect(result).not.toBeNull()
      expect(result.action).toBe('create')
    })

    test('matches update route with PATCH', () => {
      const result = router.match('PATCH', '/posts/456')

      expect(result).not.toBeNull()
      expect(result.action).toBe('update')
      expect(result.params.id).toBe('456')
    })

    test('matches update route with PUT', () => {
      const result = router.match('PUT', '/posts/456')

      expect(result).not.toBeNull()
      expect(result.action).toBe('update')
    })

    test('matches destroy route', () => {
      const result = router.match('DELETE', '/posts/789')

      expect(result).not.toBeNull()
      expect(result.action).toBe('destroy')
      expect(result.params.id).toBe('789')
    })
  })

  describe('namespaced routes matching', () => {
    test('matches namespaced route', () => {
      router.namespace('admin', () => {
        router.get('/users', 'users#index')
      })

      const result = router.match('GET', '/admin/users')

      expect(result).not.toBeNull()
      expect(result.controller).toBe('admin/users')
      expect(result.action).toBe('index')
    })

    test('matches nested namespaced route with params', () => {
      router.namespace('admin', () => {
        router.get('/users/:id', 'users#show')
      })

      const result = router.match('GET', '/admin/users/42')

      expect(result).not.toBeNull()
      expect(result.params.id).toBe('42')
    })

    test('matches deeply nested namespace', () => {
      router.namespace('api', () => {
        router.namespace('v1', () => {
          router.get('/posts/:id', 'posts#show')
        })
      })

      const result = router.match('GET', '/api/v1/posts/123')

      expect(result).not.toBeNull()
      expect(result.controller).toBe('api/v1/posts')
      expect(result.params.id).toBe('123')
    })
  })

  describe('path normalization', () => {
    test('handles trailing slash', () => {
      router.get('/posts', 'posts#index')

      const result = router.match('GET', '/posts/')

      expect(result).not.toBeNull()
    })

    test('handles missing leading slash', () => {
      router.get('/posts', 'posts#index')

      const result = router.match('GET', 'posts')

      expect(result).not.toBeNull()
    })

    test('handles query string', () => {
      router.get('/search', 'search#index')

      const result = router.match('GET', '/search?q=test&page=1')

      expect(result).not.toBeNull()
    })

    test('handles case-insensitive methods', () => {
      router.get('/posts', 'posts#index')

      const result = router.match('get', '/posts')

      expect(result).not.toBeNull()
    })

    test('handles empty path as root', () => {
      router.root('home#index')

      const result = router.match('GET', '')

      expect(result).not.toBeNull()
    })
  })

  describe('route priority (first match wins)', () => {
    test('matches first defined route for same path', () => {
      router.get('/posts', 'posts#index')
      router.get('/posts', 'posts#list') // Second route with same path

      const result = router.match('GET', '/posts')

      expect(result.action).toBe('index') // First match wins
    })

    test('matches static route before dynamic route', () => {
      router.get('/posts/new', 'posts#new')
      router.get('/posts/:id', 'posts#show')

      const result = router.match('GET', '/posts/new')

      expect(result.action).toBe('new')
    })
  })

  describe('edge cases', () => {
    test('handles UUID-style parameters', () => {
      router.get('/posts/:uuid', 'posts#show')

      const result = router.match('GET', '/posts/550e8400-e29b-41d4-a716-446655440000')

      expect(result).not.toBeNull()
      expect(result.params.uuid).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    test('handles numeric string parameters', () => {
      router.get('/posts/:id', 'posts#show')

      const result = router.match('GET', '/posts/0')

      expect(result).not.toBeNull()
      expect(result.params.id).toBe('0')
    })

    test('does not match when path has extra segments', () => {
      router.get('/posts/:id', 'posts#show')

      const result = router.match('GET', '/posts/123/extra')

      expect(result).toBeNull()
    })

    test('does not match when path has fewer segments', () => {
      router.get('/posts/:id/comments', 'comments#index')

      const result = router.match('GET', '/posts/123')

      expect(result).toBeNull()
    })

    test('returns route object with all properties', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      const result = router.match('GET', '/posts/123')

      expect(result.route).toBeDefined()
      expect(result.route.method).toBe('GET')
      expect(result.route.path).toBe('/posts/:id')
      expect(result.route.options).toEqual({ as: 'post' })
      expect(result.middleware).toEqual([])
    })
  })

  describe('normalizePath helper', () => {
    test('normalizes root path', () => {
      expect(router.normalizePath('/')).toBe('/')
    })

    test('removes trailing slash', () => {
      expect(router.normalizePath('/posts/')).toBe('/posts')
    })

    test('adds leading slash', () => {
      expect(router.normalizePath('posts')).toBe('/posts')
    })

    test('removes query string', () => {
      expect(router.normalizePath('/posts?page=1')).toBe('/posts')
    })

    test('handles empty path', () => {
      expect(router.normalizePath('')).toBe('/')
    })

    test('handles null/undefined path', () => {
      expect(router.normalizePath(null)).toBe('/')
      expect(router.normalizePath(undefined)).toBe('/')
    })
  })

  describe('matchPath helper', () => {
    test('matches static paths', () => {
      const result = router.matchPath('/posts', '/posts')
      expect(result).toEqual({})
    })

    test('extracts single param', () => {
      const result = router.matchPath('/posts/:id', '/posts/123')
      expect(result).toEqual({ id: '123' })
    })

    test('extracts multiple params', () => {
      const result = router.matchPath('/users/:user_id/posts/:id', '/users/1/posts/2')
      expect(result).toEqual({ user_id: '1', id: '2' })
    })

    test('returns null for non-matching paths', () => {
      const result = router.matchPath('/posts', '/users')
      expect(result).toBeNull()
    })

    test('returns null for different segment counts', () => {
      const result = router.matchPath('/posts/:id', '/posts')
      expect(result).toBeNull()
    })
  })

  describe('patternToRegex helper', () => {
    test('creates regex for static path', () => {
      const { regex, paramNames } = router.patternToRegex('/posts')
      expect(regex.test('/posts')).toBe(true)
      expect(regex.test('/users')).toBe(false)
      expect(paramNames).toEqual([])
    })

    test('creates regex with param capture', () => {
      const { regex, paramNames } = router.patternToRegex('/posts/:id')
      expect(regex.test('/posts/123')).toBe(true)
      expect(paramNames).toEqual(['id'])

      const match = '/posts/456'.match(regex)
      expect(match[1]).toBe('456')
    })

    test('creates regex with multiple params', () => {
      const { regex, paramNames } = router.patternToRegex('/users/:user_id/posts/:id')
      expect(regex.test('/users/1/posts/2')).toBe(true)
      expect(paramNames).toEqual(['user_id', 'id'])
    })
  })
})

describe('Router integration tests', () => {
  test('full CRUD workflow matching', () => {
    const router = new Router()
    router.resources('articles')

    // Index
    let result = router.match('GET', '/articles')
    expect(result.action).toBe('index')

    // Create
    result = router.match('POST', '/articles')
    expect(result.action).toBe('create')

    // Show
    result = router.match('GET', '/articles/1')
    expect(result.action).toBe('show')
    expect(result.params.id).toBe('1')

    // Edit
    result = router.match('GET', '/articles/1/edit')
    expect(result.action).toBe('edit')

    // Update (PATCH)
    result = router.match('PATCH', '/articles/1')
    expect(result.action).toBe('update')

    // Destroy
    result = router.match('DELETE', '/articles/1')
    expect(result.action).toBe('destroy')
  })

  test('API versioning with namespaces', () => {
    const router = new Router()

    router.namespace('api', () => {
      router.namespace('v1', () => {
        router.resources('users')
      })
      router.namespace('v2', () => {
        router.resources('users')
      })
    })

    const v1Result = router.match('GET', '/api/v1/users/1')
    expect(v1Result.controller).toBe('api/v1/users')

    const v2Result = router.match('GET', '/api/v2/users/1')
    expect(v2Result.controller).toBe('api/v2/users')
  })
})

// ==========================================
// Router.handle() Tests
// ==========================================

describe('Router.handle()', () => {
  let router

  // Mock controller class for testing
  class MockPostsController {
    static beforeAction = []
    static afterAction = []

    constructor(context) {
      this.context = context
      this.params = context.params
    }

    async index() {
      return new Response(JSON.stringify({ posts: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    async show() {
      return new Response(JSON.stringify({ post: { id: this.params.id } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    async create() {
      return new Response(JSON.stringify({ post: { title: this.params.title } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // Controller with before/after filters
  class MockAuthController {
    static beforeAction = ['authenticate']
    static afterAction = ['logAction']

    constructor(context) {
      this.context = context
      this.params = context.params
      this.authenticated = false
      this.logged = false
    }

    async authenticate() {
      if (this.context.session?.user) {
        this.authenticated = true
        return null // Continue to action
      }
      // Return unauthorized response
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    async logAction() {
      this.logged = true
    }

    async dashboard() {
      return new Response(JSON.stringify({ message: 'Welcome to dashboard' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  beforeEach(() => {
    router = new Router()

    // Configure with mock controller loader
    router.configure({
      controllerLoader: (name) => {
        const controllers = {
          posts: MockPostsController,
          auth: MockAuthController
        }
        return controllers[name] || null
      }
    })
  })

  describe('basic request handling', () => {
    test('handles GET request to index action', async () => {
      router.get('/posts', 'posts#index')

      const request = new Request('http://localhost/posts', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ posts: [] })
    })

    test('handles GET request with path params', async () => {
      router.get('/posts/:id', 'posts#show')

      const request = new Request('http://localhost/posts/123', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.post.id).toBe('123')
    })

    test('handles POST request with JSON body', async () => {
      router.post('/posts', 'posts#create')

      const request = new Request('http://localhost/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Post' })
      })
      const response = await router.handle(request)

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.post.title).toBe('Test Post')
    })

    test('returns 404 for unmatched route', async () => {
      router.get('/posts', 'posts#index')

      const request = new Request('http://localhost/unknown', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    test('returns 404 when controller not found', async () => {
      router.get('/items', 'items#index') // items controller not configured

      const request = new Request('http://localhost/items', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(404)
    })
  })

  describe('query parameters', () => {
    test('includes query params in context', async () => {
      class QueryController {
        constructor(context) {
          this.params = context.params
        }

        async search() {
          return new Response(JSON.stringify({
            query: this.params.q,
            page: this.params.page
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      }

      router.configure({
        controllerLoader: (name) => name === 'search' ? QueryController : null
      })
      router.get('/search', 'search#search')

      const request = new Request('http://localhost/search?q=test&page=2', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.query).toBe('test')
      expect(data.page).toBe('2')
    })
  })

  describe('before action filters', () => {
    test('runs before filters before action', async () => {
      router.get('/dashboard', 'auth#dashboard')

      // Request without authentication
      const request = new Request('http://localhost/dashboard', { method: 'GET' })
      const response = await router.handle(request)

      // Should return unauthorized
      expect(response.status).toBe(401)
    })

    test('continues to action when filter passes', async () => {
      // Configure with custom context builder that adds session
      router.configure({
        controllerLoader: () => MockAuthController,
        contextBuilder: async (request, match) => ({
          request,
          params: match.params,
          session: { user: { id: 1 } },
          currentUser: { id: 1 },
          _match: match
        })
      })

      router.get('/dashboard', 'auth#dashboard')

      const request = new Request('http://localhost/dashboard', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(200)
    })
  })

  describe('response handling', () => {
    test('returns action response directly', async () => {
      router.get('/posts', 'posts#index')

      const request = new Request('http://localhost/posts', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    test('wraps plain object return value in JSON response', async () => {
      class PlainController {
        constructor(context) {
          this.context = context
        }

        async data() {
          return { foo: 'bar' }
        }
      }

      router.configure({
        controllerLoader: () => PlainController
      })
      router.get('/data', 'plain#data')

      const request = new Request('http://localhost/data', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ foo: 'bar' })
    })

    test('returns 204 No Content for undefined/null return', async () => {
      class EmptyController {
        constructor(context) {
          this.context = context
        }

        async empty() {
          // No return value
        }
      }

      router.configure({
        controllerLoader: () => EmptyController
      })
      router.get('/empty', 'empty#empty')

      const request = new Request('http://localhost/empty', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(204)
    })
  })

  describe('error handling', () => {
    test('handles controller action errors', async () => {
      class ErrorController {
        constructor(context) {
          this.context = context
        }

        async fail() {
          throw new Error('Something went wrong')
        }
      }

      router.configure({
        controllerLoader: () => ErrorController
      })
      router.get('/fail', 'error#fail')

      const request = new Request('http://localhost/fail', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(500)
    })

    test('uses custom error handler when configured', async () => {
      class ErrorController {
        constructor(context) {
          this.context = context
        }

        async fail() {
          throw new Error('Custom error')
        }
      }

      router.configure({
        controllerLoader: () => ErrorController,
        errorHandler: (error) => {
          return new Response(JSON.stringify({ customError: error.message }), {
            status: 418,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      })
      router.get('/fail', 'error#fail')

      const request = new Request('http://localhost/fail', { method: 'GET' })
      const response = await router.handle(request)

      expect(response.status).toBe(418)
      const data = await response.json()
      expect(data.customError).toBe('Custom error')
    })
  })

  describe('form data handling', () => {
    test('parses URL-encoded form data', async () => {
      class FormController {
        constructor(context) {
          this.params = context.params
        }

        async submit() {
          return new Response(JSON.stringify({ received: this.params }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      }

      router.configure({
        controllerLoader: () => FormController
      })
      router.post('/form', 'form#submit')

      const request = new Request('http://localhost/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=John&email=john@example.com'
      })
      const response = await router.handle(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.received.name).toBe('John')
      expect(data.received.email).toBe('john@example.com')
    })
  })
})

describe('Router.configure()', () => {
  test('sets controllerLoader', () => {
    const router = new Router()
    const loader = () => null

    router.configure({ controllerLoader: loader })

    expect(router.controllerLoader).toBe(loader)
  })

  test('sets middleware', () => {
    const router = new Router()
    const middleware = { run: () => {} }

    router.configure({ middleware })

    expect(router.middlewareStack).toBe(middleware)
  })

  test('sets contextBuilder', () => {
    const router = new Router()
    const builder = () => ({})

    router.configure({ contextBuilder: builder })

    expect(router.contextBuilder).toBe(builder)
  })

  test('sets errorHandler', () => {
    const router = new Router()
    const handler = () => new Response()

    router.configure({ errorHandler: handler })

    expect(router.errorHandler).toBe(handler)
  })

  test('returns router for chaining', () => {
    const router = new Router()

    const result = router.configure({})

    expect(result).toBe(router)
  })
})

describe('Router with MiddlewareStack', () => {
  test('runs middleware before controller action', async () => {
    const router = new Router()
    const middlewareCalls = []

    // Simple middleware stack implementation for testing
    const middlewareStack = {
      async run(context, handler) {
        middlewareCalls.push('middleware-start')
        const response = await handler(context)
        middlewareCalls.push('middleware-end')
        return response
      }
    }

    class TestController {
      constructor(context) {
        this.context = context
      }

      async index() {
        middlewareCalls.push('action')
        return new Response('OK')
      }
    }

    router.configure({
      controllerLoader: () => TestController,
      middleware: middlewareStack
    })
    router.get('/test', 'test#index')

    const request = new Request('http://localhost/test', { method: 'GET' })
    await router.handle(request)

    expect(middlewareCalls).toEqual(['middleware-start', 'action', 'middleware-end'])
  })
})
