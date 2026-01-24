# Introduction to BunOnRails

BunOnRails is a full-stack JavaScript framework built on [Bun](https://bun.sh) that captures the "Rails magic" - convention over configuration, batteries included, zero boilerplate.

## What is BunOnRails?

BunOnRails brings the productivity and joy of Ruby on Rails to the JavaScript ecosystem, powered by Bun's blazing-fast runtime. It's designed for developers who want to build production applications quickly without sacrificing quality or spending hours on configuration.

## Core Philosophy

### Convention Over Configuration

Everything has a place, everything is predictable:

```
app/
├── models/          # Your data models
├── controllers/     # Request handlers
├── components/      # React components
├── jobs/           # Background jobs
├── mailers/        # Email templates
config/
├── routes.js       # URL routing
├── database.js     # Database config
db/
├── migrations/     # Database changes
├── seeds.js        # Initial data
```

### Batteries Included

Ships everything you need to build production apps:

- **Authentication** - User registration, login, password reset, OAuth
- **File Uploads** - S3-compatible storage with image processing
- **Background Jobs** - Reliable job processing with BullMQ
- **Real-Time** - WebSocket channels for live updates
- **Caching** - Redis-backed caching at multiple levels
- **Email** - Transactional email with React templates
- **Search** - Elasticsearch/MeiliSearch integration
- **Admin Panel** - Auto-generated CRUD interfaces

### Bun-Powered Performance

Leverages Bun's native speed for everything:

- No webpack, no babel - Bun handles bundling and transpilation
- Native SQLite driver for development
- Built-in HTTP server and WebSocket support
- Fast test runner with parallel execution
- Minimal dependencies, no `node_modules` bloat

## Who Should Use BunOnRails?

BunOnRails is ideal for:

- **Full-stack developers** who want Rails productivity in JavaScript
- **Startups** that need to ship features quickly
- **Teams** that value convention and predictability
- **Solo developers** who want batteries included
- **Anyone** tired of configuring build tools

## Key Features at a Glance

| Feature | What You Get |
|---------|--------------|
| **Setup** | One command to create and run a new app |
| **Database** | Migrations, ORM, validations, associations |
| **Routes** | Rails-like DSL with resources and namespaces |
| **Controllers** | Clean classes with automatic context |
| **Frontend** | React with framework-aware hooks |
| **Jobs** | Scheduled and async background processing |
| **Auth** | Full auth system with one generator |
| **Files** | Upload, process, and serve files |
| **Testing** | Parallel tests with isolation |
| **Deploy** | Works on any platform out of the box |

## Getting Started

Ready to dive in? Head to the [Installation](./installation.md) guide to set up your development environment, then follow the [Quick Start](./quick-start.md) to build your first app.

## Community

- **GitHub**: [github.com/developerz-ai/bun-on-rails](https://github.com/developerz-ai/bun-on-rails)
- **Documentation**: [bunonrails.com](https://bunonrails.com)
- **Discord**: Join our community for help and discussion

## License

BunOnRails is open source software licensed under the [MIT License](https://opensource.org/licenses/MIT).
