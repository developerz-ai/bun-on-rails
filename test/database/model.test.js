/**
 * Comprehensive Model tests
 *
 * Tests the overall Model class functionality including:
 * - Model construction and attributes
 * - Validations (all types)
 * - Associations
 * - Serialization
 * - Static utilities
 * - Integration between different features
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Model, RecordNotFoundError } from '../../src/database/model.js'
import { setConnection } from '../../src/database/connection.js'
import { QueryBuilder } from '../../src/database/query_builder.js'

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

// Test models
class User extends Model {
  static tableName = 'users'
  static primaryKey = 'id'
  static associations = {
    hasMany: ['posts', 'comments'],
    hasOne: ['profile']
  }
  static validations = {
    name: { presence: true, length: { min: 2, max: 50 } },
    email: { presence: true, format: /^[^@]+@[^@]+\.[^@]+$/ },
    age: { numericality: { greaterThanOrEqualTo: 0, lessThanOrEqualTo: 150 } },
    role: { inclusion: ['user', 'admin', 'moderator'] },
    username: { exclusion: ['admin', 'root', 'system'] }
  }
  static scopes = {
    active: (q) => q.where({ is_active: true }),
    byRole: (q, role) => q.where({ role })
  }
}

class Post extends Model {
  static tableName = 'posts'
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }
  static validations = {
    title: { presence: true, length: { max: 200 } },
    body: { presence: true }
  }
}

class Profile extends Model {
  static tableName = 'profiles'
  static associations = {
    belongsTo: ['user']
  }
}

class Comment extends Model {
  static tableName = 'comments'
  static associations = {
    belongsTo: ['user', 'post']
  }
}

// Auto-inferred table name model
class BlogPost extends Model {
  // No explicit tableName - should be inferred as 'blog_posts'
}

class CustomPkModel extends Model {
  static tableName = 'custom_items'
  static primaryKey = 'uuid'
}

// Register models for association tests
User.register()
Post.register()
Profile.register()
Comment.register()

describe('Model - Constructor and Attributes', () => {
  it('creates instance with attributes', () => {
    const user = new User({ name: 'John', email: 'john@example.com' })

    expect(user).toBeInstanceOf(User)
    expect(user.attributes).toEqual({ name: 'John', email: 'john@example.com' })
  })

  it('initializes with empty attributes by default', () => {
    const user = new User()

    expect(user.attributes).toEqual({})
  })

  it('initializes errors as empty object', () => {
    const user = new User({ name: 'John' })

    expect(user.errors).toEqual({})
  })

  it('sets persisted to false for new records', () => {
    const user = new User({ name: 'John' })

    expect(user.persisted).toBe(false)
  })

  it('initializes changed attributes tracking', () => {
    const user = new User({ name: 'John' })

    expect(user._changedAttributes).toBeInstanceOf(Set)
    expect(user._changedAttributes.size).toBe(0)
  })

  it('does not share attributes between instances', () => {
    const user1 = new User({ name: 'John' })
    const user2 = new User({ name: 'Jane' })

    user1.set('email', 'john@example.com')

    expect(user1.attributes.email).toBe('john@example.com')
    expect(user2.attributes.email).toBeUndefined()
  })
})

describe('Model - Attribute Access', () => {
  it('gets attribute values via get()', () => {
    const user = new User({ name: 'John', email: 'john@example.com' })

    expect(user.get('name')).toBe('John')
    expect(user.get('email')).toBe('john@example.com')
  })

  it('sets attribute values via set()', () => {
    const user = new User({ name: 'John' })
    user.set('email', 'john@example.com')

    expect(user.attributes.email).toBe('john@example.com')
  })

  it('tracks changed attributes when setting', () => {
    const user = new User({ name: 'John' })
    user.set('name', 'Jane')

    expect(user._changedAttributes.has('name')).toBe(true)
  })

  it('does not track change when setting same value', () => {
    const user = new User({ name: 'John' })
    user.set('name', 'John')

    expect(user._changedAttributes.has('name')).toBe(false)
  })

  it('provides id getter for primary key', () => {
    const user = new User({ id: 123, name: 'John' })

    expect(user.id).toBe(123)
  })

  it('id getter works with custom primary key', () => {
    const item = new CustomPkModel({ uuid: 'abc-123' })

    expect(item.id).toBe('abc-123')
  })
})

describe('Model - State Checks', () => {
  it('isNew returns true for new records', () => {
    const user = new User({ name: 'John' })

    expect(user.isNew).toBe(true)
  })

  it('isNew returns false for persisted records', () => {
    const user = new User({ id: 1, name: 'John' })
    user.persisted = true

    expect(user.isNew).toBe(false)
  })

  it('isDirty returns false for unchanged records', () => {
    const user = new User({ name: 'John' })

    expect(user.isDirty).toBe(false)
  })

  it('isDirty returns true for changed records', () => {
    const user = new User({ name: 'John' })
    user.set('name', 'Jane')

    expect(user.isDirty).toBe(true)
  })

  it('changedAttributes returns array of changed attribute names', () => {
    const user = new User({ name: 'John', email: 'john@example.com' })
    user.set('name', 'Jane')
    user.set('email', 'jane@example.com')

    expect(user.changedAttributes).toEqual(['name', 'email'])
  })
})

describe('Model - Validations', () => {
  describe('presence validation', () => {
    it('fails when field is undefined', () => {
      const user = new User({ email: 'test@example.com' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.name).toContain("can't be blank")
    })

    it('fails when field is null', () => {
      const user = new User({ name: null, email: 'test@example.com' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.name).toContain("can't be blank")
    })

    it('fails when field is empty string', () => {
      const user = new User({ name: '', email: 'test@example.com' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.name).toContain("can't be blank")
    })

    it('passes when field has value', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(user.isValid()).toBe(true)
    })
  })

  describe('length validation', () => {
    it('validates minimum length', () => {
      const user = new User({ name: 'J', email: 'j@example.com', role: 'user' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.name).toContain('too short')
      expect(user.errors.name).toContain('minimum is 2')
    })

    it('validates maximum length', () => {
      const user = new User({
        name: 'a'.repeat(51),
        email: 'test@example.com',
        role: 'user'
      })

      expect(user.isValid()).toBe(false)
      expect(user.errors.name).toContain('too long')
      expect(user.errors.name).toContain('maximum is 50')
    })

    it('validates exact length', () => {
      class CodeModel extends Model {
        static validations = {
          code: { length: { is: 6 } }
        }
      }

      const model = new CodeModel({ code: '12345' })
      expect(model.isValid()).toBe(false)
      expect(model.errors.code).toContain('exactly 6 characters')
    })

    it('passes when length is valid', () => {
      const user = new User({ name: 'John Doe', email: 'john@example.com', role: 'user' })

      expect(user.isValid()).toBe(true)
    })
  })

  describe('format validation', () => {
    it('fails when format does not match', () => {
      const user = new User({ name: 'John', email: 'invalid-email', role: 'user' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.email).toContain('invalid')
    })

    it('passes when format matches', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(user.isValid()).toBe(true)
    })
  })

  describe('numericality validation', () => {
    it('fails when value is not a number', () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: 'not-a-number', role: 'user' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.age).toContain('not a number')
    })

    it('validates greaterThan', () => {
      class Product extends Model {
        static validations = {
          price: { numericality: { greaterThan: 0 } }
        }
      }

      const product = new Product({ price: 0 })
      expect(product.isValid()).toBe(false)
      expect(product.errors.price).toContain('greater than 0')
    })

    it('validates lessThan', () => {
      class Product extends Model {
        static validations = {
          discount: { numericality: { lessThan: 100 } }
        }
      }

      const product = new Product({ discount: 100 })
      expect(product.isValid()).toBe(false)
      expect(product.errors.discount).toContain('less than 100')
    })

    it('validates greaterThanOrEqualTo', () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: -1, role: 'user' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.age).toContain('greater than or equal to 0')
    })

    it('validates lessThanOrEqualTo', () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: 151, role: 'user' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.age).toContain('less than or equal to 150')
    })

    it('passes when number is valid', () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: 30, role: 'user' })

      expect(user.isValid()).toBe(true)
    })
  })

  describe('inclusion validation', () => {
    it('fails when value not in list', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'superadmin' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.role).toContain('not included in the list')
    })

    it('passes when value is in list', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'admin' })

      expect(user.isValid()).toBe(true)
    })
  })

  describe('exclusion validation', () => {
    it('fails when value is in exclusion list', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user', username: 'admin' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.username).toContain('reserved')
    })

    it('passes when value is not in exclusion list', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user', username: 'john123' })

      expect(user.isValid()).toBe(true)
    })
  })

  describe('custom validation', () => {
    it('runs custom validation function', () => {
      class CustomModel extends Model {
        static validations = {
          value: {
            validate: (val, model) => {
              if (val && val % 2 !== 0) {
                return 'must be even'
              }
            }
          }
        }
      }

      const model = new CustomModel({ value: 5 })
      expect(model.isValid()).toBe(false)
      expect(model.errors.value).toBe('must be even')
    })

    it('passes custom validation when function returns nothing', () => {
      class CustomModel extends Model {
        static validations = {
          value: {
            validate: (val) => {
              if (val && val % 2 !== 0) {
                return 'must be even'
              }
            }
          }
        }
      }

      const model = new CustomModel({ value: 4 })
      expect(model.isValid()).toBe(true)
    })
  })

  describe('validation edge cases', () => {
    it('skips non-presence validations for empty values', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })
      // age is optional and empty - should skip numericality check

      expect(user.isValid()).toBe(true)
    })

    it('validates all fields and collects all errors', () => {
      const user = new User({ name: 'J', email: 'invalid', role: 'superadmin' })

      expect(user.isValid()).toBe(false)
      expect(user.errors.name).toBeDefined()
      expect(user.errors.email).toBeDefined()
      expect(user.errors.role).toBeDefined()
    })

    it('clears errors on each validation run', () => {
      const user = new User({ name: 'John' })
      user.isValid()
      expect(user.errors.email).toBeDefined()

      user.set('email', 'john@example.com')
      user.set('role', 'user')
      user.isValid()
      expect(user.errors.email).toBeUndefined()
    })
  })

  describe('isValid() and isInvalid()', () => {
    it('isValid() returns true when valid', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(user.isValid()).toBe(true)
    })

    it('isValid() returns false when invalid', () => {
      const user = new User({ name: 'John' })

      expect(user.isValid()).toBe(false)
    })

    it('isInvalid() returns false when valid', () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(user.isInvalid()).toBe(false)
    })

    it('isInvalid() returns true when invalid', () => {
      const user = new User({ name: 'John' })

      expect(user.isInvalid()).toBe(true)
    })
  })
})

describe('Model - Serialization', () => {
  it('toJSON() returns plain object', () => {
    const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
    const json = user.toJSON()

    expect(json).toEqual({ id: 1, name: 'John', email: 'john@example.com' })
    expect(json).not.toBeInstanceOf(User)
    expect(json).not.toBeInstanceOf(Model)
  })

  it('toJSON() does not include internal state', () => {
    const user = new User({ id: 1, name: 'John', email: 'john@example.com' })
    user.set('name', 'Jane')
    const json = user.toJSON()

    expect(json.errors).toBeUndefined()
    expect(json.persisted).toBeUndefined()
    expect(json._changedAttributes).toBeUndefined()
  })

  it('toString() returns JSON string', () => {
    const user = new User({ id: 1, name: 'John' })
    const str = user.toString()

    expect(str).toBe('{"id":1,"name":"John"}')
  })

  it('toJSON() creates independent copy', () => {
    const user = new User({ id: 1, name: 'John' })
    const json = user.toJSON()

    json.name = 'Modified'
    expect(user.attributes.name).toBe('John')
  })
})

describe('Model - Table Name Resolution', () => {
  it('uses explicit tableName when set', () => {
    expect(User.getTableName()).toBe('users')
  })

  it('infers table name from class name', () => {
    expect(BlogPost.getTableName()).toBe('blog_posts')
  })

  it('returns inferred name for model without explicit tableName', () => {
    class Article extends Model {}
    expect(Article.getTableName()).toBe('articles')
  })
})

describe('Model - Model Registration', () => {
  it('registers model in global registry', () => {
    class NewModel extends Model {
      static tableName = 'new_models'
    }

    NewModel.register()

    expect(globalThis._modelRegistry.NewModel).toBe(NewModel)
  })

  it('initializes registry if not present', () => {
    const oldRegistry = globalThis._modelRegistry
    delete globalThis._modelRegistry

    class TestModel extends Model {}
    TestModel.register()

    expect(globalThis._modelRegistry).toBeDefined()
    expect(globalThis._modelRegistry.TestModel).toBe(TestModel)

    globalThis._modelRegistry = oldRegistry
  })

  it('allows retrieval of registered models', () => {
    expect(globalThis._modelRegistry.User).toBe(User)
    expect(globalThis._modelRegistry.Post).toBe(Post)
  })
})

describe('Model - Query Builder Integration', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('Model.query() returns QueryBuilder instance', () => {
    const query = User.query()

    expect(query).toBeInstanceOf(QueryBuilder)
    expect(query.model).toBe(User)
  })

  it('Model.where() returns QueryBuilder', () => {
    const query = User.where({ name: 'John' })

    expect(query).toBeInstanceOf(QueryBuilder)
    expect(query.model).toBe(User)
  })

  it('static helper methods delegate to QueryBuilder', async () => {
    mockConnection.setMockResults([[{ id: 1, name: 'John' }]])

    const user = await User.first()

    expect(user).toBeInstanceOf(User)
    expect(mockConnection.queries.length).toBeGreaterThan(0)
  })
})

describe('Model - Scopes', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('applies scope without arguments', async () => {
    mockConnection.setMockResults([[]])

    await User.scope('active').all()

    const query = mockConnection.getLastQuery()
    expect(query.sql).toContain('is_active')
  })

  it('applies scope with arguments', async () => {
    mockConnection.setMockResults([[]])

    await User.scope('byRole', 'admin').all()

    const query = mockConnection.getLastQuery()
    expect(query.params).toContain('admin')
  })

  it('throws error for unknown scope', () => {
    expect(() => User.scope('nonexistent')).toThrow('Unknown scope: nonexistent')
  })

  it('returns QueryBuilder for chaining', async () => {
    mockConnection.setMockResults([[]])

    const query = User.scope('active')
    expect(query).toBeInstanceOf(QueryBuilder)

    await query.where({ name: 'John' }).all()

    const sql = mockConnection.getLastQuery().sql
    expect(sql).toContain('is_active')
    expect(sql).toContain('name')
  })
})

describe('Model - Associations', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  describe('loadAssociation()', () => {
    it('loads belongsTo association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const post = new Post({ id: 1, title: 'Test Post', user_id: 1 })
      post.persisted = true

      const user = await post.loadAssociation('user')

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe(1)
    })

    it('loads hasOne association', async () => {
      mockConnection.setMockResults([
        [{ id: 1, user_id: 1, bio: 'Test bio' }]
      ])

      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      const profile = await user.loadAssociation('profile')

      expect(profile).toBeInstanceOf(Profile)
      expect(profile.attributes.bio).toBe('Test bio')
    })

    it('returns null for belongsTo when foreign key is null', async () => {
      const post = new Post({ id: 1, title: 'Test Post', user_id: null })
      post.persisted = true

      const user = await post.loadAssociation('user')

      expect(user).toBeNull()
    })

    it('throws error for unknown association', async () => {
      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      await expect(user.loadAssociation('nonexistent')).rejects.toThrow('Unknown association: nonexistent')
    })

    it('throws error when model cannot be resolved', async () => {
      // Test with hasMany association where model isn't registered with correct name
      const user = new User({ id: 1, name: 'John' })
      user.persisted = true

      // 'posts' association will try to find 'Posts' model but only 'Post' is registered
      await expect(user.loadAssociation('posts')).rejects.toThrow('Cannot resolve model for association: posts')
    })
  })

  describe('association inference', () => {
    it('infers foreign key for belongsTo', async () => {
      mockConnection.setMockResults([
        [{ id: 1, name: 'John' }]
      ])

      const post = new Post({ id: 1, title: 'Test', user_id: 1 })
      post.persisted = true

      await post.loadAssociation('user')

      const query = mockConnection.getLastQuery()
      expect(query.sql).toContain('id')
      expect(query.params).toContain(1)
    })
  })

  describe('association with explicit model config', () => {
    it('uses explicit model from association config', async () => {
      class Article extends Model {
        static tableName = 'articles'
        static associations = {
          belongsTo: [{ name: 'author', model: User, foreignKey: 'author_id' }]
        }
      }

      mockConnection.setMockResults([
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      ])

      const article = new Article({ id: 1, title: 'Test', author_id: 1 })
      article.persisted = true

      const author = await article.loadAssociation('author')

      expect(author).toBeInstanceOf(User)
      expect(author.id).toBe(1)
    })
  })
})

describe('Model - Static Configuration', () => {
  it('has default tableName as null', () => {
    class EmptyModel extends Model {}
    expect(EmptyModel.tableName).toBeNull()
  })

  it('has default primaryKey as "id"', () => {
    expect(User.primaryKey).toBe('id')
  })

  it('allows custom primary key', () => {
    expect(CustomPkModel.primaryKey).toBe('uuid')
  })

  it('has default empty associations', () => {
    class EmptyModel extends Model {}
    expect(EmptyModel.associations).toEqual({})
  })

  it('has default empty validations', () => {
    class EmptyModel extends Model {}
    expect(EmptyModel.validations).toEqual({})
  })

  it('has default empty scopes', () => {
    class EmptyModel extends Model {}
    expect(EmptyModel.scopes).toEqual({})
  })
})

describe('Model - Callbacks', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('has default empty callback methods', async () => {
    const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

    // These should not throw
    await user.beforeSave()
    await user.afterSave()
    await user.beforeCreate()
    await user.afterCreate()
    await user.beforeUpdate()
    await user.afterUpdate()
    await user.beforeDestroy()
    await user.afterDestroy()
  })

  it('callbacks can be overridden in subclasses', async () => {
    let callbackRan = false

    class CallbackUser extends User {
      async beforeSave() {
        callbackRan = true
      }
    }

    mockConnection.setMockResults([
      [{ id: 1, name: 'John', email: 'john@example.com', role: 'user', created_at: new Date(), updated_at: new Date() }]
    ])

    const user = new CallbackUser({ name: 'John', email: 'john@example.com', role: 'user' })
    await user.save()

    expect(callbackRan).toBe(true)
  })
})

describe('Model - pluck() and ids()', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('pluck() extracts column values', async () => {
    mockConnection.setMockResults([
      [{ name: 'John' }, { name: 'Jane' }, { name: 'Bob' }]
    ])

    const names = await User.pluck('name')

    expect(names).toEqual(['John', 'Jane', 'Bob'])
  })

  it('ids() returns array of primary key values', async () => {
    mockConnection.setMockResults([
      [{ id: 1 }, { id: 2 }, { id: 3 }]
    ])

    const ids = await User.ids()

    expect(ids).toEqual([1, 2, 3])
  })
})

describe('Model - Helper Methods', () => {
  let mockConnection

  beforeEach(() => {
    mockConnection = new MockConnection()
    setConnection(mockConnection)
  })

  afterEach(() => {
    setConnection(null)
  })

  it('all() returns all records', async () => {
    mockConnection.setMockResults([
      [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]
    ])

    const users = await User.all()

    expect(users).toHaveLength(2)
    expect(users[0]).toBeInstanceOf(User)
  })

  it('count() returns count of records', async () => {
    mockConnection.setMockResults([
      [{ count: '42' }]
    ])

    const count = await User.count()

    expect(count).toBe(42)
  })

  it('exists() returns true when records exist', async () => {
    mockConnection.setMockResults([
      [{ count: '1' }]
    ])

    const exists = await User.exists({ name: 'John' })

    expect(exists).toBe(true)
  })

  it('exists() returns false when no records exist', async () => {
    mockConnection.setMockResults([
      [{ count: '0' }]
    ])

    const exists = await User.exists({ name: 'Nobody' })

    expect(exists).toBe(false)
  })

  it('exists() without conditions checks if any records exist', async () => {
    mockConnection.setMockResults([
      [{ count: '5' }]
    ])

    const exists = await User.exists()

    expect(exists).toBe(true)
  })
})

describe('Model - Error Handling', () => {
  it('RecordNotFoundError includes model and id', () => {
    const error = new RecordNotFoundError('User', 123)

    expect(error.message).toBe('User with id 123 not found')
    expect(error.model).toBe('User')
    expect(error.id).toBe(123)
    expect(error.name).toBe('RecordNotFoundError')
  })

  it('RecordNotFoundError works without id', () => {
    const error = new RecordNotFoundError('User')

    expect(error.message).toBe('User record not found')
    expect(error.model).toBe('User')
  })
})
