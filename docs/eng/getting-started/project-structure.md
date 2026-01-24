# Project Structure

BunOnRails follows a convention-over-configuration approach with a predictable directory structure.

## Overview

```
myapp/
├── app/                    # Application code
│   ├── components/         # React components
│   │   ├── layouts/       # Layout components
│   │   ├── pages/         # Page components
│   │   └── shared/        # Reusable components
│   ├── controllers/        # Request handlers
│   ├── jobs/              # Background jobs
│   ├── mailers/           # Email classes
│   ├── models/            # Data models
│   └── channels/          # WebSocket channels
├── config/                 # Configuration
│   ├── environments/      # Environment-specific config
│   ├── initializers/      # Startup scripts
│   ├── locales/           # i18n translations
│   ├── database.js        # Database configuration
│   ├── routes.js          # URL routing
│   ├── cors.js            # CORS settings
│   └── features.js        # Feature flags
├── db/                     # Database files
│   ├── migrations/        # Migration files
│   ├── schema.js          # Auto-generated schema
│   └── seeds.js           # Seed data
├── lib/                    # Custom libraries
├── public/                 # Static assets
├── storage/               # File uploads (development)
├── test/                   # Test files
│   ├── factories/         # Test factories
│   ├── fixtures/          # Test data
│   ├── integration/       # Integration tests
│   ├── models/            # Model tests
│   └── support/           # Test helpers
├── .env                    # Environment variables
├── .env.development.local  # Local dev overrides
├── bunfig.toml            # Bun configuration
├── docker-compose.yml     # Docker services
└── package.json           # Dependencies
```

## Directory Details

### `/app` - Application Code

#### `/app/models`

Database-backed models with ActiveRecord-style API:

```javascript
// app/models/user.js
export default class User extends Model {
  static associations = {
    hasMany: ['posts', 'comments']
  }

  static validations = {
    email: { presence: true, uniqueness: true, email: true },
    name: { presence: true }
  }

  static scopes = {
    active: (query) => query.where({ active: true })
  }
}
```

#### `/app/controllers`

Handle HTTP requests and render responses:

```javascript
// app/controllers/users_controller.js
export default class UsersController {
  static beforeAction = ['authenticate']

  async index() {
    const users = await User.active().findAll()
    return this.render({ users })
  }
}
```

#### `/app/components`

React components organized by purpose:

```
components/
├── layouts/
│   ├── ApplicationLayout.jsx
│   └── AdminLayout.jsx
├── pages/
│   ├── posts/
│   │   ├── PostsIndex.jsx
│   │   ├── PostsShow.jsx
│   │   └── PostsForm.jsx
│   └── users/
│       └── ...
└── shared/
    ├── Button.jsx
    ├── Card.jsx
    └── Modal.jsx
```

#### `/app/jobs`

Background job classes:

```javascript
// app/jobs/process_image_job.js
export default class ProcessImageJob {
  static queue = 'images'
  static attempts = 3

  async perform({ imageId }) {
    const image = await Image.find(imageId)
    await image.generateVariants()
  }
}
```

#### `/app/mailers`

Email classes with templates:

```javascript
// app/mailers/user_mailer.js
export default class UserMailer {
  welcome(user) {
    return {
      to: user.email,
      subject: 'Welcome!',
      template: 'welcome',
      data: { user }
    }
  }
}
```

#### `/app/channels`

WebSocket channel handlers:

```javascript
// app/channels/posts_channel.js
export default class PostsChannel {
  async subscribed() {
    await this.stream('posts')
  }

  async receive(data) {
    // Handle incoming messages
  }
}
```

### `/config` - Configuration

#### `/config/routes.js`

Define application routes:

```javascript
export default (router) => {
  router.root('home#index')

  router.resources('posts', () => {
    router.resources('comments')
  })

  router.namespace('admin', () => {
    router.resources('users')
  })

  router.get('/search', 'search#index')
}
```

#### `/config/database.js`

Database connection settings:

```javascript
export default {
  development: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 }
  },
  test: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
    pool: { min: 1, max: 5 }
  },
  production: {
    adapter: 'postgresql',
    url: process.env.DATABASE_URL,
    pool: { min: 5, max: 20 },
    ssl: { rejectUnauthorized: false }
  }
}
```

#### `/config/environments/`

Environment-specific settings:

```javascript
// config/environments/production.js
export default {
  server: {
    workers: 'auto',
    port: process.env.PORT || 3000
  },
  jobs: {
    workers: 2,
    concurrency: 10
  },
  cache: {
    store: 'redis',
    url: process.env.REDIS_URL
  },
  logging: {
    level: 'info',
    format: 'json'
  }
}
```

#### `/config/initializers/`

Startup scripts that run once on boot:

```javascript
// config/initializers/search.js
import { Search } from '@bun-on-rails/search'

Search.configure({
  engine: 'meilisearch',
  url: process.env.MEILISEARCH_URL
})
```

### `/db` - Database

#### `/db/migrations/`

Timestamped migration files:

```javascript
// db/migrations/20250124000000_create_users.js
export async function up(db) {
  await db.createTable('users', (t) => {
    t.id()
    t.string('email').notNull().unique()
    t.string('name')
    t.string('password_digest')
    t.timestamps()
  })
}

export async function down(db) {
  await db.dropTable('users')
}
```

#### `/db/schema.js`

Auto-generated database schema (do not edit manually):

```javascript
// Generated by bun db:migrate
export default {
  version: 20250124000000,
  tables: {
    users: {
      id: { type: 'bigint', primaryKey: true },
      email: { type: 'varchar', notNull: true },
      // ...
    }
  }
}
```

#### `/db/seeds.js`

Initial data for development:

```javascript
export default async function seed(db) {
  await User.create({
    email: 'admin@example.com',
    name: 'Admin',
    password: 'password123'
  })
}
```

### `/test` - Tests

```
test/
├── factories/
│   ├── user_factory.js
│   └── post_factory.js
├── models/
│   ├── user.test.js
│   └── post.test.js
├── controllers/
│   └── posts_controller.test.js
├── integration/
│   └── posts.test.js
└── support/
    └── setup.js
```

### `/public` - Static Assets

Files served directly without processing:

```
public/
├── favicon.ico
├── robots.txt
└── images/
    └── logo.png
```

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Models | Singular, PascalCase | `User.js`, `BlogPost.js` |
| Controllers | Plural, snake_case | `users_controller.js` |
| Components | PascalCase | `UserProfile.jsx` |
| Jobs | Descriptive, snake_case | `send_email_job.js` |
| Migrations | Timestamp prefix | `20250124_create_users.js` |
| Tests | Match source + `.test.js` | `user.test.js` |

## Environment Variables

BunOnRails uses a layered approach to environment configuration:

1. `.env` - Base configuration (committed)
2. `.env.{environment}` - Environment-specific (committed)
3. `.env.{environment}.local` - Local overrides (gitignored)

```bash
# .env
APP_NAME=MyApp
DEFAULT_LOCALE=en

# .env.development
LOG_LEVEL=debug

# .env.development.local (gitignored)
DATABASE_URL=postgres://localhost/myapp_dev
SECRET_KEY_BASE=dev-secret-key
```

## Next Steps

- Learn about [Database & ORM](../database/overview.md)
- Understand [Routing](../routing/overview.md)
- Explore [Controllers](../controllers/overview.md)
