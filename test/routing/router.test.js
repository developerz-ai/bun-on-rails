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
