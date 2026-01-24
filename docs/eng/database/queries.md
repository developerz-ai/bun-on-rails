# Queries

BunOnRails provides a powerful, chainable query interface. Queries are lazy - they don't execute until you call a terminal method.

## Basic Queries

### Finding Records

```javascript
// Find by primary key
const post = await Post.find(1)
const posts = await Post.find([1, 2, 3])

// Find by attributes
const post = await Post.findBy({ slug: 'hello' })

// First/Last
const first = await Post.first()
const last = await Post.last()
const oldest = await Post.order({ createdAt: 'asc' }).first()

// All records
const posts = await Post.findAll()
const posts = await Post.all() // alias
```

### Conditions

```javascript
// Equality
const posts = await Post.where({ published: true }).all()

// Multiple conditions
const posts = await Post.where({ published: true, userId: 1 }).all()

// SQL string with placeholders
const posts = await Post.where('views > ?', 100).all()
const posts = await Post.where('title LIKE ?', '%hello%').all()

// Array of values (IN)
const posts = await Post.where({ status: ['draft', 'pending'] }).all()

// NULL check
const posts = await Post.where({ deletedAt: null }).all()

// NOT conditions
const posts = await Post.whereNot({ published: false }).all()

// OR conditions
const posts = await Post
  .where({ published: true })
  .or({ userId: currentUser.id })
  .all()
```

### Chaining

Queries can be chained:

```javascript
const posts = await Post
  .where({ published: true })
  .where('created_at > ?', lastWeek)
  .order({ createdAt: 'desc' })
  .limit(10)
  .offset(20)
  .all()
```

## Ordering

```javascript
// Single column
const posts = await Post.order({ createdAt: 'desc' }).all()

// Multiple columns
const posts = await Post.order({ published: 'desc', createdAt: 'asc' }).all()

// SQL string
const posts = await Post.order('views DESC NULLS LAST').all()
```

## Limiting & Offset

```javascript
// Limit
const posts = await Post.limit(10).all()

// Offset
const posts = await Post.offset(20).all()

// Pagination
const posts = await Post.limit(20).offset(40).all()
```

## Selecting Columns

```javascript
// Specific columns
const posts = await Post.select('id', 'title').all()

// Computed columns
const stats = await Post.select('COUNT(*) as count', 'AVG(views) as avg_views').first()
```

## Aggregations

```javascript
// Count
const count = await Post.count()
const publishedCount = await Post.where({ published: true }).count()

// Sum
const totalViews = await Post.sum('views')

// Average
const avgViews = await Post.average('views')

// Minimum/Maximum
const firstPost = await Post.minimum('createdAt')
const maxViews = await Post.maximum('views')

// Exists
const hasPublished = await Post.where({ published: true }).exists()
```

## Grouping

```javascript
// Group by
const stats = await Post
  .select('user_id', 'COUNT(*) as count')
  .group('user_id')
  .all()

// Having
const prolificAuthors = await Post
  .select('user_id', 'COUNT(*) as count')
  .group('user_id')
  .having('COUNT(*) > ?', 10)
  .all()
```

## Joins

```javascript
// Inner join
const posts = await Post
  .joins('user')
  .where({ 'users.active': true })
  .all()

// Left join
const posts = await Post
  .leftJoins('comments')
  .select('posts.*', 'COUNT(comments.id) as comment_count')
  .group('posts.id')
  .all()

// Custom join
const posts = await Post
  .joins('INNER JOIN users ON users.id = posts.user_id')
  .all()
```

## Eager Loading

Prevent N+1 queries by eager loading associations:

```javascript
// Single association
const posts = await Post.includes('user').all()

// Multiple associations
const posts = await Post.includes('user', 'comments').all()

// Nested associations
const posts = await Post.includes('comments.author').all()

// Complex nested
const posts = await Post.includes({
  user: true,
  comments: { author: true }
}).all()
```

## Scopes

Use predefined scopes:

```javascript
// Single scope
const posts = await Post.published().all()

// Chained scopes
const posts = await Post.published().recent().limit(10)

// Scope with argument
const posts = await Post.byAuthor(userId).all()
```

## Pagination

Built-in pagination support:

```javascript
// Page-based
const posts = await Post.page(2).per(20)
// Returns: { data: [...], meta: { page: 2, perPage: 20, total: 100, totalPages: 5 } }

// Access pagination info
posts.meta.page        // 2
posts.meta.totalPages  // 5
posts.meta.total       // 100
```

## Raw SQL

When needed, use raw SQL:

```javascript
// Raw query
const results = await Post.query('SELECT * FROM posts WHERE views > $1', [100])

// Find by SQL
const posts = await Post.findBySql('SELECT * FROM posts WHERE published = true')
```

## Query Methods Reference

| Method | Description |
|--------|-------------|
| `where()` | Add conditions |
| `whereNot()` | Add NOT conditions |
| `or()` | Add OR conditions |
| `order()` | Set ordering |
| `limit()` | Limit results |
| `offset()` | Skip results |
| `select()` | Select columns |
| `group()` | Group results |
| `having()` | Having clause |
| `joins()` | Inner join |
| `leftJoins()` | Left join |
| `includes()` | Eager load |
| `page()` | Pagination page |
| `per()` | Pagination size |

## Terminal Methods

These methods execute the query:

| Method | Returns |
|--------|---------|
| `all()` | Array of models |
| `first()` | Single model or null |
| `last()` | Single model or null |
| `find(id)` | Single model |
| `findBy(attrs)` | Single model or null |
| `count()` | Number |
| `sum(col)` | Number |
| `average(col)` | Number |
| `minimum(col)` | Value |
| `maximum(col)` | Value |
| `exists()` | Boolean |
| `pluck(col)` | Array of values |
| `ids()` | Array of IDs |
