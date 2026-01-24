# Vibe Coding with BunOnRails

BunOnRails is designed for **vibe coders** - developers who want to stay in flow, focused on features and delivery rather than infrastructure and configuration.

## What is Vibe Coding?

Vibe coding is about:

- **Staying in flow** - No context switching to configure tools
- **Trusting conventions** - The framework knows the right defaults
- **Moving fast** - From idea to deployed feature quickly
- **Enjoying the process** - Coding should feel good

## How BunOnRails Enables Vibe Coding

### 1. Zero Configuration

```bash
brails new myapp
cd myapp
brails setup
brails dev
```

You're coding in 30 seconds. No webpack config, no babel config, no TypeScript config, no database config. Just code.

### 2. Batteries Included

Need auth? One command:
```bash
brails g auth
```

Need file uploads? Already there:
```javascript
user.avatar.attach(file)
```

Need background jobs? Built in:
```javascript
await SendEmailJob.performLater({ userId })
```

Need real-time? Just broadcast:
```javascript
this.broadcast('posts:new', { post })
```

### 3. Predictable Patterns

Every BunOnRails app looks the same. Once you learn the patterns, you can:

- Jump into any project instantly
- Know where to find things
- Know how to add things
- Trust that it works

```
app/models/      → Data models
app/controllers/ → Request handlers
app/jobs/        → Background tasks
config/routes.js → URL mapping
db/migrations/   → Database changes
```

### 4. Self-Documenting Code

Models tell you their schema:

```javascript
/**
 * == Schema Information
 *
 * Table name: users
 *
 *  id         :bigint           not null, primary key
 *  email      :string           not null
 *  name       :string
 */
export default class User extends Model { }
```

Routes tell you the endpoints:

```bash
brails routes
# GET    /posts       → posts#index
# POST   /posts       → posts#create
# GET    /posts/:id   → posts#show
```

### 5. AI-Assisted Development

BunOnRails is designed to work seamlessly with AI coding assistants:

```javascript
// Clear, predictable patterns AI can understand
const post = await Post.create({ title, body, userId })
if (post.errors) return this.unprocessableEntity(post.errors)
this.broadcast('posts:new', { post })
return this.render({ post }, { status: 201 })
```

AI agents can:
- Generate models, controllers, migrations
- Understand existing code instantly
- Add features without breaking things
- Follow the conventions automatically

## The Vibe Coder Workflow

### Morning: New Feature

```bash
# Generate everything you need
brails g scaffold Comment body:text post:references user:references
brails db:migrate

# Your feature is working. Now customize.
```

### Afternoon: Polish

```javascript
// Add real-time updates - one line
this.broadcast('comments:new', { comment })

// Add email notification - one line
await NewCommentJob.performLater({ commentId: comment.id })

// Add validation - declarative
static validations = {
  body: { presence: true, length: { max: 1000 } }
}
```

### Evening: Deploy

```bash
git push origin main
# CI runs, deploys automatically
```

## Principles of Vibe Coding

### 1. Convention Over Configuration

Don't configure what you can infer. File locations, naming, database tables - the framework figures it out.

### 2. Batteries Included

Don't integrate what should be built-in. Auth, uploads, jobs, caching, email - it's all there.

### 3. Progressive Complexity

Start simple, add complexity only when needed. The framework grows with your needs.

### 4. Developer Happiness

The framework should be a joy to use. Fast feedback, clear errors, beautiful output.

## Anti-Patterns to Avoid

### Don't Over-Engineer

```javascript
// Bad: Factory pattern for creating a post
const postFactory = new PostFactory(new PostgresAdapter(config))
const post = await postFactory.create(new PostDTO(params))

// Good: Just create it
const post = await Post.create(params)
```

### Don't Premature Optimize

```javascript
// Bad: Complex caching before you need it
const key = `posts:${userId}:${page}:${sort}:${hash(filters)}`
const posts = await cache.fetch(key, () => query(), { ttl: 300 })

// Good: Simple query, add caching when you need it
const posts = await Post.where({ userId }).page(page)
```

### Don't Fight Conventions

```javascript
// Bad: Custom everything
export default class PostsCtrl extends BaseController {
  static tablename = 'tbl_posts'
  static route = '/api/v1/articles'
}

// Good: Follow conventions
export default class PostsController extends Controller {
  // Posts table, /posts routes - automatic
}
```

## For AI Agents

If you're an AI coding assistant working with BunOnRails:

1. **Follow conventions** - Files go in standard locations
2. **Use generators** - `brails g` creates consistent code
3. **Trust the framework** - It handles the plumbing
4. **Keep it simple** - The simplest solution is usually correct
5. **Be predictable** - Use the same patterns everywhere

```javascript
// AI-friendly patterns
const user = await User.find(id)
if (!user) return this.notFound()

const post = await Post.create({ ...params, userId: user.id })
if (post.errors) return this.unprocessableEntity(post.errors)

await NotifyFollowersJob.performLater({ postId: post.id })
this.broadcast('posts:new', { post })

return this.render({ post }, { status: 201 })
```

## Summary

BunOnRails is built for vibe coders who want to:

- **Ship features**, not configure tools
- **Stay in flow**, not context switch
- **Write code**, not boilerplate
- **Enjoy development**, not fight the framework

The framework handles the infrastructure. You focus on what matters: building great products.

Happy vibe coding! 🎵
