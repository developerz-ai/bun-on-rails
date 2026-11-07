/**
 * Request Parser Tests
 *
 * Unit tests for request parameter parsing: query params, JSON body,
 * form data, and file uploads.
 */

import { test, expect, describe } from 'bun:test'
import {
  parseRequest,
  parseQueryString,
  parseBody,
  RequestParams,
  requestParserMiddleware
} from '../../src/controller/request_parser.js'

describe('parseQueryString', () => {
  test('parses simple query parameters', () => {
    const url = new URL('http://example.com?name=John&age=30')
    const params = parseQueryString(url.searchParams)

    expect(params.name).toBe('John')
    expect(params.age).toBe('30')
  })

  test('parses URL-encoded values', () => {
    const url = new URL('http://example.com?message=Hello%20World&emoji=%F0%9F%98%80')
    const params = parseQueryString(url.searchParams)

    expect(params.message).toBe('Hello World')
    expect(params.emoji).toBe('😀')
  })

  test('handles nested bracket notation - simple', () => {
    const url = new URL('http://example.com?user[name]=John&user[email]=john@example.com')
    const params = parseQueryString(url.searchParams)

    expect(params.user).toBeDefined()
    expect(params.user.name).toBe('John')
    expect(params.user.email).toBe('john@example.com')
  })

  test('handles nested bracket notation - deep', () => {
    const url = new URL('http://example.com?user[address][city]=NYC&user[address][zip]=10001')
    const params = parseQueryString(url.searchParams)

    expect(params.user.address.city).toBe('NYC')
    expect(params.user.address.zip).toBe('10001')
  })

  test('handles array notation with []', () => {
    const url = new URL('http://example.com?tags[]=javascript&tags[]=typescript&tags[]=bun')
    const params = parseQueryString(url.searchParams)

    expect(Array.isArray(params.tags)).toBe(true)
    expect(params.tags).toEqual(['javascript', 'typescript', 'bun'])
  })

  test('handles array notation with indexes', () => {
    const url = new URL('http://example.com?items[0]=first&items[1]=second&items[2]=third')
    const params = parseQueryString(url.searchParams)

    expect(Array.isArray(params.items)).toBe(true)
    expect(params.items[0]).toBe('first')
    expect(params.items[1]).toBe('second')
    expect(params.items[2]).toBe('third')
  })

  test('handles multiple values for same key', () => {
    const url = new URL('http://example.com?color=red&color=blue&color=green')
    const params = parseQueryString(url.searchParams)

    expect(Array.isArray(params.color)).toBe(true)
    expect(params.color).toEqual(['red', 'blue', 'green'])
  })

  test('handles empty query string', () => {
    const url = new URL('http://example.com')
    const params = parseQueryString(url.searchParams)

    expect(params).toEqual({})
  })

  test('handles empty values', () => {
    const url = new URL('http://example.com?empty=&name=John')
    const params = parseQueryString(url.searchParams)

    expect(params.empty).toBe('')
    expect(params.name).toBe('John')
  })

  test('handles special characters in values', () => {
    const url = new URL('http://example.com?query=a%2Bb%3Dc&path=%2Fhome%2Fuser')
    const params = parseQueryString(url.searchParams)

    expect(params.query).toBe('a+b=c')
    expect(params.path).toBe('/home/user')
  })
})

describe('parseBody - JSON', () => {
  test('parses JSON body', async () => {
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello', body: 'World' })
    })

    const { body, files } = await parseBody(request, 'application/json')

    expect(body.title).toBe('Hello')
    expect(body.body).toBe('World')
    expect(files).toEqual({})
  })

  test('parses nested JSON objects', async () => {
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: {
          name: 'John',
          address: { city: 'NYC', zip: '10001' }
        }
      })
    })

    const { body } = await parseBody(request, 'application/json')

    expect(body.user.name).toBe('John')
    expect(body.user.address.city).toBe('NYC')
  })

  test('parses JSON arrays', async () => {
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['a', 'b', 'c'] })
    })

    const { body } = await parseBody(request, 'application/json')

    expect(body.tags).toEqual(['a', 'b', 'c'])
  })

  test('handles invalid JSON gracefully', async () => {
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json {'
    })

    const { body } = await parseBody(request, 'application/json')

    expect(body).toEqual({})
  })

  test('handles JSON with charset', async () => {
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name: 'Test' })
    })

    const { body } = await parseBody(request, 'application/json; charset=utf-8')

    expect(body.name).toBe('Test')
  })
})

describe('parseBody - Form URL-encoded', () => {
  test('parses URL-encoded form data', async () => {
    const formData = new URLSearchParams()
    formData.append('username', 'john')
    formData.append('password', 'secret')

    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })

    const { body } = await parseBody(request, 'application/x-www-form-urlencoded')

    expect(body.username).toBe('john')
    expect(body.password).toBe('secret')
  })

  test('parses nested form data with bracket notation', async () => {
    const formData = new URLSearchParams()
    formData.append('user[name]', 'John')
    formData.append('user[email]', 'john@example.com')

    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })

    const { body } = await parseBody(request, 'application/x-www-form-urlencoded')

    expect(body.user.name).toBe('John')
    expect(body.user.email).toBe('john@example.com')
  })
})

describe('parseBody - Multipart Form Data', () => {
  test('parses multipart form fields', async () => {
    const formData = new FormData()
    formData.append('title', 'My Post')
    formData.append('body', 'Post content here')

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')
    const { body, files } = await parseBody(request, contentType)

    expect(body.title).toBe('My Post')
    expect(body.body).toBe('Post content here')
    expect(Object.keys(files).length).toBe(0)
  })

  test('parses file uploads', async () => {
    const formData = new FormData()
    formData.append('title', 'My Post')

    // Create a mock file
    const fileContent = 'Hello, World!'
    const file = new File([fileContent], 'test.txt', { type: 'text/plain' })
    formData.append('attachment', file)

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')
    const { body, files } = await parseBody(request, contentType)

    expect(body.title).toBe('My Post')
    expect(files.attachment).toBeDefined()
    expect(files.attachment.name).toBe('test.txt')
    // MIME type may include charset
    expect(files.attachment.type).toContain('text/plain')
    expect(files.attachment.size).toBe(fileContent.length)
  })

  test('parses multiple file uploads with array notation', async () => {
    const formData = new FormData()
    formData.append('files[]', new File(['content1'], 'file1.txt', { type: 'text/plain' }))
    formData.append('files[]', new File(['content2'], 'file2.txt', { type: 'text/plain' }))

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')
    const { files } = await parseBody(request, contentType)

    expect(Array.isArray(files.files)).toBe(true)
    expect(files.files.length).toBe(2)
    expect(files.files[0].name).toBe('file1.txt')
    expect(files.files[1].name).toBe('file2.txt')
  })

  test('file has helper methods', async () => {
    const formData = new FormData()
    const file = new File(['Test content'], 'test.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')
    const { files } = await parseBody(request, contentType)

    expect(typeof files.file.buffer).toBe('function')
    expect(typeof files.file.text).toBe('function')
    expect(typeof files.file.saveTo).toBe('function')

    // Test text() method
    const text = await files.file.text()
    expect(text).toBe('Test content')

    // Test buffer() method
    const buffer = await files.file.buffer()
    expect(buffer.toString()).toBe('Test content')
  })

  test('enforces max files limit', async () => {
    const formData = new FormData()
    for (let i = 0; i < 5; i++) {
      formData.append('files[]', new File(['x'], `file${i}.txt`))
    }

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')

    // parseBody with throwOnError option
    let errorThrown = false
    try {
      await parseBody(request, contentType, { maxFiles: 3, throwOnError: true })
    } catch (e) {
      errorThrown = true
      expect(e.message).toMatch(/Too many files/)
    }
    expect(errorThrown).toBe(true)
  })

  test('enforces file size limit', async () => {
    const largeContent = 'x'.repeat(1000)
    const formData = new FormData()
    formData.append('file', new File([largeContent], 'large.txt'))

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')

    let errorThrown = false
    try {
      await parseBody(request, contentType, { maxFileSize: 100, throwOnError: true })
    } catch (e) {
      errorThrown = true
      expect(e.message).toMatch(/File too large/)
    }
    expect(errorThrown).toBe(true)
  })

  test('enforces allowed MIME types', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'script.js', { type: 'application/javascript' }))

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const contentType = request.headers.get('content-type')

    let errorThrown = false
    try {
      await parseBody(request, contentType, { allowedMimeTypes: ['image/jpeg', 'image/png'], throwOnError: true })
    } catch (e) {
      errorThrown = true
      expect(e.message).toMatch(/File type not allowed/)
    }
    expect(errorThrown).toBe(true)
  })
})

describe('parseRequest', () => {
  test('merges route params, query params, and body', async () => {
    const request = new Request('http://example.com/posts/123?page=1&limit=10', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello', body: 'World' })
    })

    const routeParams = { id: '123', controller: 'posts' }
    const parsed = await parseRequest(request, routeParams)

    // Route params
    expect(parsed.params.id).toBe('123')
    expect(parsed.params.controller).toBe('posts')

    // Query params
    expect(parsed.params.page).toBe('1')
    expect(parsed.params.limit).toBe('10')
    expect(parsed.query.page).toBe('1')

    // Body params
    expect(parsed.params.title).toBe('Hello')
    expect(parsed.body.title).toBe('Hello')
  })

  test('later params override earlier ones', async () => {
    const request = new Request('http://example.com?name=QueryName', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'BodyName' })
    })

    const routeParams = { name: 'RouteName' }
    const parsed = await parseRequest(request, routeParams)

    // Body should override query, which should override route
    expect(parsed.params.name).toBe('BodyName')
  })

  test('reports hasFiles correctly', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'test.txt'))

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const parsed = await parseRequest(request)
    expect(parsed.hasFiles).toBe(true)

    const jsonRequest = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })

    const parsed2 = await parseRequest(jsonRequest)
    expect(parsed2.hasFiles).toBe(false)
  })

  test('handles GET requests (no body)', async () => {
    const request = new Request('http://example.com?search=test')

    const parsed = await parseRequest(request)

    expect(parsed.query.search).toBe('test')
    expect(parsed.body).toEqual({})
    expect(parsed.params.search).toBe('test')
  })
})

describe('RequestParams', () => {
  describe('get()', () => {
    test('gets simple parameter', () => {
      const params = new RequestParams({ name: 'John', age: '30' })

      expect(params.get('name')).toBe('John')
      expect(params.get('age')).toBe('30')
    })

    test('gets nested parameter with dot notation', () => {
      const params = new RequestParams({
        user: { name: 'John', address: { city: 'NYC' } }
      })

      expect(params.get('user.name')).toBe('John')
      expect(params.get('user.address.city')).toBe('NYC')
    })

    test('returns default value for missing parameter', () => {
      const params = new RequestParams({ name: 'John' })

      expect(params.get('missing', 'default')).toBe('default')
      expect(params.get('also.missing', 42)).toBe(42)
    })

    test('returns undefined for missing parameter without default', () => {
      const params = new RequestParams({})

      expect(params.get('missing')).toBeUndefined()
    })
  })

  describe('has()', () => {
    test('returns true for existing parameter', () => {
      const params = new RequestParams({ name: 'John' })

      expect(params.has('name')).toBe(true)
    })

    test('returns false for missing parameter', () => {
      const params = new RequestParams({})

      expect(params.has('missing')).toBe(false)
    })

    test('works with nested keys', () => {
      const params = new RequestParams({ user: { name: 'John' } })

      expect(params.has('user.name')).toBe(true)
      expect(params.has('user.email')).toBe(false)
    })
  })

  describe('require()', () => {
    test('returns value for existing parameter', () => {
      const params = new RequestParams({ id: '123' })

      expect(params.require('id')).toBe('123')
    })

    test('throws for missing parameter', () => {
      const params = new RequestParams({})

      expect(() => params.require('id')).toThrow(/Missing required parameter: id/)
    })

    test('throws for null parameter', () => {
      const params = new RequestParams({ value: null })

      expect(() => params.require('value')).toThrow(/Missing required parameter/)
    })

    test('throws for empty string parameter', () => {
      const params = new RequestParams({ value: '' })

      expect(() => params.require('value')).toThrow(/Missing required parameter/)
    })

    test('thrown error has 400 status', () => {
      const params = new RequestParams({})

      try {
        params.require('missing')
      } catch (error) {
        expect(error.status).toBe(400)
      }
    })
  })

  describe('permit()', () => {
    test('permits simple keys', () => {
      const params = new RequestParams({
        title: 'Hello',
        body: 'World',
        admin: true
      })

      const permitted = params.permit('title', 'body')

      expect(permitted.get('title')).toBe('Hello')
      expect(permitted.get('body')).toBe('World')
      expect(permitted.get('admin')).toBeUndefined()
    })

    test('permits nested object keys', () => {
      const params = new RequestParams({
        user: {
          name: 'John',
          email: 'john@example.com',
          admin: true,
          password_hash: 'secret'
        }
      })

      const permitted = params.permit({ user: ['name', 'email'] })

      expect(permitted.get('user.name')).toBe('John')
      expect(permitted.get('user.email')).toBe('john@example.com')
      expect(permitted.get('user.admin')).toBeUndefined()
      expect(permitted.get('user.password_hash')).toBeUndefined()
    })

    test('permits arrays with empty array notation', () => {
      const params = new RequestParams({
        tags: ['javascript', 'typescript', 'bun']
      })

      const permitted = params.permit({ tags: [] })

      expect(permitted.toObject().tags).toEqual(['javascript', 'typescript', 'bun'])
    })

    test('ignores non-existent keys', () => {
      const params = new RequestParams({ name: 'John' })

      const permitted = params.permit('name', 'missing')

      expect(permitted.toObject()).toEqual({ name: 'John' })
    })

    test('returns new RequestParams instance', () => {
      const params = new RequestParams({ name: 'John' })
      const permitted = params.permit('name')

      expect(permitted).toBeInstanceOf(RequestParams)
      expect(permitted).not.toBe(params)
    })
  })

  describe('toObject()', () => {
    test('returns plain object copy', () => {
      const original = { name: 'John', age: 30 }
      const params = new RequestParams(original)

      const obj = params.toObject()

      expect(obj).toEqual(original)
      expect(obj).not.toBe(original)
    })
  })

  describe('keys()', () => {
    test('returns all parameter keys', () => {
      const params = new RequestParams({ a: 1, b: 2, c: 3 })

      expect(params.keys()).toEqual(['a', 'b', 'c'])
    })
  })

  describe('isEmpty()', () => {
    test('returns true for empty params', () => {
      const params = new RequestParams({})

      expect(params.isEmpty()).toBe(true)
    })

    test('returns false for non-empty params', () => {
      const params = new RequestParams({ name: 'John' })

      expect(params.isEmpty()).toBe(false)
    })
  })

  describe('security', () => {
    test('prevents prototype pollution in permit', () => {
      const params = new RequestParams({
        '__proto__': { polluted: true },
        'constructor': { polluted: true },
        'prototype': { polluted: true },
        'safe': 'value'
      })

      const permitted = params.permit('__proto__', 'constructor', 'prototype', 'safe')
      const obj = permitted.toObject()

      expect(obj.safe).toBe('value')
      // Dangerous keys should not affect Object prototype
      expect({}.polluted).toBeUndefined()

      // The object itself may have these keys as regular properties,
      // but they should not affect prototype chain
      const testObj = {}
      expect(testObj.polluted).toBeUndefined()
    })
  })
})

describe('requestParserMiddleware', () => {
  test('attaches parsed data to context', async () => {
    const request = new Request('http://example.com/test?page=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello' })
    })

    const context = {
      request,
      params: { id: '123' },
      _match: { params: { id: '123' } }
    }

    const middleware = requestParserMiddleware()
    let nextCalled = false

    await middleware(context, async () => {
      nextCalled = true
      return new Response('OK')
    })

    expect(nextCalled).toBe(true)
    expect(context.query.page).toBe('1')
    expect(context.body.title).toBe('Hello')
    expect(context.params.id).toBe('123')
    expect(context.params.page).toBe('1')
    expect(context.params.title).toBe('Hello')
    expect(context.hasFiles).toBe(false)
  })

  test('returns 413 for payload too large when throwOnError is true', async () => {
    const largeBody = JSON.stringify({ data: 'x'.repeat(200) })
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(largeBody.length)
      },
      body: largeBody
    })

    const context = { request, params: {} }
    // Using a very small maxBodySize to trigger the error
    const middleware = requestParserMiddleware({ maxBodySize: 50, throwOnError: true })

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(413)
    const data = await response.json()
    expect(data.error).toBe('Payload Too Large')
  })

  test('returns 415 for unsupported media type when throwOnError is true', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'test.exe', { type: 'application/x-executable' }))

    const request = new Request('http://example.com', {
      method: 'POST',
      body: formData
    })

    const context = { request, params: {} }
    const middleware = requestParserMiddleware({ allowedMimeTypes: ['image/jpeg'], throwOnError: true })

    const response = await middleware(context, async () => new Response('OK'))

    expect(response.status).toBe(415)
    const data = await response.json()
    expect(data.error).toBe('Unsupported Media Type')
  })

  test('handles parsing errors gracefully when throwOnError is false', async () => {
    const request = new Request('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {'
    })

    const context = { request, params: { id: '123' } }
    const middleware = requestParserMiddleware()

    let nextCalled = false
    await middleware(context, async () => {
      nextCalled = true
      return new Response('OK')
    })

    // Should continue despite parse error
    expect(nextCalled).toBe(true)
    expect(context.body).toEqual({})
    expect(context.params.id).toBe('123')
  })
})
