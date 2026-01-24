# BunOnRails

> **Built for Vibe Coders & AI Agents** - Focus on features and delivery, not infrastructure.

A full-stack JavaScript framework built on Bun that captures the "Rails magic" - convention over configuration, batteries included, zero boilerplate. Designed from the ground up to be the most productive framework for both human developers and AI coding assistants.

[![CI](https://github.com/developerz-ai/bun-on-rails/actions/workflows/ci.yml/badge.svg)](https://github.com/developerz-ai/bun-on-rails/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why BunOnRails?

- **Vibe Coder Friendly** - Stay in flow, ship features, not configurations
- **AI Agent Ready** - Predictable patterns that AI assistants understand instantly
- **Zero-Config Setup** - `brails new myapp && brails dev` gets you running in seconds
- **Batteries Included** - Authentication, file uploads, background jobs, caching, real-time, email, search
- **Bun-Powered** - Native speed for everything: bundler, transpiler, test runner, HTTP server
- **Rails-Like DX** - Convention over configuration, generators, migrations, ORM

## Quick Start

```bash
brails new myapp
cd myapp
brails setup    # Starts Docker services, creates DB, runs migrations
brails dev      # Server running with hot reload
```

## Features

| Feature | Description |
|---------|-------------|
| **ORM** | Active Record-style with associations, validations, scopes |
| **Migrations** | Clean JavaScript migrations with auto-schema sync |
| **Routing** | Rails-like DSL with resources and namespaces |
| **Controllers** | Class-based with automatic context injection |
| **React Integration** | Built-in hooks for data fetching and real-time |
| **Background Jobs** | BullMQ-powered with scheduling and priorities |
| **WebSockets** | Native Bun WebSocket support with channels |
| **Authentication** | One-command auth generation with OAuth support |
| **File Uploads** | S3-compatible storage with image variants |
| **Caching** | Redis-backed with fragment and HTTP caching |
| **Email** | Mailer classes with React email templates |
| **Testing** | Parallel tests with factories and transactions |

## Documentation

Full documentation available at [bunonrails.com](https://bunonrails.com) or in the [docs/](./docs) directory.

- [Getting Started](./docs/eng/getting-started/introduction.md)
- [Database & ORM](./docs/eng/database/overview.md)
- [Routing & Controllers](./docs/eng/routing/overview.md)
- [Frontend Integration](./docs/eng/frontend/overview.md)
- [Background Jobs](./docs/eng/jobs/overview.md)
- [Authentication](./docs/eng/authentication/overview.md)
- [Deployment](./docs/eng/deployment/overview.md)

## Example

```javascript
// app/controllers/posts_controller.js
export default class PostsController {
  async index() {
    const posts = await Post.findAll({ include: 'user' })
    return this.render({ posts })
  }

  async create() {
    const post = await Post.create(this.params.post)
    this.broadcast('posts:new', { post })
    return this.render({ post }, { status: 201 })
  }
}
```

```javascript
// app/models/post.js
export default class Post extends Model {
  static associations = {
    belongsTo: ['user'],
    hasMany: ['comments']
  }

  static validations = {
    title: { presence: true, length: { max: 200 } },
    body: { presence: true }
  }
}
```

## CLI Commands

```bash
# Database
brails db:migrate          # Run migrations
brails db:rollback         # Rollback last migration
brails db:seed             # Load seed data

# Generators
brails g scaffold Post title:string body:text
brails g model User
brails g auth              # Full authentication system

# Development
brails dev                 # Development server
brails test                # Run tests
brails console             # Interactive REPL
```

## For AI Agents

BunOnRails is designed to be the most AI-friendly framework:

- **Predictable patterns** - Same structure in every project
- **Clear conventions** - AI knows where files go and how to name them
- **Self-documenting** - Models show their schema, routes are explicit
- **No hidden magic** - What you write is what happens

```javascript
// AI can understand and generate this instantly
const post = await Post.create({ title, body, userId: currentUser.id })
if (post.errors) return this.unprocessableEntity(post.errors)
await NotifyFollowersJob.performLater({ postId: post.id })
return this.render({ post }, { status: 201 })
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.
