# Database Overview

BunOnRails provides a powerful, intuitive database layer inspired by Ruby on Rails' Active Record. Zero configuration, maximum productivity.

## Philosophy

The database layer is designed for **vibe coders** and **AI agents** - you describe what you want, and the framework handles the rest. No ORMs to configure, no query builders to learn, no boilerplate.

## Quick Example

```javascript
// Create a post with validation
const post = await Post.create({
  title: 'Hello World',
  body: 'My first post'
})

// Query with associations
const posts = await Post
  .published()
  .includes('author', 'comments')
  .order({ createdAt: 'desc' })
  .limit(10)

// Update
post.title = 'Updated Title'
await post.save()

// Delete
await post.destroy()
```

## Components

### Models

Models represent your data and business logic. They live in `app/models/`:

```javascript
// app/models/post.js
export default class Post extends Model {
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }

  static validations = {
    title: { presence: true, length: { max: 200 } }
  }

  static scopes = {
    published: (q) => q.where({ published: true })
  }
}
```

### Migrations

Migrations define database changes. They live in `db/migrations/`:

```javascript
// db/migrations/20250124_create_posts.js
export async function up(db) {
  await db.createTable('posts', (t) => {
    t.id()
    t.string('title').notNull()
    t.text('body')
    t.references('user')
    t.timestamps()
  })
}
```

### Schema

The schema file (`db/schema.js`) is auto-generated after each migration. It's the source of truth for your database structure.

## Key Features

| Feature | Description |
|---------|-------------|
| **Auto Schema Sync** | Schema.js updates automatically after migrations |
| **Model Annotations** | Models get comments showing their columns |
| **N+1 Detection** | Warns about N+1 queries in development |
| **Query Logging** | See all queries in development |
| **Connection Pooling** | Automatic connection management |
| **Transactions** | Simple transaction API |

## AI-Agent Friendly

The database layer is designed to work seamlessly with AI coding assistants:

- **Predictable patterns** - Same API for all models
- **Clear errors** - Validation errors explain what's wrong
- **Self-documenting** - Model annotations show schema
- **No hidden magic** - What you write is what happens

```javascript
// AI agents can understand and generate this
const user = await User.findBy({ email: 'test@example.com' })
if (!user) {
  return { error: 'User not found' }
}
```

## Documentation

- [Migrations](./migrations.md) - Database schema changes
- [Models](./models.md) - Defining and using models
- [Associations](./associations.md) - Relationships between models
- [Validations](./validations.md) - Data validation
- [Queries](./queries.md) - Querying the database
- [N+1 Detection](./n-plus-one-detection.md) - Performance monitoring
