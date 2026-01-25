## Task List

Now I have a comprehensive understanding of the project. Let me create the master plan:

---

# 🚀 BunOnRails Framework - Master Implementation Plan

## Executive Summary

**Goal**: Build a production-ready, full-stack JavaScript framework on Bun with Rails-like conventions. Package as `@bun-on-rails` (not `@bun-on-rails/framework`). Designed for vibe coders and AI agents with zero hassle and minimal decisions.

**Current State**: Skeleton framework with stub implementations (TODOs everywhere). Demo app with models/controllers but no working functionality.

**Target State**: Fully functional framework with:
- Complete ORM with PostgreSQL/YugabyteDB support
- Working migrations, validations, associations
- BullMQ background jobs
- WebSocket channels
- File storage with S3 support
- Authentication system
- Email with React templates
- Redis/Dragonfly caching
- Full test suite
- Auto-generated AGENT.md and complete documentation
- Production deployment guides

## Key Library Decisions

| Component | Library | Rationale |
|-----------|---------|-----------|
| Database | `Bun.SQL` + `postgres.js` fallback | Bun's native SQL is 7x faster than pg |
| ORM Layer | Custom (Active Record pattern) | Rails-like DX, already designed |
| Migrations | Custom DSL | Already designed, needs implementation |
| Background Jobs | BullMQ | Industry standard, Redis-backed |
| Redis Client | `ioredis` (BullMQ dep) + `Bun.redis` | BullMQ needs ioredis, caching uses native |
| Email | `nodemailer` + `@react-email/render` | React templates, SMTP support |
| Image Processing | `sharp` | Industry standard, blazing fast |
| Password Hashing | `bcrypt` via `bun-password` | Secure, Bun-native |
| Validation | Custom (Rails-style) | Already designed |
| Error Monitoring | Sentry SDK | Industry standard |
| S3 Storage | `@aws-sdk/client-s3` | AWS SDK v3 |

## Architecture Overview

```
@bun-on-rails (npm package)
├── src/                    # Framework source
│   ├── index.js           # Main exports
│   ├── application.js     # App bootstrap
│   ├── database/          # ORM, migrations, query builder
│   ├── controller/        # Base controller, middleware
│   ├── routing/           # Router DSL
│   ├── jobs/              # BullMQ integration
│   ├── mail/              # Nodemailer + React Email
│   ├── websocket/         # Bun native WebSockets
│   ├── storage/           # S3/local file storage
│   ├── cache/             # Redis/Memory cache
│   ├── react/             # React hooks for frontend
│   ├── testing/           # Test utilities, factories
│   └── cli/               # brails command
├── templates/              # App generator templates
│   ├── base/              # Base app structure
│   ├── auth/              # Auth generator templates
│   └── scaffold/          # CRUD generator templates
├── docs/
│   ├── framework/         # AI-friendly framework docs
│   └── deployment/        # Deployment guides
└── test/                   # Framework tests
```

---

### PR 1: Package Configuration & Core Infrastructure

- [ ] `[quick]` Rename package from `@bun-on-rails/framework` to `@bun-on-rails` in `package.json`
- [ ] `[coding]` Add all production dependencies to `package.json`: `bullmq`, `ioredis`, `nodemailer`, `@react-email/render`, `sharp`, `@aws-sdk/client-s3`, `bcrypt`, `zod`, `@sentry/bun`
- [ ] `[coding]` Create `src/config/loader.js` - configuration system for loading `config/*.js` files with environment support
- [ ] `[coding]` Implement `src/application.js` `Application.initialize()` and `Application.start()` - full app bootstrap with Bun.serve
- [ ] `[general]` Add framework unit tests in `test/core/application.test.js`

### PR 2: Database Connection & Query Execution

- [ ] `[coding]` Implement `src/database/connection.js` `Connection.connect()` using Bun.SQL with postgres.js fallback for PostgreSQL/YugabyteDB
- [ ] `[coding]` Implement `src/database/connection.js` `ConnectionPool` class with connection pooling (min/max connections)
- [ ] `[coding]` Implement `src/database/connection.js` `Connection.query()`, `Connection.transaction()` with parameterized queries
- [ ] `[coding]` Create `src/database/adapters/postgres.js` - PostgreSQL-specific SQL generation and type handling
- [ ] `[general]` Add database connection tests in `test/database/connection.test.js` with mocked database

### PR 3: Migration System

- [ ] `[coding]` Implement `src/database/migration.js` `TableBuilder` class with full column type support (id, string, text, integer, bigint, boolean, datetime, json, references, timestamps)
- [ ] `[coding]` Implement `src/database/migration.js` `ColumnBuilder` with modifiers (notNull, unique, default, onDelete)
- [ ] `[coding]` Implement `src/database/migration.js` `MigrationRunner.migrate()` - run pending migrations, track in `schema_migrations` table
- [ ] `[coding]` Implement `src/database/migration.js` `MigrationRunner.rollback()` - rollback N migrations
- [ ] `[coding]` Create `src/database/schema.js` - auto-generate `db/schema.js` after migrations
- [ ] `[general]` Add migration system tests in `test/database/migration.test.js`

### PR 4: Model Base Class - Finders & Persistence

- [ ] `[coding]` Implement `src/database/model.js` `Model.find(id)`, `Model.findBy(conditions)`, `Model.findAll(options)` with eager loading support
- [ ] `[coding]` Implement `src/database/model.js` `Model.create(attributes)`, `Model.save()`, `Model.update()`, `Model.destroy()`
- [ ] `[coding]` Implement `src/database/model.js` `Model.where(conditions)` returning `QueryBuilder`
- [ ] `[coding]` Implement `src/database/query_builder.js` `QueryBuilder` with chainable methods: `where`, `order`, `limit`, `offset`, `includes`, `select`, `joins`
- [ ] `[general]` Add model tests in `test/database/model.test.js`

### PR 5: Model Validations

- [ ] `[coding]` Implement `src/database/validations.js` with validators: `presence`, `length`, `format`, `numericality`, `uniqueness`, `email`, `inclusion`, `exclusion`
- [ ] `[coding]` Implement `src/database/model.js` `Model.validate()` running all validations and populating `errors` object
- [ ] `[coding]` Add validation callbacks: `beforeValidation`, `afterValidation`
- [ ] `[coding]` Implement conditional validations with `on: 'create'/'update'`, `if`, `unless` options
- [ ] `[general]` Add validation tests in `test/database/validations.test.js`

### PR 6: Model Associations

- [ ] `[coding]` Implement `src/database/associations.js` `belongsTo` - loads parent record, infers foreign key
- [ ] `[coding]` Implement `src/database/associations.js` `hasMany` - loads child records with proper WHERE clause
- [ ] `[coding]` Implement `src/database/associations.js` `hasOne` - loads single child record
- [ ] `[coding]` Implement `src/database/model.js` eager loading via `includes` option to prevent N+1 queries
- [ ] `[coding]` Add N+1 query detection in development mode with console warnings
- [ ] `[general]` Add association tests in `test/database/associations.test.js`

### PR 7: Model Scopes & Callbacks

- [ ] `[coding]` Implement `src/database/model.js` `Model.scope(name)` - apply named scope to query builder
- [ ] `[coding]` Implement automatic scope methods from `static scopes` definition (e.g., `Post.published()`)
- [ ] `[coding]` Implement model callbacks: `beforeSave`, `afterSave`, `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDestroy`, `afterDestroy`
- [ ] `[coding]` Implement `src/database/model.js` pagination: `Model.page(n).per(perPage)` returning paginated results with metadata
- [ ] `[general]` Add scope and callback tests in `test/database/scopes.test.js`

### PR 8: Routing & Controller Execution

- [ ] `[coding]` Implement `src/routing/router.js` `Router.match(method, path)` - match routes with path parameter extraction
- [ ] `[coding]` Implement `src/routing/router.js` `Router.handle(request)` - full request handling: match route, load controller, run middleware, execute action
- [ ] `[coding]` Implement `src/routing/router.js` `Router.urlFor(name, params)` - generate URLs from named routes
- [ ] `[coding]` Implement `src/controller/middleware.js` - middleware chain execution with `beforeAction`/`afterAction` support
- [ ] `[general]` Add routing tests in `test/routing/router.test.js`

### PR 9: Controller Features

- [ ] `[coding]` Implement `src/controller/base.js` `Controller.broadcast(channel, data)` - WebSocket broadcasting
- [ ] `[coding]` Implement `src/controller/base.js` `Controller.flash(type, message)` - session flash messages
- [ ] `[coding]` Implement `src/controller/base.js` cookie methods: `setCookie`, `getCookie`, `deleteCookie`
- [ ] `[coding]` Implement request parameter parsing: JSON body, form data, query params, file uploads
- [ ] `[coding]` Implement rate limiting middleware from `static rateLimit` definition
- [ ] `[general]` Add controller tests in `test/controller/base.test.js`

### PR 10: Background Jobs with BullMQ

- [ ] `[coding]` Implement `src/jobs/job.js` `Job.performLater(data)`, `Job.performAt(date, data)`, `Job.performIn(ms, data)` using BullMQ
- [ ] `[coding]` Implement `src/jobs/job.js` `JobQueue` class wrapping BullMQ Queue with proper Redis connection
- [ ] `[coding]` Implement `src/jobs/job.js` `JobWorker` class wrapping BullMQ Worker with job class loading and callback execution
- [ ] `[coding]` Implement `src/jobs/job.js` `JobScheduler` for cron-based recurring jobs using BullMQ's repeatable jobs
- [ ] `[coding]` Implement unique job support with configurable `uniqueKey` function
- [ ] `[general]` Add job system tests in `test/jobs/job.test.js`

### PR 11: WebSocket Channels

- [ ] `[coding]` Implement `src/websocket/channel.js` `WebSocketServer.start()` using Bun.serve WebSocket support
- [ ] `[coding]` Implement `src/websocket/channel.js` `Channel.subscribed()`, `Channel.unsubscribed()`, `Channel.receive()` lifecycle
- [ ] `[coding]` Implement `src/websocket/channel.js` `Channel.broadcast(stream, data)` using Redis pub/sub for multi-server support
- [ ] `[coding]` Implement `src/websocket/channel.js` `Connection` class with subscription tracking and authentication
- [ ] `[general]` Add WebSocket tests in `test/websocket/channel.test.js`

### PR 12: Caching System

- [ ] `[coding]` Implement `src/cache/cache.js` `RedisStore` using Bun's native Redis client for get/set/delete/increment/decrement
- [ ] `[coding]` Implement `src/cache/cache.js` `Cache.fetch(key, callback, options)` with proper TTL support
- [ ] `[coding]` Implement `src/cache/cache.js` `Cache.deleteMatching(pattern)` for cache invalidation with wildcards
- [ ] `[coding]` Add Dragonfly compatibility notes and configuration for production
- [ ] `[general]` Add cache tests in `test/cache/cache.test.js`

### PR 13: Email System with React Templates

- [ ] `[coding]` Implement `src/mail/mailer.js` `Mail.deliver()` using nodemailer with SMTP/SendGrid/SES adapters
- [ ] `[coding]` Implement `src/mail/mailer.js` `Mail.deliverLater()` enqueueing `SendEmailJob`
- [ ] `[coding]` Implement `src/mail/mailer.js` `MailRenderer.render()` using `@react-email/render` for React email templates
- [ ] `[coding]` Create `src/jobs/send_email_job.js` - background email sending job
- [ ] `[general]` Add email tests in `test/mail/mailer.test.js`

### PR 14: File Storage System

- [ ] `[coding]` Implement `src/storage/storage.js` `StorageAdapters.local` - local filesystem storage for development
- [ ] `[coding]` Implement `src/storage/storage.js` `StorageAdapters.s3` - S3-compatible storage using `@aws-sdk/client-s3` (works with R2, DigitalOcean Spaces)
- [ ] `[coding]` Implement `src/storage/storage.js` `Storage.upload()`, `Storage.get()`, `Storage.delete()`, `Storage.getUploadUrl()` for direct uploads
- [ ] `[coding]` Implement `src/storage/storage.js` `ImageProcessor` using `sharp` for image variants (resize, crop, format conversion)
- [ ] `[coding]` Implement `src/storage/storage.js` `Attachment` class for model file attachments with variants
- [ ] `[general]` Add storage tests in `test/storage/storage.test.js`

### PR 15: React Hooks for Frontend

- [ ] `[coding]` Implement `src/react/hooks.js` `useResource(resource, options)` - data fetching with SWR-like API, loading/error states
- [ ] `[coding]` Implement `src/react/hooks.js` `useAction(action, options)` - form submission with CSRF, optimistic updates
- [ ] `[coding]` Implement `src/react/hooks.js` `useChannel(channel, callback)` - WebSocket subscription with auto-reconnect
- [ ] `[coding]` Implement `src/react/hooks.js` `useCurrentUser()`, `useFlash()`, `usePagination()`
- [ ] `[coding]` Implement `src/react/forms.js` `Form`, `Field` components with model-aware validation
- [ ] `[general]` Add React hooks tests in `test/react/hooks.test.js`

### PR 16: Testing Utilities

- [ ] `[coding]` Implement `src/testing/database.js` `setupDatabase()` - create test database, run migrations
- [ ] `[coding]` Implement `src/testing/database.js` `withinTransaction(callback)` - wrap tests in rollback transactions
- [ ] `[coding]` Implement `src/testing/factory.js` `Factory.create(name, overrides)` - persist model to database
- [ ] `[coding]` Implement `src/testing/request.js` `TestRequest` class for integration testing with session/cookie support
- [ ] `[general]` Add testing utility tests in `test/testing/utilities.test.js`

### PR 17: CLI - New App Generator

- [ ] `[coding]` Implement `src/cli/commands/new.js` - create full app directory structure
- [ ] `[coding]` Create `templates/base/` directory with all app template files: package.json, config files, docker-compose.yml, Dockerfile, .gitignore, .env.example
- [ ] `[coding]` Generate `AGENT.md` in new apps with complete framework documentation for AI assistants
- [ ] `[coding]` Implement npm dependency installation and git init in new app generator
- [ ] `[general]` Add CLI new command tests in `test/cli/new.test.js`

### PR 18: CLI - Database Commands

- [ ] `[coding]` Implement `src/cli/commands/db.js` `db:create` - create PostgreSQL database
- [ ] `[coding]` Implement `src/cli/commands/db.js` `db:migrate` - run migrations, update schema.js, annotate models
- [ ] `[coding]` Implement `src/cli/commands/db.js` `db:rollback` - rollback with step count
- [ ] `[coding]` Implement `src/cli/commands/db.js` `db:seed` - run db/seeds.js
- [ ] `[coding]` Implement `src/cli/commands/db.js` `db:schema:load` - fast schema load for CI
- [ ] `[general]` Add CLI db command tests in `test/cli/db.test.js`

### PR 19: CLI - Code Generators

- [ ] `[coding]` Implement `src/cli/commands/generate.js` `model` generator with migration, model file, test file
- [ ] `[coding]` Implement `src/cli/commands/generate.js` `controller` generator with controller file, test file
- [ ] `[coding]` Implement `src/cli/commands/generate.js` `scaffold` generator - full CRUD with model, controller, migration, routes, React components
- [ ] `[coding]` Implement `src/cli/commands/generate.js` `migration` generator with timestamp naming
- [ ] `[coding]` Implement `src/cli/commands/generate.js` `job`, `mailer`, `channel` generators
- [ ] `[general]` Add generator tests in `test/cli/generate.test.js`

### PR 20: CLI - Auth Generator

- [ ] `[coding]` Create `templates/auth/` with User model, sessions controller, registrations controller, password resets
- [ ] `[coding]` Implement `src/cli/commands/generate.js` `auth` generator - creates full authentication system
- [ ] `[coding]` Add secure password hashing using bcrypt with `hasSecurePassword` model feature
- [ ] `[coding]` Implement session management with Redis-backed sessions
- [ ] `[coding]` Add OAuth boilerplate generation for Google/GitHub
- [ ] `[general]` Add auth generator tests in `test/cli/auth.test.js`

### PR 21: CLI - Dev & Start Commands

- [ ] `[coding]` Implement `src/cli/commands/dev.js` - development server with hot reload using Bun's watch mode
- [ ] `[coding]` Implement `src/cli/commands/start.js` - production server with multi-process clustering
- [ ] `[coding]` Implement `src/cli/commands/console.js` - interactive REPL with models loaded
- [ ] `[coding]` Implement `src/cli/commands/routes.js` - print all routes in formatted table
- [ ] `[general]` Add dev/start command tests in `test/cli/commands.test.js`

### PR 22: Credentials & Environment

- [ ] `[coding]` Implement `src/cli/commands/credentials.js` - encrypted credentials file management
- [ ] `[coding]` Create `src/config/credentials.js` - load and decrypt credentials at runtime
- [ ] `[coding]` Implement `config/environments/*.js` loading with environment-specific settings
- [ ] `[coding]` Add environment variable validation with required env check on startup
- [ ] `[general]` Add credentials tests in `test/config/credentials.test.js`

### PR 23: Health Checks & Monitoring

- [ ] `[coding]` Create `src/health/health.js` - health check system with DB, Redis, job queue status
- [ ] `[coding]` Implement `/health` and `/health/detailed` endpoints in framework
- [ ] `[coding]` Add Sentry integration in `src/monitoring/sentry.js` for error tracking
- [ ] `[coding]` Add request logging middleware with timing information
- [ ] `[general]` Add health check tests in `test/health/health.test.js`

### PR 24: Framework Documentation (docs/framework/)

- [ ] `[coding]` Create `docs/framework/AGENT.md` - complete AI-friendly framework guide (this becomes the generated AGENT.md)
- [ ] `[coding]` Create `docs/framework/models.md` - complete ORM documentation with all methods and options
- [ ] `[coding]` Create `docs/framework/controllers.md` - complete controller documentation with middleware
- [ ] `[coding]` Create `docs/framework/routing.md` - complete routing DSL documentation
- [ ] `[coding]` Create `docs/framework/jobs.md` - complete background jobs documentation
- [ ] `[coding]` Create `docs/framework/websockets.md` - complete WebSocket channels documentation
- [ ] `[coding]` Create `docs/framework/testing.md` - complete testing documentation

### PR 25: Deployment Documentation (docs/deployment/)

- [ ] `[coding]` Create `docs/deployment/railway.md` - Railway deployment guide with PostgreSQL, Redis, environment setup
- [ ] `[coding]` Create `docs/deployment/render.md` - Render deployment guide with render.yaml
- [ ] `[coding]` Create `docs/deployment/fly.md` - Fly.io deployment guide with fly.toml
- [ ] `[coding]` Create `docs/deployment/docker.md` - Docker/Docker Compose deployment with multi-service setup
- [ ] `[coding]` Create `docs/deployment/vps.md` - Self-hosted VPS guide with Nginx, SSL (Let's Encrypt), systemd
- [ ] `[coding]` Create `docs/deployment/production-checklist.md` - YugabyteDB, Dragonfly, Sentry, monitoring, backups

### PR 26: Demo App - Working Implementation

- [ ] `[coding]` Update `demo/` to use working framework - ensure all TODO stubs are replaced with real implementations
- [ ] `[coding]` Add working authentication flow in demo app
- [ ] `[coding]` Add working posts CRUD with real database operations
- [ ] `[coding]` Add working background job example (send welcome email on registration)
- [ ] `[coding]` Add working WebSocket example (real-time post updates)
- [ ] `[general]` Ensure demo app runs end-to-end with `brails dev`

### PR 27: Demo App Tests

- [ ] `[general]` Create `demo/test/models/user.test.js` - User model unit tests
- [ ] `[general]` Create `demo/test/models/post.test.js` - Post model unit tests
- [ ] `[general]` Create `demo/test/controllers/posts_controller.test.js` - Posts controller integration tests
- [ ] `[general]` Create `demo/test/integration/auth.test.js` - Full authentication flow tests
- [ ] `[general]` Create `demo/test/integration/posts.test.js` - Full posts CRUD flow tests

### PR 28: Framework Integration Tests

- [ ] `[general]` Create `test/integration/full_stack.test.js` - end-to-end test: create app, run migrations, start server, make requests
- [ ] `[general]` Create `test/integration/generators.test.js` - test all generators produce valid code
- [ ] `[general]` Create `test/integration/deployment.test.js` - test Dockerfile builds, docker-compose works
- [ ] `[general]` Run full test suite and fix any failures

### PR 29: Final Polish & Package Preparation

- [ ] `[quick]` Update `README.md` with final documentation and examples
- [ ] `[quick]` Update `CHANGELOG.md` with version 0.1.0 release notes
- [ ] `[quick]` Add `.npmignore` to exclude dev files from package
- [ ] `[quick]` Verify `package.json` has correct metadata: repository, keywords, engines, bin
- [ ] `[general]` Run `bun run lint` and `bun run format` - fix all issues
- [ ] `[general]` Run complete test suite: `bun test` - all tests must pass
- [ ] `[quick]` Create GitHub release tag v0.1.0

---

## Success Criteria

1. **All tests pass**: `bun test` runs with 100% success rate
2. **Linting clean**: `bun run lint` returns 0 errors, 0 warnings
3. **Demo app works**: `brails new test-app && cd test-app && brails setup && brails dev` creates a working app
4. **Documentation complete**: `docs/framework/AGENT.md` provides complete AI-friendly framework guide
5. **Deployment guides work**: Following any deployment guide results in working production app
6. **Package publishable**: `npm pack` creates valid package, `npm publish --dry-run` succeeds

## Risk Mitigation

- **Database compatibility**: Test with both PostgreSQL and YugabyteDB
- **Bun version**: Pin minimum Bun version in engines field
- **BullMQ + Dragonfly**: Verify BullMQ works with Dragonfly (Redis-compatible)
- **Sharp on different platforms**: Sharp has native bindings - test on macOS, Linux, Windows

## Dependencies Graph

```
PR1 (Core) 
  ↓
PR2 (DB Connection) → PR3 (Migrations)
  ↓                         ↓
PR4 (Model Finders) → PR5 (Validations) → PR6 (Associations) → PR7 (Scopes)
                              ↓
PR8 (Routing) → PR9 (Controller Features)
  ↓
PR10 (Jobs) ← PR12 (Cache)
  ↓
PR11 (WebSockets)
  ↓
PR13 (Email) → PR14 (Storage)
  ↓
PR15 (React) → PR16 (Testing)
  ↓
PR17-22 (CLI Commands) → PR23 (Health/Monitoring)
  ↓
PR24-25 (Documentation)
  ↓
PR26-28 (Demo & Integration Tests)
  ↓
PR29 (Final Polish)
```

---

PLANNING COMPLETE