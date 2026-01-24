# Quick Start

Build your first BunOnRails application in under 10 minutes.

## Create Your Application

```bash
bun create bun-on-rails blog
cd blog
bun setup
bun dev
```

Your app is now running at `http://localhost:3000`.

## Generate a Resource

Let's create a blog with posts:

```bash
bun generate scaffold Post title:string body:text published:boolean
```

This generates:
- Migration file
- Post model with validations
- PostsController with CRUD actions
- React components (List, Form, Show)
- Test files
- Routes (automatically added)

Run the migration:

```bash
bun db:migrate
```

Visit `http://localhost:3000/posts` to see your posts CRUD interface.

## Understanding the Generated Code

### The Model

```javascript
// app/models/post.js
export default class Post extends Model {
  static validations = {
    title: { presence: true },
    body: { presence: true }
  }
}
```

### The Controller

```javascript
// app/controllers/posts_controller.js
export default class PostsController {
  async index() {
    const posts = await Post.findAll()
    return this.render({ posts })
  }

  async show() {
    const post = await Post.find(this.params.id)
    return this.render({ post })
  }

  async create() {
    const post = await Post.create(this.params.post)
    if (post.errors) {
      return this.render({ errors: post.errors }, { status: 422 })
    }
    return this.render({ post }, { status: 201 })
  }

  async update() {
    const post = await Post.find(this.params.id)
    await post.update(this.params.post)
    return this.render({ post })
  }

  async destroy() {
    const post = await Post.find(this.params.id)
    await post.destroy()
    return this.render({ success: true })
  }
}
```

### The Routes

```javascript
// config/routes.js
export default (router) => {
  router.root('home#index')
  router.resources('posts')
}
```

## Add a Relationship

Let's add comments to posts:

```bash
bun generate model Comment body:text post:references
bun db:migrate
```

Update the models:

```javascript
// app/models/post.js
export default class Post extends Model {
  static associations = {
    hasMany: ['comments']
  }

  static validations = {
    title: { presence: true },
    body: { presence: true }
  }
}

// app/models/comment.js
export default class Comment extends Model {
  static associations = {
    belongsTo: ['post']
  }

  static validations = {
    body: { presence: true }
  }
}
```

Now you can query with associations:

```javascript
// Eager load to prevent N+1
const posts = await Post.findAll({ include: 'comments' })

// Access association
const post = await Post.find(1)
const comments = await post.comments()
```

## Add Authentication

Generate a complete authentication system:

```bash
bun generate auth
bun db:migrate
```

This creates:
- User model with secure password hashing
- Session management
- Registration and login flows
- Password reset via email
- Auth middleware

Protect your controllers:

```javascript
// app/controllers/posts_controller.js
export default class PostsController {
  static beforeAction = ['authenticate']

  async index() {
    // this.currentUser is now available
    const posts = await Post.where({ userId: this.currentUser.id })
    return this.render({ posts })
  }
}
```

## Add Real-Time Updates

Enable WebSocket broadcasting:

```javascript
// app/controllers/posts_controller.js
async create() {
  const post = await Post.create({
    ...this.params.post,
    userId: this.currentUser.id
  })

  // Broadcast to all connected clients
  this.broadcast('posts:new', { post })

  return this.render({ post }, { status: 201 })
}
```

Subscribe in your React component:

```javascript
// app/components/PostsList.jsx
import { useResource, useChannel } from '@bun-on-rails/react'

export default function PostsList() {
  const { data: posts, mutate } = useResource('posts')

  useChannel('posts:new', ({ post }) => {
    mutate(prev => [post, ...prev])
  })

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

## Add Background Jobs

Process tasks asynchronously:

```bash
bun generate job SendWelcomeEmail
```

```javascript
// app/jobs/send_welcome_email_job.js
export default class SendWelcomeEmailJob {
  static queue = 'emails'
  static attempts = 3

  async perform({ userId }) {
    const user = await User.find(userId)
    await UserMailer.welcome(user).deliver()
  }
}

// Enqueue from anywhere
await SendWelcomeEmailJob.performLater({ userId: user.id })
```

Start the job worker:

```bash
bun jobs:work
```

## Run Tests

BunOnRails includes a fast, parallel test runner:

```bash
bun test
```

Example test:

```javascript
// test/models/post.test.js
import { test, expect } from 'bun:test'
import { factory } from '@bun-on-rails/test'

test('Post requires a title', async () => {
  const post = await Post.create({ body: 'content' })
  expect(post.errors.title).toContain('is required')
})

test('Post can have comments', async () => {
  const post = await factory.create('post')
  await factory.create('comment', { postId: post.id })

  const comments = await post.comments()
  expect(comments.length).toBe(1)
})
```

## Deploy

BunOnRails apps deploy anywhere that supports Docker or Bun:

```bash
# Build for production
bun run build

# Start production server
bun start
```

The included `Procfile` works with Heroku, Railway, Render, and Fly.io:

```
web: bun start
worker: bun jobs:work
```

## Next Steps

You've built a blog with:
- Database-backed posts and comments
- User authentication
- Real-time updates
- Background jobs
- Tests

Continue learning:

- [Project Structure](./project-structure.md) - Understand the file organization
- [Database Guide](../database/overview.md) - Deep dive into the ORM
- [Controllers](../controllers/overview.md) - Learn about request handling
- [Testing](../testing/overview.md) - Write comprehensive tests
