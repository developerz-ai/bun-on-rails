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
    it('fails when field is undefined', async () => {
      const user = new User({ email: 'test@example.com' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.name).toContain("can't be blank")
    })

    it('fails when field is null', async () => {
      const user = new User({ name: null, email: 'test@example.com' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.name).toContain("can't be blank")
    })

    it('fails when field is empty string', async () => {
      const user = new User({ name: '', email: 'test@example.com' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.name).toContain("can't be blank")
    })

    it('passes when field has value', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(await user.isValid()).toBe(true)
    })
  })

  describe('length validation', () => {
    it('validates minimum length', async () => {
      const user = new User({ name: 'J', email: 'j@example.com', role: 'user' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.name).toContain('too short')
      expect(user.errors.name).toContain('minimum is 2')
    })

    it('validates maximum length', async () => {
      const user = new User({
        name: 'a'.repeat(51),
        email: 'test@example.com',
        role: 'user'
      })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.name).toContain('too long')
      expect(user.errors.name).toContain('maximum is 50')
    })

    it('validates exact length', async () => {
      class CodeModel extends Model {
        static validations = {
          code: { length: { is: 6 } }
        }
      }

      const model = new CodeModel({ code: '12345' })
      expect(await model.isValid()).toBe(false)
      expect(model.errors.code).toContain('exactly 6 characters')
    })

    it('passes when length is valid', async () => {
      const user = new User({ name: 'John Doe', email: 'john@example.com', role: 'user' })

      expect(await user.isValid()).toBe(true)
    })
  })

  describe('format validation', () => {
    it('fails when format does not match', async () => {
      const user = new User({ name: 'John', email: 'invalid-email', role: 'user' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.email).toContain('invalid')
    })

    it('passes when format matches', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(await user.isValid()).toBe(true)
    })
  })

  describe('numericality validation', () => {
    it('fails when value is not a number', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: 'not-a-number', role: 'user' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.age).toContain('not a number')
    })

    it('validates greaterThan', async () => {
      class Product extends Model {
        static validations = {
          price: { numericality: { greaterThan: 0 } }
        }
      }

      const product = new Product({ price: 0 })
      expect(await product.isValid()).toBe(false)
      expect(product.errors.price).toContain('greater than 0')
    })

    it('validates lessThan', async () => {
      class Product extends Model {
        static validations = {
          discount: { numericality: { lessThan: 100 } }
        }
      }

      const product = new Product({ discount: 100 })
      expect(await product.isValid()).toBe(false)
      expect(product.errors.discount).toContain('less than 100')
    })

    it('validates greaterThanOrEqualTo', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: -1, role: 'user' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.age).toContain('greater than or equal to 0')
    })

    it('validates lessThanOrEqualTo', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: 151, role: 'user' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.age).toContain('less than or equal to 150')
    })

    it('passes when number is valid', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', age: 30, role: 'user' })

      expect(await user.isValid()).toBe(true)
    })
  })

  describe('inclusion validation', () => {
    it('fails when value not in list', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'superadmin' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.role).toContain('not included in the list')
    })

    it('passes when value is in list', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'admin' })

      expect(await user.isValid()).toBe(true)
    })
  })

  describe('exclusion validation', () => {
    it('fails when value is in exclusion list', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user', username: 'admin' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.username).toContain('reserved')
    })

    it('passes when value is not in exclusion list', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user', username: 'john123' })

      expect(await user.isValid()).toBe(true)
    })
  })

  describe('custom validation', () => {
    it('runs custom validation function', async () => {
      class CustomModel extends Model {
        static validations = {
          value: {
            custom: {
              validate: (val, model) => {
                if (val && val % 2 !== 0) {
                  return 'must be even'
                }
              }
            }
          }
        }
      }

      const model = new CustomModel({ value: 5 })
      expect(await model.isValid()).toBe(false)
      expect(model.errors.value).toBe('must be even')
    })

    it('passes custom validation when function returns nothing', async () => {
      class CustomModel extends Model {
        static validations = {
          value: {
            custom: {
              validate: (val) => {
                if (val && val % 2 !== 0) {
                  return 'must be even'
                }
              }
            }
          }
        }
      }

      const model = new CustomModel({ value: 4 })
      expect(await model.isValid()).toBe(true)
    })
  })

  describe('validation edge cases', () => {
    it('skips non-presence validations for empty values', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })
      // age is optional and empty - should skip numericality check

      expect(await user.isValid()).toBe(true)
    })

    it('validates all fields and collects all errors', async () => {
      const user = new User({ name: 'J', email: 'invalid', role: 'superadmin' })

      expect(await user.isValid()).toBe(false)
      expect(user.errors.name).toBeDefined()
      expect(user.errors.email).toBeDefined()
      expect(user.errors.role).toBeDefined()
    })

    it('clears errors on each validation run', async () => {
      const user = new User({ name: 'John' })
      await user.isValid()
      expect(user.errors.email).toBeDefined()

      user.set('email', 'john@example.com')
      user.set('role', 'user')
      await user.isValid()
      expect(user.errors.email).toBeUndefined()
    })
  })

  describe('isValid() and isInvalid()', () => {
    it('isValid() returns true when valid', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(await user.isValid()).toBe(true)
    })

    it('isValid() returns false when invalid', async () => {
      const user = new User({ name: 'John' })

      expect(await user.isValid()).toBe(false)
    })

    it('isInvalid() returns false when valid', async () => {
      const user = new User({ name: 'John', email: 'john@example.com', role: 'user' })

      expect(await user.isInvalid()).toBe(false)
    })

    it('isInvalid() returns true when invalid', async () => {
      const user = new User({ name: 'John' })

      expect(await user.isInvalid()).toBe(true)
    })
  })

  describe('helper methods', () => {
    it('errorsFor() returns all errors for a field', async () => {
      class MultiErrorModel extends Model {
        static validations = {
          value: {
            presence: true,
            length: { min: 5 }
          }
        }
      }

      const model = new MultiErrorModel({ value: '' })
      await model.validate()

      const fieldErrors = model.errorsFor('value')
      expect(fieldErrors.length).toBeGreaterThan(0)
    })

    it('fullMessages() returns all errors as array', async () => {
      const user = new User({ name: 'J', email: 'invalid' })
      await user.validate()

      const messages = user.fullMessages()
      expect(Array.isArray(messages)).toBe(true)
      expect(messages.length).toBeGreaterThan(0)
    })

    it('hasError() checks if field has error', async () => {
      const user = new User({ name: 'John' })
      await user.validate()

      expect(user.hasError('email')).toBe(true)
      expect(user.hasError('name')).toBe(false)
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
    await user.beforeValidation()
    await user.afterValidation()
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

describe('Model - Validation Callbacks', () => {
  describe('beforeValidation', () => {
    it('is called before validation runs', async () => {
      const callOrder = []

      class TrackedModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async beforeValidation() {
          callOrder.push('beforeValidation')
        }
      }

      // Mock the runValidations to track call order
      const model = new TrackedModel({ name: 'John' })
      await model.validate()

      expect(callOrder).toContain('beforeValidation')
    })

    it('can modify attributes before validation', async () => {
      class NormalizingModel extends Model {
        static validations = {
          email: { presence: true, format: /^[^@]+@[^@]+\.[^@]+$/ }
        }

        async beforeValidation() {
          // Normalize email to lowercase and trim
          if (this.attributes.email) {
            this.attributes.email = this.attributes.email.toLowerCase().trim()
          }
        }
      }

      const model = new NormalizingModel({ email: '  JOHN@EXAMPLE.COM  ' })
      await model.validate()

      expect(model.attributes.email).toBe('john@example.com')
      expect(Object.keys(model.errors).length).toBe(0)
    })

    it('can add errors in beforeValidation that persist', async () => {
      class ConditionalModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async beforeValidation() {
          if (this.attributes.name === 'blocked') {
            this.errors.name = 'is blocked'
          }
        }
      }

      const model = new ConditionalModel({ name: 'blocked' })
      const isValid = await model.validate()

      // Errors added in beforeValidation persist through validation
      // (unless overwritten by built-in validators for the same field)
      expect(isValid).toBe(false)
      expect(model.errors.name).toBe('is blocked')
    })

    it('built-in validators can overwrite beforeValidation errors for same field', async () => {
      class OverwriteModel extends Model {
        static validations = {
          name: { presence: true }  // This will overwrite beforeValidation error
        }

        async beforeValidation() {
          this.errors.name = 'custom error from beforeValidation'
        }
      }

      // When name is missing, presence validator will overwrite the error
      const model = new OverwriteModel({})
      const isValid = await model.validate()

      expect(isValid).toBe(false)
      // The presence validator's error overwrites the beforeValidation error
      expect(model.errors.name).toContain("can't be blank")
    })

    it('can set default values before validation', async () => {
      class DefaultsModel extends Model {
        static validations = {
          status: { inclusion: ['pending', 'active', 'inactive'] }
        }

        async beforeValidation() {
          if (!this.attributes.status) {
            this.attributes.status = 'pending'
          }
        }
      }

      const model = new DefaultsModel({})
      const isValid = await model.validate()

      expect(isValid).toBe(true)
      expect(model.attributes.status).toBe('pending')
    })

    it('is awaited (supports async operations)', async () => {
      let asyncComplete = false

      class AsyncModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async beforeValidation() {
          await new Promise(resolve => setTimeout(resolve, 10))
          asyncComplete = true
          this.attributes.name = 'set-async'
        }
      }

      const model = new AsyncModel({})
      await model.validate()

      expect(asyncComplete).toBe(true)
      expect(model.attributes.name).toBe('set-async')
    })
  })

  describe('afterValidation', () => {
    it('is called after validation runs', async () => {
      let afterValidationCalled = false

      class TrackedModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async afterValidation() {
          afterValidationCalled = true
        }
      }

      const model = new TrackedModel({ name: 'John' })
      await model.validate()

      expect(afterValidationCalled).toBe(true)
    })

    it('can add conditional errors based on validation results', async () => {
      class ConditionalErrorModel extends Model {
        static validations = {
          password: { presence: true }
        }

        async afterValidation() {
          // Add error if password is present but weak
          if (this.attributes.password && this.attributes.password.length < 8) {
            this.errors.password = 'is too weak (must be at least 8 characters)'
          }
        }
      }

      const model = new ConditionalErrorModel({ password: 'short' })
      const isValid = await model.validate()

      expect(isValid).toBe(false)
      expect(model.errors.password).toContain('too weak')
    })

    it('can remove errors conditionally', async () => {
      class WarningModel extends Model {
        static validations = {
          name: { presence: true, length: { min: 10 } }
        }

        async afterValidation() {
          // Allow short names if user opted in
          if (this.attributes.allow_short_name && this.errors.name) {
            delete this.errors.name
          }
        }
      }

      const model = new WarningModel({ name: 'Jo', allow_short_name: true })
      const isValid = await model.validate()

      expect(isValid).toBe(true)
    })

    it('can add cross-field validation errors', async () => {
      class DateRangeModel extends Model {
        static validations = {
          start_date: { presence: true },
          end_date: { presence: true }
        }

        async afterValidation() {
          if (this.attributes.start_date && this.attributes.end_date) {
            if (new Date(this.attributes.end_date) < new Date(this.attributes.start_date)) {
              this.errors.end_date = 'must be after start date'
            }
          }
        }
      }

      const model = new DateRangeModel({
        start_date: '2024-06-01',
        end_date: '2024-05-01'
      })
      const isValid = await model.validate()

      expect(isValid).toBe(false)
      expect(model.errors.end_date).toBe('must be after start date')
    })

    it('is awaited (supports async operations)', async () => {
      let asyncComplete = false

      class AsyncModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async afterValidation() {
          await new Promise(resolve => setTimeout(resolve, 10))
          asyncComplete = true
        }
      }

      const model = new AsyncModel({ name: 'John' })
      await model.validate()

      expect(asyncComplete).toBe(true)
    })

    it('has access to validation errors from built-in validators', async () => {
      let capturedErrors = null

      class InspectingModel extends Model {
        static validations = {
          email: { presence: true, email: true }
        }

        async afterValidation() {
          capturedErrors = { ...this.errors }
        }
      }

      const model = new InspectingModel({ email: 'invalid' })
      await model.validate()

      expect(capturedErrors).toBeDefined()
      expect(capturedErrors.email).toBeDefined()
    })
  })

  describe('callback order', () => {
    it('calls beforeValidation before afterValidation', async () => {
      const callOrder = []

      class OrderedModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async beforeValidation() {
          callOrder.push('before')
        }

        async afterValidation() {
          callOrder.push('after')
        }
      }

      const model = new OrderedModel({ name: 'John' })
      await model.validate()

      expect(callOrder).toEqual(['before', 'after'])
    })

    it('validation callbacks run on isValid() call', async () => {
      let beforeCalled = false
      let afterCalled = false

      class TrackedModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async beforeValidation() {
          beforeCalled = true
        }

        async afterValidation() {
          afterCalled = true
        }
      }

      const model = new TrackedModel({ name: 'John' })
      await model.isValid()

      expect(beforeCalled).toBe(true)
      expect(afterCalled).toBe(true)
    })

    it('validation callbacks run on isInvalid() call', async () => {
      let beforeCalled = false
      let afterCalled = false

      class TrackedModel extends Model {
        static validations = {
          name: { presence: true }
        }

        async beforeValidation() {
          beforeCalled = true
        }

        async afterValidation() {
          afterCalled = true
        }
      }

      const model = new TrackedModel({})
      await model.isInvalid()

      expect(beforeCalled).toBe(true)
      expect(afterCalled).toBe(true)
    })
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
