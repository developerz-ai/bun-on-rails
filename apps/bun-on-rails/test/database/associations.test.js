/**
 * Comprehensive Association Tests
 *
 * Tests all association types together in an integrated manner:
 * - belongsTo: Parent relationship
 * - hasMany: Collection relationship
 * - hasOne: Single child relationship
 * - Mixed associations on models
 * - Cross-association scenarios
 * - Integration with Model lifecycle
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

  getQueryCount() {
    return this.queries.length
  }
}

// Test Models - Simulating a blog system
class User extends Model {
  static tableName = 'users'
  static primaryKey = 'id'
  static associations = {
    hasMany: ['posts', 'comments'],
    hasOne: ['profile']
  }
  static validations = {}
}

class Post extends Model {
  static tableName = 'posts'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments', 'likes']
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

class Profile extends Model {
  static tableName = 'profiles'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user']
  }
  static validations = {}
}

class Like extends Model {
  static tableName = 'likes'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['post']
  }
  static validations = {}
}

// Register models in global registry
User.register()
Post.register()
Comment.register()
Profile.register()
Like.register()

// Define associations on models
defineAssociations(User)
defineAssociations(Post)
defineAssociations(Comment)
defineAssociations(Profile)
defineAssociations(Like)

describe('Association System Integration', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
    mockConnection = null
  })

  describe('Model with Multiple Association Types', () => {
    it('user has hasMany and hasOne associations', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }], // posts
        [{ id: 1, bio: 'Test bio', user_id: 1 }]  // profile
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const posts = await user.posts()
      const profile = await user.profile()

      expect(posts).toBeInstanceOf(Array)
      expect(posts.length).toBe(1)
      expect(posts[0]).toBeInstanceOf(Post)

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.attributes.bio).toBe('Test bio')
    })

    it('post has belongsTo and hasMany associations', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }], // user
        [{ id: 1, body: 'Great post!', post_id: 1 }]          // comments
      ])

      const post = new Post({ id: 1, title: 'Test', user_id: 1 })
      post.persisted = true

      const user = await post.user()
      const comments = await post.comments()

      expect(user).toBeInstanceOf(User)
      expect(user.attributes.name).toBe('John')

      expect(comments).toBeInstanceOf(Array)
      expect(comments.length).toBe(1)
      expect(comments[0]).toBeInstanceOf(Comment)
    })

    it('comment has multiple belongsTo associations', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }],        // user
        [{ id: 2, title: 'Test Post' }]   // post
      ])

      const comment = new Comment({
        id: 1,
        body: 'Great!',
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

      // Each association should be cached independently
      mockConnection.clearQueries()
      await comment.user()
      await comment.post()
      expect(mockConnection.getQueryCount()).toBe(0)
    })
  })

  describe('Cross-Association Traversal', () => {
    it('can traverse from user -> post -> comments', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Test Post', user_id: 1 }],           // user.posts()
        [
          { id: 1, body: 'Comment 1', post_id: 1, user_id: 2 },
          { id: 2, body: 'Comment 2', post_id: 1, user_id: 3 }
        ]                                                       // post.comments()
      ])

      const user = new User({ id: 1, name: 'Author' })
      user.persisted = true

      const posts = await user.posts()
      expect(posts.length).toBe(1)

      const comments = await posts[0].comments()
      expect(comments.length).toBe(2)
      expect(comments[0].attributes.body).toBe('Comment 1')
    })

    it('can traverse from comment -> post -> user', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Test Post', user_id: 1 }],  // comment.post()
        [{ id: 1, name: 'Author' }]                   // post.user()
      ])

      const comment = new Comment({
        id: 1,
        body: 'Great!',
        post_id: 1,
        user_id: 2
      })
      comment.persisted = true

      const post = await comment.post()
      expect(post).toBeInstanceOf(Post)

      const author = await post.user()
      expect(author).toBeInstanceOf(User)
      expect(author.attributes.name).toBe('Author')
    })

    it('can access same model through different paths', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Commenter' }],               // comment.user()
        [{ id: 1, title: 'Test Post', user_id: 5 }],  // comment.post()
        [{ id: 5, name: 'Author' }]                   // post.user()
      ])

      const comment = new Comment({
        id: 1,
        body: 'Nice!',
        user_id: 1,
        post_id: 1
      })
      comment.persisted = true

      const commenter = await comment.user()
      const post = await comment.post()
      const author = await post.user()

      // Both are User instances, but different users
      expect(commenter).toBeInstanceOf(User)
      expect(author).toBeInstanceOf(User)
      expect(commenter.id).toBe(1)
      expect(author.id).toBe(5)
    })
  })

  describe('Association Methods Availability', () => {
    it('belongsTo defines getter, setter, build, and create methods', () => {
      const post = new Post({ id: 1 })

      // Getter
      expect(typeof post.user).toBe('function')

      // Setter
      expect(typeof post['user=']).toBe('function')

      // Build
      expect(typeof post.buildUser).toBe('function')

      // Create
      expect(typeof post.createUser).toBe('function')
    })

    it('hasMany defines getter, build, create, count, has, and clear methods', () => {
      const user = new User({ id: 1 })

      // Getter
      expect(typeof user.posts).toBe('function')

      // Build (singular)
      expect(typeof user.buildPost).toBe('function')

      // Create (singular)
      expect(typeof user.createPost).toBe('function')

      // Count
      expect(typeof user.postsCount).toBe('function')

      // Has
      expect(typeof user.hasPosts).toBe('function')

      // Clear cache
      expect(typeof user.clearPostsCache).toBe('function')
    })

    it('hasOne defines getter, setter, build, create, has, and clear methods', () => {
      const user = new User({ id: 1 })

      // Getter
      expect(typeof user.profile).toBe('function')

      // Setter
      expect(typeof user['profile=']).toBe('function')

      // Build
      expect(typeof user.buildProfile).toBe('function')

      // Create
      expect(typeof user.createProfile).toBe('function')

      // Has
      expect(typeof user.hasProfile).toBe('function')

      // Clear cache
      expect(typeof user.clearProfileCache).toBe('function')
    })
  })

  describe('Association Building and Creating', () => {
    it('buildPost sets foreign key correctly', () => {
      const user = new User({ id: 5, name: 'Author' })
      user.persisted = true

      const post = user.buildPost({ title: 'New Post' })

      expect(post).toBeInstanceOf(Post)
      expect(post.attributes.title).toBe('New Post')
      expect(post.attributes.user_id).toBe(5)
      expect(post.persisted).toBe(false)
    })

    it('createPost persists record with foreign key', async () => {
      mockConnection.setMockResults([
        [{ id: 10, title: 'Created Post', user_id: 5, created_at: new Date(), updated_at: new Date() }]
      ])

      const user = new User({ id: 5, name: 'Author' })
      user.persisted = true

      const post = await user.createPost({ title: 'Created Post' })

      expect(post).toBeInstanceOf(Post)
      expect(post.persisted).toBe(true)
      expect(post.attributes.user_id).toBe(5)
      expect(post.id).toBe(10)
    })

    it('buildUser through belongsTo creates parent instance', () => {
      const post = new Post({ id: 1, title: 'Orphan Post' })

      const user = post.buildUser({ name: 'New Author' })

      expect(user).toBeInstanceOf(User)
      expect(user.attributes.name).toBe('New Author')
      expect(user.persisted).toBe(false)
    })

    it('buildProfile through hasOne sets foreign key on child', () => {
      const user = new User({ id: 3, name: 'John' })
      user.persisted = true

      const profile = user.buildProfile({ bio: 'Test bio' })

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.attributes.bio).toBe('Test bio')
      expect(profile.attributes.user_id).toBe(3)
      expect(profile.persisted).toBe(false)
    })
  })

  describe('Association Caching', () => {
    it('caches belongsTo association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ id: 1, user_id: 1 })
      post.persisted = true

      await post.user()
      await post.user()
      await post.user()

      expect(mockConnection.getQueryCount()).toBe(1)
    })

    it('caches hasMany association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts()
      await user.posts()

      expect(mockConnection.getQueryCount()).toBe(1)
    })

    it('caches hasOne association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.profile()
      await user.profile()

      expect(mockConnection.getQueryCount()).toBe(1)
    })

    it('clearPostsCache forces reload', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 1 }
        ]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const posts1 = await user.posts()
      expect(posts1.length).toBe(1)

      user.clearPostsCache()

      const posts2 = await user.posts()
      expect(posts2.length).toBe(2)
      expect(mockConnection.getQueryCount()).toBe(2)
    })

    it('reload option bypasses cache', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }],
        [{ id: 1, name: 'John Updated' }]
      ])

      const post = new Post({ id: 1, user_id: 1 })
      post.persisted = true

      const user1 = await post.user()
      const user2 = await post.user({ reload: true })

      expect(mockConnection.getQueryCount()).toBe(2)
      expect(user1.attributes.name).toBe('John')
      expect(user2.attributes.name).toBe('John Updated')
    })
  })

  describe('Association Setters', () => {
    it('belongsTo setter updates foreign key', () => {
      const post = new Post({ id: 1, title: 'Test' })
      const user = new User({ id: 5, name: 'Jane' })
      user.persisted = true

      post['user='](user)

      expect(post.attributes.user_id).toBe(5)
    })

    it('belongsTo setter with null clears foreign key', () => {
      const post = new Post({ id: 1, title: 'Test', user_id: 5 })

      post['user='](null)

      expect(post.attributes.user_id).toBeNull()
    })

    it('hasOne setter updates foreign key on child', () => {
      const user = new User({ id: 5, name: 'Jane' })
      user.persisted = true

      const profile = new Profile({ bio: 'Test' })

      user['profile='](profile)

      expect(profile.attributes.user_id).toBe(5)
    })

    it('hasOne setter with null clears association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, bio: 'Test', user_id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.profile()  // Load and cache

      user['profile='](null)

      mockConnection.clearQueries()
      const profile = await user.profile()

      // Should return null from cache
      expect(profile).toBeNull()
      expect(mockConnection.getQueryCount()).toBe(0)
    })
  })

  describe('Association Count and Existence', () => {
    it('postsCount returns number of associated records', async () => {
      mockConnection.setMockResults([
        [{ count: 5 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const count = await user.postsCount()

      expect(count).toBe(5)
    })

    it('hasPosts returns true when records exist', async () => {
      mockConnection.setMockResults([
        [{ count: 3 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const has = await user.hasPosts()

      expect(has).toBe(true)
    })

    it('hasPosts returns false when no records exist', async () => {
      mockConnection.setMockResults([
        [{ count: 0 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const has = await user.hasPosts()

      expect(has).toBe(false)
    })

    it('hasProfile returns true when record exists', async () => {
      mockConnection.setMockResults([
        [{ count: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const has = await user.hasProfile()

      expect(has).toBe(true)
    })

    it('count methods work with conditions', async () => {
      mockConnection.setMockResults([
        [{ count: 2 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      const count = await user.postsCount({ published: true })

      expect(count).toBe(2)

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('published')
    })
  })

  describe('Null and Undefined Handling', () => {
    it('belongsTo returns null when foreign key is null', async () => {
      const post = new Post({ id: 1, title: 'Test', user_id: null })

      const user = await post.user()

      expect(user).toBeNull()
      expect(mockConnection.getQueryCount()).toBe(0)
    })

    it('hasMany returns empty array when primary key is null', async () => {
      const user = new User({ name: 'John' })  // No id

      const posts = await user.posts()

      expect(posts).toEqual([])
      expect(mockConnection.getQueryCount()).toBe(0)
    })

    it('hasOne returns null when primary key is null', async () => {
      const user = new User({ name: 'John' })  // No id

      const profile = await user.profile()

      expect(profile).toBeNull()
      expect(mockConnection.getQueryCount()).toBe(0)
    })

    it('belongsTo returns null when parent not found', async () => {
      mockConnection.setMockResults([
        []  // Empty result
      ])

      const post = new Post({ id: 1, user_id: 999 })
      post.persisted = true

      const user = await post.user()

      expect(user).toBeNull()
    })
  })

  describe('Query Options', () => {
    it('hasMany accepts custom where conditions', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Published', user_id: 1, published: true }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ where: { published: true } })

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('published')
    })

    it('hasMany accepts custom ordering', async () => {
      mockConnection.setMockResults([
        [{ id: 2 }, { id: 1 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ order: { created_at: 'desc' } })

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('order by')
    })

    it('hasMany accepts limit and offset', async () => {
      mockConnection.setMockResults([
        [{ id: 11 }, { id: 12 }]
      ])

      const user = new User({ id: 1 })
      user.persisted = true

      await user.posts({ limit: 2, offset: 10 })

      const query = mockConnection.getLastQuery()
      expect(query.sql.toLowerCase()).toContain('limit')
      expect(query.sql.toLowerCase()).toContain('offset')
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

      expect(user).toBeInstanceOf(User)
    })

    it('works on unpersisted records', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ title: 'Draft', user_id: 1 })
      // Not persisted

      const user = await post.user()

      expect(user).toBeInstanceOf(User)
    })

    it('returns consistent empty array for hasMany on unpersisted records', async () => {
      const user = new User({ name: 'Draft' })
      // Not persisted, no id

      const posts1 = await user.posts()
      const posts2 = await user.posts()

      expect(posts1).toEqual([])
      expect(posts2).toEqual([])
      // Both calls should return empty array without querying
      expect(mockConnection.getQueryCount()).toBe(0)
    })
  })

  describe('Complex Real-World Scenarios', () => {
    it('blog post with author, comments, and likes', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Author', email: 'author@example.com' }],  // post.user()
        [
          { id: 1, body: 'Great!', post_id: 1, user_id: 2 },
          { id: 2, body: 'Nice!', post_id: 1, user_id: 3 }
        ],  // post.comments()
        [
          { id: 1, post_id: 1 },
          { id: 2, post_id: 1 },
          { id: 3, post_id: 1 }
        ]   // post.likes()
      ])

      const post = new Post({
        id: 1,
        title: 'My Blog Post',
        user_id: 1
      })
      post.persisted = true

      const author = await post.user()
      const comments = await post.comments()
      const likes = await post.likes()

      expect(author.attributes.name).toBe('Author')
      expect(comments.length).toBe(2)
      expect(likes.length).toBe(3)
    })

    it('user profile with posts and comments activity', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 1 }
        ],  // user.posts()
        [
          { id: 1, body: 'Comment 1', user_id: 1, post_id: 5 },
          { id: 2, body: 'Comment 2', user_id: 1, post_id: 6 }
        ],  // user.comments()
        [{ id: 1, bio: 'Software Developer', user_id: 1 }]  // user.profile()
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const posts = await user.posts()
      const comments = await user.comments()
      const profile = await user.profile()

      expect(posts.length).toBe(2)
      expect(comments.length).toBe(2)
      expect(profile.attributes.bio).toBe('Software Developer')

      // Verify all cached
      mockConnection.clearQueries()
      await user.posts()
      await user.comments()
      await user.profile()
      expect(mockConnection.getQueryCount()).toBe(0)
    })

    it('chain of associations with data', async () => {
      // Comment -> Post -> User (author)
      mockConnection.setMockResults([
        [{ id: 1, title: 'Original Post', user_id: 5 }],  // comment.post()
        [{ id: 5, name: 'Post Author' }],                 // post.user()
        [{ id: 2, name: 'Commenter' }]                    // comment.user()
      ])

      const comment = new Comment({
        id: 1,
        body: 'Interesting perspective!',
        user_id: 2,
        post_id: 1
      })
      comment.persisted = true

      const post = await comment.post()
      const postAuthor = await post.user()
      const commenter = await comment.user()

      expect(post.attributes.title).toBe('Original Post')
      expect(postAuthor.attributes.name).toBe('Post Author')
      expect(commenter.attributes.name).toBe('Commenter')
      expect(postAuthor.id).not.toBe(commenter.id)
    })
  })

  describe('Independent Instance Caches', () => {
    it('different post instances have separate caches', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'User 1' }],
        [{ id: 2, name: 'User 2' }]
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

    it('different user instances have separate hasMany caches', async () => {
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

  describe('Model Registration and Resolution', () => {
    it('throws error when associated model cannot be resolved', async () => {
      class Orphan extends Model {
        static tableName = 'orphans'
        static associations = {
          belongsTo: ['phantom']  // Phantom model not registered
        }
        static validations = {}
      }
      defineAssociations(Orphan)

      const orphan = new Orphan({ id: 1, phantom_id: 1 })
      orphan.persisted = true

      await expect(orphan.phantom()).rejects.toThrow('Cannot resolve model')
    })

    it('resolves models from global registry', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'Test' }]
      ])

      const post = new Post({ id: 1, user_id: 1 })
      post.persisted = true

      const user = await post.user()

      // Should successfully resolve User from registry
      expect(user).toBeInstanceOf(User)
    })
  })

  describe('Association Method Signature Consistency', () => {
    it('all association getters return promises', () => {
      const user = new User({ id: 1 })
      const post = new Post({ id: 1, user_id: 1 })
      user.persisted = true
      post.persisted = true

      // HasMany
      const postsPromise = user.posts()
      expect(postsPromise).toBeInstanceOf(Promise)

      // HasOne
      const profilePromise = user.profile()
      expect(profilePromise).toBeInstanceOf(Promise)

      // BelongsTo
      const userPromise = post.user()
      expect(userPromise).toBeInstanceOf(Promise)
    })

    it('all build methods return model instances synchronously', () => {
      const user = new User({ id: 1 })
      const post = new Post({ id: 1 })

      // HasMany build
      const builtPost = user.buildPost({ title: 'Test' })
      expect(builtPost).toBeInstanceOf(Post)
      expect(builtPost.persisted).toBe(false)

      // HasOne build
      const builtProfile = user.buildProfile({ bio: 'Test' })
      expect(builtProfile).toBeInstanceOf(Profile)
      expect(builtProfile.persisted).toBe(false)

      // BelongsTo build
      const builtUser = post.buildUser({ name: 'Test' })
      expect(builtUser).toBeInstanceOf(User)
      expect(builtUser.persisted).toBe(false)
    })

    it('all create methods return promises of persisted instances', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 1, created_at: new Date(), updated_at: new Date() }],
        [{ id: 2, bio: 'Bio', user_id: 1, created_at: new Date(), updated_at: new Date() }],
        [{ id: 3, name: 'User', created_at: new Date(), updated_at: new Date() }]
      ])

      const user = new User({ id: 1 })
      const post = new Post({ id: 1 })
      user.persisted = true
      post.persisted = true

      // HasMany create
      const createdPost = await user.createPost({ title: 'Post' })
      expect(createdPost).toBeInstanceOf(Post)
      expect(createdPost.persisted).toBe(true)

      // HasOne create
      const createdProfile = await user.createProfile({ bio: 'Bio' })
      expect(createdProfile).toBeInstanceOf(Profile)
      expect(createdProfile.persisted).toBe(true)

      // BelongsTo create
      const createdUser = await post.createUser({ name: 'User' })
      expect(createdUser).toBeInstanceOf(User)
      expect(createdUser.persisted).toBe(true)
    })
  })
})

describe('Association System - defineAssociations Function', () => {
  it('defines associations on model class', () => {
    class TestModel extends Model {
      static tableName = 'test_models'
      static associations = {
        belongsTo: ['parent'],
        hasMany: ['children'],
        hasOne: ['detail']
      }
      static validations = {}
    }

    const prototype = TestModel.prototype

    defineAssociations(TestModel)

    // Check that methods are defined
    expect(typeof prototype.parent).toBe('function')
    expect(typeof prototype.children).toBe('function')
    expect(typeof prototype.detail).toBe('function')
  })

  it('handles model with no associations', () => {
    class Plain extends Model {
      static tableName = 'plains'
      static validations = {}
    }

    // Should not throw
    expect(() => defineAssociations(Plain)).not.toThrow()
  })

  it('handles empty associations object', () => {
    class Empty extends Model {
      static tableName = 'empties'
      static associations = {}
      static validations = {}
    }

    expect(() => defineAssociations(Empty)).not.toThrow()
  })
})
