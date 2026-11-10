/**
 * Eager Loading Tests
 *
 * Tests the eager loading functionality via `includes` option
 * to prevent N+1 queries when loading associations.
 *
 * N+1 Problem: Without eager loading, fetching N records with an
 * association would execute N+1 queries (1 for the main records,
 * then N queries for each associated record).
 *
 * Eager loading solves this by batch-loading all associated records
 * in a single query, reducing the total to 2 queries regardless of N.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Model } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'
import { defineAssociations, EagerLoader } from '../../src/database/associations.js'

// Mock connection that tracks query count
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

  getQueryCount() {
    return this.queries.length
  }

  getQueries() {
    return this.queries
  }

  clearQueries() {
    this.queries = []
  }
}

// ============================================
// Test Models
// ============================================

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

class Profile extends Model {
  static tableName = 'profiles'
  static primaryKey = 'id'
  static associations = {
    belongsTo: ['user']
  }
  static validations = {}
}

// Register models
User.register()
Post.register()
Comment.register()
Profile.register()

// Define associations
defineAssociations(User)
defineAssociations(Post)
defineAssociations(Comment)
defineAssociations(Profile)

describe('Eager Loading - N+1 Prevention', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
    mockConnection = null
  })

  describe('Model.includes() static method', () => {
    it('adds associations to the includes list', async () => {
      mockConnection.setMockResults([
        []  // Empty result for posts query
      ])

      const query = Post.includes('user')

      expect(query.includesList).toContain('user')
    })

    it('supports multiple associations', async () => {
      const query = Post.includes('user', 'comments')

      expect(query.includesList).toContain('user')
      expect(query.includesList).toContain('comments')
    })

    it('chains with other query methods', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post 1', user_id: 1 }],
        [{ id: 1, name: 'John' }]
      ])

      const posts = await Post
        .includes('user')
        .where({ published: true })
        .order({ created_at: 'desc' })
        .limit(10)
        .all()

      expect(posts.length).toBe(1)
      expect(mockConnection.getQueryCount()).toBeLessThanOrEqual(2)
    })
  })

  describe('belongsTo Eager Loading', () => {
    it('batch loads parent records in a single query', async () => {
      // Main query returns 3 posts with different users
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 2 },
          { id: 3, title: 'Post 3', user_id: 1 }  // Same user as post 1
        ],
        // Eager load query returns users (only 2 unique users)
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ]
      ])

      const posts = await Post.includes('user').all()

      // Should execute exactly 2 queries:
      // 1. SELECT * FROM posts
      // 2. SELECT * FROM users WHERE id IN (1, 2)
      expect(mockConnection.getQueryCount()).toBe(2)
      expect(posts.length).toBe(3)

      // All posts should have user attached
      expect(posts[0].user).toBeDefined()
      expect(posts[0].user.attributes.name).toBe('John')
      expect(posts[1].user.attributes.name).toBe('Jane')
      expect(posts[2].user.attributes.name).toBe('John')  // Same user as post 1
    })

    it('handles null foreign keys', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Post with user', user_id: 1 },
          { id: 2, title: 'Post without user', user_id: null }
        ],
        [{ id: 1, name: 'John' }]
      ])

      const posts = await Post.includes('user').all()

      expect(posts[0].user).not.toBeNull()
      expect(posts[1].user).toBeNull()
    })

    it('handles missing parent records', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 999 }  // User doesn't exist
        ],
        [{ id: 1, name: 'John' }]  // Only user 1 exists
      ])

      const posts = await Post.includes('user').all()

      expect(posts[0].user).not.toBeNull()
      expect(posts[1].user).toBeNull()  // Should be null, not throw
    })
  })

  describe('hasMany Eager Loading', () => {
    it('batch loads child records in a single query', async () => {
      mockConnection.setMockResults([
        // Main query: users
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ],
        // Eager load: posts for all users
        [
          { id: 1, title: 'Post A', user_id: 1 },
          { id: 2, title: 'Post B', user_id: 1 },
          { id: 3, title: 'Post C', user_id: 2 }
        ]
      ])

      const users = await User.includes('posts').all()

      // Should execute exactly 2 queries
      expect(mockConnection.getQueryCount()).toBe(2)

      // Users should have posts attached as arrays
      expect(users[0].posts).toBeInstanceOf(Array)
      expect(users[0].posts.length).toBe(2)
      expect(users[1].posts.length).toBe(1)
    })

    it('returns empty array for users with no children', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, name: 'Prolific Author' },
          { id: 2, name: 'Silent User' }
        ],
        [
          { id: 1, title: 'Post 1', user_id: 1 }
          // No posts for user 2
        ]
      ])

      const users = await User.includes('posts').all()

      expect(users[0].posts.length).toBe(1)
      expect(users[1].posts).toEqual([])  // Empty array, not undefined
    })

    it('groups children correctly by foreign key', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
          { id: 3, name: 'User 3' }
        ],
        [
          { id: 1, title: 'P1', user_id: 1 },
          { id: 2, title: 'P2', user_id: 3 },
          { id: 3, title: 'P3', user_id: 1 },
          { id: 4, title: 'P4', user_id: 3 }
        ]
      ])

      const users = await User.includes('posts').all()

      expect(users[0].posts.length).toBe(2)  // User 1
      expect(users[1].posts.length).toBe(0)  // User 2
      expect(users[2].posts.length).toBe(2)  // User 3

      // Verify correct posts are grouped
      expect(users[0].posts.map(p => p.attributes.title)).toEqual(['P1', 'P3'])
      expect(users[2].posts.map(p => p.attributes.title)).toEqual(['P2', 'P4'])
    })
  })

  describe('hasOne Eager Loading', () => {
    it('batch loads single child records', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ],
        [
          { id: 1, bio: 'John bio', user_id: 1 },
          { id: 2, bio: 'Jane bio', user_id: 2 }
        ]
      ])

      const users = await User.includes('profile').all()

      expect(mockConnection.getQueryCount()).toBe(2)
      expect(users[0].profile).not.toBeNull()
      expect(users[0].profile.attributes.bio).toBe('John bio')
      expect(users[1].profile.attributes.bio).toBe('Jane bio')
    })

    it('returns null for records without hasOne association', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, name: 'With Profile' },
          { id: 2, name: 'Without Profile' }
        ],
        [{ id: 1, bio: 'Has bio', user_id: 1 }]
      ])

      const users = await User.includes('profile').all()

      expect(users[0].profile).not.toBeNull()
      expect(users[1].profile).toBeNull()
    })

    it('takes only first record when multiple exist', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'User' }],
        [
          { id: 1, bio: 'First profile', user_id: 1 },
          { id: 2, bio: 'Second profile', user_id: 1 }  // Shouldn't happen but handling edge case
        ]
      ])

      const users = await User.includes('profile').all()

      // Should take first match
      expect(users[0].profile.attributes.bio).toBe('First profile')
    })
  })

  describe('Multiple Associations', () => {
    it('eager loads multiple associations in parallel', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }],
        [{ id: 1, title: 'Post', user_id: 1 }],  // posts
        [{ id: 1, body: 'Comment', user_id: 1 }]  // comments
      ])

      const users = await User.includes('posts', 'comments').all()

      // 1 main query + 2 eager load queries
      expect(mockConnection.getQueryCount()).toBe(3)
      expect(users[0].posts).toBeDefined()
      expect(users[0].comments).toBeDefined()
    })

    it('handles mixed association types', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }],
        [{ id: 1, title: 'Post', user_id: 1 }],  // hasMany posts
        [{ id: 1, bio: 'Bio', user_id: 1 }]  // hasOne profile
      ])

      const users = await User.includes('posts', 'profile').all()

      expect(users[0].posts).toBeInstanceOf(Array)
      expect(users[0].profile).not.toBeNull()
    })
  })

  describe('Nested Associations', () => {
    it('loads nested associations with dot notation', async () => {
      mockConnection.setMockResults([
        // Users
        [{ id: 1, name: 'John' }],
        // Posts for users
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 1 }
        ],
        // Comments for posts (nested)
        [
          { id: 1, body: 'Comment 1', post_id: 1 },
          { id: 2, body: 'Comment 2', post_id: 1 },
          { id: 3, body: 'Comment 3', post_id: 2 }
        ]
      ])

      const users = await User.includes('posts.comments').all()

      expect(users[0].posts).toBeDefined()
      expect(users[0].posts[0].comments).toBeDefined()
      expect(users[0].posts[0].comments.length).toBe(2)
      expect(users[0].posts[1].comments.length).toBe(1)
    })

    it('handles deep nesting', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 1 }],  // Posts
        [{ id: 1, body: 'Comment', post_id: 1, user_id: 2 }],  // Comments
        [{ id: 2, name: 'Commenter' }]  // Comment authors
      ])

      const posts = await Post.includes('comments.user').all()

      expect(posts[0].comments[0].user).toBeDefined()
      expect(posts[0].comments[0].user.attributes.name).toBe('Commenter')
    })
  })

  describe('Model.findAll with includes option', () => {
    it('supports includes option in findAll', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 1 }],
        [{ id: 1, name: 'Author' }]
      ])

      const posts = await Post.findAll({
        include: 'user'
      })

      expect(posts.length).toBe(1)
      expect(posts[0].user.attributes.name).toBe('Author')
      expect(mockConnection.getQueryCount()).toBe(2)
    })

    it('supports array of includes in findAll', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 1 }],
        [{ id: 1, name: 'Author' }],
        [{ id: 1, body: 'Comment', post_id: 1 }]
      ])

      const posts = await Post.findAll({
        include: ['user', 'comments']
      })

      expect(posts[0].user).toBeDefined()
      expect(posts[0].comments).toBeDefined()
    })

    it('combines includes with where conditions', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Published Post', user_id: 1, published: true }],
        [{ id: 1, name: 'Author' }]
      ])

      const posts = await Post.findAll({
        where: { published: true },
        include: 'user'
      })

      expect(posts.length).toBe(1)
      expect(posts[0].user).toBeDefined()
    })

    it('combines includes with ordering and limit', async () => {
      mockConnection.setMockResults([
        [
          { id: 2, title: 'Recent Post', user_id: 1 },
          { id: 1, title: 'Old Post', user_id: 1 }
        ],
        [{ id: 1, name: 'Author' }]
      ])

      const posts = await Post.findAll({
        order: { created_at: 'desc' },
        limit: 10,
        include: 'user'
      })

      expect(posts.length).toBe(2)
      // Both posts should have the same user eager loaded
      expect(posts[0].user).toBe(posts[1].user)
    })
  })

  describe('N+1 Query Prevention Verification', () => {
    it('executes exactly 2 queries for belongsTo regardless of record count', async () => {
      // Simulate 100 posts
      const posts = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        title: `Post ${i + 1}`,
        user_id: (i % 10) + 1  // 10 unique users
      }))

      const users = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`
      }))

      mockConnection.setMockResults([posts, users])

      const result = await Post.includes('user').all()

      // Should be exactly 2 queries, not 101 (1 + 100 N+1)
      expect(mockConnection.getQueryCount()).toBe(2)
      expect(result.length).toBe(100)

      // Verify all posts have users attached
      result.forEach(post => {
        expect(post.user).not.toBeNull()
      })
    })

    it('executes exactly 2 queries for hasMany regardless of record count', async () => {
      // Simulate 50 users with varying post counts
      const users = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`
      }))

      // 200 posts spread across users
      const posts = Array.from({ length: 200 }, (_, i) => ({
        id: i + 1,
        title: `Post ${i + 1}`,
        user_id: (i % 50) + 1
      }))

      mockConnection.setMockResults([users, posts])

      const result = await User.includes('posts').all()

      // Should be exactly 2 queries, not 51 (1 + 50 N+1)
      expect(mockConnection.getQueryCount()).toBe(2)
      expect(result.length).toBe(50)

      // Each user should have 4 posts
      result.forEach(user => {
        expect(user.posts.length).toBe(4)
      })
    })

    it('uses IN clause for batch loading', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 2 },
          { id: 3, title: 'Post 3', user_id: 3 }
        ],
        [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
          { id: 3, name: 'User 3' }
        ]
      ])

      await Post.includes('user').all()

      const queries = mockConnection.getQueries()
      // The second query should use IN clause
      expect(queries[1].sql).toContain('IN')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty result set', async () => {
      mockConnection.setMockResults([
        []  // No posts
      ])

      const posts = await Post.includes('user').all()

      expect(posts).toEqual([])
      // Should only execute main query, not eager load query
      expect(mockConnection.getQueryCount()).toBe(1)
    })

    it('handles all null foreign keys', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Orphan 1', user_id: null },
          { id: 2, title: 'Orphan 2', user_id: null }
        ]
      ])

      const posts = await Post.includes('user').all()

      expect(posts.length).toBe(2)
      posts.forEach(post => {
        expect(post.user).toBeNull()
      })
      // Should only execute main query since no FK values to load
      expect(mockConnection.getQueryCount()).toBe(1)
    })

    it('throws for an unknown association, naming the declared ones', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post' }]
      ])

      // a misspelled includes() used to be skipped with a warning
      await expect(Post.includes('nonexistent').all()).rejects.toThrow(
        "Unknown association 'nonexistent' in includes() on Post; declared: "
      )
    })

    it('deduplicates foreign key values', async () => {
      mockConnection.setMockResults([
        [
          { id: 1, title: 'Post 1', user_id: 1 },
          { id: 2, title: 'Post 2', user_id: 1 },
          { id: 3, title: 'Post 3', user_id: 1 }
        ],
        [{ id: 1, name: 'John' }]
      ])

      const posts = await Post.includes('user').all()

      // All posts reference same user, should only query once with id=1
      const queries = mockConnection.getQueries()
      expect(queries[1].params.filter(p => p === 1).length).toBe(1)

      // All posts should share the same user reference
      expect(posts[0].user.attributes.name).toBe('John')
      expect(posts[1].user.attributes.name).toBe('John')
      expect(posts[2].user.attributes.name).toBe('John')
    })
  })

  describe('Caching Behavior', () => {
    it('does not re-query when accessing eager loaded associations', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 1 }],
        [{ id: 1, name: 'John' }]
      ])

      const posts = await Post.includes('user').all()

      const initialQueryCount = mockConnection.getQueryCount()

      // Access the association multiple times
      const user1 = posts[0].user
      const user2 = posts[0].user
      const user3 = posts[0].user

      // No additional queries should be made
      expect(mockConnection.getQueryCount()).toBe(initialQueryCount)
      expect(user1).toBe(user2)
      expect(user2).toBe(user3)
    })

    it('eager loaded data is available synchronously', async () => {
      mockConnection.setMockResults([
        [{ id: 1, title: 'Post', user_id: 1 }],
        [{ id: 1, name: 'John' }]
      ])

      const posts = await Post.includes('user').all()

      // Access should be synchronous (already loaded)
      const user = posts[0].user
      expect(user.attributes.name).toBe('John')
    })
  })
})

describe('EagerLoader Class - Standalone API', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('can load associations on pre-fetched records', async () => {
    // First fetch posts without eager loading
    mockConnection.setMockResults([
      [
        { id: 1, title: 'Post 1', user_id: 1 },
        { id: 2, title: 'Post 2', user_id: 2 }
      ],
      // Eager loader will query for users
      [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ]
    ])

    const posts = await Post.all()
    expect(posts.length).toBe(2)

    // Verify the cache key is not set (association not pre-loaded)
    expect(posts[0]._association_user).toBeUndefined()

    // Now use EagerLoader to load associations
    const loader = new EagerLoader(Post, ['user'])
    await loader.load(posts)

    // Users should now be attached (EagerLoader assigns directly to the property)
    // Note: This is different from the cache key used by the association method
    expect(posts[0].user).toBeDefined()
    expect(posts[0].user).toBeInstanceOf(User)
    expect(posts[0].user.attributes.name).toBe('John')
    expect(posts[1].user.attributes.name).toBe('Jane')
  })

  it('handles multiple associations', async () => {
    mockConnection.setMockResults([
      [{ id: 1, name: 'User 1' }],
      [{ id: 1, title: 'Post', user_id: 1 }],
      [{ id: 1, bio: 'Bio', user_id: 1 }]
    ])

    const users = await User.all()
    const loader = new EagerLoader(User, ['posts', 'profile'])
    await loader.load(users)

    expect(users[0].posts).toBeInstanceOf(Array)
    expect(users[0].posts.length).toBe(1)
    expect(users[0].profile).not.toBeNull()
  })

  it('handles nested associations', async () => {
    mockConnection.setMockResults([
      [{ id: 1, title: 'Post', user_id: 1 }],
      [{ id: 1, body: 'Comment', post_id: 1, user_id: 2 }],
      [{ id: 2, name: 'Commenter' }]
    ])

    const posts = await Post.all()
    const loader = new EagerLoader(Post, ['comments.user'])
    await loader.load(posts)

    expect(posts[0].comments[0].user.attributes.name).toBe('Commenter')
  })

  it('handles empty records array', async () => {
    const loader = new EagerLoader(Post, ['user'])

    // Should not throw
    await loader.load([])
    await loader.load(null)
  })

  it('warns but continues for unknown associations', async () => {
    mockConnection.setMockResults([
      [{ id: 1, title: 'Post' }]
    ])

    const posts = await Post.all()
    const loader = new EagerLoader(Post, ['nonexistent'])

    // Should not throw
    await loader.load(posts)
    expect(posts.length).toBe(1)
  })
})

describe('Eager Loading - Query Optimization', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('only fetches unique foreign key values', async () => {
    mockConnection.setMockResults([
      [
        { id: 1, title: 'Post 1', user_id: 5 },
        { id: 2, title: 'Post 2', user_id: 5 },
        { id: 3, title: 'Post 3', user_id: 10 }
      ],
      [
        { id: 5, name: 'User 5' },
        { id: 10, name: 'User 10' }
      ]
    ])

    await Post.includes('user').all()

    const queries = mockConnection.getQueries()
    // Should query for unique user IDs: 5 and 10
    // Note: The order may vary, so we check that both are present
    expect(queries[1].params.length).toBe(2)
    expect(queries[1].params).toContain(5)
    expect(queries[1].params).toContain(10)
  })

  it('optimizes query count with multiple has associations', async () => {
    mockConnection.setMockResults([
      [{ id: 1, name: 'User' }],
      [
        { id: 1, title: 'Post 1', user_id: 1 },
        { id: 2, title: 'Post 2', user_id: 1 }
      ],
      [
        { id: 1, body: 'Comment 1', user_id: 1 },
        { id: 2, body: 'Comment 2', user_id: 1 }
      ],
      [{ id: 1, bio: 'Bio', user_id: 1 }]
    ])

    await User.includes('posts', 'comments', 'profile').all()

    // 1 main + 3 association queries
    expect(mockConnection.getQueryCount()).toBe(4)
  })
})
