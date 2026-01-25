/**
 * BelongsTo Association Tests
 *
 * Tests the belongsTo association functionality including:
 * - Loading parent records
 * - Foreign key inference
 * - Caching and reload behavior
 * - Association setters
 * - Build and create methods
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
  static validations = {}
}

class Post extends Model {
  static tableName = 'posts'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user']
  }
  static validations = {}
}

class Comment extends Model {
  static tableName = 'comments'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user', 'post']
  }
  static validations = {}
}

class Article extends Model {
  static tableName = 'articles'
  static primaryKey = 'id'
  static associations = {
    belongsTo: [
      { name: 'author', model: User, foreignKey: 'author_id' }
    ]
  }
  static validations = {}
}

class Review extends Model {
  static tableName = 'reviews'
  static primaryKey = 'id'
  static associations = {
    belongsTo: [
      { name: 'reviewer', model: User }  // Uses reviewer_id by default
    ]
  }
  static validations = {}
}

// Register models in global registry
User.register()
Post.register()
Comment.register()
Article.register()
Review.register()

// Define associations on models
defineAssociations(Post)
defineAssociations(Comment)
defineAssociations(Article)
defineAssociations(Review)

describe('BelongsTo Association', () => {
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
    it('loads parent record by foreign key', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const post = new Post({ id: 1, title: 'Test Post', user_id: 1 })
      post.persisted = true

      const user = await post.user()

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
      expect(user.attributes.name).toBe('John')
    })

    it('returns null when foreign key is null', async () => {
      const post = new Post({ id: 1, title: 'Test Post', user_id: null })
      post.persisted = true

      const user = await post.user()

      expect(user).toBeNull()
      expect(mockConnection.queries.length).toBe(0) // No query made
    })

    it('returns null when foreign key is undefined', async () => {
      const post = new Post({ id: 1, title: 'Test Post' })
      post.persisted = true

      const user = await post.user()

      expect(user).toBeNull()
      expect(mockConnection.queries.length).toBe(0) // No query made
    })

    it('returns null when parent record not found', async () => {
      mockConnection.setMockResults([
        []  // Empty result
      ])

      const post = new Post({ id: 1, title: 'Test Post', user_id: 999 })
      post.persisted = true

      const user = await post.user()

      expect(user).toBeNull()
    })
  })

  describe('Foreign Key Inference', () => {
    it('infers foreign key from association name', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ id: 1, title: 'Test', user_id: 1 })
      post.persisted = true

      await post.user()

      const query = mockConnection.getLastQuery()
      expect(query.params).toContain(1) // user_id value
    })

    it('uses explicit foreign key when provided', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Jane' }]
      ])

      const article = new Article({ id: 1, title: 'Test', author_id: 1 })
      article.persisted = true

      const author = await article.author()

      expect(author).toBeInstanceOf(User)
      expect(author.id).toBe(1)
    })

    it('infers foreign key for custom association name', async () => {
      mockConnection.setMockResults([
        [{ id: 2, name: 'Reviewer' }]
      ])

      const review = new Review({ id: 1, reviewer_id: 2 })
      review.persisted = true

      const reviewer = await review.reviewer()

      expect(reviewer).toBeInstanceOf(User)
      expect(reviewer.id).toBe(2)
    })
  })

  describe('Caching Behavior', () => {
    it('caches loaded association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ id: 1, title: 'Test', user_id: 1 })
      post.persisted = true

      await post.user()
      await post.user()
      await post.user()

      // Should only query once due to caching
      expect(mockConnection.queries.length).toBe(1)
    })

    it('caches null when foreign key is null', async () => {
      const post = new Post({ id: 1, title: 'Test', user_id: null })
      post.persisted = true

      await post.user()
      await post.user()

      expect(mockConnection.queries.length).toBe(0)
    })

    it('reloads when reload option is true', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }],
        [{ id: 1, name: 'John Updated' }]
      ])

      const post = new Post({ id: 1, title: 'Test', user_id: 1 })
      post.persisted = true

      const user1 = await post.user()
      const user2 = await post.user({ reload: true })

      expect(mockConnection.queries.length).toBe(2)
      expect(user1.attributes.name).toBe('John')
      expect(user2.attributes.name).toBe('John Updated')
    })
  })

  describe('Multiple Associations', () => {
    it('handles multiple belongsTo on same model', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }],
        [{ id: 2, title: 'Test Post' }]
      ])

      const comment = new Comment({
        id: 1,
        body: 'Great post!',
        user_id: 1,
        post_id: 2
      })
      comment.persisted = true

      const user = await comment.user()
      const post = await comment.post()

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)

      expect(post).toBeInstanceOf(Post)
      expect(post.id).toBe(2)
    })
  })

  describe('Association Setter', () => {
    it('sets foreign key when assigning record', () => {
      const post = new Post({ id: 1, title: 'Test' })
      const user = new User({ id: 5, name: 'Jane' })
      user.persisted = true

      // Use the setter
      post['user='](user)

      expect(post.attributes.user_id).toBe(5)
    })

    it('clears foreign key when setting null', () => {
      const post = new Post({ id: 1, title: 'Test', user_id: 5 })

      post['user='](null)

      expect(post.attributes.user_id).toBeNull()
    })

    it('caches the assigned record', async () => {
      const post = new Post({ id: 1, title: 'Test' })
      const user = new User({ id: 5, name: 'Jane' })
      user.persisted = true

      post['user='](user)

      // Should return cached user without querying
      const result = await post.user()
      expect(result).toBe(user)
      expect(mockConnection.queries.length).toBe(0)
    })
  })

  describe('Build Association', () => {
    it('creates new unsaved associated model', () => {
      const post = new Post({ id: 1, title: 'Test' })
      post.persisted = true

      const user = post.buildUser({ name: 'New User', email: 'new@example.com' })

      expect(user).toBeInstanceOf(User)
      expect(user.attributes.name).toBe('New User')
      expect(user.persisted).toBe(false)
    })

    it('build method accepts empty attributes', () => {
      const post = new Post({ id: 1, title: 'Test' })

      const user = post.buildUser()

      expect(user).toBeInstanceOf(User)
      expect(user.attributes).toEqual({})
    })
  })

  describe('Create Association', () => {
    it('creates and saves associated model', async () => {
      mockConnection.setMockResults([
        [{ id: 10, name: 'Created User', email: 'created@example.com', created_at: new Date(), updated_at: new Date() }]
      ])

      const post = new Post({ id: 1, title: 'Test' })
      post.persisted = true

      const user = await post.createUser({ name: 'Created User', email: 'created@example.com' })

      expect(user).toBeInstanceOf(User)
      expect(user.persisted).toBe(true)
      expect(post.attributes.user_id).toBe(10) // Foreign key updated
    })

    it('caches the created record', async () => {
      mockConnection.setMockResults([
        [{ id: 10, name: 'Created User', created_at: new Date(), updated_at: new Date() }]
      ])

      const post = new Post({ id: 1, title: 'Test' })
      post.persisted = true

      await post.createUser({ name: 'Created User' })

      // Clear queries to check caching
      mockConnection.clearQueries()

      const cachedUser = await post.user()
      expect(cachedUser.id).toBe(10)
      expect(mockConnection.queries.length).toBe(0) // Should use cached
    })
  })

  describe('Model Resolution', () => {
    it('resolves model from global registry', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ id: 1, user_id: 1 })
      post.persisted = true

      const user = await post.user()

      // Should successfully resolve User model
      expect(user).toBeInstanceOf(User)
    })

    it('uses explicit model class when provided', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Jane' }]
      ])

      const article = new Article({ id: 1, author_id: 1 })
      article.persisted = true

      // Article has explicit model: User for 'author'
      const author = await article.author()

      expect(author).toBeInstanceOf(User)
    })

    it('throws error when model cannot be resolved', async () => {
      // Create a model with unregistered association
      class Orphan extends Model {
        static tableName = 'orphans'
        static associations = {
          belongsTo: ['phantom']  // PhantomModel is not registered
        }
        static validations = {}
      }
      defineAssociations(Orphan)

      const orphan = new Orphan({ id: 1, phantom_id: 1 })
      orphan.persisted = true

      await expect(orphan.phantom()).rejects.toThrow('Cannot resolve model')
    })
  })

  describe('Edge Cases', () => {
    it('handles zero as valid foreign key', async () => {
      mockConnection.setMockResults([
        [{ id: 0, name: 'System User' }]
      ])

      const post = new Post({ id: 1, user_id: 0 })
      post.persisted = true

      const user = await post.user()

      // Zero is a valid foreign key value
      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(0)
    })

    it('handles string foreign key values', async () => {
      mockConnection.setMockResults([
        [{ id: 'uuid-123', name: 'UUID User' }]
      ])

      const post = new Post({ id: 1, user_id: 'uuid-123' })
      post.persisted = true

      const user = await post.user()

      expect(user).not.toBeNull()
    })

    it('works on new (unpersisted) records', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ title: 'Draft', user_id: 1 })
      // Not persisted

      const user = await post.user()

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
    })
  })

  describe('Query Generation', () => {
    it('queries by primary key', async () => {
      mockConnection.setMockResults([
        [{ id: 5, name: 'John' }]
      ])

      const post = new Post({ id: 1, user_id: 5 })
      post.persisted = true

      await post.user()

      const query = mockConnection.getLastQuery()
      // Should query by the User's primary key with the foreign key value
      expect(query.sql).toContain('id')
      expect(query.params).toContain(5)
    })
  })
})

describe('BelongsTo - Integration with Model', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('association method is defined on model prototype', () => {
    const post = new Post({ id: 1 })

    expect(typeof post.user).toBe('function')
    expect(typeof post.buildUser).toBe('function')
    expect(typeof post.createUser).toBe('function')
  })

  it('multiple instances have independent caches', async () => {
    mockConnection.setMockResults([
      [{ id: 1, name: 'User One' }],
      [{ id: 2, name: 'User Two' }]
    ])

    const post1 = new Post({ id: 1, user_id: 1 })
    const post2 = new Post({ id: 2, user_id: 2 })
    post1.persisted = true
    post2.persisted = true

    const user1 = await post1.user()
    const user2 = await post2.user()

    expect(user1.id).toBe(1)
    expect(user2.id).toBe(2)
    expect(user1).not.toBe(user2)
  })
})
