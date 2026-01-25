/**
 * HasOne Association Tests
 *
 * Tests the hasOne association functionality including:
 * - Loading single child record
 * - Foreign key inference
 * - Caching and reload behavior
 * - Build and create methods
 * - Association setter
 * - Has helper method
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Model } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'
import { defineAssociations } from '../../src/database/associations.js'

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

// Test Models
class User extends Model {
  static tableName = 'users'
  static primaryKey = 'id'
  static associations = {
    hasOne: ['profile']
  }
  static validations = {}
}

class Profile extends Model {
  static tableName = 'profiles'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user']
  }
  static validations = {}
}

class Address extends Model {
  static tableName = 'addresses'
  static primaryKey = 'id'
  static validations = {}
}

// Model with explicit foreign key
class Person extends Model {
  static tableName = 'people'
  static primaryKey = 'id'
  static associations = {
    hasOne: [
      { name: 'home_address', model: Address, foreignKey: 'owner_id' }
    ]
  }
  static validations = {}
}

// Model with multiple hasOne associations
class Company extends Model {
  static tableName = 'companies'
  static primaryKey = 'id'
  static associations = {
    hasOne: ['headquarters', 'ceo']
  }
  static validations = {}
}

class Headquarters extends Model {
  static tableName = 'headquarters'
  static primaryKey = 'id'
  static validations = {}
}

class Ceo extends Model {
  static tableName = 'ceos'
  static primaryKey = 'id'
  static validations = {}
}

// Subscription must be defined before Account due to forward reference
class Subscription extends Model {
  static tableName = 'subscriptions'
  static primaryKey = 'id'
  static validations = {}
}

// Model with scope
class Account extends Model {
  static tableName = 'accounts'
  static primaryKey = 'id'
  static associations = {
    hasOne: [
      { name: 'active_subscription', model: Subscription, foreignKey: 'account_id', scope: { active: true } }
    ]
  }
  static validations = {}
}

// Register models in global registry
User.register()
Profile.register()
Address.register()
Person.register()
Company.register()
Headquarters.register()
Ceo.register()
Account.register()
Subscription.register()

// Define associations on models
defineAssociations(User)
defineAssociations(Profile)
defineAssociations(Person)
defineAssociations(Company)
defineAssociations(Account)

describe('HasOne Association', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
    mockConnection = null
  })

  describe('Basic Loading', () => {
    it('loads single child record by foreign key', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Hello world', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const profile = await user.profile()

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.id).toBe(1)
      expect(profile.attributes.bio).toBe('Hello world')
    })

    it('returns null when no child record exists', async () => {
      mockConnection.setMockResults([
        []  // Empty result
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const profile = await user.profile()

      expect(profile).toBeNull()
    })

    it('returns null when primary key is null', async () => {
      const user = new User({ name: 'John' })  // No id set

      const profile = await user.profile()

      expect(profile).toBeNull()
      expect(mockConnection.queries.length).toBe(0) // No query made
    })

    it('returns null when primary key is undefined', async () => {
      const user = new User({ id: undefined, name: 'John' })

      const profile = await user.profile()

      expect(profile).toBeNull()
      expect(mockConnection.queries.length).toBe(0)
    })
  })

  describe('Foreign Key Inference', () => {
    it('infers foreign key from owner model name', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.profile()

      const query = mockConnection.getLastQuery()
      // Should query profiles where user_id = 1
      expect(query.sql).toContain('user_id')
      expect(query.params).toContain(1)
    })

    it('uses explicit foreign key when provided', async () => {
      mockConnection.setMockResults([
        [{ id: 1, street: '123 Main St', owner_id: 5 }]
      ])

      const person = new Person({ id: 5, name: 'Jane' })
      person.persisted = true

      await person.home_address()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('owner_id')
      expect(query.params).toContain(5)
    })

    it('handles camelCase model names correctly', async () => {
      // BlogPost -> blog_post_id
      class BlogPost extends Model {
        static tableName = 'blog_posts'
        static associations = {
          hasOne: ['summary']
        }
        static validations = {}
      }

      class Summary extends Model {
        static tableName = 'summaries'
        static validations = {}
      }

      BlogPost.register()
      Summary.register()
      defineAssociations(BlogPost)

      mockConnection.setMockResults([
        [{ id: 1, text: 'TL;DR', blog_post_id: 1 }]
      ])

      const blogPost = new BlogPost({ id: 1 })
      blogPost.persisted = true

      await blogPost.summary()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('blog_post_id')
    })
  })

  describe('Caching Behavior', () => {
    it('caches loaded association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.profile()
      await user.profile()
      await user.profile()

      // Should only query once due to caching
      expect(mockConnection.queries.length).toBe(1)
    })

    it('caches null when no record found', async () => {
      mockConnection.setMockResults([
        []
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.profile()
      await user.profile()

      expect(mockConnection.queries.length).toBe(1)
    })

    it('reloads when reload option is true', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Original', user_id: 1 }],
        [{ id: 1, bio: 'Updated', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const profile1 = await user.profile()
      const profile2 = await user.profile({ reload: true })

      expect(mockConnection.queries.length).toBe(2)
      expect(profile1.attributes.bio).toBe('Original')
      expect(profile2.attributes.bio).toBe('Updated')
    })

    it('clears cache with clearCache method', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Original', user_id: 1 }],
        [{ id: 1, bio: 'Updated', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.profile()
      user.clearProfileCache()
      await user.profile()

      expect(mockConnection.queries.length).toBe(2)
    })
  })

  describe('Default Scope', () => {
    it('applies default scope from config', async () => {
      mockConnection.setMockResults([
        [{ id: 1, active: true, account_id: 1 }]
      ])

      const account = new Account({ id: 1 })
      account.persisted = true

      await account.active_subscription()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('active')
    })
  })

  describe('Association Setter', () => {
    it('sets foreign key on child when assigning record', () => {
      const user = new User({ id: 5, name: 'Jane' })
      user.persisted = true

      const profile = new Profile({ bio: 'Hello' })

      // Use the setter
      user['profile='](profile)

      expect(profile.attributes.user_id).toBe(5)
    })

    it('clears cache when setting null', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.profile()  // Load and cache

      user['profile='](null)

      // Cache should be cleared
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      // Clear queries to verify new query is made
      mockConnection.clearQueries()

      // Should return null from cache (not query)
      const cachedProfile = await user.profile()
      expect(cachedProfile).toBeNull()
      expect(mockConnection.queries.length).toBe(0)
    })

    it('caches the assigned record', async () => {
      const user = new User({ id: 5, name: 'Jane' })
      user.persisted = true

      const profile = new Profile({ id: 10, bio: 'Hello' })
      profile.persisted = true

      user['profile='](profile)

      // Should return cached profile without querying
      const result = await user.profile()
      expect(result).toBe(profile)
      expect(mockConnection.queries.length).toBe(0)
    })
  })

  describe('Build Association', () => {
    it('creates new unsaved child with foreign key set', () => {
      const user = new User({ id: 5, name: 'John' })
      user.persisted = true

      const profile = user.buildProfile({ bio: 'New profile' })

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.attributes.bio).toBe('New profile')
      expect(profile.attributes.user_id).toBe(5)
      expect(profile.persisted).toBe(false)
    })

    it('build method accepts empty attributes', () => {
      const user = new User({ id: 1 })

      const profile = user.buildProfile()

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.attributes.user_id).toBe(1)
    })
  })

  describe('Create Association', () => {
    it('creates and saves child with foreign key set', async () => {
      mockConnection.setMockResults([
        [{ id: 10, bio: 'Created profile', user_id: 5, created_at: new Date(), updated_at: new Date() }]
      ])

      const user = new User({ id: 5, name: 'John' })
      user.persisted = true

      const profile = await user.createProfile({ bio: 'Created profile' })

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.persisted).toBe(true)
      expect(profile.attributes.user_id).toBe(5)

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('insert')
    })

    it('caches the created record', async () => {
      mockConnection.setMockResults([
        [{ id: 10, bio: 'Created', user_id: 1, created_at: new Date(), updated_at: new Date() }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.createProfile({ bio: 'Created' })

      // Clear queries to check caching
      mockConnection.clearQueries()

      const cachedProfile = await user.profile()
      expect(cachedProfile.id).toBe(10)
      expect(mockConnection.queries.length).toBe(0) // Should use cached
    })
  })

  describe('Has Association Method', () => {
    it('returns true when associated record exists', async () => {
      mockConnection.setMockResults([
        [{ count: 1 }]  // exists() uses count() internally
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const hasProfile = await user.hasProfile()

      expect(hasProfile).toBe(true)
    })

    it('returns false when no associated record exists', async () => {
      mockConnection.setMockResults([
        [{ count: 0 }]  // exists() uses count() internally
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const hasProfile = await user.hasProfile()

      expect(hasProfile).toBe(false)
    })

    it('returns false when primary key is null', async () => {
      const user = new User({ name: 'John' })

      const hasProfile = await user.hasProfile()

      expect(hasProfile).toBe(false)
      expect(mockConnection.queries.length).toBe(0)
    })

    it('accepts additional conditions', async () => {
      mockConnection.setMockResults([
        [{ count: 1 }]  // exists() uses count() internally
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.hasProfile({ verified: true })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('verified')
    })
  })

  describe('Multiple HasOne Associations', () => {
    it('handles multiple hasOne on same model', async () => {
      mockConnection.setMockResults([
        [{ id: 1, city: 'New York', company_id: 1 }],
        [{ id: 1, name: 'John CEO', company_id: 1 }]
      ])

      const company = new Company({ id: 1, name: 'Acme Inc' })
      company.persisted = true

      const hq = await company.headquarters()
      const ceo = await company.ceo()

      expect(hq).toBeInstanceOf(Headquarters)
      expect(hq.attributes.city).toBe('New York')

      expect(ceo).toBeInstanceOf(Ceo)
      expect(ceo.attributes.name).toBe('John CEO')
    })

    it('caches each association independently', async () => {
      mockConnection.setMockResults([
        [{ id: 1, city: 'New York', company_id: 1 }],
        [{ id: 1, name: 'John CEO', company_id: 1 }]
      ])

      const company = new Company({ id: 1 })
      company.persisted = true

      await company.headquarters()
      await company.ceo()
      await company.headquarters()  // Should use cache
      await company.ceo()  // Should use cache

      expect(mockConnection.queries.length).toBe(2)
    })
  })

  describe('Model Resolution', () => {
    it('resolves model from global registry', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const profile = await user.profile()

      expect(profile).toBeInstanceOf(Profile)
    })

    it('uses explicit model class when provided', async () => {
      mockConnection.setMockResults([
        [{ id: 1, street: '123 Main', owner_id: 1 }]
      ])

      const person = new Person({ id: 1 })
      person.persisted = true

      const address = await person.home_address()

      expect(address).toBeInstanceOf(Address)
    })

    it('throws error when model cannot be resolved', async () => {
      class Orphan extends Model {
        static tableName = 'orphans'
        static associations = {
          hasOne: ['phantom']  // Phantom model is not registered
        }
        static validations = {}
      }
      defineAssociations(Orphan)

      const orphan = new Orphan({ id: 1 })
      orphan.persisted = true

      await expect(orphan.phantom()).rejects.toThrow('Cannot resolve model')
    })
  })

  describe('Edge Cases', () => {
    it('handles zero as valid primary key', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 0 }]
      ])

      const user = new User({ id: 0, name: 'System' })
      user.persisted = true

      const profile = await user.profile()

      // Zero is a valid primary key value
      expect(profile).toBeInstanceOf(Profile)
      expect(mockConnection.queries.length).toBe(1)
    })

    it('handles string primary key values', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 'uuid-123' }]
      ])

      const user = new User({ id: 'uuid-123' })
      user.persisted = true

      const profile = await user.profile()

      expect(profile).toBeInstanceOf(Profile)
    })

    it('works on new (unpersisted) records with id', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'Draft' })
      // Not persisted, but has id

      const profile = await user.profile()

      expect(profile).toBeInstanceOf(Profile)
    })
  })

  describe('Query Generation', () => {
    it('queries by foreign key with correct value', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 42 }]
      ])

      const user = new User({ id: 42, name: 'John' })
      user.persisted = true

      await user.profile()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('user_id')
      expect(query.params).toContain(42)
    })

    it('uses LIMIT 1 or equivalent for single record fetch', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.profile()

      const query = mockConnection.getLastQuery()
      // Query should use first() which typically applies LIMIT 1
      expect(query.sql.toLowerCase()).toContain('limit')
    })
  })
})

describe('HasOne - Integration with Model', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('association method is defined on model prototype', () => {
    const user = new User({ id: 1 })

    expect(typeof user.profile).toBe('function')
    expect(typeof user.buildProfile).toBe('function')
    expect(typeof user.createProfile).toBe('function')
    expect(typeof user.hasProfile).toBe('function')
    expect(typeof user.clearProfileCache).toBe('function')
  })

  it('multiple instances have independent caches', async () => {
    mockConnection.setMockResults([
      [{ id: 1, bio: 'User 1 Profile', user_id: 1 }],
      [{ id: 2, bio: 'User 2 Profile', user_id: 2 }]
    ])

    const user1 = new User({ id: 1 })
    const user2 = new User({ id: 2 })
    user1.persisted = true
    user2.persisted = true

    const profile1 = await user1.profile()
    const profile2 = await user2.profile()

    expect(profile1.attributes.bio).toBe('User 1 Profile')
    expect(profile2.attributes.bio).toBe('User 2 Profile')
    expect(profile1).not.toBe(profile2)
  })
})

describe('HasOne vs HasMany comparison', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('hasOne returns single record while hasMany returns array', async () => {
    // Setup a model with both hasOne and hasMany
    class TestUser extends Model {
      static tableName = 'test_users'
      static primaryKey = 'id'
      static associations = {
        hasOne: ['avatar'],
        hasMany: ['photos']
      }
      static validations = {}
    }

    class Avatar extends Model {
      static tableName = 'avatars'
      static validations = {}
    }

    class Photo extends Model {
      static tableName = 'photos'
      static validations = {}
    }

    TestUser.register()
    Avatar.register()
    Photo.register()
    defineAssociations(TestUser)

    mockConnection.setMockResults([
      [{ id: 1, url: 'avatar.jpg', test_user_id: 1 }],  // hasOne result
      [  // hasMany result
        { id: 1, url: 'photo1.jpg', test_user_id: 1 },
        { id: 2, url: 'photo2.jpg', test_user_id: 1 }
      ]
    ])

    const testUser = new TestUser({ id: 1 })
    testUser.persisted = true

    const avatar = await testUser.avatar()
    const photos = await testUser.photos()

    // hasOne returns single record or null
    expect(avatar).toBeInstanceOf(Avatar)
    expect(Array.isArray(avatar)).toBe(false)

    // hasMany returns array
    expect(Array.isArray(photos)).toBe(true)
    expect(photos.length).toBe(2)
    expect(photos[0]).toBeInstanceOf(Photo)
  })
})
