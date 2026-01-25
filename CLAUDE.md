# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BunOnRails is a full-stack JavaScript framework built on Bun with Rails-like conventions. It follows convention-over-configuration with batteries included (ORM, jobs, WebSockets, auth, file uploads, caching, email).

**Key philosophy**: Predictable patterns for both humans and AI assistants. Files under 300 LOC, single responsibility, use/wrap popular libraries.

## Commands

```bash
# Development
bun run dev                    # Dev server with hot reload
bun run start                  # Production server
bun run build                  # Build for production

# Testing
bun test                       # Run all tests
bun test --filter unit         # Unit tests only
bun test --filter integration  # Integration tests only
bun test path/to/file.test.js  # Single test file

# Code Quality
bun run lint                   # ESLint
bun run format                 # Prettier

# Documentation
bun run docs:dev               # Local docs server
bun run docs:build             # Build docs

# CLI (brails)
brails new myapp               # Create new app
brails dev                     # Dev server
brails db:migrate              # Run migrations
brails db:rollback             # Rollback migration
brails db:seed                 # Seed data
brails g scaffold Post title:string body:text  # Generate CRUD
brails g model User            # Generate model
brails g auth                  # Generate auth system
brails test                    # Run tests
brails console                 # REPL
brails routes                  # List routes
```

## Architecture

### Core Framework Structure (src/)

```
src/
├── index.js              # Main exports
├── application.js        # App bootstrap
├── database/
│   ├── model.js          # Active Record base class
│   ├── migration.js      # Migration DSL
│   └── query_builder.js  # Chainable queries
├── controller/base.js    # Controller base class
├── routing/router.js     # Rails-like routing DSL
├── jobs/job.js           # Background job system (BullMQ)
├── websocket/channel.js  # WebSocket channels
├── mail/mailer.js        # Email with React templates
├── storage/storage.js    # File uploads (S3-compatible)
├── cache/cache.js        # Memory/Redis caching
├── react/
│   ├── hooks.js          # useResource, useAction, useChannel
│   └── forms.js          # Form/Field components
├── testing/              # Test utilities, factories
└── cli/commands/         # CLI command implementations
```

### Generated App Structure (app/)

```
app/
├── models/         # Singular, PascalCase (User.js → class User)
├── controllers/    # Plural, snake_case (users_controller.js → UsersController)
├── jobs/           # snake_case (send_email_job.js → SendEmailJob)
├── mailers/        # snake_case (user_mailer.js → UserMailer)
├── channels/       # snake_case (posts_channel.js → PostsChannel)
└── components/     # PascalCase React components
    ├── layouts/
    ├── pages/
    └── shared/

config/
├── routes.js       # Router DSL
├── database.js     # DB config
└── initializers/   # Startup scripts

db/
├── migrations/     # Timestamped (20250124_create_users.js)
├── schema.js       # Auto-generated (DON'T EDIT)
└── seeds.js

test/
├── factories/
├── models/
├── controllers/
└── integration/
```

## Key Patterns

### Model (Active Record)
```javascript
export default class Post extends Model {
  static associations = {
    belongsTo: ['user'],        // expects user_id column
    hasMany: ['comments']       // expects post_id on comments
  }

  static validations = {
    title: { presence: true, length: { max: 200 } }
  }

  static scopes = {
    published: (q) => q.where({ published: true })
  }
}
```

### Controller
```javascript
export default class PostsController {
  static beforeAction = ['authenticate']

  async index() {
    const posts = await Post.findAll({ include: 'user' })
    return this.render({ posts })
  }

  async create() {
    const post = await Post.create(this.params.post)
    if (post.errors) return this.unprocessableEntity(post.errors)
    this.broadcast('posts:new', { post })
    return this.render({ post }, { status: 201 })
  }
}
// Context: this.request, this.params, this.session, this.currentUser, this.cache, this.db
```

### Router (config/routes.js)
```javascript
export default (router) => {
  router.root('home#index')
  router.resources('posts')           // Full CRUD routes
  router.namespace('admin', () => {
    router.resources('users')
  })
  router.get('/search', 'search#index')
}
```

### Job
```javascript
export default class SendEmailJob extends Job {
  static queue = 'email'
  static attempts = 3

  async perform({ userId }) { /* ... */ }
}
// Enqueue: SendEmailJob.performLater(data), .performAt(date, data), .performIn(ms, data)
```

### Migration
```javascript
export async function up(db) {
  await db.createTable('posts', (t) => {
    t.id()
    t.string('title').notNull()
    t.text('body')
    t.references('user')      // Creates user_id foreign key
    t.timestamps()            // created_at, updated_at
  })
}

export async function down(db) {
  await db.dropTable('posts')
}
```

## Database Conventions

- Table names: plural snake_case (`users`, `blog_posts`)
- Primary key: `id` (bigint auto-increment)
- Foreign keys: `{model}_id` (`user_id`, `post_id`)
- Timestamps: automatic `created_at`, `updated_at`
- Join tables: alphabetical order (`posts_tags` not `tags_posts`)
- Boolean columns: prefix with `is_` (`is_active`, `is_published`)

## Testing

Uses Bun's native test runner:

```javascript
import { test, expect } from 'bun:test'

test('unit: Post validates title', async () => {
  const post = await Post.create({ body: 'content' })
  expect(post.errors.title).toBeDefined()
})

test('integration: POST /posts creates post', async () => {
  const res = await request.post('/posts', { title: 'Test', body: 'Content' })
  expect(res.status).toBe(201)
})
```

Test isolation via transactions - each test runs in a transaction that rolls back.

## Code Style

- ES modules (`import`/`export`)
- JSDoc for public APIs
- Small focused functions, single responsibility
- Prefer composition over inheritance
- No manual dependency injection - framework handles wiring
