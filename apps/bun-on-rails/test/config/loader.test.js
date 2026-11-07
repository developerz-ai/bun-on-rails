/**
 * Configuration Loader Tests
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import {
  Config,
  createConfig,
  loadConfig,
  getConfig,
  setConfig,
  getEnvironment,
  isDevelopment,
  isProduction,
  isTest,
  defaultConfig
} from '../../src/config/loader.js'

// Test fixtures directory
const fixturesDir = join(import.meta.dir, '../fixtures/config')

// Helper to create test config files
function createTestConfigFiles(configs) {
  // Clean up existing fixtures
  if (existsSync(fixturesDir)) {
    rmSync(fixturesDir, { recursive: true })
  }

  mkdirSync(fixturesDir, { recursive: true })
  mkdirSync(join(fixturesDir, 'config'), { recursive: true })
  mkdirSync(join(fixturesDir, 'config/environments'), { recursive: true })

  for (const [name, content] of Object.entries(configs)) {
    const filePath = join(fixturesDir, 'config', name)
    // Ensure directory exists for nested paths
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(filePath, content)
  }
}

// Cleanup helper
function cleanupFixtures() {
  if (existsSync(fixturesDir)) {
    rmSync(fixturesDir, { recursive: true })
  }
}

describe('getEnvironment', () => {
  const originalBunEnv = process.env.BUN_ENV
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    // Restore environment
    if (originalBunEnv !== undefined) {
      process.env.BUN_ENV = originalBunEnv
    } else {
      delete process.env.BUN_ENV
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
  })

  test('returns BUN_ENV if set', () => {
    process.env.BUN_ENV = 'staging'
    process.env.NODE_ENV = 'production'
    expect(getEnvironment()).toBe('staging')
  })

  test('returns NODE_ENV if BUN_ENV not set', () => {
    delete process.env.BUN_ENV
    process.env.NODE_ENV = 'production'
    expect(getEnvironment()).toBe('production')
  })

  test('defaults to development', () => {
    delete process.env.BUN_ENV
    delete process.env.NODE_ENV
    expect(getEnvironment()).toBe('development')
  })
})

describe('environment helpers', () => {
  const originalBunEnv = process.env.BUN_ENV
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    if (originalBunEnv !== undefined) {
      process.env.BUN_ENV = originalBunEnv
    } else {
      delete process.env.BUN_ENV
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
  })

  test('isDevelopment returns true in development', () => {
    process.env.BUN_ENV = 'development'
    expect(isDevelopment()).toBe(true)
  })

  test('isProduction returns true in production', () => {
    process.env.BUN_ENV = 'production'
    expect(isProduction()).toBe(true)
  })

  test('isTest returns true in test', () => {
    process.env.BUN_ENV = 'test'
    expect(isTest()).toBe(true)
  })
})

describe('Config class', () => {
  describe('constructor', () => {
    test('creates empty config', () => {
      const config = new Config()
      expect(config.loaded).toBe(false)
      expect(config.all()).toEqual({})
    })

    test('sets appRoot to cwd by default', () => {
      const config = new Config()
      expect(config.appRoot).toBe(process.cwd())
    })
  })

  describe('get/set', () => {
    let config

    beforeEach(() => {
      config = new Config()
    })

    test('get returns undefined for missing key', () => {
      expect(config.get('missing')).toBeUndefined()
    })

    test('get returns default value for missing key', () => {
      expect(config.get('missing', 'default')).toBe('default')
    })

    test('set and get simple value', () => {
      config.set('key', 'value')
      expect(config.get('key')).toBe('value')
    })

    test('set and get nested value', () => {
      config.set('database.host', 'localhost')
      expect(config.get('database.host')).toBe('localhost')
      expect(config.get('database')).toEqual({ host: 'localhost' })
    })

    test('set deeply nested value', () => {
      config.set('a.b.c.d', 'deep')
      expect(config.get('a.b.c.d')).toBe('deep')
    })

    test('get with dot notation', () => {
      config.merge({
        database: {
          pool: {
            min: 2,
            max: 10
          }
        }
      })
      expect(config.get('database.pool.min')).toBe(2)
      expect(config.get('database.pool.max')).toBe(10)
    })
  })

  describe('has', () => {
    test('returns false for missing key', () => {
      const config = new Config()
      expect(config.has('missing')).toBe(false)
    })

    test('returns true for existing key', () => {
      const config = new Config()
      config.set('exists', 'value')
      expect(config.has('exists')).toBe(true)
    })

    test('returns true for nested key', () => {
      const config = new Config()
      config.set('a.b.c', 'value')
      expect(config.has('a.b.c')).toBe(true)
      expect(config.has('a.b')).toBe(true)
    })
  })

  describe('require', () => {
    test('returns value if exists', () => {
      const config = new Config()
      config.set('key', 'value')
      expect(config.require('key')).toBe('value')
    })

    test('throws if key does not exist', () => {
      const config = new Config()
      expect(() => config.require('missing')).toThrow(
        'Required configuration key "missing" is not set'
      )
    })
  })

  describe('section', () => {
    test('returns empty object for missing section', () => {
      const config = new Config()
      expect(config.section('missing')).toEqual({})
    })

    test('returns section object', () => {
      const config = new Config()
      config.merge({
        database: {
          host: 'localhost',
          port: 5432
        }
      })
      expect(config.section('database')).toEqual({
        host: 'localhost',
        port: 5432
      })
    })
  })

  describe('merge', () => {
    test('merges config objects', () => {
      const config = new Config()
      config.merge({ a: 1 })
      config.merge({ b: 2 })
      expect(config.all()).toEqual({ a: 1, b: 2 })
    })

    test('deep merges nested objects', () => {
      const config = new Config()
      config.merge({
        database: {
          host: 'localhost',
          port: 5432
        }
      })
      config.merge({
        database: {
          host: 'production.db.com',
          ssl: true
        }
      })
      expect(config.get('database')).toEqual({
        host: 'production.db.com',
        port: 5432,
        ssl: true
      })
    })

    test('arrays are replaced, not merged', () => {
      const config = new Config()
      config.merge({ items: [1, 2, 3] })
      config.merge({ items: [4, 5] })
      expect(config.get('items')).toEqual([4, 5])
    })
  })
})

describe('createConfig', () => {
  test('creates config with defaults', () => {
    const config = createConfig()
    expect(config.get('server.port')).toBe(3000)
    expect(config.get('database.adapter')).toBe('postgresql')
    expect(config.get('cache.store')).toBe('memory')
  })

  test('allows overriding defaults', () => {
    const config = createConfig({
      server: { port: 8080 }
    })
    expect(config.get('server.port')).toBe(8080)
    expect(config.get('server.host')).toBe('0.0.0.0')
  })
})

describe('defaultConfig', () => {
  test('has server configuration', () => {
    expect(defaultConfig.server.host).toBe('0.0.0.0')
    expect(defaultConfig.server.port).toBe(3000)
  })

  test('has database configuration', () => {
    expect(defaultConfig.database.adapter).toBe('postgresql')
    expect(defaultConfig.database.port).toBe(5432)
    expect(defaultConfig.database.pool.min).toBe(2)
    expect(defaultConfig.database.pool.max).toBe(10)
  })

  test('has redis configuration', () => {
    // Redis host is null by default (disabled)
    expect(defaultConfig.redis.host).toBeNull()
    expect(defaultConfig.redis.port).toBe(6379)
  })

  test('has cache configuration', () => {
    expect(defaultConfig.cache.store).toBe('memory')
    expect(defaultConfig.cache.ttl).toBe(3600)
  })

  test('has jobs configuration', () => {
    expect(defaultConfig.jobs.adapter).toBe('memory')
    expect(defaultConfig.jobs.concurrency).toBe(5)
  })

  test('has mail configuration', () => {
    expect(defaultConfig.mail.adapter).toBe('console')
  })

  test('has storage configuration', () => {
    expect(defaultConfig.storage.adapter).toBe('local')
  })

  test('has session configuration', () => {
    expect(defaultConfig.session.ttl).toBe(86400 * 7)
  })

  test('has logging configuration', () => {
    expect(defaultConfig.logging.level).toBe('info')
    expect(defaultConfig.logging.format).toBe('pretty')
  })
})

describe('loadConfig', () => {
  afterEach(() => {
    cleanupFixtures()
  })

  test('loads base config files', async () => {
    createTestConfigFiles({
      'database.js': `export default { host: 'localhost', port: 5432 }`,
      'cache.js': `export default { store: 'redis', ttl: 7200 }`
    })

    const config = await loadConfig({ root: fixturesDir })

    expect(config.get('database.host')).toBe('localhost')
    expect(config.get('database.port')).toBe(5432)
    expect(config.get('cache.store')).toBe('redis')
    expect(config.get('cache.ttl')).toBe(7200)
  })

  test('merges environment-specific config', async () => {
    const originalEnv = process.env.BUN_ENV
    process.env.BUN_ENV = 'test'

    try {
      createTestConfigFiles({
        'database.js': `export default { host: 'localhost', port: 5432, database: 'myapp_dev' }`,
        'environments/test.js': `export default { database: { database: 'myapp_test', host: 'test-db' } }`
      })

      const config = await loadConfig({ root: fixturesDir })

      expect(config.get('database.host')).toBe('test-db')
      expect(config.get('database.database')).toBe('myapp_test')
      expect(config.get('database.port')).toBe(5432) // Preserved from base
    } finally {
      if (originalEnv !== undefined) {
        process.env.BUN_ENV = originalEnv
      } else {
        delete process.env.BUN_ENV
      }
    }
  })

  test('loads production environment config', async () => {
    const originalEnv = process.env.BUN_ENV
    process.env.BUN_ENV = 'production'

    try {
      createTestConfigFiles({
        'server.js': `export default { port: 3000 }`,
        'environments/production.js': `export default { server: { port: 80 }, logging: { format: 'json' } }`
      })

      const config = await loadConfig({ root: fixturesDir })

      expect(config.get('server.port')).toBe(80)
      expect(config.get('logging.format')).toBe('json')
    } finally {
      if (originalEnv !== undefined) {
        process.env.BUN_ENV = originalEnv
      } else {
        delete process.env.BUN_ENV
      }
    }
  })

  test('supports named exports', async () => {
    createTestConfigFiles({
      'routes.js': `
        export const prefix = '/api'
        export const version = 'v1'
      `
    })

    const config = await loadConfig({ root: fixturesDir })

    expect(config.get('routes.prefix')).toBe('/api')
    expect(config.get('routes.version')).toBe('v1')
  })

  test('handles missing config directory gracefully', async () => {
    const config = await loadConfig({ root: '/nonexistent/path' })
    expect(config.loaded).toBe(true)
    // Should still have defaults
    expect(config.get('server.port')).toBe(3000)
  })

  test('sets loaded flag after loading', async () => {
    createTestConfigFiles({})
    const config = await loadConfig({ root: fixturesDir })
    expect(config.loaded).toBe(true)
  })
})

describe('global config', () => {
  test('getConfig returns same instance', () => {
    const config1 = getConfig()
    const config2 = getConfig()
    expect(config1).toBe(config2)
  })

  test('setConfig replaces global instance', () => {
    const newConfig = new Config()
    newConfig.set('custom', 'value')
    setConfig(newConfig)

    expect(getConfig().get('custom')).toBe('value')
  })

  test('loadConfig sets global config', async () => {
    cleanupFixtures()
    createTestConfigFiles({
      'app.js': `export default { name: 'TestApp' }`
    })

    await loadConfig({ root: fixturesDir })

    expect(getConfig().get('app.name')).toBe('TestApp')

    cleanupFixtures()
  })
})

describe('env property', () => {
  test('config.env returns current environment', () => {
    const originalEnv = process.env.BUN_ENV
    process.env.BUN_ENV = 'staging'

    try {
      const config = new Config()
      expect(config.env).toBe('staging')
    } finally {
      if (originalEnv !== undefined) {
        process.env.BUN_ENV = originalEnv
      } else {
        delete process.env.BUN_ENV
      }
    }
  })
})
