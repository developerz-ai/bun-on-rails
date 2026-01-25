/**
 * N+1 Query Detection Tests
 *
 * Tests the N+1 query detection system including:
 * - Query tracking and fingerprinting
 * - Pattern detection across time windows
 * - Warning emission
 * - Configuration options
 * - Integration with QueryBuilder
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import {
  N1QueryDetector,
  trackQuery,
  configureN1Detection,
  enableN1Detection,
  disableN1Detection,
  resetN1Detection,
  getN1Stats
} from '../../src/database/n_plus_one_detector.js'
import { Model } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'
import { defineAssociations } from '../../src/database/associations.js'

// Mock isDevelopment to control test behavior
let mockIsDevelopment = true
mock.module('../../src/config/loader.js', () => ({
  isDevelopment: () => mockIsDevelopment,
  isProduction: () => !mockIsDevelopment,
  isTest: () => false,
  getEnvironment: () => mockIsDevelopment ? 'development' : 'production'
}))

// Mock connection for tests
class MockConnection {
  constructor() {
    this.connected = true
    this.queries = []
    this.mockResults = []
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params })
    return this.mockResults.shift() || []
  }

  setMockResults(results) {
    this.mockResults = [...results]
  }

  getLastQuery() {
    return this.queries[this.queries.length - 1]
  }

  clearQueries() {
    this.queries = []
  }
}

describe('N+1 Query Detection', () => {
  beforeEach(() => {
    resetN1Detection()
    mockIsDevelopment = true
    configureN1Detection({
      threshold: 3,
      windowMs: 1000,
      includeStackTrace: false  // Disable for cleaner tests
    })
  })

  afterEach(() => {
    resetN1Detection()
  })

  describe('Query Fingerprinting', () => {
    it('generates consistent fingerprints for similar queries', () => {
      // Track multiple similar queries
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [3])

      const stats = getN1Stats()

      // Should group all as same pattern
      expect(stats.totalTracked).toBe(3)
      const patterns = Object.keys(stats.patterns)
      expect(patterns.length).toBe(1)
      expect(patterns[0]).toContain('users')
    })

    it('differentiates queries with different WHERE columns', () => {
      trackQuery('SELECT * FROM "posts" WHERE "user_id" = $1', [1])
      trackQuery('SELECT * FROM "posts" WHERE "category_id" = $1', [1])

      const stats = getN1Stats()
      expect(Object.keys(stats.patterns).length).toBe(2)
    })

    it('differentiates queries on different tables', () => {
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "posts" WHERE "id" = $1', [1])

      const stats = getN1Stats()
      expect(Object.keys(stats.patterns).length).toBe(2)
    })

    it('extracts table name from various SQL formats', () => {
      // Standard SELECT
      trackQuery('SELECT * FROM users WHERE id = $1', [1])

      // Quoted table name
      trackQuery('SELECT * FROM "posts" WHERE id = $1', [1])

      // With schema prefix (should still work)
      trackQuery('SELECT * FROM comments WHERE post_id = $1', [1])

      const stats = getN1Stats()
      expect(Object.keys(stats.patterns).length).toBe(3)
    })
  })

  describe('Detection Threshold', () => {
    it('does not warn below threshold', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      // Only 2 queries - below threshold of 3
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])

      expect(warnings.length).toBe(0)
    })

    it('warns when threshold is reached', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [3])

      expect(warnings.length).toBe(1)
      expect(warnings[0].count).toBe(3)
    })

    it('only warns once per pattern', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      // Trigger 5 similar queries
      for (let i = 0; i < 5; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }

      // Should only warn once
      expect(warnings.length).toBe(1)
    })

    it('respects custom threshold', () => {
      const warnings = []
      configureN1Detection({
        threshold: 5,
        onDetection: (data) => warnings.push(data)
      })

      // 4 queries - below threshold of 5
      for (let i = 0; i < 4; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }

      expect(warnings.length).toBe(0)

      // 5th query triggers warning
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [5])
      expect(warnings.length).toBe(1)
    })
  })

  describe('Time Window', () => {
    it('only counts queries within time window', async () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        windowMs: 100, // 100ms window
        onDetection: (data) => warnings.push(data)
      })

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])

      // Wait for queries to fall outside window
      await new Promise(resolve => setTimeout(resolve, 150))

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [3])

      // Should not warn - only 1 query in current window
      expect(warnings.length).toBe(0)
    })
  })

  describe('Development Mode', () => {
    it('only tracks in development mode', () => {
      mockIsDevelopment = true
      resetN1Detection()

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])

      let stats = getN1Stats()
      expect(stats.totalTracked).toBe(1)

      // Switch to production mode
      mockIsDevelopment = false

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])

      stats = getN1Stats()
      // Should still be 1 - production query not tracked
      expect(stats.totalTracked).toBe(1)
    })

    it('can be disabled manually', () => {
      disableN1Detection()

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])

      const stats = getN1Stats()
      expect(stats.totalTracked).toBe(0)

      enableN1Detection()
    })

    it('can be enabled after disabling', () => {
      disableN1Detection()
      enableN1Detection()

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])

      const stats = getN1Stats()
      expect(stats.totalTracked).toBe(1)
    })
  })

  describe('Ignored Tables', () => {
    beforeEach(() => {
      resetN1Detection()
    })

    it('ignores configured tables', () => {
      configureN1Detection({
        ignoredTables: ['sessions', 'logs']
      })

      trackQuery('SELECT * FROM "sessions" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "logs" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])

      const stats = getN1Stats()
      expect(stats.totalTracked).toBe(1) // Only users query tracked
    })

    it('ignores schema_migrations by default', () => {
      // Explicitly reset and configure to ensure clean state
      resetN1Detection()
      configureN1Detection({
        threshold: 3,
        windowMs: 1000,
        includeStackTrace: false
      })

      trackQuery('SELECT * FROM "schema_migrations" WHERE "version" = $1', ['123'])

      const stats = getN1Stats()
      expect(stats.totalTracked).toBe(0)
    })
  })

  describe('Warning Output', () => {
    it('includes query information in warning', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      for (let i = 0; i < 3; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }

      expect(warnings[0].sql).toContain('SELECT')
      expect(warnings[0].sql).toContain('users')
      expect(warnings[0].fingerprint.table).toBe('users')
      expect(warnings[0].fingerprint.type).toBe('SELECT')
    })

    it('includes stack trace when enabled', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        includeStackTrace: true,
        onDetection: (data) => warnings.push(data)
      })

      for (let i = 0; i < 3; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }

      expect(warnings[0].stackTrace).toBeDefined()
      expect(Array.isArray(warnings[0].stackTrace)).toBe(true)
    })

    it('generates helpful suggestion for foreign key queries', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      for (let i = 0; i < 3; i++) {
        trackQuery('SELECT * FROM "users" WHERE "post_id" = $1', [i])
      }

      // Warning should contain suggestion about eager loading
      expect(warnings[0].warning).toContain('includes')
    })
  })

  describe('Reset Functionality', () => {
    it('clears all tracking state', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])

      resetN1Detection()

      // After reset, we need to reconfigure with the callback
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      // After reset, same query should start fresh
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [3])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [4])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [5])

      // Should warn now (3 new queries)
      expect(warnings.length).toBe(1)

      const stats = getN1Stats()
      expect(stats.totalTracked).toBe(3)
    })

    it('allows warnings again for previously warned patterns', () => {
      const warnings = []
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      // First batch - triggers warning
      for (let i = 0; i < 3; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }
      expect(warnings.length).toBe(1)

      resetN1Detection()

      // After reset, reconfigure with the callback
      configureN1Detection({
        threshold: 3,
        onDetection: (data) => warnings.push(data)
      })

      // Second batch - should warn again
      for (let i = 0; i < 3; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }
      expect(warnings.length).toBe(2)
    })
  })

  describe('Statistics', () => {
    it('returns accurate query counts', () => {
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [1])
      trackQuery('SELECT * FROM "users" WHERE "id" = $1', [2])
      trackQuery('SELECT * FROM "posts" WHERE "user_id" = $1', [1])

      const stats = getN1Stats()

      expect(stats.totalTracked).toBe(3)
      expect(Object.keys(stats.patterns).length).toBe(2)
    })

    it('identifies potential N+1 patterns', () => {
      configureN1Detection({ threshold: 3 })

      // Create N+1 pattern for users
      for (let i = 0; i < 5; i++) {
        trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
      }

      // Single query for posts
      trackQuery('SELECT * FROM "posts" WHERE "id" = $1', [1])

      const stats = getN1Stats()

      expect(stats.potentialN1.length).toBe(1)
      expect(stats.potentialN1[0].pattern).toContain('users')
      expect(stats.potentialN1[0].count).toBe(5)
    })
  })
})

describe('N+1 Detection Integration', () => {
  let mockConnection

  // Test Models - defined once, outside beforeEach
  // Use explicit model references in associations to avoid registry lookup issues
  class IntegrationUser extends Model {
    static tableName = 'users'
    static validations = {}
  }

  class IntegrationPost extends Model {
    static tableName = 'posts'
    static validations = {}
  }

  // Set up associations with explicit model references after both classes are defined
  IntegrationUser.associations = {
    hasMany: [{ name: 'posts', model: IntegrationPost, foreignKey: 'user_id' }]
  }

  IntegrationPost.associations = {
    belongsTo: [{ name: 'user', model: IntegrationUser, foreignKey: 'user_id' }]
  }

  // Register models once
  IntegrationUser.register()
  IntegrationPost.register()
  defineAssociations(IntegrationUser)
  defineAssociations(IntegrationPost)

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
    resetN1Detection()
    mockIsDevelopment = true

    configureN1Detection({
      threshold: 3,
      windowMs: 1000,
      includeStackTrace: false
    })
  })

  afterEach(() => {
    setConnection(null)
    resetN1Detection()
  })

  it('tracks queries through QueryBuilder', async () => {
    mockConnection.setMockResults([
      [{ id: 1, name: 'John' }]
    ])

    await IntegrationUser.where({ id: 1 }).all()

    const stats = getN1Stats()
    expect(stats.totalTracked).toBe(1)
  })

  it('detects N+1 in association loading', async () => {
    const warnings = []
    configureN1Detection({
      threshold: 3,
      onDetection: (data) => warnings.push(data)
    })

    // Set up mock results for:
    // 1. Loading 3 posts
    // 2-4. Loading user for each post (N+1!)
    mockConnection.setMockResults([
      [
        { id: 1, title: 'Post 1', user_id: 1 },
        { id: 2, title: 'Post 2', user_id: 2 },
        { id: 3, title: 'Post 3', user_id: 3 }
      ],
      [{ id: 1, name: 'User 1' }],
      [{ id: 2, name: 'User 2' }],
      [{ id: 3, name: 'User 3' }]
    ])

    const posts = await IntegrationPost.all()

    // Simulate N+1 by loading user for each post
    for (const post of posts) {
      await post.user()
    }

    // Should have detected N+1 pattern
    expect(warnings.length).toBe(1)
    expect(warnings[0].fingerprint.table).toBe('users')
  })

  it('does not warn when using includes (eager loading)', async () => {
    const warnings = []
    configureN1Detection({
      threshold: 3,
      onDetection: (data) => warnings.push(data)
    })

    // Set up mock results for eager loading (2 queries total)
    mockConnection.setMockResults([
      [
        { id: 1, title: 'Post 1', user_id: 1 },
        { id: 2, title: 'Post 2', user_id: 2 },
        { id: 3, title: 'Post 3', user_id: 3 }
      ],
      // Eager load all users in one query
      [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
        { id: 3, name: 'User 3' }
      ]
    ])

    // Using includes - no N+1
    await IntegrationPost.includes('user').all()

    // Should not have any N+1 warnings
    expect(warnings.length).toBe(0)

    const stats = getN1Stats()
    // Only 2 queries - one for posts, one for users
    expect(stats.totalTracked).toBe(2)
  })

  it('tracks count queries', async () => {
    mockConnection.setMockResults([
      [{ count: 5 }]
    ])

    await IntegrationUser.count()

    const stats = getN1Stats()
    expect(stats.totalTracked).toBe(1)
  })

  it('detects N+1 in count queries', async () => {
    const warnings = []
    configureN1Detection({
      threshold: 3,
      onDetection: (data) => warnings.push(data)
    })

    // Simulate counting posts for multiple users
    mockConnection.setMockResults([
      [{ count: 2 }],
      [{ count: 3 }],
      [{ count: 1 }]
    ])

    for (let i = 1; i <= 3; i++) {
      await IntegrationPost.where({ user_id: i }).count()
    }

    // Should detect the N+1 pattern in count queries
    expect(warnings.length).toBe(1)
  })
})

describe('Edge Cases', () => {
  beforeEach(() => {
    resetN1Detection()
    mockIsDevelopment = true
    configureN1Detection({
      threshold: 3,
      windowMs: 1000,
      includeStackTrace: false
    })
  })

  it('handles empty SQL gracefully', () => {
    expect(() => trackQuery('', [])).not.toThrow()
  })

  it('handles malformed SQL gracefully', () => {
    expect(() => trackQuery('not valid sql', [])).not.toThrow()
    expect(() => trackQuery('SELECT', [])).not.toThrow()
  })

  it('handles INSERT/UPDATE/DELETE queries', () => {
    trackQuery('INSERT INTO "users" (name) VALUES ($1)', ['John'])
    trackQuery('UPDATE "users" SET name = $1 WHERE id = $2', ['Jane', 1])
    trackQuery('DELETE FROM "users" WHERE id = $1', [1])

    const stats = getN1Stats()
    expect(stats.totalTracked).toBe(3)
  })

  it('handles queries with multiple conditions', () => {
    for (let i = 0; i < 3; i++) {
      trackQuery(
        'SELECT * FROM "posts" WHERE "user_id" = $1 AND "published" = $2 AND "category_id" = $3',
        [1, true, 5]
      )
    }

    const stats = getN1Stats()
    expect(stats.potentialN1.length).toBe(1)
  })

  it('handles concurrent access safely', async () => {
    const warnings = []
    configureN1Detection({
      threshold: 5,
      onDetection: (data) => warnings.push(data)
    })

    // Simulate concurrent queries
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise(resolve => {
          trackQuery('SELECT * FROM "users" WHERE "id" = $1', [i])
          resolve()
        })
      )
    }

    await Promise.all(promises)

    // Should have detected the pattern
    expect(warnings.length).toBe(1)
    expect(warnings[0].count).toBeGreaterThanOrEqual(5)
  })
})
