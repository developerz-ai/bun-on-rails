# Authentication

BunOnRails provides a complete authentication system with one command. No need to build auth from scratch.

## Quick Setup

```bash
brails g auth
brails db:migrate
```

This generates:

- User model with secure password hashing
- Session management (Redis-backed)
- Registration flow
- Login/logout
- Password reset via email
- Account locking after failed attempts
- Routes and controllers
- React components (optional)

## What You Get

### User Model

```javascript
// app/models/user.js
export default class User extends Model {
  static hasSecurePassword = true

  static validations = {
    email: { presence: true, uniqueness: true, email: true },
    password: { presence: { on: 'create' }, length: { min: 8 } }
  }

  // Built-in methods
  async authenticate(password) { ... }
  async generatePasswordResetToken() { ... }
  async resetPassword(token, newPassword) { ... }
}
```

### Sessions Controller

```javascript
// app/controllers/sessions_controller.js
export default class SessionsController extends Controller {
  // POST /login
  async create() {
    const { email, password } = this.params
    const user = await User.findBy({ email })

    if (!user || !(await user.authenticate(password))) {
      return this.render({ error: 'Invalid credentials' }, { status: 401 })
    }

    this.session.userId = user.id
    return this.render({ user })
  }

  // DELETE /logout
  async destroy() {
    this.session.userId = null
    return this.render({ success: true })
  }
}
```

### Registrations Controller

```javascript
// app/controllers/registrations_controller.js
export default class RegistrationsController extends Controller {
  // POST /signup
  async create() {
    const user = await User.create(this.params.user)

    if (user.errors) {
      return this.unprocessableEntity(user.errors)
    }

    // Auto-login after registration
    this.session.userId = user.id

    // Send welcome email
    await SendWelcomeEmailJob.performLater({ userId: user.id })

    return this.render({ user }, { status: 201 })
  }
}
```

## Using Authentication

### Protecting Controllers

```javascript
export default class PostsController extends Controller {
  // Protect all actions
  static beforeAction = ['authenticate']

  // Or protect specific actions
  static beforeAction = {
    authenticate: { only: ['create', 'update', 'destroy'] }
  }

  async create() {
    // this.currentUser is available
    const post = await Post.create({
      ...this.params.post,
      userId: this.currentUser.id
    })
  }
}
```

### Current User

After authentication, `this.currentUser` is available in controllers:

```javascript
async index() {
  if (this.currentUser) {
    // Logged in
    const posts = await Post.where({ userId: this.currentUser.id })
  } else {
    // Not logged in
    const posts = await Post.published()
  }
}
```

### Frontend Integration

```javascript
import { useCurrentUser } from '@bun-on-rails'

function Header() {
  const { user, loading } = useCurrentUser()

  if (loading) return <div>Loading...</div>

  if (user) {
    return (
      <nav>
        <span>Welcome, {user.name}</span>
        <a href="/logout" data-method="delete">Logout</a>
      </nav>
    )
  }

  return (
    <nav>
      <a href="/login">Login</a>
      <a href="/signup">Sign Up</a>
    </nav>
  )
}
```

## Routes

Generated routes:

```javascript
// config/routes.js
router.get('/login', 'sessions#new')
router.post('/login', 'sessions#create')
router.delete('/logout', 'sessions#destroy')

router.get('/signup', 'registrations#new')
router.post('/signup', 'registrations#create')

router.get('/password/new', 'passwords#new')
router.post('/password', 'passwords#create')
router.get('/password/edit', 'passwords#edit')
router.patch('/password', 'passwords#update')
```

## Password Reset

Built-in password reset flow:

```javascript
// User requests reset
await user.generatePasswordResetToken()
await PasswordResetMailer.send(user).deliver()

// User resets password
const user = await User.findByResetToken(token)
await user.resetPassword(token, newPassword)
```

## Account Locking

Automatic account locking after failed attempts:

```javascript
// config/auth.js
export default {
  maxLoginAttempts: 5,
  lockDuration: 30 * 60 * 1000, // 30 minutes
}
```

## Session Configuration

```javascript
// config/environments/production.js
export default {
  session: {
    store: 'redis',
    url: process.env.REDIS_URL,
    secret: process.env.SECRET_KEY_BASE,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }
}
```

## OAuth Integration

Add OAuth providers:

```bash
brails g auth:oauth google
brails g auth:oauth github
```

Configure:

```javascript
// config/oauth.js
export default {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['email', 'profile']
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    scopes: ['user:email']
  }
}
```

Routes are automatically added:

```
GET  /auth/google          → Redirect to Google
GET  /auth/google/callback → Handle callback
GET  /auth/github          → Redirect to GitHub
GET  /auth/github/callback → Handle callback
```

## Best Practices

1. **Use HTTPS in production** - Protect session cookies
2. **Set secure cookie options** - httpOnly, secure, sameSite
3. **Use strong secrets** - Generate with `brails credentials:edit`
4. **Rate limit login attempts** - Prevent brute force
5. **Log authentication events** - For security auditing

## AI-Agent Friendly

Authentication is fully generated and predictable:

```javascript
// AI agents can easily work with this
if (!this.currentUser) {
  return this.unauthorized()
}

const user = await User.findBy({ email })
if (await user.authenticate(password)) {
  this.session.userId = user.id
}
```

No complex setup, just use the patterns.
