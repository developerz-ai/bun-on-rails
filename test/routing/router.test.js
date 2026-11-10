/**
 * Router Tests - Route Matching and Parameter Extraction
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { Router, buildQueryString } from '../../src/routing/router.js'

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
// Router.urlFor() Tests
// ==========================================

describe('Router.urlFor()', () => {
  let router

  beforeEach(() => {
    router = new Router()
  })

  describe('basic URL generation', () => {
    test('generates URL for simple named route', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts')

      expect(url).toBe('/posts')
    })

    test('generates URL with single parameter', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      const url = router.urlFor('post', { id: 123 })

      expect(url).toBe('/posts/123')
    })

    test('generates URL with multiple parameters', () => {
      router.get('/users/:user_id/posts/:id', 'posts#show', { as: 'user_post' })

      const url = router.urlFor('user_post', { user_id: 42, id: 99 })

      expect(url).toBe('/users/42/posts/99')
    })

    test('generates URL with string parameters', () => {
      router.get('/posts/:slug', 'posts#show', { as: 'post_by_slug' })

      const url = router.urlFor('post_by_slug', { slug: 'my-awesome-post' })

      expect(url).toBe('/posts/my-awesome-post')
    })

    test('URL-encodes special characters in parameters', () => {
      router.get('/search/:query', 'search#show', { as: 'search' })

      const url = router.urlFor('search', { query: 'hello world' })

      expect(url).toBe('/search/hello%20world')
    })

    test('URL-encodes unicode characters', () => {
      router.get('/posts/:title', 'posts#show', { as: 'post_title' })

      const url = router.urlFor('post_title', { title: 'café' })

      expect(url).toBe('/posts/caf%C3%A9')
    })
  })

  describe('error handling', () => {
    test('throws error for unknown route name', () => {
      expect(() => {
        router.urlFor('nonexistent')
      }).toThrow('No route found with name: nonexistent')
    })

    test('throws error for missing required parameter', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      expect(() => {
        router.urlFor('post', {})
      }).toThrow("Missing required parameter 'id' for route 'post'")
    })

    test('throws error for null parameter value', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      expect(() => {
        router.urlFor('post', { id: null })
      }).toThrow("Missing required parameter 'id' for route 'post'")
    })

    test('throws error for undefined parameter value', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      expect(() => {
        router.urlFor('post', { id: undefined })
      }).toThrow("Missing required parameter 'id' for route 'post'")
    })
  })

  describe('query parameters', () => {
    test('appends unused params as query string', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', { page: 2, per_page: 10 })

      expect(url).toBe('/posts?page=2&per_page=10')
    })

    test('combines path params and query params', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      const url = router.urlFor('post', { id: 123, format: 'json' })

      expect(url).toBe('/posts/123?format=json')
    })

    test('uses explicit query option', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', {}, { query: { search: 'test', active: 'true' } })

      expect(url).toBe('/posts?search=test&active=true')
    })

    test('merges unused params with explicit query option', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      const url = router.urlFor('post', { id: 123, extra: 'value' }, { query: { format: 'json' } })

      expect(url).toBe('/posts/123?format=json&extra=value')
    })

    test('URL-encodes query parameter keys and values', () => {
      router.get('/search', 'search#index', { as: 'search' })

      const url = router.urlFor('search', { 'query term': 'hello world' })

      expect(url).toBe('/search?query%20term=hello%20world')
    })

    test('handles array query parameters', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', {}, { query: { tags: ['ruby', 'rails'] } })

      expect(url).toBe('/posts?tags[]=ruby&tags[]=rails')
    })

    test('handles nested object query parameters', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', {}, { query: { filter: { status: 'active', type: 'article' } } })

      expect(url).toBe('/posts?filter[status]=active&filter[type]=article')
    })
  })

  describe('absolute URLs', () => {
    test('generates absolute URL with host option', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      const url = router.urlFor('post', { id: 123 }, { host: 'example.com' })

      expect(url).toBe('https://example.com/posts/123')
    })

    test('uses custom protocol', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', {}, { host: 'example.com', protocol: 'http' })

      expect(url).toBe('http://example.com/posts')
    })

    test('generates absolute URL with query params', () => {
      router.get('/search', 'search#index', { as: 'search' })

      const url = router.urlFor('search', { q: 'test' }, { host: 'api.example.com' })

      expect(url).toBe('https://api.example.com/search?q=test')
    })

    test('throws error when absolute requested without host', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      expect(() => {
        router.urlFor('posts', {}, { absolute: true })
      }).toThrow('Host required for absolute URL generation')
    })
  })

  describe('edge cases', () => {
    test('handles root path', () => {
      router.root('home#index')
      // Need to manually add named route for root
      router.namedRoutes['root'] = { method: 'GET', path: '/' }

      const url = router.urlFor('root')

      expect(url).toBe('/')
    })

    test('handles numeric parameter converted to string', () => {
      router.get('/posts/:id', 'posts#show', { as: 'post' })

      const url = router.urlFor('post', { id: 0 })

      expect(url).toBe('/posts/0')
    })

    test('handles UUID-style parameters', () => {
      router.get('/posts/:uuid', 'posts#show', { as: 'post_uuid' })

      const url = router.urlFor('post_uuid', { uuid: '550e8400-e29b-41d4-a716-446655440000' })

      expect(url).toBe('/posts/550e8400-e29b-41d4-a716-446655440000')
    })

    test('handles boolean query parameters', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', { published: true })

      expect(url).toBe('/posts?published=true')
    })

    test('ignores null and undefined query params', () => {
      router.get('/posts', 'posts#index', { as: 'posts' })

      const url = router.urlFor('posts', { page: 1, skip: null, ignore: undefined })

      expect(url).toBe('/posts?page=1')
    })
  })

  describe('namespaced routes', () => {
    test('generates URL for namespaced route', () => {
      router.namespace('admin', () => {
        router.get('/users', 'users#index', { as: 'admin_users' })
      })

      const url = router.urlFor('admin_users')

      expect(url).toBe('/admin/users')
    })

    test('generates URL for deeply nested namespace with params', () => {
      router.namespace('api', () => {
        router.namespace('v1', () => {
          router.get('/posts/:id', 'posts#show', { as: 'api_v1_post' })
        })
      })

      const url = router.urlFor('api_v1_post', { id: 42 })

      expect(url).toBe('/api/v1/posts/42')
    })
  })

  describe('helper method: _extractParamNames', () => {
    test('extracts single param name', () => {
      const names = router._extractParamNames('/posts/:id')
      expect(names).toEqual(['id'])
    })

    test('extracts multiple param names', () => {
      const names = router._extractParamNames('/users/:user_id/posts/:id/comments/:comment_id')
      expect(names).toEqual(['user_id', 'id', 'comment_id'])
    })

    test('returns empty array for path without params', () => {
      const names = router._extractParamNames('/posts')
      expect(names).toEqual([])
    })

    test('handles root path', () => {
      const names = router._extractParamNames('/')
      expect(names).toEqual([])
    })
  })

  describe('buildQueryString', () => {
    test('builds simple query string', () => {
      const qs = buildQueryString({ page: 1, per_page: 10 })
      expect(qs).toBe('page=1&per_page=10')
    })

    test('encodes special characters', () => {
      const qs = buildQueryString({ search: 'hello world', tag: 'a+b' })
      expect(qs).toBe('search=hello%20world&tag=a%2Bb')
    })

    test('handles array values', () => {
      const qs = buildQueryString({ ids: [1, 2, 3] })
      expect(qs).toBe('ids[]=1&ids[]=2&ids[]=3')
    })

    test('handles nested object values', () => {
      const qs = buildQueryString({ filter: { status: 'active' } })
      expect(qs).toBe('filter[status]=active')
    })

    test('returns empty string for empty object', () => {
      const qs = buildQueryString({})
      expect(qs).toBe('')
    })
  })
})

describe('Router.urlFor() integration', () => {
  test('round-trip: urlFor generates URL that match() can match', () => {
    const router = new Router()
    router.get('/posts/:id', 'posts#show', { as: 'post' })

    const generatedUrl = router.urlFor('post', { id: 123 })
    const match = router.match('GET', generatedUrl)

    expect(match).not.toBeNull()
    expect(match.params.id).toBe('123')
    expect(match.action).toBe('show')
  })

  test('round-trip with multiple params', () => {
    const router = new Router()
    router.get('/users/:user_id/posts/:id/comments/:comment_id', 'comments#show', { as: 'user_post_comment' })

    const generatedUrl = router.urlFor('user_post_comment', {
      user_id: 1,
      id: 2,
      comment_id: 3
    })
    const match = router.match('GET', generatedUrl)

    expect(match).not.toBeNull()
    expect(match.params).toEqual({
      user_id: '1',
      id: '2',
      comment_id: '3'
    })
  })

  test('URL with query params can be matched (query stripped)', () => {
    const router = new Router()
    router.get('/search', 'search#index', { as: 'search' })

    const generatedUrl = router.urlFor('search', { q: 'test', page: 2 })
    expect(generatedUrl).toBe('/search?q=test&page=2')

    const match = router.match('GET', generatedUrl)
    expect(match).not.toBeNull()
    expect(match.action).toBe('index')
  })
})
