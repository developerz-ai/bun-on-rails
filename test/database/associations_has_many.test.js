/**
 * HasMany Association Tests
 *
 * Tests the hasMany association functionality including:
 * - Loading child records with proper WHERE clause
 * - Foreign key inference
 * - Caching and reload behavior
 * - Build and create methods
 * - Count and exists helper methods
 * - Ordering and scoping
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
    hasMany: ['posts', 'comments']
  }
  static validations = {}
}

class Post extends Model {
  static tableName = 'posts'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
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

// Model with explicit foreign key
class Author extends Model {
  static tableName = 'authors'
  static primaryKey = 'id'
  static associations = {
    hasMany: [
      { name: 'articles', foreignKey: 'author_id' }
    ]
  }
  static validations = {}
}

class Article extends Model {
  static tableName = 'articles'
  static primaryKey = 'id'
  static validations = {}
}

// Entry class must be defined before Blog due to forward reference
class Entry extends Model {
  static tableName = 'entries'
  static primaryKey = 'id'
  static validations = {}
}

// Model with ordering and scopes
class Blog extends Model {
  static tableName = 'blogs'
  static primaryKey = 'id'
  static associations = {
    hasMany: [
      { name: 'entries', order: { created_at: 'desc' } },
      { name: 'published_entries', model: Entry, foreignKey: 'blog_id', scope: { published: true } }
    ]
  }
  static validations = {}
}

// Register models in global registry
User.register()
Post.register()
Comment.register()
Author.register()
Article.register()
Blog.register()
Entry.register()

// Define associations on models
defineAssociations(User)
defineAssociations(Post)
defineAssociations(Comment)
defineAssociations(Author)
defineAssociations(Blog)

describe('HasMany Association', () => {
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
    it('loads child records by foreign key', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'First Post', user_id: 1 },
          { id: 2, title: 'Second Post', user_id: 1 }
        ]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const posts = await user.posts()

      expect(posts).toBeInstanceOf(Array)
      expect(posts.length).toBe(2)
      expect(posts[0]).toBeInstanceOf(Post)
      expect(posts[0].attributes.title).toBe('First Post')
      expect(posts[1].attributes.title).toBe('Second Post')
    })

    it('returns empty array when no child records exist', async () => {
      mockConnection.setMockResults([
        []  // Empty result
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const posts = await user.posts()

      expect(posts).toEqual([])
    })

    it('returns empty array when primary key is null', async () => {
      const user = new User({ name: 'John' })  // No id set

      const posts = await user.posts()

      expect(posts).toEqual([])
      expect(mockConnection.queries.length).toBe(0) // No query made
    })

    it('returns empty array when primary key is undefined', async () => {
      const user = new User({ id: undefined, name: 'John' })

      const posts = await user.posts()

      expect(posts).toEqual([])
      expect(mockConnection.queries.length).toBe(0)
    })
  })

  describe('Foreign Key Inference', () => {
    it('infers foreign key from owner model name', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.posts()

      const query = mockConnection.getLastQuery()
      // Should query posts where user_id = 1
      expect(query.sql).toContain('user_id')
      expect(query.params).toContain(1)
    })

    it('uses explicit foreign key when provided', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Article 1', author_id: 5 }]
      ])

      const author = new Author({ id: 5, name: 'Jane' })
      author.persisted = true

      await author.articles()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('author_id')
      expect(query.params).toContain(5)
    })

    it('handles camelCase model names correctly', async () => {
      // BlogPost -> blog_post_id
      class BlogPost extends Model {
        static tableName = 'blog_posts'
        static associations = {
          hasMany: ['reactions']
        }
        static validations = {}
      }

      class Reaction extends Model {
        static tableName = 'reactions'
        static validations = {}
      }

      BlogPost.register()
      Reaction.register()
      defineAssociations(BlogPost)

      mockConnection.setMockResults([
        [{ id: 1, emoji: '👍', blog_post_id: 1 }]
      ])

      const blogPost = new BlogPost({ id: 1 })
      blogPost.persisted = true

      await blogPost.reactions()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('blog_post_id')
    })
  })

  describe('Caching Behavior', () => {
    it('caches loaded association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.posts()
      await user.posts()
      await user.posts()

      // Should only query once due to caching
      expect(mockConnection.queries.length).toBe(1)
    })

    it('caches empty array', async () => {
      mockConnection.setMockResults([
        []
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.posts()
      await user.posts()

      expect(mockConnection.queries.length).toBe(1)
    })

    it('reloads when reload option is true', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 1 }
        ]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const posts1 = await user.posts()
      const posts2 = await user.posts({ reload: true })

      expect(mockConnection.queries.length).toBe(2)
      expect(posts1.length).toBe(1)
      expect(posts2.length).toBe(2)
    })

    it('does not cache when using custom options', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [{ id: 1, title: 'Post 1', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.posts({ where: { published: true } })
      await user.posts({ where: { published: true } })

      // Should query twice because custom options bypass cache
      expect(mockConnection.queries.length).toBe(2)
    })

    it('clears cache with clearCache method', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'New Post', user_id: 1 }
        ]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await user.posts()
      user.clearPostsCache()
      await user.posts()

      expect(mockConnection.queries.length).toBe(2)
    })
  })

  describe('Query Options', () => {
    it('applies additional where conditions', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Published', user_id: 1, published: true }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ where: { published: true } })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('user_id')
      expect(query.sql).toContain('published')
    })

    it('applies custom ordering', async () => {
      mockConnection.setMockResults([
        [{ id: 2 }, { id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ order: { created_at: 'desc' } })

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('order by')
    })

    it('applies limit', async () => {
      mockConnection.setMockResults([
        [{ id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ limit: 5 })

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('limit')
    })

    it('applies offset', async () => {
      mockConnection.setMockResults([
        [{ id: 2 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ offset: 10 })

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('offset')
    })
  })

  describe('Default Ordering', () => {
    it('applies default order from config', async () => {
      mockConnection.setMockResults([
        [{ id: 2, created_at: '2024-01-02' }, { id: 1, created_at: '2024-01-01' }]
      ])

      const blog = new Blog({ id: 1 })
      blog.persisted = true

      await blog.entries()

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('order by')
    })

    it('custom order overrides default order', async () => {
      mockConnection.setMockResults([
        [{ id: 1 }, { id: 2 }]
      ])

      const blog = new Blog({ id: 1 })
      blog.persisted = true

      await blog.entries({ order: { title: 'asc' } })

      const query = mockConnection.getLastQuery()
      // Custom order should be applied
      expect(query.sql.toLowerCase()).toContain('order by')
    })
  })

  describe('Default Scope', () => {
    it('applies default scope from config', async () => {
      mockConnection.setMockResults([
        [{ id: 1, published: true }]
      ])

      const blog = new Blog({ id: 1 })
      blog.persisted = true

      await blog.published_entries()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('published')
    })
  })

  describe('Build Association', () => {
    it('creates new unsaved child with foreign key set', () => {
      const user = new User({ id: 5, name: 'John' })
      user.persisted = true

      const post = user.buildPost({ title: 'New Post' })

      expect(post).toBeInstanceOf(Post)
      expect(post.attributes.title).toBe('New Post')
      expect(post.attributes.user_id).toBe(5)
      expect(post.persisted).toBe(false)
    })

    it('build method accepts empty attributes', () => {
      const user = new User({ id: 1 })

      const post = user.buildPost()

      expect(post).toBeInstanceOf(Post)
      expect(post.attributes.user_id).toBe(1)
    })

    it('uses singularized name for build method', () => {
      const user = new User({ id: 1 })

      // posts -> buildPost (singular)
      expect(typeof user.buildPost).toBe('function')

      // comments -> buildComment (singular)
      expect(typeof user.buildComment).toBe('function')
    })
  })

  describe('Create Association', () => {
    it('creates and saves child with foreign key set', async () => {
      mockConnection.setMockResults([
        [{ id: 10, title: 'Created Post', user_id: 5, created_at: new Date(), updated_at: new Date() }]
      ])

      const user = new User({ id: 5, name: 'John' })
      user.persisted = true

      const post = await user.createPost({ title: 'Created Post' })

      expect(post).toBeInstanceOf(Post)
      expect(post.persisted).toBe(true)
      expect(post.attributes.user_id).toBe(5)

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('insert')
    })

    it('clears cache after creating child', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],  // First load
        [{ id: 10, title: 'New Post', user_id: 1, created_at: new Date(), updated_at: new Date() }],  // Create
        [{ id: 1 }, { id: 10 }]  // Reload
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts()  // Load and cache
      await user.createPost({ title: 'New Post' })  // Create
      await user.posts()  // Should reload (cache cleared)

      // Should have 3 queries: load, insert, reload
      expect(mockConnection.queries.length).toBe(3)
    })
  })

  describe('Count Method', () => {
    it('returns count of associated records', async () => {
      mockConnection.setMockResults([
        [{ count: 5 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const count = await user.postsCount()

      expect(count).toBe(5)
    })

    it('returns 0 when primary key is null', async () => {
      const user = new User({ name: 'John' })

      const count = await user.postsCount()

      expect(count).toBe(0)
      expect(mockConnection.queries.length).toBe(0)
    })

    it('accepts additional conditions', async () => {
      mockConnection.setMockResults([
        [{ count: 3 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.postsCount({ published: true })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('published')
    })
  })

  describe('Has Association Method', () => {
    it('returns true when associated records exist', async () => {
      mockConnection.setMockResults([
        [{ count: 1 }]  // exists() uses count() internally
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const hasPosts = await user.hasPosts()

      expect(hasPosts).toBe(true)
    })

    it('returns false when no associated records exist', async () => {
      mockConnection.setMockResults([
        [{ count: 0 }]  // exists() uses count() internally
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const hasPosts = await user.hasPosts()

      expect(hasPosts).toBe(false)
    })

    it('returns false when primary key is null', async () => {
      const user = new User({ name: 'John' })

      const hasPosts = await user.hasPosts()

      expect(hasPosts).toBe(false)
      expect(mockConnection.queries.length).toBe(0)
    })

    it('accepts additional conditions', async () => {
      mockConnection.setMockResults([
        [{ count: 1 }]  // exists() uses count() internally
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.hasPosts({ published: true })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('published')
    })
  })

  describe('Multiple HasMany Associations', () => {
    it('handles multiple hasMany on same model', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [{ id: 1, body: 'Comment 1', user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const posts = await user.posts()
      const comments = await user.comments()

      expect(posts.length).toBe(1)
      expect(posts[0]).toBeInstanceOf(Post)

      expect(comments.length).toBe(1)
      expect(comments[0]).toBeInstanceOf(Comment)
    })

    it('caches each association independently', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [{ id: 1, body: 'Comment 1', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts()
      await user.comments()
      await user.posts()  // Should use cache
      await user.comments()  // Should use cache

      expect(mockConnection.queries.length).toBe(2)
    })
  })

  describe('Model Resolution', () => {
    it('resolves model from global registry', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const posts = await user.posts()

      expect(posts[0]).toBeInstanceOf(Post)
    })

    it('uses explicit model class when provided', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Entry', blog_id: 1, published: true }]
      ])

      const blog = new Blog({ id: 1 })
      blog.persisted = true

      const entries = await blog.published_entries()

      expect(entries[0]).toBeInstanceOf(Entry)
    })

    it('throws error when model cannot be resolved', async () => {
      class Orphan extends Model {
        static tableName = 'orphans'
        static associations = {
          hasMany: ['ghosts']  // Ghost model is not registered
        }
        static validations = {}
      }
      defineAssociations(Orphan)

      const orphan = new Orphan({ id: 1 })
      orphan.persisted = true

      await expect(orphan.ghosts()).rejects.toThrow('Cannot resolve model')
    })
  })

  describe('Edge Cases', () => {
    it('handles zero as valid primary key', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 0 }]
      ])

      const user = new User({ id: 0, name: 'System' })
      user.persisted = true

      const posts = await user.posts()

      // Zero is a valid primary key value
      expect(posts.length).toBe(1)
      expect(mockConnection.queries.length).toBe(1)
    })

    it('handles string primary key values', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 'uuid-123' }]
      ])

      const user = new User({ id: 'uuid-123' })
      user.persisted = true

      const posts = await user.posts()

      expect(posts.length).toBe(1)
    })

    it('works on new (unpersisted) records with id', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 1 }]
      ])

      const user = new User({ id: 1, name: 'Draft' })
      // Not persisted, but has id

      const posts = await user.posts()

      expect(posts.length).toBe(1)
    })
  })

  describe('Query Generation', () => {
    it('queries by foreign key with correct value', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 42 }]
      ])

      const user = new User({ id: 42, name: 'John' })
      user.persisted = true

      await user.posts()

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('user_id')
      expect(query.params).toContain(42)
    })
  })
})

describe('HasMany - Integration with Model', () => {
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

    expect(typeof user.posts).toBe('function')
    expect(typeof user.buildPost).toBe('function')
    expect(typeof user.createPost).toBe('function')
    expect(typeof user.postsCount).toBe('function')
    expect(typeof user.hasPosts).toBe('function')
    expect(typeof user.clearPostsCache).toBe('function')
  })

  it('multiple instances have independent caches', async () => {
    mockConnection.setMockResults([
      [{ id: 1, title: 'User 1 Post', user_id: 1 }],
      [{ id: 2, title: 'User 2 Post', user_id: 2 }]
    ])

    const user1 = new User({ id: 1 })
    const user2 = new User({ id: 2 })
    user1.persisted = true
    user2.persisted = true

    const posts1 = await user1.posts()
    const posts2 = await user2.posts()

    expect(posts1[0].attributes.title).toBe('User 1 Post')
    expect(posts2[0].attributes.title).toBe('User 2 Post')
    expect(posts1).not.toBe(posts2)
  })
})
