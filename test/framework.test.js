/**
 * Framework Tests
 */

import { test, expect, describe } from 'bun:test'
import {
  Model,
  Controller,
  Router,
  Job,
  Mailer,
  Channel,
  Cache,
  Storage,
  factory,
} from '../src/index.js'

describe('Framework exports', () => {
  test('exports Model class', () => {
    expect(Model).toBeDefined()
    expect(typeof Model).toBe('function')
  })

  test('exports Controller class', () => {
    expect(Controller).toBeDefined()
    expect(typeof Controller).toBe('function')
  })

  test('exports Router class', () => {
    expect(Router).toBeDefined()
    expect(typeof Router).toBe('function')
  })

  test('exports Job class', () => {
    expect(Job).toBeDefined()
    expect(typeof Job).toBe('function')
  })

  test('exports Mailer class', () => {
    expect(Mailer).toBeDefined()
    expect(typeof Mailer).toBe('function')
  })

  test('exports Channel class', () => {
    expect(Channel).toBeDefined()
    expect(typeof Channel).toBe('function')
  })

  test('exports Cache class', () => {
    expect(Cache).toBeDefined()
    expect(typeof Cache).toBe('function')
  })

  test('exports Storage class', () => {
    expect(Storage).toBeDefined()
    expect(typeof Storage).toBe('function')
  })

  test('exports factory instance', () => {
    expect(factory).toBeDefined()
    expect(typeof factory.define).toBe('function')
    expect(typeof factory.build).toBe('function')
    expect(typeof factory.create).toBe('function')
  })
})

describe('Model', () => {
  test('can create instance with attributes', () => {
    const model = new Model({ name: 'test', value: 123 })
    expect(model.attributes.name).toBe('test')
    expect(model.attributes.value).toBe(123)
  })

  test('has errors object', () => {
    const model = new Model({})
    expect(model.errors).toEqual({})
  })
})

describe('Controller', () => {
  test('can render JSON response', () => {
    const mockContext = {
      request: null,
      params: {},
      session: {},
      currentUser: null,
      http: null,
      cache: null,
      temp: null,
      db: null
    }
    const controller = new Controller(mockContext)
    const response = controller.render({ message: 'hello' })

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  test('can redirect', () => {
    const mockContext = {
      request: null,
      params: {},
      session: {},
      currentUser: null,
      http: null,
      cache: null,
      temp: null,
      db: null
    }
    const controller = new Controller(mockContext)
    const response = controller.redirect('/dashboard')

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/dashboard')
  })
})

describe('Router', () => {
  test('can define routes', () => {
    const router = new Router()

    router.get('/posts', 'posts#index')
    router.post('/posts', 'posts#create')

    expect(router.routes.length).toBe(2)
    expect(router.routes[0].method).toBe('GET')
    expect(router.routes[0].path).toBe('/posts')
    expect(router.routes[1].method).toBe('POST')
  })

  test('can define resourceful routes', () => {
    const router = new Router()

    router.resources('posts')

    // Should create standard CRUD routes
    const methods = router.routes.map(r => r.method)
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
    expect(methods).toContain('PATCH')
    expect(methods).toContain('DELETE')
  })

  test('can define namespaced routes', () => {
    const router = new Router()

    router.namespace('admin', () => {
      router.get('/users', 'users#index')
    })

    expect(router.routes[0].path).toBe('/admin/users')
    expect(router.routes[0].controller).toBe('admin/users')
  })
})

describe('Factory', () => {
  class FrameworkFactoryWidget extends Model {}
  FrameworkFactoryWidget.register()

  test('can define and build models', async () => {
    factory.define('testModel', {
      name: 'Test',
      value: 42
    }, { model: FrameworkFactoryWidget })

    const instance = await factory.build('testModel')
    expect(instance.attributes.name).toBe('Test')
    expect(instance.attributes.value).toBe(42)
  })

  test('can override attributes when building', async () => {
    factory.define('overrideTest', {
      name: 'Default',
      value: 0
    }, { model: 'FrameworkFactoryWidget' })

    const instance = await factory.build('overrideTest', { value: 100 })
    expect(instance.attributes.value).toBe(100)
  })

  test('supports sequences', () => {
    const seq1 = factory.sequence('testSeq')
    const seq2 = factory.sequence('testSeq')
    const seq3 = factory.sequence('testSeq')

    expect(seq1).toBe(1)
    expect(seq2).toBe(2)
    expect(seq3).toBe(3)
  })
})
