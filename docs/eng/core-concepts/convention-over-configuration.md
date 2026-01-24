# Convention Over Configuration

The principle that drives BunOnRails: make the common case effortless by establishing sensible defaults.

## How It Works

BunOnRails uses naming conventions and file locations to automatically wire your application together.

### File Location Conventions

| Location | Purpose | Auto-loaded |
|----------|---------|-------------|
| `app/models/*.js` | Database models | Yes |
| `app/controllers/*_controller.js` | Request handlers | Yes |
| `app/jobs/*_job.js` | Background jobs | Yes |
| `app/mailers/*_mailer.js` | Email classes | Yes |
| `app/channels/*_channel.js` | WebSocket handlers | Yes |
| `config/routes.js` | URL routing | Yes |
| `config/initializers/*.js` | Startup scripts | Yes |
| `db/migrations/*.js` | Database changes | On demand |

### Naming Conventions

#### Models

```javascript
// File: app/models/user.js
// Class: User
// Table: users (auto-inferred)

export default class User extends Model {
  // Table name: users (plural, snake_case)
  // Primary key: id (auto)
  // Timestamps: created_at, updated_at (auto)
}
```

#### Controllers

```javascript
// File: app/controllers/posts_controller.js
// Class: PostsController
// Routes: /posts/*

export default class PostsController {
  // Action: index → GET /posts
  // Action: show → GET /posts/:id
  // Action: create → POST /posts
  // Action: update → PATCH /posts/:id
  // Action: destroy → DELETE /posts/:id
}
```

#### Associations

```javascript
class User extends Model {
  static associations = {
    // hasMany: posts → looks for Post model, posts table, user_id column
    hasMany: ['posts'],
    // hasOne: profile → looks for Profile model, profiles table, user_id column
    hasOne: ['profile']
  }
}

class Post extends Model {
  static associations = {
    // belongsTo: user → looks for User model, users table, expects user_id column
    belongsTo: ['user']
  }
}
```

### Database Conventions

#### Table Names

| Model | Table |
|-------|-------|
| `User` | `users` |
| `Post` | `posts` |
| `BlogPost` | `blog_posts` |
| `Category` | `categories` |

#### Column Names

| Purpose | Convention |
|---------|------------|
| Primary key | `id` |
| Foreign key | `{model}_id` (e.g., `user_id`) |
| Created timestamp | `created_at` |
| Updated timestamp | `updated_at` |
| Boolean | Often prefixed with `is_` |

#### Join Tables

For many-to-many relationships:

```javascript
class Post extends Model {
  static associations = {
    hasAndBelongsToMany: ['tags']
  }
}

// Join table: posts_tags (alphabetical order)
// Columns: post_id, tag_id
```

## Overriding Conventions

When conventions don't fit, explicit configuration takes precedence.

### Custom Table Name

```javascript
class User extends Model {
  static tableName = 'people'
}
```

### Custom Foreign Key

```javascript
class Post extends Model {
  static associations = {
    belongsTo: [
      { name: 'author', model: 'User', foreignKey: 'author_id' }
    ]
  }
}
```

### Custom Primary Key

```javascript
class LegacyUser extends Model {
  static primaryKey = 'user_id'
}
```

### Custom Routes

```javascript
// config/routes.js
export default (router) => {
  // Override resourceful route
  router.get('/u/:username', 'users#show')

  // Custom controller mapping
  router.resources('articles', { controller: 'posts' })
}
```

## Convention Examples

### Complete Model

```javascript
// app/models/post.js
export default class Post extends Model {
  // Conventions applied:
  // - Table: posts
  // - Primary key: id
  // - Timestamps: created_at, updated_at
  // - Foreign key for user: user_id
  // - Association method: user(), comments()

  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }

  static validations = {
    title: { presence: true },
    body: { presence: true }
  }
}
```

### Complete Controller

```javascript
// app/controllers/posts_controller.js
export default class PostsController {
  // Conventions applied:
  // - Handles /posts routes
  // - this.params contains request parameters
  // - this.render() returns JSON response
  // - this.currentUser available after authentication

  async index() {
    // GET /posts
    const posts = await Post.findAll()
    return this.render({ posts })
  }

  async show() {
    // GET /posts/:id
    const post = await Post.find(this.params.id)
    return this.render({ post })
  }

  async create() {
    // POST /posts
    const post = await Post.create(this.params.post)
    return this.render({ post }, { status: 201 })
  }

  async update() {
    // PATCH/PUT /posts/:id
    const post = await Post.find(this.params.id)
    await post.update(this.params.post)
    return this.render({ post })
  }

  async destroy() {
    // DELETE /posts/:id
    const post = await Post.find(this.params.id)
    await post.destroy()
    return this.render({ success: true })
  }
}
```

### Complete Resource Route

```javascript
// config/routes.js
router.resources('posts')

// Generates:
// GET    /posts           → posts#index
// GET    /posts/new       → posts#new     (for forms)
// POST   /posts           → posts#create
// GET    /posts/:id       → posts#show
// GET    /posts/:id/edit  → posts#edit    (for forms)
// PATCH  /posts/:id       → posts#update
// PUT    /posts/:id       → posts#update
// DELETE /posts/:id       → posts#destroy
```

## Benefits

### 1. Predictability

Every BunOnRails project has the same structure:

```bash
# You immediately know where to look
app/models/user.js        # User model
app/controllers/users_controller.js  # User controller
test/models/user.test.js  # User tests
```

### 2. Speed

No wiring code means faster development:

```javascript
// Just create the file - it works
// app/models/post.js
export default class Post extends Model {}

// Immediately usable
await Post.create({ title: 'Hello' })
```

### 3. Reduced Errors

Less configuration means fewer opportunities for typos and mistakes.

### 4. Team Collaboration

New developers know exactly where to find and add code.

## When to Break Convention

Break convention when:

- Integrating with legacy databases
- Following external API naming
- Domain-specific terminology is clearer
- Performance optimization requires it

Follow convention when:

- Starting a new feature
- Convention name is reasonable
- Working with other developers
- No compelling reason to change

## Summary

Convention over configuration means:

1. **Sensible defaults** - Common patterns require zero setup
2. **Clear escape hatches** - Override when needed
3. **Predictable structure** - Same layout in every project
4. **Less code** - Framework handles the wiring

This philosophy allows you to focus on your application's unique logic rather than boilerplate configuration.
