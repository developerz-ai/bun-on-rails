# Core Philosophy

BunOnRails is built on three fundamental principles that guide every design decision.

## Convention Over Configuration

The single most important principle: sensible defaults eliminate busywork.

### What This Means

Instead of configuring every aspect of your application, BunOnRails provides intelligent defaults based on file locations and naming patterns:

```
app/models/user.js          → User model
app/controllers/users_controller.js  → UsersController
app/components/pages/users/  → User page components
db/migrations/              → Database migrations
```

### Example: Database Configuration

**Without convention:**
```javascript
// Configure ORM
import { createConnection } from 'some-orm'
import UserModel from './models/user'
import PostModel from './models/post'

const connection = createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [UserModel, PostModel],
  // 50 more lines of config...
})
```

**With BunOnRails:**
```javascript
// Just create your model - everything else is automatic
// app/models/user.js
export default class User extends Model {
  static validations = {
    email: { presence: true }
  }
}
```

### Benefits

- **Speed** - Start building features immediately
- **Consistency** - Every BunOnRails project looks the same
- **Onboarding** - New team members know where everything is
- **Less Bugs** - Fewer configuration files means fewer mistakes

## Batteries Included

Everything you need to build production applications, out of the box.

### Included Features

| Need | Solution |
|------|----------|
| Database access | Active Record-style ORM |
| User auth | One-command auth generator |
| Background jobs | BullMQ integration |
| Real-time | Native WebSocket channels |
| File uploads | S3-compatible storage |
| Caching | Redis-backed cache |
| Email | Mailer classes with templates |
| Search | Elasticsearch/MeiliSearch |
| Testing | Parallel test runner |

### Why Batteries Included?

**The Paradox of Choice**: When every feature requires choosing, configuring, and integrating a separate library, developers spend more time on tooling than building.

**Ecosystem Fatigue**: JavaScript has millions of packages. BunOnRails curates the best solutions so you don't have to.

**Integration Quality**: Features designed to work together provide better DX than cobbled-together libraries.

### Example: Adding Real-Time Features

**Typical JavaScript approach:**
1. Choose WebSocket library (socket.io? ws? µWebSockets?)
2. Configure server
3. Set up connection handling
4. Implement authentication
5. Add reconnection logic
6. Configure client
7. Handle serialization

**BunOnRails approach:**
```javascript
// Backend
this.broadcast('posts:new', { post })

// Frontend
useChannel('posts:new', (data) => {
  // Handle update
})
```

## Developer Happiness

The framework should be a joy to use.

### Fast Feedback Loops

- **Hot Reload** - Changes reflect instantly
- **Clear Errors** - Helpful messages, not stack traces
- **Fast Tests** - Parallel execution with isolation
- **Quick Start** - New projects in seconds

### Readable Code

BunOnRails APIs read like English:

```javascript
// Find all published posts with their authors, most recent first
const posts = await Post
  .published()
  .includes('author')
  .order({ createdAt: 'desc' })
  .limit(10)
```

### Powerful Generators

Generate entire features with one command:

```bash
bun generate scaffold Post title:string body:text published:boolean user:references
```

This creates:
- Migration
- Model with validations
- Controller with CRUD actions
- React components
- Test files
- Route registration

### Helpful Console

Interactive REPL with your models loaded:

```javascript
$ bun console

> await User.findBy({ email: 'admin@example.com' })
User { id: 1, email: 'admin@example.com', name: 'Admin' }

> await Post.count()
42
```

## The Rails Heritage

BunOnRails openly embraces its Rails inspiration.

### What We Took From Rails

- **MVC Architecture** - Clean separation of concerns
- **Active Record Pattern** - Models as database wrappers
- **Migrations** - Version-controlled schema changes
- **Routing DSL** - Declarative URL mapping
- **Convention Structure** - Predictable file organization
- **Generators** - Scaffolding for common patterns

### What We Changed

- **JavaScript** - The language of the web
- **Bun Runtime** - Native speed, no legacy Node baggage
- **React Frontend** - Modern component model
- **TypeScript Optional** - JSDoc types for those who want them
- **Modern Tooling** - No webpack, no babel
- **Simplified Config** - Even fewer files than Rails

## Design Decisions

### Why Bun?

- **Speed** - 4x faster than Node.js for many operations
- **All-in-One** - Bundler, transpiler, test runner, package manager
- **Native APIs** - SQLite, HTTP, WebSocket built in
- **ES Modules** - No CommonJS compatibility issues
- **Active Development** - Rapid improvements

### Why Not TypeScript-First?

- **Lower Barrier** - JavaScript is more accessible
- **JSDoc Types** - Full type support without compilation
- **User Choice** - TypeScript users can opt in
- **Faster Development** - No build step in development

### Why React for Frontend?

- **Ecosystem** - Largest component library ecosystem
- **Familiarity** - Most JavaScript developers know React
- **Server Components** - Future-ready architecture
- **Framework Hooks** - Deep integration possibilities

## Summary

BunOnRails is opinionated about:

- **Structure** - Where files go
- **Naming** - How things are called
- **Defaults** - Sensible starting points
- **Features** - What's included

BunOnRails is flexible about:

- **Business Logic** - Your code, your rules
- **Language** - JavaScript or TypeScript
- **Styling** - Tailwind, CSS modules, or anything
- **Deployment** - Any platform that runs Bun

This balance provides maximum productivity while maintaining flexibility where it matters.
